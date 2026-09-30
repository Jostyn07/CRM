'use client';
// Ruta: lib/auth/sessionContext.js
// Contexto de sesión: usuario, perfil, organización, sucursales y
// permisos efectivos, cargados una sola vez para toda la app.
//
//   const { profile, organization, branches, activeBranchId, can } = useSession();
//   if (can('leads.export')) ...                 // tiene el permiso (cualquier alcance)
//   if (can('leads.assign', 'organization')) ... // con alcance mínimo de organización
//
// Esto solo decide qué se muestra. La seguridad real está en RLS.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/client';
import { setActivityContext } from '../activity/tracker';

const SCOPE_RANK = { own: 1, branch: 2, organization: 3 };
const BRANCH_KEY = 'lf_active_branch';
const CACHE_KEY = 'lf_session_cache';

const EMPTY = {
  user: null,
  profile: null,
  organization: null,
  branches: [],
  permissions: {},
  isPlatformOwner: false,
};

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [activeBranchId, setActiveBranchIdState] = useState(null); // null = todas mis sucursales

  // Aplica la sesión (desde el servidor o desde el caché local)
  const apply = useCallback((user, data) => {
    const profile = data.profile?.id ? data.profile : null;
    const branches = (data.branches ?? []).filter((b) => b.status === 'active');
    setState({
      user,
      profile,
      organization: data.organization ?? null,
      roleName: data.role_name ?? null,
      branches,
      permissions: data.permissions ?? {},
      isPlatformOwner: data.is_platform_owner === true,
    });
    // Sucursal activa: la guardada si sigue siendo válida; con una sola, esa
    let saved = null;
    try {
      saved = window.localStorage.getItem(BRANCH_KEY);
    } catch {}
    const valid = branches.some((b) => b.id === saved);
    const initial = branches.length === 1 ? branches[0].id : valid ? saved : null;
    setActiveBranchIdState(initial);
    setActivityContext({ branchId: initial });
  }, []);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      try {
        window.localStorage.removeItem(CACHE_KEY);
      } catch {}
      setState(EMPTY);
      setLoading(false);
      return;
    }
    const user = session.user;

    // 1. Pinta al instante con la última sesión guardada de este usuario
    //    (solo decide qué se muestra; la seguridad real está en RLS)
    try {
      const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null');
      if (cached?.userId === user.id && cached.data) {
        apply(user, cached.data);
        setLoading(false);
      }
    } catch {}

    // 2. Datos frescos en UNA sola llamada
    let data = null;
    const res = await supabase.rpc('get_my_session');
    if (!res.error && res.data) {
      data = res.data;
    } else {
      // Compatibilidad si la migración de rendimiento aún no está aplicada
      const [profileRes, permsRes, ownerRes, branchesRes] = await Promise.all([
        supabase.rpc('get_my_profile'),
        supabase.rpc('get_my_permissions'),
        supabase.rpc('is_platform_owner'),
        supabase.from('user_branches').select('is_primary, branch:branches(id, name, status)').eq('user_id', user.id),
      ]);
      const profile = profileRes.data?.id ? profileRes.data : null;
      let organization = null;
      if (profile?.organization_id) {
        const { data: org } = await supabase.from('organizations').select('id, name, slug, status, logo_url').eq('id', profile.organization_id).single();
        organization = org ?? null;
      }
      data = {
        profile,
        organization,
        branches: (branchesRes.data ?? [])
          .filter((ub) => ub.branch)
          .map((ub) => ({ ...ub.branch, isPrimary: ub.is_primary }))
          .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.name.localeCompare(b.name)),
        permissions: permsRes.data ?? {},
        is_platform_owner: ownerRes.data === true,
      };
    }

    apply(user, data);
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: user.id, data }));
    } catch {}
    setLoading(false);
  }, [apply]);

  useEffect(() => {
    load();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) load();
    });

    // Los permisos pueden cambiar mientras la app está abierta
    const onFocus = () => {
      supabase.rpc('get_my_permissions').then(({ data }) => {
        if (data) setState((s) => (s.user ? { ...s, permissions: data } : s));
      });
    };
    window.addEventListener('focus', onFocus);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const setActiveBranchId = useCallback((id) => {
    setActiveBranchIdState(id || null);
    setActivityContext({ branchId: id || null });
    try {
      if (id) window.localStorage.setItem(BRANCH_KEY, id);
      else window.localStorage.removeItem(BRANCH_KEY);
    } catch {}
  }, []);

  const can = useCallback(
    (key, minScope) => {
      const scope = state.permissions[key];
      if (!scope) return false;
      if (!minScope) return true;
      return SCOPE_RANK[scope] >= SCOPE_RANK[minScope];
    },
    [state.permissions]
  );

  const value = useMemo(
    () => ({
      ...state,
      loading,
      activeBranchId,
      activeBranch: state.branches.find((b) => b.id === activeBranchId) ?? null,
      setActiveBranchId,
      can,
      scopeOf: (key) => state.permissions[key] ?? null,
      refresh: load,
    }),
    [state, loading, activeBranchId, setActiveBranchId, can, load]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>');
  return ctx;
}