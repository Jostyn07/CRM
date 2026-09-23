'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../../lib/supabase/client';
import Button from '../../../components/ui/button';
import Input from '../../../components/ui/input';
import Modal from '../../../components/ui/modal';
import CardMenu from '../../../components/ui/cardMenu';
import DataTable from '../../../components/tables/dataTable';

const TABS = [
  { href: '/settings/usuarios', label: 'Usuarios' },
  { href: '/settings/numeros', label: 'Números' },
  { href: '/settings/plantillas', label: 'Plantillas de permisos' },
  { href: '/settings/organizacion', label: 'Organización' },
  { href: '/settings/actividad', label: 'Registro de actividad' },
];

// E.164: + seguido de 8 a 15 dígitos. No fuerza que empiece en "1" --
// la organización podría eventualmente tener números de otros países.
const E164_RE = /^\+[1-9]\d{7,14}$/;

export default function NumerosPage() {
  const [numeros, setNumeros] = useState([]);
  const [usageByNumero, setUsageByNumero] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const myProfileRef = useRef({ id: null, organization_id: null });

  const [editing, setEditing] = useState(null); // null = cerrado, {} = crear, {id,...} = editar
  const [deleting, setDeleting] = useState(null);

  // (owner multi-org) el owner no pertenece a una sola organización
  // -- necesita elegir cuál está administrando, igual que ya hace en
  // Leads y al editar un usuario. Sin esto, la consulta no sabía qué
  // catálogo mostrar y crear un número intentaba adjuntarlo a
  // organization_id = NULL (el propio del owner).
  const [isOwner, setIsOwner] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  async function load() {
    setLoading(true);
    setErrorMsg(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let ownerNow = isOwner;
    if (user) {
      const { data: myProfile } = await supabase.from('profiles').select('id, role, organization_id').eq('id', user.id).single();
      if (myProfile) {
        myProfileRef.current.id = myProfile.id;
        myProfileRef.current.organization_id = myProfile.organization_id;
        ownerNow = myProfile.role === 'owner';
        setIsOwner(ownerNow);
        if (ownerNow && organizations.length === 0) {
          const { data: orgs } = await supabase.from('organizations').select('id, name').order('name');
          setOrganizations(orgs ?? []);
        }
      }
    }

    if (ownerNow && !selectedOrgId) {
      // Todavía no eligió qué organización administrar -- nada que
      // consultar (y la RLS igual no dejaría ver nada sin esto).
      setNumeros([]);
      setUsageByNumero({});
      setLoading(false);
      return;
    }

    let numerosQuery = supabase.from('phone_numbers').select('id, numero, etiqueta, activo, created_at').order('created_at', { ascending: false });
    if (ownerNow && selectedOrgId) {
      numerosQuery = numerosQuery.eq('organization_id', selectedOrgId);
    }

    const [{ data: numerosData, error: numerosError }, { data: asignacionesData }] = await Promise.all([
      numerosQuery,
      supabase.from('user_phone_numbers').select('phone_number_id'),
    ]);

    if (numerosError) {
      setErrorMsg(numerosError.message);
    } else {
      setNumeros(numerosData ?? []);

      const counts = {};
      (asignacionesData ?? []).forEach((a) => {
        counts[a.phone_number_id] = (counts[a.phone_number_id] || 0) + 1;
      });
      setUsageByNumero(counts);
    }
    setLoading(false);
  }

  async function handleSave(form) {
    // organization_id/created_by solo van en el INSERT -- la RLS exige que
    // coincida con tu propia organización (o, si eres el owner, con la
    // organización que elegiste arriba -- el owner no tiene una
    // organización propia para usar como default aquí).
    const payload = form.id
      ? { numero: form.numero.trim(), etiqueta: form.etiqueta.trim() || null }
      : {
          numero: form.numero.trim(),
          etiqueta: form.etiqueta.trim() || null,
          organization_id: isOwner ? selectedOrgId : myProfileRef.current.organization_id,
          created_by: myProfileRef.current.id,
        };

    const { error } = form.id
      ? await supabase.from('phone_numbers').update(payload).eq('id', form.id)
      : await supabase.from('phone_numbers').insert(payload);

    if (!error) {
      setEditing(null);
      load();
    }
    return error;
  }

  async function toggleActivo(numero, checked) {
    // Optimista, igual que las plantillas -- se ve el cambio de inmediato.
    setNumeros((prev) => prev.map((n) => (n.id === numero.id ? { ...n, activo: checked } : n)));

    const { error } = await supabase.from('phone_numbers').update({ activo: checked }).eq('id', numero.id);

    if (error) {
      setErrorMsg(error.message);
      setNumeros((prev) => prev.map((n) => (n.id === numero.id ? { ...n, activo: !checked } : n)));
    }
  }

  async function handleDelete(numero) {
    const { error } = await supabase.from('phone_numbers').delete().eq('id', numero.id);
    if (!error) {
      setDeleting(null);
      load();
    }
    return error;
  }

  const columns = [
    { key: 'numero', label: 'Número', render: (n) => <span style={{ fontWeight: 600 }}>{n.numero}</span> },
    { key: 'etiqueta', label: 'Etiqueta', render: (n) => n.etiqueta || '—' },
    {
      key: 'activo',
      label: 'Activo',
      render: (n) => (
        <label style={{ display: 'inline-flex', alignItems: 'center' }}>
          <input type="checkbox" checked={n.activo} onChange={(e) => toggleActivo(n, e.target.checked)} />
        </label>
      ),
    },
    {
      key: 'usuarios',
      label: 'Usuarios asignados',
      render: (n) => usageByNumero[n.id] || 0,
    },
    {
      key: 'acciones',
      label: '',
      render: (n) => (
        <CardMenu
          items={[
            { label: 'Editar', onClick: () => setEditing(n) },
            { label: 'Eliminar', onClick: () => setDeleting(n), danger: true },
          ]}
        />
      ),
    },
  ];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em' }}>Números</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Catálogo de números comprados en Telnyx — agrégalos aquí para poder asignárselos a los usuarios como caller ID.
          </p>
          {isOwner && (
            <select
              className="input"
              style={{ height: 38, fontSize: '0.85rem', marginTop: 8 }}
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
            >
              <option value="">Elige una organización…</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
        </div>
        <Button onClick={() => setEditing({})} disabled={isOwner && !selectedOrgId}>+ Nuevo número</Button>
      </div>

      {isOwner && !selectedOrgId && (
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Elige una organización arriba para ver y administrar su catálogo de números.
        </p>
      )}

      <div className="tabs-bar">
        {TABS.map((t) => (
          <a key={t.href} href={t.href} className={`tab-link${t.href === '/settings/numeros' ? ' active' : ''}`}>
            {t.label}
          </a>
        ))}
      </div>

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : isOwner && !selectedOrgId ? null : (
        <DataTable columns={columns} rows={numeros} emptyMessage="Todavía no hay números en el catálogo. Agrega el primero con “+ Nuevo número”." />
      )}

      <NumeroModal numero={editing} onClose={() => setEditing(null)} onSave={handleSave} />

      <ConfirmDeleteModal
        numero={deleting}
        usageCount={deleting ? usageByNumero[deleting.id] || 0 : 0}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </main>
  );
}

function NumeroModal({ numero, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (numero) {
      setForm({ id: numero.id || null, numero: numero.numero || '', etiqueta: numero.etiqueta || '' });
      setError(null);
    } else {
      setForm(null);
    }
  }, [numero]);

  if (!numero || !form) return null;

  async function handleSave() {
    const trimmed = form.numero.trim();
    if (!E164_RE.test(trimmed)) {
      setError('El número debe estar en formato E.164, ej: +18175336243 (con "+" y código de país, sin espacios ni guiones).');
      return;
    }
    setSaving(true);
    const err = await onSave({ ...form, numero: trimmed });
    setSaving(false);
    if (err) {
      // Violación del unique de `numero` -- mensaje más claro que el crudo de Postgres.
      setError(err.code === '23505' ? 'Ese número ya está en el catálogo.' : err.message);
    }
  }

  return (
    <Modal open={!!numero} onClose={onClose} title={form.id ? 'Editar número' : 'Nuevo número'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input
          label="Número (E.164)"
          placeholder="+18175336243"
          value={form.numero}
          onChange={(e) => setForm({ ...form, numero: e.target.value })}
        />

        <Input
          label="Etiqueta (opcional)"
          placeholder="Ej. Ventas Texas"
          value={form.etiqueta}
          onChange={(e) => setForm({ ...form, etiqueta: e.target.value })}
        />

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteModal({ numero, usageCount, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!numero) return null;

  async function handleConfirm() {
    setDeleting(true);
    const err = await onConfirm(numero);
    setDeleting(false);
    if (err) setError(err.message);
  }

  return (
    <Modal open={!!numero} onClose={onClose} title="Eliminar número">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ fontSize: '0.9rem' }}>
          ¿Eliminar <strong>{numero.numero}</strong> del catálogo?
        </p>
        {usageCount > 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-status-default-text)' }}>
            {usageCount} usuario{usageCount === 1 ? '' : 's'} lo tiene{usageCount === 1 ? '' : 'n'} asignado como caller ID — al eliminarlo, se le{usageCount === 1 ? '' : 'es'} quita esa opción (la asignación se borra junto con el número).
          </p>
        )}
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={handleConfirm} disabled={deleting}>{deleting ? 'Eliminando…' : 'Eliminar'}</Button>
        </div>
      </div>
    </Modal>
  );
}