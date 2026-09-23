import { supabase } from './client';

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // Un usuario marcado como inactivo por un admin no debe poder entrar,
  // aunque su contraseña sea correcta — Supabase Auth no sabe nada de
  // profiles.estado por sí solo, así que lo validamos acá.
  const { data: profile } = await supabase
    .from('profiles')
    .select('estado')
    .eq('id', data.user.id)
    .single();

  if (profile?.estado === 'inactivo') {
    await supabase.auth.signOut();
    throw new Error('Tu cuenta está inactiva. Contacta a un administrador.');
  }

  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}