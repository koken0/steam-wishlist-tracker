'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WishlistDashboardData } from '@/lib/wishlist-contract';

type View = 'overview' | 'projects' | 'widget' | 'security' | 'settings';
type Screen = 'welcome' | 'onboarding' | 'app';

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
  return payload;
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

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    fetchWishlistDashboard()
      .then((data) => { setWishlistData(data); setDataError(''); })
      .catch((error: Error) => setDataError(error.message));
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

  if (screen === 'welcome') {
    return <Welcome onContinue={() => setScreen('onboarding')} />;
  }

  if (screen === 'onboarding') {
    return (
      <Onboarding
        step={onboardingStep}
        data={wishlistData}
        error={dataError}
        refreshing={refreshing}
        retry={refreshData}
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
          <div className="top-actions"><span className="freshness"><i />{wishlistData ? `Steam generated ${formatRelativeTime(wishlistData.generatedAt || wishlistData.fetchedAt)}` : 'Connecting…'}</span><button className="icon-button" aria-label="Notifications" onClick={() => notify('No unread alerts')}>♢<em>2</em></button><button className={`refresh ${refreshing ? 'spinning' : ''}`} onClick={refreshData}>↻ <span>{refreshing ? 'Syncing…' : 'Refresh'}</span></button></div>
        </header>

        <div className="content">
          {dataError && <div className="data-error" role="alert"><span>!</span><p><b>Data connection needs attention</b><small>{dataError}</small></p><button onClick={refreshData}>Retry</button></div>}
          {!wishlistData && !dataError && <div className="loading-card"><span/><p>Loading the server-side data source…</p></div>}
          {view === 'overview' && wishlistData && <Overview data={wishlistData} progress={progress} milestone={Number(milestone || 15000)} />}
          {view === 'projects' && wishlistData && <Projects data={wishlistData} onOpen={() => setView('overview')} notify={notify} />}
          {view === 'widget' && wishlistData && <WidgetPreview data={wishlistData} refreshing={refreshing} onRefresh={refreshData} />}
          {view === 'security' && <Security data={wishlistData} token={token} setToken={setToken} notify={notify} />}
          {view === 'settings' && <Settings data={wishlistData} milestone={milestone} setMilestone={setMilestone} notify={notify} reset={() => { setScreen('welcome'); setOnboardingStep(1); }} />}
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
          <div className="home-widget">
            <div className="widget-top"><span className="tiny-game">S</span><b>Starfall Harbor</b><span>•••</span></div>
            <strong>12,847</strong><div className="widget-delta">↗ 284 today</div>
            <div className="mini-bars">{previewPoints.map((p,i) => <i key={i} style={{height:`${p}%`}} />)}</div>
          </div>
          <div className="phone-alert"><span className="alert-icon">↗</span><span><small>WISHLINE · NOW</small><b>Wishlist spike detected</b><p>Starfall Harbor is 2.4× above its 7-day average.</p></span></div>
          <div className="phone-dock"><i/><i/><i/><i/></div>
        </div>
        <div className="floating-chip chip-one"><span>+261</span><small>net today</small></div>
        <div className="floating-chip chip-two"><span>15K</span><small>next milestone</small></div>
      </section>
    </main>
  );
}

function Onboarding({ step, data, error, refreshing, retry, next, back, finish }: { step:number; data:WishlistDashboardData|null; error:string; refreshing:boolean; retry:()=>void; next:()=>void; back:()=>void; finish:()=>void }) {
  return (
    <main className="onboarding-screen">
      <header className="onboarding-header"><div className="brand"><span className="brand-mark">W</span><span>Wishline</span></div><span>Secure local setup</span></header>
      <div className="onboarding-layout">
        <aside className="steps">
          {[['1','Check connection'],['2','Confirm project'],['3','Finish setup']].map(([n,label],i) => <div className={`step ${step === i+1 ? 'current' : ''} ${step > i+1 ? 'complete' : ''}`} key={n}><span>{step > i+1 ? '✓' : n}</span><div><b>{label}</b><small>{['Verify the server-side source','Review the configured App ID','Open your workspace'][i]}</small></div></div>)}
        </aside>
        <section className="setup-card">
          {step === 1 && <>
            <span className="setup-icon">⌁</span><p className="eyebrow">STEP 1 OF 3</p><h1>Check the data source</h1><p className="setup-lead">Financial credentials are configured only in the local server environment. Wishline never asks for or sends a key through this screen.</p>
            <div className={`connection-card ${data?.source === 'steam' ? 'connected' : ''}`}><span>{data ? '✓' : error ? '!' : '…'}</span><p><small>SERVER-SIDE SOURCE</small><b>{data?.source === 'steam' ? 'Live Steamworks connection' : data ? 'Anonymous validation fixture' : error ? 'Connection unavailable' : 'Checking configuration…'}</b>{data && <em>App ID {data.appId} · {data.daily.length} records</em>}</p><strong>{data?.source === 'steam' ? 'LIVE' : data ? 'FIXTURE' : 'WAIT'}</strong></div>
            {error && <div className="inline-error"><b>Could not validate the source.</b><span>{error}</span><button onClick={retry}>{refreshing ? 'Retrying…' : 'Retry connection'}</button></div>}
            <div className="security-callout"><span>◆</span><p><b>Never paste a Financial API key into the browser.</b><br/>Live mode reads it from an ignored <code>.env.local</code> file and sends requests directly from the server.</p></div>
          </>}
          {step === 2 && <>
            <span className="setup-icon project-icon">{data?.projectName.charAt(0) || 'W'}</span><p className="eyebrow">STEP 2 OF 3</p><h1>Confirm your project</h1><p className="setup-lead">Wishline will track the single App ID configured for this private MVP workspace.</p>
            <button className="detected-project selected"><span className="game-cover">{data?.projectName.charAt(0) || 'W'}</span><span><b>{data?.projectName || 'Project unavailable'}</b><small>App ID {data?.appId || '—'} · {data?.releaseState || 'Unknown state'}</small></span><span className="selected-check">✓</span></button>
            <div className="sync-detail"><span>Intraday checks</span><b>Server cache · manual refresh</b></div>
          </>}
          {step === 3 && <>
            <span className="setup-icon ready-icon">✓</span><p className="eyebrow">STEP 3 OF 3</p><h1>Ready to track momentum</h1><p className="setup-lead">Your {data?.source === 'steam' ? 'live local connection' : 'anonymous contract fixture'} is configured. Financial credentials remain outside the browser.</p>
            <div className="review-list"><div><span className="game-tile">{data?.projectName.charAt(0) || 'W'}</span><p><small>TRACKING</small><b>{data?.projectName || 'Configured project'}</b></p><em>{data?.source === 'steam' ? 'Live' : 'Fixture'}</em></div><div><span>↻</span><p><small>SYNC SCHEDULE</small><b>Cached intraday + manual refresh</b></p></div><div><span>◆</span><p><small>CREDENTIAL BOUNDARY</small><b>Server-side only</b></p></div></div>
          </>}
          <div className="setup-actions"><button className="secondary-button" onClick={back}>← Back</button>{step < 3 ? <button className="primary-button compact" disabled={!data} onClick={next}>Continue →</button> : <button className="primary-button compact" onClick={finish}>Open dashboard →</button>}</div>
        </section>
      </div>
    </main>
  );
}

function PageHeading({ eyebrow, title, copy, action }: { eyebrow:string; title:string; copy:string; action?:React.ReactNode }) {
  return <div className="headline-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subhead">{copy}</p></div>{action}</div>;
}

function Overview({ data, progress, milestone }: { data:WishlistDashboardData; progress:number; milestone:number }) {
  const recent = data.daily.slice(-7);
  const previous = data.daily.slice(-14, -7);
  const today = recent.at(-1);
  const average = averageOf(recent.map((day) => day.net));
  const previousAverage = averageOf(previous.map((day) => day.net));
  const pace = previousAverage ? ((average - previousAverage) / previousAverage) * 100 : 0;
  const chartMax = Math.max(1, ...recent.map((day) => day.net), ...previous.map((day) => day.net));
  const toGo = data.currentWishlists == null ? null : Math.max(0, milestone - data.currentWishlists);
  const estimatedDays = average > 0 && toGo != null ? Math.ceil(toGo / average) : null;

  return <>
    <PageHeading eyebrow={formatHeadingDate(today?.date)} title="Your wishlists are moving." copy={`${data.projectName}'s latest Steam-generated data is ${Math.abs(pace).toFixed(0)}% ${pace >= 0 ? 'above' : 'below'} the previous weekly pace.`} action={<button className="period">Last {data.daily.length} days <span>⌄</span></button>} />
    <div className="source-strip"><span className={data.source === 'steam' ? 'live' : ''}>{data.source === 'steam' ? '● LIVE STEAMWORKS' : '◇ ANONYMOUS FIXTURE'}</span><p>Steam generated {formatTimestamp(data.generatedAt)} · Server fetched {formatTimestamp(data.fetchedAt)}{data.cacheHit ? ' · cached response' : ''}</p></div>
    <div className="stat-grid">
      <article className="stat-card hero-stat"><p>Current wishlist snapshot <span className="info">i</span></p><strong>{formatCount(data.currentWishlists)}</strong><div className="delta positive">↗ {formatCount(today?.adds ?? 0)} <span>latest adds</span></div><div className="ghost-ring">{compactCount(data.currentWishlists)}</div></article>
      <article className="stat-card"><p>Latest net movement</p><strong>{signedCount(today?.net ?? 0)}</strong><div className="metric-row"><span><i className="add" />{formatCount(today?.adds ?? 0)} adds</span><span><i className="delete" />{formatCount(today?.deletes ?? 0)} deletes</span></div></article>
      <article className="stat-card"><p>7-day net average</p><strong>{formatCount(Math.round(average))}</strong><div className={`delta ${pace >= 0 ? 'positive' : 'negative'}`}>{pace >= 0 ? '↗' : '↘'} {Math.abs(pace).toFixed(1)}% <span>vs previous week</span></div></article>
    </div>
    <div className="dashboard-grid">
      <article className="panel trend-panel"><div className="panel-head"><div><p className="panel-title">Wishlist momentum</p><p className="panel-subtitle">Adds minus deletes per reported date</p></div><div className="legend"><span><i className="legend-now" />Recent</span><span><i className="legend-before" />Previous</span></div></div><div className="chart-wrap"><div className="y-labels"><span>{chartMax}</span><span>{Math.round(chartMax*.66)}</span><span>{Math.round(chartMax*.33)}</span><span>0</span></div><div className="chart"><div className="grid-line one"/><div className="grid-line two"/><div className="grid-line three"/><div className="grid-line four"/><div className="bars">{recent.map((day,index)=><div className="bar-pair" key={day.date}><span className="bar previous" style={{height:`${Math.max(4,((previous[index]?.net || 0)/chartMax)*100)}%`}}/><span className="bar current" style={{height:`${Math.max(4,(day.net/chartMax)*100)}%`}}/><small>{formatDay(day.date)}</small></div>)}</div></div></div></article>
      <article className="panel milestone-panel"><div className="panel-head"><div><p className="panel-title">Next milestone</p><p className="panel-subtitle">Based on the configured snapshot</p></div><span className="spark">✦</span></div><div className="milestone-number"><strong>{compactCount(milestone)}</strong><span>{toGo == null ? 'Add total snapshot in .env.local' : `${formatCount(toGo)} to go`}</span></div><div className="progress"><span style={{width:`${progress}%`}} /></div><p className="prediction"><b>{estimatedDays ? `Estimated in ${estimatedDays} days` : 'Estimate unavailable'}</b><br/>{data.currentWishlistsAsOf ? `Snapshot captured ${formatTimestamp(data.currentWishlistsAsOf)}` : 'Set STEAM_CURRENT_WISHLIST_TOTAL for live mode'}</p></article>
    </div>
    <div className="activity-row"><article className="panel compact-panel"><div className="panel-head"><div><p className="panel-title">Latest Steam record</p><p className="panel-subtitle">All values come from the normalized response</p></div></div><div className="activity-list"><div><span className="activity-icon purple">↗</span><p><b>{formatCount(today?.adds ?? 0)} wishlist additions</b><small>{formatCount(today?.addsWindows ?? 0)} Windows · {formatCount(today?.addsMac ?? 0)} Mac · {formatCount(today?.addsLinux ?? 0)} Linux</small></p><time>{today?.date}</time></div><div><span className="activity-icon lime">✓</span><p><b>{formatCount(today?.purchases ?? 0)} purchases · {formatCount(today?.gifts ?? 0)} gifts</b><small>{formatCount(today?.deletes ?? 0)} wishlist deletions</small></p><time>{formatRelativeTime(today?.generatedAt)}</time></div></div></article><article className="panel compact-panel health"><p className="panel-title">Data health</p><div className="health-status"><span>✓</span><p><b>{data.source === 'steam' ? 'Steam connector is responding' : 'Contract fixture is valid'}</b><small>Browser API caching is disabled</small></p></div><dl><div><dt>Source</dt><dd>{data.source === 'steam' ? 'Steamworks partner API' : 'Anonymous fixture'}</dd></div><div><dt>Records</dt><dd>{data.daily.length} normalized days</dd></div></dl></article></div>
  </>;
}

function Projects({ data, onOpen, notify }: { data:WishlistDashboardData; onOpen:()=>void; notify:(s:string)=>void }) {
  const latest = data.daily.at(-1);
  const titleParts = data.projectName.toUpperCase().split(' ');
  return <><PageHeading eyebrow="WORKSPACE" title="Projects" copy="The private MVP tracks one configured Steam App ID." action={<button className="primary-button compact disabled-look" onClick={()=>notify('Free MVP includes one active game')}>+ Add project</button>} /><div className="project-summary"><span><b>1</b> of 1 game seat used</span><div><i/></div></div><article className="project-card"><div className="project-art"><span>{titleParts.slice(0,-1).join(' ') || 'STEAM'}</span><b>{titleParts.at(-1)}</b><small>{data.source === 'steam' ? 'LIVE DATA' : 'FIXTURE'}</small></div><div className="project-details"><div className="title-line"><div><span className="live-pill">● TRACKING</span><h2>{data.projectName}</h2><p>App ID {data.appId}</p></div><button className="more-button">•••</button></div><div className="project-metrics"><div><small>CURRENT SNAPSHOT</small><b>{formatCount(data.currentWishlists)}</b></div><div><small>LATEST NET</small><b className="green">{signedCount(latest?.net ?? 0)}</b></div><div><small>STEAM GENERATED</small><b>{formatRelativeTime(data.generatedAt)}</b></div></div><div className="project-footer"><span>Intraday server cache · Manual refresh</span><button className="secondary-button" onClick={onOpen}>Open analytics →</button></div></div></article><div className="info-banner"><span>i</span><p><b>One game, isolated client response.</b><br/>The server returns only normalized wishlist aggregates. It never exposes the Financial API key to this browser.</p></div></>;
}

function WidgetPreview({ data, refreshing, onRefresh }: { data:WishlistDashboardData; refreshing:boolean; onRefresh:()=>void }) {
  const latest = data.daily.at(-1);
  return <><PageHeading eyebrow="MOBILE COMPANION" title="Your home-screen widget" copy="The widget consumes the same sanitized server response as the dashboard." action={<button className="refresh" onClick={onRefresh}>↻ {refreshing?'Syncing…':'Refresh data'}</button>} /><div className="widget-layout"><article className="widget-stage"><div className="phone widget-phone"><div className="phone-speaker"/><div className="phone-header"><span>9:41</span><span>● ◒</span></div><div className="home-date"><b>{formatDay(latest?.date)}</b><span>{latest?.date}</span></div><div className="small-widget"><div><span className="tiny-game">{data.projectName.charAt(0)}</span><p><b>{data.projectName}</b><small>Steam generated {formatRelativeTime(data.generatedAt)}</small></p></div><strong>{formatCount(data.currentWishlists)}</strong><span className="widget-change">↗ {formatCount(latest?.adds ?? 0)}</span></div><div className="phone-app-grid">{[1,2,3,4,5,6,7,8].map(i=><i key={i}/>)}</div><div className="phone-dock"><i/><i/><i/><i/></div></div></article><aside className="widget-guide"><span className="setup-icon">▣</span><h2>Small widget · 2×1</h2><p>Shows the configured current snapshot and latest Steam wishlist additions.</p><ul><li><span>✓</span>Reads a sanitized server response</li><li><span>✓</span>Never receives the Financial API key</li><li><span>✓</span>Manual refresh uses server throttling</li><li><span>✓</span>Steam generation timestamp displayed</li></ul><div className="install-card"><b>{data.source === 'steam' ? 'Live connector active' : 'Fixture validation mode'}</b><p>{data.source === 'steam' ? `Reading App ID ${data.appId} through the server-side adapter.` : 'Switch WISHLIST_DATA_SOURCE to steam after configuring .env.local.'}</p></div><p className="phase-note">The PWA never caches requests under <code>/api/</code>, keeping private analytics out of its offline store.</p></aside></div></>;
}

function Security({ data, token, setToken, notify }: { data:WishlistDashboardData|null; token:string; setToken:(s:string)=>void; notify:(s:string)=>void }) {
  function issue(){ setToken(`wln_demo_${crypto.randomUUID().replaceAll('-','').slice(0,24)}`); }
  function revoke(){ setToken(''); notify('Demo token revoked'); }
  return <><PageHeading eyebrow="SECURITY CENTER" title="Access without exposing keys" copy="Verify the local credential boundary and simulate companion access." /><div className="security-grid"><article className="panel security-main"><div className="security-hero"><span>◆</span><div><h2>Financial key isolation</h2><p>The current connector reads the key only from the local server environment. The browser receives normalized wishlist aggregates and never receives the credential.</p></div><em>{data?.source === 'steam' ? 'LIVE BOUNDARY' : 'FIXTURE MODE'}</em></div><div className="token-section"><div><p className="panel-title">Demo app token</p><p className="panel-subtitle">Token issuance remains simulated until authentication is added.</p></div>{token ? <><div className="token-value"><code>{token}</code><button onClick={()=>{navigator.clipboard?.writeText(token);notify('Token copied')}}>Copy</button></div><div className="token-actions"><span>Issued just now · Read-only · {data?.projectName || 'configured project'}</span><button className="danger-button" onClick={revoke}>Revoke token</button></div></> : <div className="empty-token"><span>⌁</span><p><b>No active demo token</b><small>Issue one to simulate mobile companion access.</small></p><button className="primary-button compact" onClick={issue}>Issue token</button></div>}</div></article><aside className="panel audit-panel"><p className="panel-title">Connection facts</p><p className="panel-subtitle">Safe local verification</p><div className="audit-list"><div><span className="audit-dot green-dot"/><p><b>Browser API cache disabled</b><small>Private responses are never stored offline</small></p></div><div><span className="audit-dot purple-dot"/><p><b>Credential server-side</b><small>No NEXT_PUBLIC_ exposure</small></p></div><div><span className="audit-dot"/><p><b>Source: {data?.source || 'checking'}</b><small>App ID {data?.appId || '—'}</small></p></div></div></aside></div><div className="security-principles"><div><span>01</span><b>Local acceptance test</b><p>The ignored environment file is suitable only for private testing.</p></div><div><span>02</span><b>Production vault next</b><p>AES-256-GCM and managed key material are still required before deployment.</p></div><div><span>03</span><b>Scoped clients next</b><p>Real revocable tokens require authentication and persistent storage.</p></div></div></>;
}

function Settings({ data, milestone, setMilestone, notify, reset }: { data:WishlistDashboardData|null; milestone:string; setMilestone:(s:string)=>void; notify:(s:string)=>void; reset:()=>void }) {
  return <><PageHeading eyebrow="PREFERENCES" title="Workspace settings" copy={`Configure the local experience for ${data?.projectName || 'the current project'}.`} /><div className="settings-layout"><article className="panel settings-panel"><div className="settings-section"><div><h2>Milestone target</h2><p>Choose the next round-number goal shown on the dashboard.</p></div><select value={milestone} onChange={(e)=>setMilestone(e.target.value)} aria-label="Milestone target"><option value="15000">15,000 wishlists</option><option value="25000">25,000 wishlists</option><option value="50000">50,000 wishlists</option><option value="100000">100,000 wishlists</option></select></div><div className="settings-section"><div><h2>Data source</h2><p>{data?.source === 'steam' ? 'Live server-side Steamworks adapter with a protected key.' : 'Deterministic anonymous data for contract validation.'}</p></div><span className={`demo-badge ${data?.source === 'steam' ? 'live' : ''}`}>{data?.source === 'steam' ? 'LIVE STEAM' : 'FIXTURE'}</span></div><div className="settings-section"><div><h2>Intraday sync</h2><p>Server caching prevents excessive requests; manual refresh is throttled.</p></div><label className="toggle"><input type="checkbox" defaultChecked/><span/></label></div><div className="settings-actions"><button className="primary-button compact" onClick={()=>notify('Settings saved locally')}>Save changes</button></div></article><aside className="panel about-card"><span className="brand-mark">W</span><h2>Wishline MVP</h2><p>Local real-data acceptance build<br/>Version 0.2.0</p><hr/><p>{data?.source === 'steam' ? `Connected to App ID ${data.appId}.` : 'Ready to switch to a real Steamworks project using .env.local.'}</p><button className="danger-text" onClick={reset}>Reset onboarding</button></aside></div></>;
}

function averageOf(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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
