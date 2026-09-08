'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { observeWishlineUser, signInToWishline, signOutOfWishline, wishlineAuthorizationHeader } from '@/lib/firebase-client';
import type { AdminOverview } from '@/lib/wishline-admin-store';
import styles from './admin.module.css';

type SessionState = 'checking' | 'signed-out' | 'loading' | 'ready' | 'forbidden' | 'error';

export default function AdminPage() {
  const [session, setSession] = useState<SessionState>('checking');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setSession('loading');
    setMessage('');
    try {
      const response = await fetch('/api/admin/overview', { cache: 'no-store', headers: await wishlineAuthorizationHeader() });
      const body = await response.json() as AdminOverview | { error?: { message?: string } };
      if (!response.ok || 'error' in body) {
        setMessage('error' in body ? body.error?.message || 'No se pudo abrir el panel.' : 'No se pudo abrir el panel.');
        setSession(response.status === 403 ? 'forbidden' : response.status === 401 ? 'signed-out' : 'error');
        return;
      }
      if (!('totals' in body)) throw new Error('Invalid operator response.');
      setOverview(body as AdminOverview);
      setSession('ready');
    } catch {
      setMessage('No se pudo conectar con la consola.');
      setSession('error');
    }
  }

  useEffect(() => observeWishlineUser((user) => {
    if (!user) {
      setOverview(null);
      setSession('signed-out');
      return;
    }
    void load();
  }), []);

  const accounts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return overview?.accounts || [];
    return (overview?.accounts || []).filter((account) =>
      [account.ownerEmail, account.workspaceName, account.projectName, account.appId?.toString()]
        .some((value) => value?.toLowerCase().includes(term)),
    );
  }, [overview, query]);

  if (session === 'checking' || session === 'loading') return <Gate title="Abriendo consola…" detail="Verificando tu identidad y cargando la actividad." />;
  if (session === 'signed-out') return (
    <Gate title="Consola privada" detail="Inicia sesión con la cuenta administradora de Wishline.">
      <button className={styles.primary} onClick={() => void signInToWishline().then(load).catch(() => {
        setMessage('No se pudo iniciar sesión con Google.');
        setSession('error');
      })}>Continuar con Google</button>
    </Gate>
  );
  if (session === 'forbidden') return (
    <Gate title="Acceso restringido" detail={message || 'Esta cuenta no está autorizada.'}>
      <button className={styles.secondary} onClick={() => void signOutOfWishline()}>Cambiar de cuenta</button>
    </Gate>
  );
  if (!overview) return (
    <Gate title="Panel no disponible" detail={message}>
      <button className={styles.primary} onClick={() => void load()}>Reintentar</button>
    </Gate>
  );

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}><span>W</span> Wishline</Link>
        <div className={styles.operator}>Operator console <small>Acceso privado</small></div>
        <nav><a className={styles.active} href="#summary">Resumen</a><a href="#scheduler">Worker horario</a><a href="#accounts">Usuarios</a></nav>
        <button className={styles.signOut} onClick={() => void signOutOfWishline()}>Cerrar sesión</button>
      </aside>
      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><span className={styles.liveDot} /> Sistema operativo</div>
          <button className={styles.secondary} onClick={() => void load()}>Actualizar</button>
        </header>
        <div className={styles.content} id="summary">
          <div className={styles.heading}>
            <div><p>ADMINISTRACIÓN</p><h1>Resumen de Wishline</h1><span>Datos privados del operador · actualizado {formatDate(overview.generatedAt)}</span></div>
          </div>
          <div className={styles.stats}>
            <Stat label="Usuarios" value={overview.totals.accounts} accent />
            <Stat label="Nuevos · 7 días" value={overview.totals.newLast7Days} />
            <Stat label="Proyectos conectados" value={overview.totals.connected} />
            <Stat label="Con notificaciones" value={overview.totals.notificationsEnabled} />
          </div>
          <SchedulerPanel overview={overview} />
          <section className={styles.panel} id="accounts">
            <div className={styles.panelHead}>
              <div><h2>Usuarios registrados</h2><p>Los más recientes aparecen primero.</p></div>
              <input aria-label="Buscar usuarios" placeholder="Buscar email, proyecto o App ID" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Usuario</th><th>Registro</th><th>Proyecto</th><th>Estado</th><th>Última actividad</th><th>Push</th></tr></thead>
                <tbody>{accounts.map((account) => (
                  <tr key={account.workspaceId}>
                    <td><strong>{account.ownerEmail || 'Sin email'}</strong><small>{account.workspaceName}</small></td>
                    <td>{formatDate(account.createdAt)}</td>
                    <td><strong>{account.projectName || 'Sin conectar'}</strong><small>{account.appId ? `App ${account.appId}` : '—'}</small></td>
                    <td><span className={account.connected ? styles.good : styles.neutral}>{account.connected ? 'Conectado' : 'Pendiente'}</span></td>
                    <td>{formatDate(account.lastActivityAt || account.updatedAt)}</td>
                    <td>{account.notificationsEnabled ? 'Activas' : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!accounts.length && <div className={styles.empty}>No hay usuarios que coincidan con la búsqueda.</div>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Gate({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return <main className={styles.gate}><div className={styles.gateCard}><div className={styles.mark}>W</div><p>WISHLINE OPERATOR</p><h1>{title}</h1><span>{detail}</span>{children && <div className={styles.gateAction}>{children}</div>}</div></main>;
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className={`${styles.stat} ${accent ? styles.accent : ''}`}><span>{label}</span><strong>{value.toLocaleString('es')}</strong></div>;
}

function SchedulerPanel({ overview }: { overview: AdminOverview }) {
  const { scheduler } = overview;
  const latest = scheduler.latest;
  const statusLabel = { healthy: 'Saludable', degraded: 'Con fallas', stale: 'Atrasado', unknown: 'Sin datos' }[scheduler.status];
  return <section className={styles.panel} id="scheduler">
    <div className={styles.panelHead}>
      <div><h2>Worker automático · cada hora</h2><p>Últimas 48 ejecuciones conservadas en D1.</p></div>
      <span className={`${styles.health} ${styles[scheduler.status]}`}>{statusLabel}</span>
    </div>
    <div className={styles.schedulerSummary}>
      <div><span>Última ejecución</span><strong>{latest ? formatDate(latest.completedAt) : '—'}</strong></div>
      <div><span>Resultado</span><strong>{latest ? runLabel(latest.result) : 'Sin datos'}</strong></div>
      <div><span>Proyectos</span><strong>{latest ? `${latest.succeeded}/${latest.attempted} correctos` : '—'}</strong></div>
      <div><span>Errores de consulta</span><strong>{latest?.pollErrors ?? '—'}</strong></div>
    </div>
    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>Finalizó</th><th>Estado</th><th>Intentos</th><th>Éxitos</th><th>Fallos</th><th>Registros</th><th>Cambios</th><th>Poll errors</th></tr></thead>
        <tbody>{scheduler.recent.map((run) => <tr key={`${run.startedAt}-${run.completedAt}`}>
          <td>{formatDate(run.completedAt)}</td>
          <td><span className={run.failed > 0 ? styles.bad : styles.good}>{runLabel(run.result)}</span></td>
          <td>{run.attempted}</td><td>{run.succeeded}</td><td>{run.failed}</td><td>{run.recordsReceived}</td><td>{run.changesDetected}</td><td>{run.pollErrors}</td>
        </tr>)}</tbody>
      </table>
      {!scheduler.recent.length && <div className={styles.empty}>Todavía no hay ejecuciones registradas.</div>}
    </div>
    {overview.recentSyncFailures.length > 0 && <div className={styles.failures}>
      <h3>Fallos recientes por proyecto</h3>
      {overview.recentSyncFailures.slice(0, 8).map((failure, index) => <div key={`${failure.occurredAt}-${index}`}>
        <span>{failure.projectName || failure.ownerEmail || 'Proyecto desconocido'}{failure.appId ? ` · App ${failure.appId}` : ''}</span>
        <code>{failure.reasonCode || 'UNKNOWN'}</code><time>{formatDate(failure.occurredAt)}</time>
      </div>)}
    </div>}
  </section>;
}

function runLabel(result: AdminOverview['scheduler']['recent'][number]['result']) {
  return ({ changed: 'Cambios detectados', unchanged: 'Sin cambios', partial_failure: 'Falla parcial', failed: 'Falló', no_connections: 'Sin conexiones', no_remote_request: 'Sin consulta remota', no_usable_records: 'Sin registros útiles', unknown: 'Desconocido' })[result];
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
}
