// Ruta: lib/supabase/auth.js
import { supabase } from './client';
import { trackLogin, trackLogout } from '../activity/tracker';

const BLOCKED_STATUS = {
  inactive: 'Tu cuenta está inactiva. Contacta a un administrador.',
  suspended: 'Tu cuenta está suspendida. Contacta a un administrador.',
};

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message?.toLowerCase().includes('invalid login')) {
      throw new Error('Correo o contraseña incorrectos.');
    }
    if (error.message?.toLowerCase().includes('email not confirmed')) {
      throw new Error('Confirma tu correo antes de entrar: revisa el enlace que te enviamos.');
    }
    throw error;
  }

  // Supabase Auth no conoce el estado del perfil: se valida acá.
  // (Aunque entrara, RLS no le dejaría ver nada.)
  const [{ data: profile }, { data: isOwner }] = await Promise.all([
    supabase.rpc('get_my_profile'),
    supabase.rpc('is_platform_owner'),
  ]);

  if (profile?.id && BLOCKED_STATUS[profile.status]) {
    await supabase.auth.signOut();
    throw new Error(BLOCKED_STATUS[profile.status]);
  }

  if (!profile?.id && !isOwner) {
    await supabase.auth.signOut();
    throw new Error('Tu usuario no pertenece a ninguna organización. Contacta a un administrador.');
  }

  await trackLogin();
  return { ...data, profile: profile?.id ? profile : null, isPlatformOwner: isOwner === true };
}

export async function signOut() {
  await trackLogout();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}