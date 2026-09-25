// Ruta: lib/tasks/useOrgUsers.js
// Usuarios de la organización (activos o invitados) para elegir
// responsable de una tarea y mostrar nombres.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/client';

export function useOrgUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase
      .from('profiles')
      .select('id, full_name, email, status')
      .in('status', ['active', 'invited'])
      .order('full_name')
      .then(({ data }) => {
        if (!alive) return;
        setUsers((data ?? []).map((u) => ({ ...u, name: u.full_name || u.email })));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  return { users, userMap, loading };
}