'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase/client';
import Button from '../ui/button';

// Trae de a 1000 filas por vez (evita el límite por consulta de
// Supabase y funciona igual de bien con cientos que con decenas de
// miles de leads).
const FETCH_BATCH_SIZE = 1000;

export default function ExportLeadsSection() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(''); // '' = todos los usuarios
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
    setUsers(data ?? []);
  }

  async function fetchAllLeads(ownerId) {
    let all = [];
    let from = 0;

    // Incluye leads activos Y archivados — es una exportación completa,
    // no la vista filtrada de la pantalla de Leads.
    while (true) {
      let query = supabase
        .from('leads')
        .select(
          `
          name, phone, address, email, status, created_at,
          owner:profiles!leads_owner_id_fkey ( full_name ),
          lead_funnel ( funnels ( name ) )
        `
        )
        .order('created_at', { ascending: false })
        .range(from, from + FETCH_BATCH_SIZE - 1);

      if (ownerId) query = query.eq('owner_id', ownerId);

      const { data, error } = await query;
      if (error) throw error;

      all = all.concat(data ?? []);
      setProgress(all.length);

      if (!data || data.length < FETCH_BATCH_SIZE) break;
      from += FETCH_BATCH_SIZE;
    }

    return all;
  }

  async function handleExport() {
    setExporting(true);
    setErrorMsg(null);
    setProgress(0);

    try {
      const leads = await fetchAllLeads(selectedUserId || null);

      const rows = leads.map((l) => {
        const owner = Array.isArray(l.owner) ? l.owner[0] : l.owner;
        const rel = Array.isArray(l.lead_funnel) ? l.lead_funnel[0] : l.lead_funnel;
        const funnelName = Array.isArray(rel?.funnels) ? rel.funnels[0]?.name : rel?.funnels?.name;

        return {
          Nombre: l.name,
          Teléfono: l.phone,
          Dirección: l.address || '',
          Correo: l.email || '',
          Estado: l.status === 'archived' ? 'Archivado' : 'Activo',
          Propietario: owner?.full_name || '',
          Embudo: funnelName || 'Sin asignar',
          Creado: l.created_at ? new Date(l.created_at).toLocaleString('es') : '',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

      const selectedUserName = selectedUserId
        ? (users.find((u) => u.id === selectedUserId)?.full_name || 'usuario').replace(/\s+/g, '_')
        : 'todos';
      const dateStamp = new Date().toISOString().slice(0, 10);

      XLSX.writeFile(workbook, `leads-${selectedUserName}-${dateStamp}.xlsx`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Exportar leads a Excel</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
        Descarga todos los leads del sistema, o filtrados por un usuario específico. Incluye activos y
        archivados.
      </p>

      <label style={{ display: 'block', marginBottom: '0.75rem', maxWidth: 280 }}>
        <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Usuario</span>
        <select className="input" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Todos los usuarios</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name || u.id}</option>
          ))}
        </select>
      </label>

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '0.75rem' }}>{errorMsg}</p>}

      <Button onClick={handleExport} disabled={exporting}>
        {exporting
          ? progress !== null
            ? `Descargando… (${progress} leads)`
            : 'Descargando…'
          : 'Descargar Excel'}
      </Button>
    </div>
  );
}