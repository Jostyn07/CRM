'use client';
// Ruta: app/settings/page.js
// Mi espacio: el espacio personal de cada usuario dentro de Xiris.
// Perfil visible, apariencia y fondo, disponibilidad, notificaciones,
// atajos, "mi identidad" en la empresa y seguridad de la cuenta.
// Nada de esto toca la configuración de la organización ni los permisos
// (eso sigue en las demás secciones de Configuración, para administradores).

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsHeader, errorText } from '../../components/settings/settingsTabs';
import { supabase } from '../../lib/supabase/client';
import { signOut } from '../../lib/supabase/auth';
import { useSession } from '../../lib/auth/sessionContext';
import { useTheme } from '../../lib/theme/themeContext';
import { isSoundOn, playReceived, setSoundOn } from '../../lib/sounds';
import { ACCENTS, BACKGROUNDS, DASHBOARD_WIDGETS, SHORTCUTS, STATUSES, applyAccent, applyBackground, dashboardLayout, saveMyPrefs, uploadProfileMedia, useMyPrefs } from '../../lib/me/workspace';
import { clientId, listMyAccess, mfaStatus } from '../../lib/me/access';
import OrgLogoCard from '../../components/settings/orgLogoCard';
import AccessTable from '../../components/me/accessTable';
import Icon, { IconText } from '../../components/ui/icon';

const SCOPE_LABEL = { own: 'Propio', branch: 'Sucursal', organization: 'Organización' };
const SECTIONS = [
  { key: 'perfil', label: 'Mi perfil', icon: 'user', group: 'Personal' },
  { key: 'apariencia', label: 'Apariencia y fondo', icon: 'palette', group: 'Personal' },
  { key: 'notificaciones', label: 'Notificaciones', icon: 'bell', group: 'Personal' },
  { key: 'disponibilidad', label: 'Disponibilidad', icon: 'circle-dot', group: 'Trabajo' },
  { key: 'dashboard', label: 'Mi dashboard', icon: 'layout-grid', group: 'Trabajo' },
  { key: 'atajos', label: 'Atajos de teclado', icon: 'keyboard', group: 'Trabajo' },
  { key: 'identidad', label: 'Mi identidad', icon: 'id-card', group: 'Trabajo' },
  { key: 'seguridad', label: 'Seguridad', icon: 'shield', group: 'Seguridad' },
];

const initials = (n) =>
  String(n || '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

export default function MySpacePage() {
  const { user, profile, organization, branches, permissions, isPlatformOwner, roleName, loading, refresh, can } = useSession();
  const prefs = useMyPrefs(profile?.organization_id ? user?.id : null);
  const [section, setSection] = useState('perfil');

  useEffect(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    if (SECTIONS.some((s) => s.key === h)) setSection(h);
  }, []);
  const go = (k) => {
    setSection(k);
    try {
      window.history.replaceState(null, '', `#${k}`);
    } catch {}
  };

  if (loading) return <main style={{ padding: '1.5rem' }}>Cargando…</main>;
  const name = prefs?.display_name || profile?.full_name || user?.email || 'Usuario';
  const status = STATUSES[prefs?.availability] ?? STATUSES.available;
  const bg = BACKGROUNDS.find((b) => b.key === (prefs?.prefs?.bg || 'seda')) ?? BACKGROUNDS[0];

  return (
    <main className="me-page">
      <SettingsHeader title="Mi espacio" subtitle="Tu perfil y tus preferencias. Lo que cambies aquí solo te afecta a ti." />

      <section className="card me-hero">
        <div className="me-banner" data-bgprev={bg.key} style={prefs?.prefs?.cover_url ? { background: `center / cover no-repeat url("${prefs.prefs.cover_url}")` } : undefined} />
        <div className="me-hero-body">
          <span className="me-avatar">
            {prefs?.prefs?.avatar_url ? <img src={prefs.prefs.avatar_url} alt="" /> : initials(name)}
            <i style={{ background: status.color }} title={status.label} />
          </span>
          <div className="me-hero-text">
            <h2>{name}</h2>
            <p>{prefs?.job_title || roleName || 'Miembro del equipo'}</p>
            <span className="me-status">
              <i style={{ background: status.color }} /> {status.label}
            </span>
          </div>
          <div className="me-hero-actions">
            <button className="btn btn-secondary" onClick={() => go('perfil')}>
              <IconText name="pencil" size={15}>Editar perfil</IconText>
            </button>
            <button className="btn me-gold" onClick={() => go('apariencia')}>
              <IconText name="palette" size={15}>Personalizar</IconText>
            </button>
          </div>
        </div>
      </section>

      <div className="me-layout">
        <nav className="card me-nav" aria-label="Secciones de Mi espacio">
          {['Personal', 'Trabajo', 'Seguridad'].map((g) => (
            <div key={g}>
              <span className="me-nav-group">{g}</span>
              {SECTIONS.filter((s) => s.group === g).map((s) => (
                <button key={s.key} className={section === s.key ? 'active' : ''} onClick={() => go(s.key)}>
                  <Icon name={s.icon} size={16} /> {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="me-content">
          {!prefs && profile?.organization_id && <p className="me-muted">Cargando tus preferencias…</p>}
          {section === 'perfil' && <PhotosSection user={user} prefs={prefs} name={name} />}
          {section === 'perfil' && <ProfileSection user={user} profile={profile} prefs={prefs} refresh={refresh} />}
          {section === 'apariencia' && <AppearanceSection prefs={prefs} />}
          {section === 'notificaciones' && <NotificationsSection />}
          {section === 'disponibilidad' && <AvailabilitySection prefs={prefs} />}
          {section === 'dashboard' && <DashboardSection prefs={prefs} />}
          {section === 'atajos' && <ShortcutsSection prefs={prefs} />}
          {section === 'identidad' && (
            <IdentitySection
              name={name}
              prefs={prefs}
              roleName={isPlatformOwner ? 'Dueño de la plataforma' : roleName}
              organization={organization}
              branches={branches}
              permissions={permissions}
              userId={user?.id}
            />
          )}
          {section === 'seguridad' && <SecuritySection user={user} can={can} />}
          {section === 'perfil' && (can?.('settings.manage', 'organization') || isPlatformOwner) && (
            <div style={{ marginTop: 16 }}>
              <OrgLogoCard />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Card({ title, sub, children, footer }) {
  return (
    <section className="card me-card">
      <header>
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </header>
      {children}
      {footer && <footer>{footer}</footer>}
    </section>
  );
}

function useSaver() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run(fn, ok = 'Guardado.') {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'No se pudo guardar.' });
    } finally {
      setBusy(false);
    }
  }
  const view = msg ? <span className={msg.ok ? 'me-ok' : 'me-err'}>{msg.text}</span> : null;
  return { run, busy, view };
}

// ---------------- Mi perfil
function ProfileSection({ user, profile, prefs, refresh }) {
  const [f, setF] = useState(null);
  const { run, busy, view } = useSaver();
  useEffect(() => {
    if (!profile) return;
    setF({
      full_name: profile.full_name ?? '',
      phone: profile.phone ?? '',
      display_name: prefs?.display_name ?? '',
      job_title: prefs?.job_title ?? '',
      bio: prefs?.bio ?? '',
      extension: prefs?.extension ?? '',
    });
  }, [profile, prefs?.display_name, prefs?.job_title, prefs?.bio, prefs?.extension]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    await run(async () => {
      const { error } = await supabase.from('profiles').update({ full_name: f.full_name.trim(), phone: f.phone.trim() || null }).eq('id', user.id);
      if (error) throw new Error(await errorText(error));
      await saveMyPrefs({ display_name: f.display_name, job_title: f.job_title, bio: f.bio, extension: f.extension });
      refresh?.();
    }, 'Perfil guardado.');
  }

  return (
    <form onSubmit={save}>
      <Card title="Mi perfil" sub="Así te ven tus compañeros dentro de Xiris.">
        <div className="me-grid">
          <Field label="Nombre completo">
            <input className="input" value={f.full_name} onChange={set('full_name')} required />
          </Field>
          <Field label="Nombre visible" hint="Opcional. Cómo quieres que te llamen.">
            <input className="input" value={f.display_name} onChange={set('display_name')} maxLength={80} placeholder={f.full_name} />
          </Field>
          <Field label="Cargo">
            <input className="input" value={f.job_title} onChange={set('job_title')} maxLength={80} placeholder="Ej. Asesor comercial" />
          </Field>
          <Field label="Teléfono">
            <input className="input" value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="Extensión" hint="Si manejas telefonía.">
            <input className="input" value={f.extension} onChange={set('extension')} maxLength={20} />
          </Field>
          <Field label="Correo">
            <input className="input" value={user?.email ?? ''} disabled />
          </Field>
        </div>
        <Field label="Descripción corta" hint={`${f.bio.length}/280`}>
          <textarea className="input" rows={3} value={f.bio} onChange={set('bio')} maxLength={280} placeholder="Cuéntale a tu equipo en qué te especializas." />
        </Field>
        <div className="me-actions">
          {view}
          <button className="btn me-gold" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </div>
      </Card>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="me-field">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}

// ---------------- Apariencia y fondo
function AppearanceSection({ prefs }) {
  const { preference, setTheme } = useTheme();
  const { run, view } = useSaver();
  const accentSaver = useSaver();
  const current = prefs?.prefs?.bg || 'seda';
  const themes = [
    { key: 'light', label: 'Claro', icon: 'sun' },
    { key: 'dark', label: 'Oscuro', icon: 'moon' },
    { key: 'system', label: 'Automático', icon: 'monitor' },
  ];
  return (
    <>
      <Card title="Tema" sub="Automático sigue la configuración de tu computador.">
        <div className="me-choice3">
          {themes.map((t) => (
            <button key={t.key} type="button" className={`me-choice${preference === t.key ? ' on' : ''}`} onClick={() => setTheme(t.key)}>
              <Icon name={t.icon} size={20} />
              {t.label}
            </button>
          ))}
        </div>
      </Card>
      <Card title="Color de acento" sub="Cambia botones, pestañas, selecciones e indicadores. Solo en tu pantalla." footer={accentSaver.view}>
        <div className="me-accents">
          {ACCENTS.map((a) => {
            const on = (prefs?.prefs?.accent || null) === a.color;
            return (
              <button
                key={a.key}
                type="button"
                className={`me-accent${on ? ' on' : ''}`}
                onClick={() => {
                  applyAccent(a.color);
                  accentSaver.run(() => saveMyPrefs({ prefs: { accent: a.color } }), 'Color guardado.');
                }}
              >
                <span style={{ background: a.swatch }}>{on && <Icon name="check" size={14} />}</span>
                {a.label}
              </button>
            );
          })}
          <label className="me-accent">
            <span style={{ background: prefs?.prefs?.accent && !ACCENTS.some((a) => a.color === prefs.prefs.accent) ? prefs.prefs.accent : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
              <input
                type="color"
                defaultValue={prefs?.prefs?.accent || '#c99a3d'}
                onChange={(e) => applyAccent(e.target.value)}
                onBlur={(e) => accentSaver.run(() => saveMyPrefs({ prefs: { accent: e.target.value } }), 'Color guardado.')}
                aria-label="Color personalizado"
              />
            </span>
            Personalizado
          </label>
        </div>
      </Card>
      <Card title="Fondo de mi espacio" sub="Solo cambia tu pantalla; tus compañeros siguen viendo el suyo." footer={view}>
        <div className="me-bgs">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`me-bg${current === b.key ? ' on' : ''}`}
              onClick={() => {
                applyBackground(b.key);
                run(() => saveMyPrefs({ prefs: { bg: b.key } }), 'Fondo guardado.');
              }}
            >
              <span className="me-bg-swatch" data-bgprev={b.key} />
              <span>{b.label}</span>
              {current === b.key && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

// ---------------- Notificaciones
function NotificationsSection() {
  const [chat, setChat] = useState(true);
  const [wa, setWa] = useState(true);
  const [perm, setPerm] = useState('default');
  useEffect(() => {
    setChat(isSoundOn('chat'));
    setWa(isSoundOn('wa'));
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
  }, []);
  return (
    <>
      <Card title="Sonidos" sub="Cada canal se puede silenciar por separado. Se guarda en este navegador.">
        <Toggle
          label="Comunicación interna"
          desc="Sonido al recibir y enviar mensajes del equipo."
          on={chat}
          onChange={(v) => {
            setChat(v);
            setSoundOn(v, 'chat');
            if (v) setTimeout(() => playReceived('chat'), 50);
          }}
        />
        <Toggle
          label="WhatsApp"
          desc="Sonido al recibir y enviar mensajes de clientes."
          on={wa}
          onChange={(v) => {
            setWa(v);
            setSoundOn(v, 'wa');
            if (v) setTimeout(() => playReceived('wa'), 50);
          }}
        />
      </Card>
      <Card title="Avisos de escritorio" sub="Muestran un aviso aunque estés en otra pestaña.">
        {perm === 'granted' ? (
          <p className="me-ok">
            <Icon name="circle-check" size={15} /> Activados en este navegador.
          </p>
        ) : perm === 'denied' ? (
          <p className="me-muted">Están bloqueados. Actívalos desde el candado de la barra de direcciones del navegador.</p>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={async () => {
              if (typeof Notification === 'undefined') return;
              setPerm(await Notification.requestPermission());
            }}
          >
            <IconText name="bell" size={15}>Activar avisos</IconText>
          </button>
        )}
      </Card>
    </>
  );
}

function Toggle({ label, desc, on, onChange }) {
  return (
    <label className="me-toggle">
      <span>
        <strong>{label}</strong>
        {desc && <small>{desc}</small>}
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

// ---------------- Disponibilidad
function AvailabilitySection({ prefs }) {
  const { run, view } = useSaver();
  if (!prefs) return null;
  return (
    <Card title="Disponibilidad" sub="Tu equipo ve tu estado junto a tu nombre." footer={view}>
      <div className="me-status-grid">
        {Object.entries(STATUSES).map(([k, s]) => (
          <button key={k} type="button" className={`me-choice${prefs.availability === k ? ' on' : ''}`} onClick={() => run(() => saveMyPrefs({ availability: k }), 'Estado actualizado.')}>
            <i className="me-dot" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>
      <Toggle
        label="Estado automático"
        desc='Pasar a "Ausente" tras 15 minutos sin actividad y volver a "Disponible" al regresar.'
        on={prefs.availability_auto}
        onChange={(v) => run(() => saveMyPrefs({ availability_auto: v }))}
      />
      <p className="me-muted" style={{ marginTop: 10 }}>
        Desde {new Date(prefs.availability_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    </Card>
  );
}

// ---------------- Atajos
function ShortcutsSection({ prefs }) {
  const { run, view } = useSaver();
  const on = prefs?.prefs?.shortcuts !== false;
  return (
    <Card title="Atajos de teclado" sub="Muévete por Xiris sin soltar el teclado. No funcionan mientras escribes en un campo." footer={view}>
      <Toggle label="Usar atajos de teclado" on={on} onChange={(v) => run(() => saveMyPrefs({ prefs: { shortcuts: v } }))} />
      <div className={`me-shortcuts${on ? '' : ' off'}`}>
        {SHORTCUTS.map((s) => (
          <div key={s.keys}>
            <span>{s.label}</span>
            <span>
              {s.keys.split(' + ').map((k, i) => (
                <span key={k}>
                  {i > 0 && ' + '}
                  <kbd>{k}</kbd>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------- Mi identidad
function IdentitySection({ name, prefs, roleName, organization, branches, permissions, userId }) {
  const [sum, setSum] = useState(null);
  const [perms, setPerms] = useState([]);
  const [showPerms, setShowPerms] = useState(false);
  useEffect(() => {
    if (!userId) return;
    supabase.rpc('my_workspace_summary').then(({ data }) => setSum(data ?? {}));
    supabase
      .from('permissions')
      .select('key, description')
      .order('key')
      .then(({ data }) => setPerms(data ?? []));
  }, [userId]);
  const mine = useMemo(() => perms.filter((p) => permissions?.[p.key]), [perms, permissions]);
  const since = sum?.member_since ? new Date(sum.member_since).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  return (
    <>
      <Card title="Mi identidad en la empresa" sub="Tu lugar dentro de la organización.">
        <div className="me-ident">
          <Fact label="Nombre" value={name} />
          <Fact label="Cargo" value={prefs?.job_title || '—'} />
          <Fact label="Rol" value={roleName || '—'} />
          <Fact label="Organización" value={organization?.name || '—'} />
          <Fact label="Sucursales" value={branches.map((b) => b.name).join(', ') || '—'} />
          <Fact label="En Xiris desde" value={since} />
        </div>
        <div className="me-kpis">
          <div>
            <b>{sum ? Number(sum.leads_assigned ?? 0).toLocaleString('es-CO') : '…'}</b>
            <span>Leads asignados</span>
          </div>
          <div>
            <b>{sum ? Number(sum.tasks_open ?? 0).toLocaleString('es-CO') : '…'}</b>
            <span>Tareas pendientes</span>
          </div>
        </div>
      </Card>
      <Card title="Mis permisos" sub="Los define un administrador.">
        <button type="button" className="btn btn-secondary" onClick={() => setShowPerms((v) => !v)}>
          {showPerms ? 'Ocultar permisos' : `Ver mis permisos (${mine.length})`}
        </button>
        {showPerms && (
          <div className="me-perms">
            {mine.map((p) => (
              <div key={p.key}>
                <span>{p.description}</span>
                <span>{SCOPE_LABEL[permissions[p.key]]}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function Fact({ label, value }) {
  return (
    <div className="me-fact">
      <small>{label}</small>
      <span>{value}</span>
    </div>
  );
}

// ---------------- Seguridad
function SecuritySection({ user, can }) {
  const router = useRouter();
  const [pw, setPw] = useState({ a: '', b: '' });
  const { run, busy, view } = useSaver();
  const others = useSaver();
  const weak = pw.a && pw.a.length < 8;
  const mismatch = pw.b && pw.a !== pw.b;

  return (
    <>
      {can('account.password') && (
      <Card title="Cambiar contraseña" sub={`Cuenta: ${user?.email ?? ''}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (weak || mismatch || !pw.a) return;
            run(async () => {
              const { error } = await supabase.auth.updateUser({ password: pw.a });
              if (error) throw new Error(error.message.includes('different') ? 'La nueva contraseña debe ser diferente a la actual.' : error.message);
              setPw({ a: '', b: '' });
            }, 'Contraseña actualizada.');
          }}
        >
          <div className="me-grid">
            <Field label="Nueva contraseña" hint={weak ? 'Mínimo 8 caracteres.' : null}>
              <input className="input" type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
            </Field>
            <Field label="Repite la contraseña" hint={mismatch ? 'No coinciden.' : null}>
              <input className="input" type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
            </Field>
          </div>
          <div className="me-actions">
            {view}
            <button className="btn me-gold" disabled={busy || !pw.a || weak || mismatch}>
              Cambiar contraseña
            </button>
          </div>
        </form>
      </Card>
      )}
      <MfaCard />
      {can('account.access_log') && <AccessCard />}
      <Card title="Sesiones" sub="Si iniciaste sesión en otro equipo y no lo usas, ciérrala desde aquí." footer={others.view}>
        <div className="me-actions" style={{ justifyContent: 'flex-start' }}>
          {can('account.sessions') && (
          <button
            className="btn btn-secondary"
            disabled={others.busy}
            onClick={() =>
              others.run(async () => {
                const { error } = await supabase.auth.signOut({ scope: 'others' });
                if (error) throw new Error(error.message);
              }, 'Se cerraron tus otras sesiones.')
            }
          >
            <IconText name="monitor-smartphone" size={15}>Cerrar sesión en otros dispositivos</IconText>
          </button>
          )}
          <button
            className="btn btn-secondary"
            style={{ color: 'var(--color-danger)' }}
            onClick={async () => {
              await signOut();
              router.push('/login');
            }}
          >
            <IconText name="log-out" size={15}>Cerrar sesión aquí</IconText>
          </button>
        </div>
      </Card>
    </>
  );
}


// ---------------- Foto de perfil y portada
function PhotosSection({ user, prefs, name }) {
  const { run, busy, view } = useSaver();
  async function pick(kind, file) {
    if (!file) return;
    await run(async () => {
      const url = await uploadProfileMedia(user.id, file, kind);
      await saveMyPrefs({ prefs: { [`${kind}_url`]: url } });
    }, kind === 'avatar' ? 'Foto actualizada.' : 'Portada actualizada.');
  }
  const remove = (kind) => run(() => saveMyPrefs({ prefs: { [`${kind}_url`]: null } }), 'Imagen quitada.');
  return (
    <Card title="Foto y portada" sub="PNG, JPG, WEBP o GIF de hasta 5 MB. Tus compañeros verán tu foto." footer={view}>
      <div className="me-photos">
        <div className="me-photo">
          <span className="me-photo-avatar">{prefs?.prefs?.avatar_url ? <img src={prefs.prefs.avatar_url} alt="" /> : initials(name)}</span>
          <div className="me-photo-actions">
            <label className={`btn btn-secondary${busy ? ' disabled' : ''}`}>
              <IconText name="camera" size={15}>Cambiar foto</IconText>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pick('avatar', e.target.files?.[0])} />
            </label>
            {prefs?.prefs?.avatar_url && (
              <button type="button" className="btn btn-secondary" onClick={() => remove('avatar')}>
                Quitar
              </button>
            )}
          </div>
        </div>
        <div className="me-photo">
          <span className="me-photo-cover" style={prefs?.prefs?.cover_url ? { backgroundImage: `url("${prefs.prefs.cover_url}")` } : undefined} />
          <div className="me-photo-actions">
            <label className={`btn btn-secondary${busy ? ' disabled' : ''}`}>
              <IconText name="image" size={15}>Cambiar portada</IconText>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pick('cover', e.target.files?.[0])} />
            </label>
            {prefs?.prefs?.cover_url && (
              <button type="button" className="btn btn-secondary" onClick={() => remove('cover')}>
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------- Mi dashboard (ordenar y ocultar)
function DashboardSection({ prefs }) {
  const { run, view } = useSaver();
  const base = dashboardLayout(prefs);
  const [order, setOrder] = useState(base.order);
  const [hidden, setHidden] = useState(base.hidden);
  useEffect(() => {
    const l = dashboardLayout(prefs);
    setOrder(l.order);
    setHidden(l.hidden);
  }, [prefs?.prefs?.dashboard]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = (k) => DASHBOARD_WIDGETS.find((w) => w.key === k)?.label ?? k;
  const save = (o, h) => run(() => saveMyPrefs({ prefs: { dashboard: { order: o, hidden: [...h] } } }), 'Dashboard guardado.');
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const o = [...order];
    [o[i], o[j]] = [o[j], o[i]];
    setOrder(o);
    save(o, hidden);
  }
  function toggle(k) {
    const h = new Set(hidden);
    if (h.has(k)) h.delete(k);
    else h.add(k);
    setHidden(h);
    save(order, h);
  }
  return (
    <Card title="Mi dashboard" sub="Elige qué ves al entrar y en qué orden. Solo cambia tu Dashboard." footer={view}>
      <ol className="me-widgets">
        {order.map((k, i) => (
          <li key={k} className={hidden.has(k) ? 'off' : ''}>
            <span className="me-widget-n">{i + 1}</span>
            <label>
              <input type="checkbox" checked={!hidden.has(k)} onChange={() => toggle(k)} /> {label(k)}
            </label>
            <span className="me-widget-move">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${label(k)}`}>
                <Icon name="chevron-up" size={16} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Bajar ${label(k)}`}>
                <Icon name="chevron-down" size={16} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="me-actions" style={{ justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            const o = DASHBOARD_WIDGETS.map((w) => w.key);
            setOrder(o);
            setHidden(new Set());
            save(o, new Set());
          }}
        >
          Restablecer
        </button>
        <a className="btn btn-secondary" href="/dashboard">
          Ver mi dashboard
        </a>
      </div>
    </Card>
  );
}

// ---------------- Verificación en dos pasos
function MfaCard() {
  const [st, setSt] = useState(null);
  const [enroll, setEnroll] = useState(null); // { id, qr, secret }
  const [code, setCode] = useState('');
  const { run, busy, view } = useSaver();
  const load = () => mfaStatus().then(setSt).catch(() => setSt({ factors: [] }));
  useEffect(() => {
    load();
  }, []);
  async function start() {
    await run(async () => {
      // Limpia intentos anteriores sin terminar
      const { data: all } = await supabase.auth.mfa.listFactors();
      for (const f of all?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Xiris ${new Date().toISOString().slice(0, 10)}` });
      if (error) throw new Error(error.message);
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    }, 'Escanea el código y escribe los 6 dígitos.');
  }
  async function confirm(e) {
    e.preventDefault();
    await run(async () => {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
      if (error) throw new Error('El código no es válido. Revisa la hora de tu celular e intenta con el siguiente.');
      setEnroll(null);
      setCode('');
      await load();
    }, 'Verificación en dos pasos activada.');
  }
  async function disable(id) {
    if (!window.confirm('¿Desactivar la verificación en dos pasos? Tu cuenta quedará protegida solo con la contraseña.')) return;
    await run(async () => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw new Error(error.message);
      await load();
    }, 'Verificación en dos pasos desactivada.');
  }
  const active = st?.factors?.length > 0;
  return (
    <Card title="Verificación en dos pasos" sub="Además de la contraseña, al entrar se pide un código de una aplicación como Google Authenticator o Microsoft Authenticator." footer={view}>
      {!st ? (
        <p className="me-muted">Cargando…</p>
      ) : active ? (
        <div className="me-actions" style={{ justifyContent: 'space-between' }}>
          <span className="me-ok">
            <Icon name="shield-check" size={16} /> Activada
          </span>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => disable(st.factors[0].id)}>
            Desactivar
          </button>
        </div>
      ) : enroll ? (
        <form onSubmit={confirm} className="me-mfa">
          <img src={enroll.qr} alt="Código QR para la aplicación de autenticación" />
          <div>
            <ol>
              <li>Abre tu aplicación de autenticación y escanea el código.</li>
              <li>
                Si no puedes escanearlo, escribe esta clave: <code>{enroll.secret}</code>
              </li>
              <li>Escribe el código de 6 dígitos que aparece.</li>
            </ol>
            <div className="me-actions" style={{ justifyContent: 'flex-start' }}>
              <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ width: 140, letterSpacing: '0.3em', textAlign: 'center' }} />
              <button className="btn me-gold" disabled={busy || code.length !== 6}>
                Activar
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEnroll(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={start}>
          <IconText name="shield-check" size={15}>Activar verificación en dos pasos</IconText>
        </button>
      )}
    </Card>
  );
}

// ---------------- Dónde se ha abierto mi cuenta
function AccessCard() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    listMyAccess()
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  const mine = clientId();
  return (
    <Card title="Dónde se ha abierto mi cuenta" sub="Equipos y navegadores donde se ha usado tu cuenta. Si ves uno que no reconoces, cambia tu contraseña y cierra las demás sesiones.">
      {error && <p className="me-err">{error}</p>}
      {!rows ? <p className="me-muted">Cargando…</p> : <AccessTable rows={rows} mine={mine} />}
    </Card>
  );
}