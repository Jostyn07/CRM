// Ruta: supabase/functions/register-organization/index.ts
// Registro público de una empresa nueva: crea la organización, sus
// sucursales y su primer administrador (con la contraseña que eligió).
// Supabase envía el correo de confirmación; hasta confirmarlo no puede entrar.
//
// POST {
//   company: { name, slug, country, phone },
//   branches: ["Bogotá", "Medellín"],
//   admin: { full_name, email, phone, password },
//   accept_terms: true,
//   website: ""            // trampa anti-bots: debe llegar vacío
// }
//
// Secrets: APP_URL, REGISTRATION_ENABLED ("false" para cerrar el registro)
// Desplegar con verificación de JWT desactivada (es público).
// Archivo autocontenido: se puede pegar tal cual en el editor del dashboard.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": APP_URL || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (error: string, status = 400) => json({ error }, status);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED = new Set(["www", "app", "api", "admin", "login", "registro", "mail", "soporte", "support", "static"]);
const MAX_PER_IP_PER_HOUR = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Método no permitido", 405);
  if (Deno.env.get("REGISTRATION_ENABLED") === "false") return fail("El registro de empresas está cerrado.", 403);

  let b: any;
  try {
    b = await req.json();
  } catch {
    return fail("JSON inválido");
  }

  // Trampa anti-bots: un humano nunca llena este campo oculto
  if (b.website) return json({ ok: true });

  const name = String(b.company?.name ?? "").trim();
  const slug = String(b.company?.slug ?? "").trim().toLowerCase();
  const country = String(b.company?.country ?? "").trim();
  const companyPhone = String(b.company?.phone ?? "").trim();
  const branches = [...new Set((b.branches ?? []).map((x: string) => String(x).trim()).filter(Boolean))] as string[];
  const fullName = String(b.admin?.full_name ?? "").trim();
  const email = String(b.admin?.email ?? "").trim().toLowerCase();
  const adminPhone = String(b.admin?.phone ?? "").trim();
  const password = String(b.admin?.password ?? "");

  if (name.length < 2) return fail("Escribe el nombre de la empresa.");
  if (!SLUG_RE.test(slug) || RESERVED.has(slug)) return fail("La dirección web no es válida o está reservada.");
  if (!country) return fail("Selecciona el país de la empresa.");
  if (branches.length === 0 || branches.length > 50) return fail("Agrega entre 1 y 50 sucursales.");
  if (fullName.length < 3) return fail("Escribe tu nombre completo.");
  if (!EMAIL_RE.test(email)) return fail("El correo no es válido.");
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return fail("La contraseña debe tener al menos 10 caracteres, con letras y números.");
  }
  if (b.accept_terms !== true) return fail("Debes aceptar los términos y la política de tratamiento de datos.");

  // Límite por IP: máximo 3 registros por hora
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (ip) {
    const { count } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "organization_self_registered")
      .eq("ip", ip)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) return fail("Demasiados registros desde tu conexión. Intenta más tarde.", 429);
  }

  // Slug disponible (se revalida al insertar)
  const { data: taken } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (taken) return fail("Esa dirección web ya está en uso. Elige otra.", 409);

  // 1. Usuario de Auth sin confirmar
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName },
  });
  if (userErr || !created?.user) {
    const exists = userErr?.message?.toLowerCase().includes("already");
    return exists ? fail("Ese correo ya tiene una cuenta. Inicia sesión.", 409) : fail("No se pudo crear la cuenta.", 500);
  }
  const userId = created.user.id;

  // 2. Organización + sucursales
  const { data: org, error: orgErr } = await admin.rpc("create_organization_with_branches", {
    p_name: name,
    p_slug: slug,
    p_branches: branches,
  });
  if (orgErr || !org) {
    await admin.auth.admin.deleteUser(userId);
    return orgErr?.code === "23505"
      ? fail("Esa dirección web ya está en uso. Elige otra.", 409)
      : fail("No se pudo crear la empresa.", 500);
  }
  const orgId: string = org.organization_id;

  // 3. Perfil de administrador con acceso a todas las sucursales
  const { error: provErr } = await admin.rpc("provision_user", {
    p_user: userId,
    p_org: orgId,
    p_branch_ids: org.branch_ids,
    p_role_key: "organization_admin",
    p_full_name: fullName,
    p_email: email,
    p_status: "active",
  });
  if (provErr) {
    await admin.auth.admin.deleteUser(userId);
    await admin.from("organizations").delete().eq("id", orgId);
    return fail("No se pudo crear tu perfil.", 500);
  }

  await admin.from("profiles").update({ phone: adminPhone || null }).eq("id", userId);
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { organization_id: orgId, branch_ids: org.branch_ids, role_key: "organization_admin" },
  });

  // Datos de la empresa y aceptación de términos (Ley 1581 de 2012)
  const { data: s } = await admin.from("organization_settings").select("settings").eq("organization_id", orgId).single();
  await admin
    .from("organization_settings")
    .update({
      settings: {
        ...(s?.settings ?? {}),
        company_country: country,
        company_phone: companyPhone || null,
        terms_accepted: { by: userId, at: new Date().toISOString(), ip },
      },
    })
    .eq("organization_id", orgId);

  await admin.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: userId,
    action: "organization_self_registered",
    entity_type: "organizations",
    entity_id: orgId,
    metadata: { name, slug, branches, country },
    ip,
    user_agent: req.headers.get("user-agent"),
  });

  // 4. Correo de confirmación
  await anon.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: APP_URL ? `${APP_URL}/login?confirmed=1` : undefined },
  });

  return json({ ok: true, email }, 201);
});
