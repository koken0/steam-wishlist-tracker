'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WishlistDashboardData } from '@/lib/wishlist-contract';

type View = 'overview' | 'projects' | 'widget' | 'security' | 'settings';
type Screen = 'welcome' | 'onboarding' | 'app';

type SetupState = {
  user: { email: string | null; name: string | null };
  workspace: {
    workspaceId: string;
    workspaceName: string;
    appId: number | null;
    projectName: string | null;
    connected: boolean;
    updatedAt: string | null;
  };
};

const previewPoints = [32, 40, 37, 55, 51, 72];

const nav: { id: View; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'projects', label: 'Projects', icon: '◇' },
  { id: 'widget', label: 'Widget', icon: '▣' },
  { id: 'security', label: 'Security', icon: '⌾' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

async function fetchWishlistDashboard(force = false): Promise<WishlistDashboardData> {
  const response = await fetch('/api/wishlist', {
    method: force ? 'POST' : 'GET',
    cache: 'no-store',
    headers: force ? { 'X-Wishline-Action': 'refresh' } : undefined,
  });
  const payload = await response.json() as WishlistDashboardData | { error?: { message?: string } };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error?.message || 'Wishlist data could not be loaded.' : 'Wishlist data could not be loaded.');
  }
  return payload as WishlistDashboardData;
}

async function fetchSetup(): Promise<SetupState> {
  const response = await fetch('/api/setup', { cache: 'no-store' });
  const payload = await response.json() as SetupState | { error?: { message?: string } };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error?.message || 'Workspace could not be loaded.' : 'Workspace could not be loaded.');
  }
  return payload as SetupState;
}

async function connectSteam(input: { appId: string; apiKey: string; projectName: string }): Promise<SetupState> {
  const response = await fetch('/api/setup', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as SetupState | { error?: { message?: string } };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error?.message || 'Steam connection could not be saved.' : 'Steam connection could not be saved.');
  }
  return payload as SetupState;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [view, setView] = useState<View>('overview');
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState('');
  const [token, setToken] = useState('');
  const [milestone, setMilestone] = useState('15000');
  const [wishlistData, setWishlistData] = useState<WishlistDashboardData | null>(null);
  const [dataError, setDataError] = useState('');
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    fetchWishlistDashboard()
      .then((data) => { setWishlistData(data); setDataError(''); })
      .catch((error: Error) => setDataError(error.message));
    fetchSetup().then(setSetup).catch(() => undefined);
  }, []);

  const progress = useMemo(() => {
    if (wishlistData?.currentWishlists == null) return 0;
    return Math.min(100, Math.round((wishlistData.currentWishlists / Number(milestone || 15000)) * 100));
  }, [milestone, wishlistData]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  async function refreshData() {
    setRefreshing(true);
    try {
      const data = await fetchWishlistDashboard(true);
      setWishlistData(data);
      setDataError('');
      notify(data.cacheHit ? 'Using the latest safe server cache' : 'Steam wishlist data refreshed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wishlist refresh failed.';
      setDataError(message);
      notify('Wishlist refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  function finishOnboarding() {
    setScreen('app');
    setView('overview');
    notify(wishlistData?.source === 'steam' ? 'Live Steam workspace is ready' : 'Fixture workspace is ready');
  }

  async function openOnboarding() {
    setScreen('onboarding');
    setSetupLoading(true);
    try {
      const value = await fetchSetup();
      setSetup(value);
      setSetupError('');
      setOnboardingStep(value.workspace.connected ? 3 : 1);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Sign in is required.');
    } finally {
      setSetupLoading(false);
    }
  }

  async function saveConnection(input: { appId: string; apiKey: string; projectName: string }) {
    setSetupLoading(true);
    setSetupError('');
    try {
      const value = await connectSteam(input);
      setSetup(value);
      const data = await fetchWishlistDashboard(true);
      setWishlistData(data);
      setDataError('');
      setOnboardingStep(3);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Steam connection could not be saved.');
    } finally {
      setSetupLoading(false);
    }
  }

  if (screen === 'welcome') {
    return <Welcome onContinue={openOnboarding} />;
  }

  if (screen === 'onboarding') {
    return (
      <Onboarding
        step={onboardingStep}
        data={wishlistData}
        setup={setup}
        error={setupError}
        loading={setupLoading}
        connect={saveConnection}
        next={() => setOnboardingStep((step) => Math.min(3, step + 1))}
        back={() => onboardingStep === 1 ? setScreen('welcome') : setOnboardingStep((step) => step - 1)}
        finish={finishOnboarding}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" onClick={() => setView('overview')}><span className="brand-mark">W</span><span>Wishline</span></button>
        <nav aria-label="Primary navigation">
          {nav.map((item) => (
            <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className={`sidebar-note ${wishlistData?.source === 'steam' ? 'live-source' : ''}`}><span className="status-dot" /><div>{wishlistData?.source === 'steam' ? 'Live Steam data' : 'Anonymous fixture'}<small>{wishlistData?.source === 'steam' ? 'Financial key stays server-side' : 'Safe local contract data'}</small></div></div>
        <button className="profile" onClick={() => setScreen('welcome')}><span className="avatar">JA</span><span><b>Jordan Allen</b><small>Demo owner</small></span><span>↗</span></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="project-picker" onClick={() => setView('projects')}><span className="game-tile">{wishlistData?.projectName?.charAt(0) || 'W'}</span><span><small>Current project</small><b>{wishlistData?.projectName || 'Loading project…'}</b></span><span>⌄</span></button>
          <div className="top-actions"><span className={`freshness freshness-${wishlistData?.freshness || 'unknown'}`}><i />{wishlistData ? `${freshnessLabel(wishlistData.freshness)} · ${formatRelativeTime(wishlistData.generatedAt || wishlistData.fetchedAt)}` : 'Connecting…'}</span><button className="icon-button" aria-label="Notifications" onClick={() => notify(wishlistData?.alerts[0]?.message || 'No detected wishlist spikes')}>♢{Boolean(wishlistData?.alerts.length) && <em>{wishlistData?.alerts.filter((alert) => !alert.readAt).length}</em>}</button><button className={`refresh ${refreshing ? 'spinning' : ''}`} onClick={refreshData}>↻ <span>{refreshing ? 'Syncing…' : 'Refresh'}</span></button></div>
        </header>

        <div className="content">
          {dataError && <div className="data-error" role="alert"><span>!</span><p><b>Data connection needs attention</b><small>{dataError}</small></p><button onClick={refreshData}>Retry</button></div>}
          {wishlistData?.syncWarning && <div className="data-warning" role="status"><span>!</span><p><b>Showing last stored data</b><small>{wishlistData.syncWarning.message}</small></p></div>}
          {!wishlistData && !dataError && <div className="loading-card"><span/><p>Loading the server-side data source…</p></div>}
          {view === 'overview' && wishlistData && <Overview data={wishlistData} progress={progress} milestone={Number(milestone || 15000)} />}
          {view === 'projects' && wishlistData && <Projects data={wishlistData} onOpen={() => setView('overview')} notify={notify} />}
          {view === 'widget' && wishlistData && <WidgetPreview data={wishlistData} refreshing={refreshing} onRefresh={refreshData} />}
          {view === 'security' && <Security data={wishlistData} token={token} setToken={setToken} notify={notify} />}
          {view === 'settings' && <Settings data={wishlistData} milestone={milestone} setMilestone={setMilestone} notify={notify} reset={() => { setScreen('onboarding'); setOnboardingStep(2); setSetupError(''); }} />}
        </div>
      </section>
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="welcome-screen">
      <section className="welcome-copy">
        <div className="brand welcome-brand"><span className="brand-mark">W</span><span>Wishline</span></div>
        <div className="welcome-content">
          <span className="beta-pill"><i /> PRIVATE BETA DEMO</span>
          <h1>Your Steam wishlists.<br/><em>Finally within reach.</em></h1>
          <p>Track momentum, catch spikes, and celebrate every milestone—without opening another dashboard.</p>
          <button className="primary-button" onClick={onContinue}>Continue to demo <span>→</span></button>
          <div className="trust-row"><span>⌾ Read-only access</span><span>◆ Encrypted by design</span><span>◉ Unofficial companion</span></div>
        </div>
        <p className="fine-print">Wishline is an unofficial third-party companion and is not affiliated with Valve Corporation.</p>
      </section>
      <section className="welcome-visual" aria-label="Product preview">
        <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
        <div className="phone">
          <div className="phone-speaker" />
          <div className="phone-header"><span>9:41</span><span>● ◒</span></div>
          <div className="phone-greeting"><small>GOOD MORNING</small><b>Your launch is gaining momentum.</b></div>
          <div className="home-widget" aria-label="Future widget concept">
            <div className="widget-top"><span className="tiny-game">S</span><b>Starfall Harbor</b><span>•••</span></div>
            <strong>12,847</strong><div className="widget-delta">↗ 284 latest day</div>
            <div className="mini-bars">{previewPoints.map((p,i) => <i key={i} style={{height:`${p}%`}} />)}</div>
          </div>
          <div className="phone-alert"><span className="alert-icon">↗</span><span><small>WISHLINE · NOW</small><b>Wishlist spike detected</b><p>Starfall Harbor is 2.4× above its 7-day average.</p></span></div>
          <div className="phone-dock"><i/><i/><i/><i/></div>
        </div>
        <div className="floating-chip chip-one"><span>+261</span><small>latest reported net</small></div>
        <div className="floating-chip chip-two"><span>15K</span><small>next milestone</small></div>
      </section>
    </main>
  );
}

function Onboarding({ step, data, setup, error, loading, connect, next, back, finish }: { step:number; data:WishlistDashboardData|null; setup:SetupState|null; error:string; loading:boolean; connect:(input:{appId:string;apiKey:string;projectName:string})=>void; next:()=>void; back:()=>void; finish:()=>void }) {
  const [appId, setAppId] = useState(setup?.workspace.appId ? String(setup.workspace.appId) : '');
  const [apiKey, setApiKey] = useState('');
  const [projectName, setProjectName] = useState(setup?.workspace.projectName || '');

  return (
    <main className="onboarding-screen">
      <header className="onboarding-header"><div className="brand"><span className="brand-mark">W</span><span>Wishline</span></div><span>Secure local setup</span></header>
      <div className="onboarding-layout">
        <aside className="steps">
          {[['1','Create account'],['2','Connect Steam'],['3','Finish setup']].map(([n,label],i) => <div className={`step ${step === i+1 ? 'current' : ''} ${step > i+1 ? 'complete' : ''}`} key={n}><span>{step > i+1 ? '✓' : n}</span><div><b>{label}</b><small>{['Use your private Wishline identity','Validate and protect your API key','Open your workspace'][i]}</small></div></div>)}
        </aside>
        <section className="setup-card">
          {step === 1 && <>
            <span className="setup-icon">◎</span><p className="eyebrow">STEP 1 OF 3</p><h1>Create your private workspace</h1><p className="setup-lead">Wishline uses passwordless platform sign-in. Your identity owns one isolated workspace; Wishline does not create or store a password.</p>
            <div className={`connection-card ${setup ? 'connected' : ''}`}><span>{setup ? '✓' : '◎'}</span><p><small>WISHLINE ACCOUNT</small><b>{setup ? setup.user.name || setup.user.email || 'Authenticated owner' : 'Sign in to continue'}</b><em>{setup ? setup.workspace.workspaceName : 'Local testing uses a stable simulated account'}</em></p><strong>{setup ? 'READY' : 'SIGN IN'}</strong></div>
            {error && <div className="inline-error"><b>Account required.</b><span>{error}</span></div>}
            <div className="security-callout"><span>◆</span><p><b>Secure local storage is prepared automatically.</b><br/>Starting Wishline creates the local server protection key when needed; it never enters the browser or Git.</p></div>
          </>}
          {step === 2 && <>
            <span className="setup-icon project-icon">S</span><p className="eyebrow">STEP 2 OF 3</p><h1>Connect your Steam project</h1><p className="setup-lead">The browser sends these details once over the private setup request. The server validates the App ID, protects the key, and never returns it.</p>
            <form className="connection-form" onSubmit={(event)=>{event.preventDefault();connect({appId,apiKey,projectName});}}>
              <label><span>Steam App ID</span><input inputMode="numeric" autoComplete="off" required value={appId} onChange={(event)=>setAppId(event.target.value.replace(/\D/g,''))} placeholder="1234567" /></label>
              <label><span>Financial API key</span><input type="password" autoComplete="off" required value={apiKey} onChange={(event)=>setApiKey(event.target.value)} placeholder="Paste your key for this secure connection" /></label>
              <label><span>Project name <em>optional</em></span><input autoComplete="off" maxLength={120} value={projectName} onChange={(event)=>setProjectName(event.target.value)} placeholder="Detected from Steam Store when available" /></label>
              {error && <div className="inline-error"><b>Connection failed.</b><span>{error}</span></div>}
              <button className="primary-button compact setup-submit" disabled={loading || !appId || !apiKey}>{loading ? 'Validating with Steam…' : 'Validate and save securely →'}</button>
            </form>
            <div className="security-callout"><span>◆</span><p><b>Your key is never shown again.</b><br/>Wishline keeps it protected on the server and inaccessible to the browser.</p></div>
          </>}
          {step === 3 && <>
            <span className="setup-icon ready-icon">✓</span><p className="eyebrow">STEP 3 OF 3</p><h1>Ready to track momentum</h1><p className="setup-lead">Your authenticated workspace and live Steam connection are ready. The Financial API key remains protected on the server.</p>
            <div className="review-list"><div><span className="game-tile">{setup?.workspace.projectName?.charAt(0) || 'W'}</span><p><small>TRACKING</small><b>{setup?.workspace.projectName || data?.projectName || 'Configured project'}</b></p><em>Live</em></div><div><span>◎</span><p><small>OWNER</small><b>{setup?.user.email || setup?.user.name || 'Authenticated account'}</b></p></div><div><span>◆</span><p><small>CREDENTIAL PROTECTION</small><b>Server-side only</b></p></div></div>
          </>}
          <div className="setup-actions"><button className="secondary-button" onClick={back}>← Back</button>{step === 1 ? setup ? <button className="primary-button compact" disabled={loading} onClick={next}>Continue →</button> : <a className="primary-button compact" href="/signin-with-chatgpt?return_to=/">Sign in with ChatGPT →</a> : step === 3 ? <button className="primary-button compact" disabled={!setup?.workspace.connected} onClick={finish}>Open dashboard →</button> : null}</div>
        </section>
      </div>
    </main>
  );
}

function PageHeading({ eyebrow, title, copy, action }: { eyebrow:string; title:string; copy:string; action?:React.ReactNode }) {
  return <div className="headline-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subhead">{copy}</p></div>{action}</div>;
}

function Overview({ data, progress, milestone }: { data:WishlistDashboardData; progress:number; milestone:number }) {
  const firstDate = data.daily.at(0)?.date || '';
  const lastDate = data.daily.at(-1)?.date || '';
  const [fromDate, setFromDate] = useState(firstDate);
  const [toDate, setToDate] = useState(lastDate);
  const recent = data.daily.slice(-7);
  const previous = data.daily.slice(-14, -7);
  const latest = recent.at(-1);
  const average = averageOf(recent.map((day) => day.net));
  const previousAverage = averageOf(previous.map((day) => day.net));
  const pace = previousAverage ? ((average - previousAverage) / previousAverage) * 100 : 0;
  const toGo = data.currentWishlists == null ? null : Math.max(0, milestone - data.currentWishlists);
  const estimatedDays = average > 0 && toGo != null ? Math.ceil(toGo / average) : null;

  const history = useMemo(() => {
    let runningTotal = data.currentWishlists;
    const totals = new Map<string, number>();
    for (let index = data.daily.length - 1; index >= 0; index--) {
      const day = data.daily[index];
      if (runningTotal != null) {
        totals.set(day.date, runningTotal);
        runningTotal -= day.net;
      }
    }
    return data.daily.map((day) => ({ ...day, total: totals.get(day.date) ?? null }));
  }, [data]);

  const selected = history.filter((day) => (!fromDate || day.date >= fromDate) && (!toDate || day.date <= toDate));
  const selectedNet = selected.reduce((sum, day) => sum + day.net, 0);
  const selectedAdds = selected.reduce((sum, day) => sum + day.adds, 0);
  const selectedDeletes = selected.reduce((sum, day) => sum + day.deletes, 0);

  return <>
    <PageHeading eyebrow={formatHeadingDate(latest?.date)} title="Your wishlists are moving." copy={`${data.projectName}'s latest Steam-generated data is ${Math.abs(pace).toFixed(0)}% ${pace >= 0 ? 'above' : 'below'} the previous weekly pace.`} />
    <div className="source-strip"><span className={data.source === 'steam' ? 'live' : ''}>{data.source === 'steam' ? '● LIVE STEAMWORKS' : '◇ ANONYMOUS FIXTURE'}</span><p>{freshnessLabel(data.freshness)} · Steam generated {formatTimestamp(data.generatedAt)} · Server fetched {formatTimestamp(data.fetchedAt)}{data.cacheHit ? ' · cached response' : ''}</p></div>
    <div className="coverage-strip"><b>{totalLabel(data)}</b><span>{coverageLabel(data)}</span></div>
    <div className="stat-grid">
      <article className="stat-card hero-stat"><p>{totalLabel(data)} <span className="info">i</span></p><strong>{formatCount(data.currentWishlists)}</strong><div className="delta positive">↗ {formatCount(latest?.adds ?? 0)} <span>latest reported adds</span></div><div className="ghost-ring">{compactCount(data.currentWishlists)}</div></article>
      <article className="stat-card"><p>{latest?.date === utcToday() ? 'Today so far' : 'Latest reported net'}</p><strong>{signedCount(latest?.net ?? 0)}</strong><div className="metric-row"><span><i className="add" />{formatCount(latest?.adds ?? 0)} adds</span><span><i className="delete" />{formatCount(latest?.deletes ?? 0)} deletes</span></div></article>
      <article className="stat-card"><p>7-day net average</p><strong>{formatCount(Math.round(average))}</strong><div className={`delta ${pace >= 0 ? 'positive' : 'negative'}`}>{pace >= 0 ? '↗' : '↘'} {Math.abs(pace).toFixed(1)}% <span>vs previous week</span></div></article>
    </div>
    <article className="panel range-panel">
      <div className="range-head"><div><p className="panel-title">Histórico entre fechas</p><p className="panel-subtitle">Movimiento neto diario y evolución estimada del total</p></div><div className="date-range"><label>Desde<input type="date" min={firstDate} max={toDate || lastDate} value={fromDate} onChange={(event)=>setFromDate(event.target.value)} /></label><span>→</span><label>Hasta<input type="date" min={fromDate || firstDate} max={lastDate} value={toDate} onChange={(event)=>setToDate(event.target.value)} /></label></div></div>
      {selected.length ? <><div className="range-summary"><div><small>PERÍODO</small><b>{selected.length} {selected.length === 1 ? 'día' : 'días'}</b></div><div><small>ALTAS</small><b className="green">+{formatCount(selectedAdds)}</b></div><div><small>BAJAS</small><b>-{formatCount(selectedDeletes)}</b></div><div><small>CRECIMIENTO NETO</small><b className={selectedNet >= 0 ? 'green' : ''}>{signedCount(selectedNet)}</b></div></div><WishlistRangeChart days={selected} /></> : <div className="empty-range">No hay registros en este rango. Elegí fechas dentro del histórico disponible.</div>}
    </article>
    <div className="dashboard-grid">
      <article className="panel trend-panel"><div className="panel-head"><div><p className="panel-title">Últimos 7 días</p><p className="panel-subtitle">Altas, bajas y neto reportado por Steam</p></div><div className="legend"><span><i className="legend-now" />Neto</span></div></div><div className="daily-table">{recent.slice().reverse().map(day=><div key={day.date}><time>{formatShortDate(day.date)}</time><span className="daily-adds">+{formatCount(day.adds)}</span><span className="daily-deletes">-{formatCount(day.deletes)}</span><b>{signedCount(day.net)}</b></div>)}</div></article>
      <article className="panel milestone-panel"><div className="panel-head"><div><p className="panel-title">Next milestone</p><p className="panel-subtitle">Based on stored coverage</p></div><span className="spark">✦</span></div><div className="milestone-number"><strong>{compactCount(milestone)}</strong><span>{toGo == null ? 'Stored total unavailable' : `${formatCount(toGo)} to go`}</span></div><div className="progress"><span style={{width:`${progress}%`}} /></div><p className="prediction"><b>{estimatedDays ? `Estimated in ${estimatedDays} days` : 'Estimate unavailable'}</b><br/>{coverageLabel(data)}</p></article>
    </div>
    <div className="activity-row"><article className="panel compact-panel"><div className="panel-head"><div><p className="panel-title">Latest Steam record</p><p className="panel-subtitle">All values come from the normalized response</p></div></div><div className="activity-list"><div><span className="activity-icon purple">↗</span><p><b>{formatCount(latest?.adds ?? 0)} wishlist additions</b><small>{formatCount(latest?.addsWindows ?? 0)} Windows · {formatCount(latest?.addsMac ?? 0)} Mac · {formatCount(latest?.addsLinux ?? 0)} Linux</small></p><time>{latest?.date}</time></div><div><span className="activity-icon lime">✓</span><p><b>{formatCount(latest?.purchases ?? 0)} purchases · {formatCount(latest?.gifts ?? 0)} gifts</b><small>{formatCount(latest?.deletes ?? 0)} wishlist deletions</small></p><time>{formatRelativeTime(latest?.generatedAt)}</time></div></div></article><article className="panel compact-panel health"><p className="panel-title">Data health</p><div className="health-status"><span>✓</span><p><b>{data.syncWarning ? 'Steam sync needs attention' : data.source === 'steam' ? 'Steam connector is responding' : 'Contract fixture is valid'}</b><small>{freshnessLabel(data.freshness)} · Browser API caching is disabled</small></p></div><dl><div><dt>Source</dt><dd>{data.source === 'steam' ? 'Steamworks partner API' : 'Anonymous fixture'}</dd></div><div><dt>Coverage</dt><dd>{data.coverageStart || 'Unknown'} → {data.coverageEnd || 'Unknown'}</dd></div><div><dt>Records</dt><dd>{data.daily.length} normalized days</dd></div></dl></article></div>
  </>;
}

function WishlistRangeChart({ days }: { days: Array<WishlistDashboardData['daily'][number] & { total:number|null }> }) {
  const width = 900;
  const height = 250;
  const padding = 28;
  const values = days.map((day) => day.total ?? day.net);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = days.map((day, index) => {
    const x = days.length === 1 ? width / 2 : padding + index * ((width - padding * 2) / (days.length - 1));
    const y = height - padding - (((day.total ?? day.net) - min) / span) * (height - padding * 2);
    return { ...day, x, y };
  });
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area = `${path} L ${points.at(-1)?.x} ${height-padding} L ${points[0]?.x} ${height-padding} Z`;
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));

  return <div className="history-chart"><div className="history-scale"><span>{formatCount(max)}</span><span>{formatCount(min)}</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución de wishlists en el período seleccionado"><defs><linearGradient id="historyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6755e7" stopOpacity=".28"/><stop offset="1" stopColor="#6755e7" stopOpacity=".02"/></linearGradient></defs><line x1={padding} y1={padding} x2={width-padding} y2={padding}/><line x1={padding} y1={height/2} x2={width-padding} y2={height/2}/><line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding}/><path className="history-area" d={area}/><path className="history-line" d={path}/>{points.map((point)=><circle key={point.date} cx={point.x} cy={point.y} r="4"><title>{formatShortDate(point.date)} · {formatCount(point.total)} stored total · {signedCount(point.net)} net</title></circle>)}</svg><div className="history-dates">{points.map((point,index)=><span key={point.date} style={{left:`${(point.x/width)*100}%`}}>{index % labelEvery === 0 || index === points.length-1 ? formatChartDate(point.date) : ''}</span>)}</div><p className="chart-note">The total line is reconstructed from the history stored by Wishline. It does not claim activity from before the displayed coverage start.</p></div>;
}

function Projects({ data, onOpen, notify }: { data:WishlistDashboardData; onOpen:()=>void; notify:(s:string)=>void }) {
  const latest = data.daily.at(-1);
  const titleParts = data.projectName.toUpperCase().split(' ');
  return <><PageHeading eyebrow="WORKSPACE" title="Projects" copy="The private MVP tracks one configured Steam App ID." action={<button className="primary-button compact disabled-look" onClick={()=>notify('Free MVP includes one active game')}>+ Add project</button>} /><div className="project-summary"><span><b>1</b> of 1 game seat used</span><div><i/></div></div><article className="project-card"><div className="project-art"><span>{titleParts.slice(0,-1).join(' ') || 'STEAM'}</span><b>{titleParts.at(-1)}</b><small>{data.source === 'steam' ? 'LIVE DATA' : 'FIXTURE'}</small></div><div className="project-details"><div className="title-line"><div><span className="live-pill">● TRACKING</span><h2>{data.projectName}</h2><p>App ID {data.appId}</p></div><button className="more-button">•••</button></div><div className="project-metrics"><div><small>{totalLabel(data).toUpperCase()}</small><b>{formatCount(data.currentWishlists)}</b></div><div><small>LATEST REPORTED NET</small><b className="green">{signedCount(latest?.net ?? 0)}</b></div><div><small>DATA FRESHNESS</small><b>{freshnessLabel(data.freshness)}</b></div></div><div className="project-footer"><span>{coverageLabel(data)}</span><button className="secondary-button" onClick={onOpen}>Open analytics →</button></div></div></article><div className="info-banner"><span>i</span><p><b>One game, isolated client response.</b><br/>The server returns only normalized wishlist aggregates. It never exposes the Financial API key to this browser.</p></div></>;
}

function WidgetPreview({ data, refreshing, onRefresh }: { data:WishlistDashboardData; refreshing:boolean; onRefresh:()=>void }) {
  const latest = data.daily.at(-1);
  return <><PageHeading eyebrow="PWA CONCEPT PREVIEW" title="Future native widget preview" copy="This mockup previews a later Android phase; it is not a delivered native widget." action={<button className="refresh" onClick={onRefresh}>↻ {refreshing?'Syncing…':'Refresh data'}</button>} /><div className="widget-layout"><article className="widget-stage"><div className="phone widget-phone"><div className="phone-speaker"/><div className="phone-header"><span>9:41</span><span>● ◒</span></div><div className="home-date"><b>{formatDay(latest?.date)}</b><span>{latest?.date}</span></div><div className="small-widget"><div><span className="tiny-game">{data.projectName.charAt(0)}</span><p><b>{data.projectName}</b><small>{freshnessLabel(data.freshness)} · through {data.coverageEnd || 'unknown'}</small></p></div><strong>{formatCount(data.currentWishlists)}</strong><span className="widget-change">{signedCount(latest?.net ?? 0)}</span></div><div className="phone-app-grid">{[1,2,3,4,5,6,7,8].map(i=><i key={i}/>)}</div><div className="phone-dock"><i/><i/><i/><i/></div></div></article><aside className="widget-guide"><span className="setup-icon">▣</span><h2>Concept mockup · 2×1</h2><p>Shows the {totalLabel(data).toLowerCase()} and latest reported Steam movement using the same sanitized dashboard response.</p><ul><li><span>✓</span>Clearly labeled as a future concept</li><li><span>✓</span>Reads a sanitized server response</li><li><span>✓</span>Never receives the Financial API key</li><li><span>✓</span>Shows coverage and freshness</li></ul><div className="install-card"><b>{data.source === 'steam' ? 'Live connector active' : 'Fixture validation mode'}</b><p>{coverageLabel(data)}</p></div><p className="phase-note">The PWA never caches requests under <code>/api/</code>. Native Android delivery remains outside the MVP.</p></aside></div></>;
}

function Security({ data, token, setToken, notify }: { data:WishlistDashboardData|null; token:string; setToken:(s:string)=>void; notify:(s:string)=>void }) {
  function issue(){ setToken(`wln_demo_${crypto.randomUUID().replaceAll('-','').slice(0,24)}`); }
  function revoke(){ setToken(''); notify('Demo token revoked'); }
  return <><PageHeading eyebrow="SECURITY CENTER" title="Access without exposing keys" copy="Verify the protected credential boundary and simulate companion access." /><div className="security-grid"><article className="panel security-main"><div className="security-hero"><span>◆</span><div><h2>Financial key isolation</h2><p>The authenticated setup endpoint validates and protects the key before storage. The browser receives normalized wishlist aggregates and never receives the credential again.</p></div><em>{data?.source === 'steam' ? 'LIVE BOUNDARY' : 'FIXTURE MODE'}</em></div><div className="token-section"><div><p className="panel-title">Demo app token</p><p className="panel-subtitle">Companion-token issuance remains simulated; account authentication is active.</p></div>{token ? <><div className="token-value"><code>{token}</code><button onClick={()=>{navigator.clipboard?.writeText(token);notify('Token copied')}}>Copy</button></div><div className="token-actions"><span>Issued just now · Read-only · {data?.projectName || 'configured project'}</span><button className="danger-button" onClick={revoke}>Revoke token</button></div></> : <div className="empty-token"><span>⌁</span><p><b>No active demo token</b><small>Issue one to simulate mobile companion access.</small></p><button className="primary-button compact" onClick={issue}>Issue token</button></div>}</div></article><aside className="panel audit-panel"><p className="panel-title">Connection facts</p><p className="panel-subtitle">Safe local verification</p><div className="audit-list"><div><span className="audit-dot green-dot"/><p><b>Browser API cache disabled</b><small>Private responses are never stored offline</small></p></div><div><span className="audit-dot purple-dot"/><p><b>Protected credential storage</b><small>No plaintext key in storage or client responses</small></p></div><div><span className="audit-dot"/><p><b>Source: {data?.source || 'checking'}</b><small>App ID {data?.appId || '—'}</small></p></div></div></aside></div><div className="security-principles"><div><span>01</span><b>Passwordless owner identity</b><p>Each authenticated user receives an isolated workspace.</p></div><div><span>02</span><b>Protected connection</b><p>The stored credential is available only to the server runtime.</p></div><div><span>03</span><b>Scoped clients next</b><p>Real revocable companion tokens still require a durable token service.</p></div></div></>;
}

function Settings({ data, milestone, setMilestone, notify, reset }: { data:WishlistDashboardData|null; milestone:string; setMilestone:(s:string)=>void; notify:(s:string)=>void; reset:()=>void }) {
  return <><PageHeading eyebrow="PREFERENCES" title="Workspace settings" copy={`Configure the local experience for ${data?.projectName || 'the current project'}.`} /><div className="settings-layout"><article className="panel settings-panel"><div className="settings-section"><div><h2>Milestone target</h2><p>Choose the next round-number goal shown on the dashboard.</p></div><select value={milestone} onChange={(e)=>setMilestone(e.target.value)} aria-label="Milestone target"><option value="15000">15,000 wishlists</option><option value="25000">25,000 wishlists</option><option value="50000">50,000 wishlists</option><option value="100000">100,000 wishlists</option></select></div><div className="settings-section"><div><h2>Data source</h2><p>{data?.source === 'steam' ? 'Live server-side Steamworks adapter with a protected key.' : 'Deterministic anonymous data for contract validation.'}</p></div><span className={`demo-badge ${data?.source === 'steam' ? 'live' : ''}`}>{data?.source === 'steam' ? 'LIVE STEAM' : 'FIXTURE'}</span></div><div className="settings-section"><div><h2>Hourly intraday sync</h2><p>The backend checks today&apos;s GMT record once per hour; Steam may publish changes in batches.</p></div><label className="toggle"><input type="checkbox" defaultChecked disabled aria-label="Hourly intraday sync enabled"/><span/></label></div><div className="settings-actions"><button className="primary-button compact" onClick={()=>notify('Settings saved locally')}>Save changes</button></div></article><aside className="panel about-card"><span className="brand-mark">W</span><h2>Wishline MVP</h2><p>Local real-data acceptance build<br/>Version 0.2.0</p><hr/><p>{data?.source === 'steam' ? `Connected to App ID ${data.appId}.` : 'Ready to connect a Steamworks project through onboarding.'}</p><button className="danger-text" onClick={reset}>Update Steam connection</button></aside></div></>;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function averageOf(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function freshnessLabel(value: WishlistDashboardData['freshness']): string {
  return ({ fresh: 'Fresh', delayed: 'Delayed', stale: 'Stale', unknown: 'Freshness unknown' })[value];
}

function totalLabel(data: WishlistDashboardData): string {
  if (data.totalKind === 'stored') return 'Stored wishlist total';
  return 'Wishlist total unavailable';
}

function coverageLabel(data: WishlistDashboardData): string {
  if (!data.coverageStart || !data.coverageEnd) return 'Stored coverage unavailable';
  if (data.coverageComplete) return `Complete stored history through ${data.coverageEnd}`;
  return `Stored coverage ${data.coverageStart} through ${data.coverageEnd}`;
}

function formatCount(value: number | null | undefined): string {
  return value == null ? '—' : Math.round(value).toLocaleString('en-US');
}

function signedCount(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatCount(value)}`;
}

function compactCount(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2).replace(/\.0$/, '')}K`;
  return String(value);
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'timestamp unavailable';
  const elapsed = Date.now() - new Date(value).valueOf();
  const minutes = Math.max(0, Math.round(elapsed / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'unavailable';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatHeadingDate(value: string | undefined): string {
  if (!value) return 'LATEST STEAM RECORD';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
}

function formatDay(value: string | undefined): string {
  if (!value) return '—';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' });
}

function formatShortDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatChartDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}
