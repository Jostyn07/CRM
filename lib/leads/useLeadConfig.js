'use client';
// Ruta: lib/leads/useLeadConfig.js
// Configuración de leads de la organización (estados, fuentes, etiquetas,
// campos personalizados) y usuarios con sus sucursales, cargados una vez.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/client';

export function useLeadConfig() {
  const [config, setConfig] = useState({
    statuses: [],
    sources: [],
    tags: [],
    customFields: [],
    users: [],
    allBranches: [],
    defaultCountryCode: '+1',
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [st, so, tg, cf, us, ub, br, settings] = await Promise.all([
      supabase.from('lead_statuses').select('*').order('position'),
      supabase.from('lead_sources').select('*').order('name'),
      supabase.from('tags').select('*').order('name'),
      supabase.from('custom_fields').select('*').order('position'),
      supabase.from('profiles').select('id, full_name, email, status').in('status', ['active', 'invited']).order('full_name'),
      supabase.from('user_branches').select('user_id, branch_id'),
      supabase.from('branches').select('id, name, status').order('name'),
      supabase.from('organization_settings').select('settings').maybeSingle(),
    ]);

    const branchesByUser = {};
    for (const r of ub.data ?? []) (branchesByUser[r.user_id] ||= []).push(r.branch_id);

    setConfig({
      statuses: st.data ?? [],
      sources: so.data ?? [],
      tags: tg.data ?? [],
      customFields: cf.data ?? [],
      users: (us.data ?? []).map((u) => ({
        ...u,
        name: u.full_name || u.email,
        branchIds: branchesByUser[u.id] ?? [],
      })),
      allBranches: br.data ?? [],
      defaultCountryCode: settings.data?.settings?.default_country_code ?? '+1',
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maps = useMemo(
    () => ({
      status: Object.fromEntries(config.statuses.map((s) => [s.id, s])),
      source: Object.fromEntries(config.sources.map((s) => [s.id, s])),
      tag: Object.fromEntries(config.tags.map((t) => [t.id, t])),
      user: Object.fromEntries(config.users.map((u) => [u.id, u])),
      branch: Object.fromEntries(config.allBranches.map((b) => [b.id, b])),
    }),
    [config]
  );

  // Usuarios que pueden ser responsables de un lead de esa sucursal
  const usersOfBranch = useCallback(
    (branchId) => (branchId ? config.users.filter((u) => u.branchIds.includes(branchId)) : config.users),
    [config.users]
  );

  return { ...config, maps, usersOfBranch, loading, reload: load };
}
