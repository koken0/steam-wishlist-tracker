'use client';

import { useEffect, useMemo, useState } from 'react';

type View = 'overview' | 'projects' | 'widget' | 'security' | 'settings';
type Screen = 'welcome' | 'onboarding' | 'app';

const chartPoints = [32, 40, 37, 55, 51, 72, 84];
const previousPoints = [27, 29, 35, 31, 43, 48, 51];
const days = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];

const nav: { id: View; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'projects', label: 'Projects', icon: '◇' },
  { id: 'widget', label: 'Widget', icon: '▣' },
  { id: 'security', label: 'Security', icon: '⌾' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [view, setView] = useState<View>('overview');
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('2 min ago');
  const [toast, setToast] = useState('');
  const [token, setToken] = useState('');
  const [milestone, setMilestone] = useState('15000');

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  const progress = useMemo(() => Math.min(100, Math.round((12847 / Number(milestone || 15000)) * 100)), [milestone]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  function refreshData() {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      setLastUpdated('just now');
      notify('Wishlist data refreshed');
    }, 800);
  }

  function finishOnboarding() {
    setScreen('app');
    setView('overview');
    notify('Demo workspace is ready');
  }

  if (screen === 'welcome') {
    return <Welcome onContinue={() => setScreen('onboarding')} />;
  }

  if (screen === 'onboarding') {
    return (
      <Onboarding
        step={onboardingStep}
        apiKey={apiKey}
        setApiKey={setApiKey}
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
        <div className="sidebar-note"><span className="status-dot" /><div>Demo data<small>Steamworks is not connected</small></div></div>
        <button className="profile" onClick={() => setScreen('welcome')}><span className="avatar">JA</span><span><b>Jordan Allen</b><small>Demo owner</small></span><span>↗</span></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="project-picker" onClick={() => setView('projects')}><span className="game-tile">S</span><span><small>Current project</small><b>Starfall Harbor</b></span><span>⌄</span></button>
          <div className="top-actions"><span className="freshness"><i />Updated {lastUpdated}</span><button className="icon-button" aria-label="Notifications" onClick={() => notify('No unread alerts')}>♢<em>2</em></button><button className={`refresh ${refreshing ? 'spinning' : ''}`} onClick={refreshData}>↻ <span>{refreshing ? 'Syncing…' : 'Refresh'}</span></button></div>
        </header>

        <div className="content">
          {view === 'overview' && <Overview progress={progress} milestone={Number(milestone || 15000)} />}
          {view === 'projects' && <Projects onOpen={() => setView('overview')} notify={notify} />}
          {view === 'widget' && <WidgetPreview refreshing={refreshing} onRefresh={refreshData} />}
          {view === 'security' && <Security token={token} setToken={setToken} notify={notify} />}
          {view === 'settings' && <Settings milestone={milestone} setMilestone={setMilestone} notify={notify} reset={() => { setScreen('welcome'); setOnboardingStep(1); setApiKey(''); }} />}
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
            <div className="mini-bars">{chartPoints.slice(0,6).map((p,i) => <i key={i} style={{height:`${p}%`}} />)}</div>
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

function Onboarding({ step, apiKey, setApiKey, next, back, finish }: { step:number; apiKey:string; setApiKey:(v:string)=>void; next:()=>void; back:()=>void; finish:()=>void }) {
  return (
    <main className="onboarding-screen">
      <header className="onboarding-header"><div className="brand"><span className="brand-mark">W</span><span>Wishline</span></div><span>Demo setup</span></header>
      <div className="onboarding-layout">
        <aside className="steps">
          {[['1','Connect Steamworks'],['2','Choose a project'],['3','Finish setup']].map(([n,label],i) => <div className={`step ${step === i+1 ? 'current' : ''} ${step > i+1 ? 'complete' : ''}`} key={n}><span>{step > i+1 ? '✓' : n}</span><div><b>{label}</b><small>{['Add a secure API key','Select one app to track','Review your workspace'][i]}</small></div></div>)}
        </aside>
        <section className="setup-card">
          {step === 1 && <>
            <span className="setup-icon">⌁</span><p className="eyebrow">STEP 1 OF 3</p><h1>Connect Steamworks</h1><p className="setup-lead">In production, your dedicated Financial API key is encrypted server-side and never sent to a mobile device.</p>
            <label className="field-label" htmlFor="api-key">Financial API key</label><div className="input-wrap"><input id="api-key" type="password" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} placeholder="Paste your key here"/><span>◉</span></div>
            <button className="demo-link" onClick={() => setApiKey('WISHLINE-DEMO-KEY-NOT-REAL')}>Use a safe demo key instead</button>
            <div className="security-callout"><span>◆</span><p><b>This demo never sends or stores a key.</b><br/>The value stays in temporary browser memory and is discarded when you reload.</p></div>
          </>}
          {step === 2 && <>
            <span className="setup-icon project-icon">S</span><p className="eyebrow">STEP 2 OF 3</p><h1>We found your game</h1><p className="setup-lead">The demo adapter has returned one sample project for your Free workspace.</p>
            <button className="detected-project selected"><span className="game-cover">S</span><span><b>Starfall Harbor</b><small>App ID 2847190 · Pre-release</small></span><span className="selected-check">✓</span></button>
            <div className="sync-detail"><span>Daily sync</span><b>Free workspace · 1 active game</b></div>
          </>}
          {step === 3 && <>
            <span className="setup-icon ready-icon">✓</span><p className="eyebrow">STEP 3 OF 3</p><h1>Ready to track momentum</h1><p className="setup-lead">Your simulated workspace is configured. No external account, API request, or payment service is involved.</p>
            <div className="review-list"><div><span className="game-tile">S</span><p><small>TRACKING</small><b>Starfall Harbor</b></p><em>Active</em></div><div><span>↻</span><p><small>SYNC SCHEDULE</small><b>Daily + manual refresh</b></p></div><div><span>◆</span><p><small>ACCESS</small><b>Read-only demo token</b></p></div></div>
          </>}
          <div className="setup-actions"><button className="secondary-button" onClick={back}>← Back</button>{step < 3 ? <button className="primary-button compact" disabled={step === 1 && !apiKey} onClick={next}>Continue →</button> : <button className="primary-button compact" onClick={finish}>Open dashboard →</button>}</div>
        </section>
      </div>
    </main>
  );
}

function PageHeading({ eyebrow, title, copy, action }: { eyebrow:string; title:string; copy:string; action?:React.ReactNode }) {
  return <div className="headline-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subhead">{copy}</p></div>{action}</div>;
}

function Overview({ progress, milestone }: { progress:number; milestone:number }) {
  return <>
    <PageHeading eyebrow="THURSDAY, AUGUST 27" title="Your wishlists are moving." copy="A strong day for Starfall Harbor—today's pace is 38% above your weekly average." action={<button className="period">Last 30 days <span>⌄</span></button>} />
    <div className="stat-grid">
      <article className="stat-card hero-stat"><p>Total wishlists <span className="info">i</span></p><strong>12,847</strong><div className="delta positive">↗ 284 <span>today</span></div><div className="ghost-ring">12.8K</div></article>
      <article className="stat-card"><p>Net today</p><strong>+261</strong><div className="metric-row"><span><i className="add" />284 adds</span><span><i className="delete" />23 deletes</span></div></article>
      <article className="stat-card"><p>7-day average</p><strong>189</strong><div className="delta positive">↗ 18.2% <span>vs previous week</span></div></article>
    </div>
    <div className="dashboard-grid">
      <article className="panel trend-panel"><div className="panel-head"><div><p className="panel-title">Wishlist momentum</p><p className="panel-subtitle">Daily net additions</p></div><div className="legend"><span><i className="legend-now" />This week</span><span><i className="legend-before" />Previous</span></div></div><div className="chart-wrap"><div className="y-labels"><span>300</span><span>200</span><span>100</span><span>0</span></div><div className="chart"><div className="grid-line one"/><div className="grid-line two"/><div className="grid-line three"/><div className="grid-line four"/><div className="bars">{chartPoints.map((point,index)=><div className="bar-pair" key={days[index]}><span className="bar previous" style={{height:`${previousPoints[index]}%`}}/><span className="bar current" style={{height:`${point}%`}}/><small>{days[index]}</small></div>)}</div></div></div></article>
      <article className="panel milestone-panel"><div className="panel-head"><div><p className="panel-title">Next milestone</p><p className="panel-subtitle">Keep the momentum going</p></div><span className="spark">✦</span></div><div className="milestone-number"><strong>{milestone >= 1000 ? `${milestone/1000}K` : milestone}</strong><span>{Math.max(0,milestone-12847).toLocaleString()} to go</span></div><div className="progress"><span style={{width:`${progress}%`}} /></div><p className="prediction"><b>Estimated in 9 days</b><br/>Based on your current 7-day pace</p></article>
    </div>
    <div className="activity-row"><article className="panel compact-panel"><div className="panel-head"><div><p className="panel-title">Recent activity</p><p className="panel-subtitle">Last 3 sync events</p></div><button className="text-button">View all</button></div><div className="activity-list"><div><span className="activity-icon purple">↗</span><p><b>Wishlist pace increased</b><small>2.4× above the rolling baseline</small></p><time>Today, 2:16 PM</time></div><div><span className="activity-icon lime">✓</span><p><b>Daily sync completed</b><small>284 adds · 23 deletes</small></p><time>Today, 2:00 PM</time></div></div></article><article className="panel compact-panel health"><p className="panel-title">Data health</p><div className="health-status"><span>✓</span><p><b>Everything looks good</b><small>Latest cached payload is fresh</small></p></div><dl><div><dt>Source</dt><dd>Demo adapter</dd></div><div><dt>Next sync</dt><dd>Tomorrow, 2:00 PM</dd></div></dl></article></div>
  </>;
}

function Projects({ onOpen, notify }: { onOpen:()=>void; notify:(s:string)=>void }) {
  return <><PageHeading eyebrow="WORKSPACE" title="Projects" copy="Choose which Steam App ID this workspace tracks." action={<button className="primary-button compact disabled-look" onClick={()=>notify('Free demo includes one active game')}>+ Add project</button>} /><div className="project-summary"><span><b>1</b> of 1 game seat used</span><div><i/></div></div><article className="project-card"><div className="project-art"><span>STARFALL</span><b>HARBOR</b><small>COMING SOON</small></div><div className="project-details"><div className="title-line"><div><span className="live-pill">● TRACKING</span><h2>Starfall Harbor</h2><p>App ID 2847190</p></div><button className="more-button">•••</button></div><div className="project-metrics"><div><small>TOTAL WISHLISTS</small><b>12,847</b></div><div><small>NET TODAY</small><b className="green">+261</b></div><div><small>LAST SYNC</small><b>2 min ago</b></div></div><div className="project-footer"><span>Daily sync · Manual refresh</span><button className="secondary-button" onClick={onOpen}>Open analytics →</button></div></div></article><div className="info-banner"><span>i</span><p><b>One game, unlimited focus.</b><br/>The Free MVP tracks a single App ID. Project switching is planned for a later phase.</p></div></>;
}

function WidgetPreview({ refreshing, onRefresh }: { refreshing:boolean; onRefresh:()=>void }) {
  return <><PageHeading eyebrow="MOBILE COMPANION" title="Your home-screen widget" copy="A PWA preview of the Phase 1 small widget for Android." action={<button className="refresh" onClick={onRefresh}>↻ {refreshing?'Syncing…':'Refresh data'}</button>} /><div className="widget-layout"><article className="widget-stage"><div className="phone widget-phone"><div className="phone-speaker"/><div className="phone-header"><span>9:41</span><span>● ◒</span></div><div className="home-date"><b>Thursday</b><span>August 27</span></div><div className="small-widget"><div><span className="tiny-game">S</span><p><b>Starfall Harbor</b><small>Wishline · now</small></p></div><strong>12,847</strong><span className="widget-change">↗ 284</span></div><div className="phone-app-grid">{[1,2,3,4,5,6,7,8].map(i=><i key={i}/>)}</div><div className="phone-dock"><i/><i/><i/><i/></div></div></article><aside className="widget-guide"><span className="setup-icon">▣</span><h2>Small widget · 2×1</h2><p>Shows the current wishlist total and 24-hour delta from the latest cached payload.</p><ul><li><span>✓</span>Reads simulated local cache</li><li><span>✓</span>Manual refresh available</li><li><span>✓</span>Tap opens project analytics</li><li><span>✓</span>Stale-data timestamp supported</li></ul><div className="install-card"><b>Install the demo</b><p>Use your browser&apos;s “Add to Home Screen” action to run Wishline like an app.</p></div><p className="phase-note">A native Jetpack Glance widget and background FCM refresh belong to the Android implementation after this PWA validation.</p></aside></div></>;
}

function Security({ token, setToken, notify }: { token:string; setToken:(s:string)=>void; notify:(s:string)=>void }) {
  function issue(){ setToken(`wln_demo_${crypto.randomUUID().replaceAll('-','').slice(0,24)}`); }
  function revoke(){ setToken(''); notify('Demo token revoked'); }
  return <><PageHeading eyebrow="SECURITY CENTER" title="Access without exposing keys" copy="Manage the read-only token used by companion devices." /><div className="security-grid"><article className="panel security-main"><div className="security-hero"><span>◆</span><div><h2>Financial key isolation</h2><p>The production design keeps the raw Steamworks key in an encrypted server-side vault. Clients receive only scoped, revocable access.</p></div><em>DESIGN READY</em></div><div className="token-section"><div><p className="panel-title">Demo app token</p><p className="panel-subtitle">This token is generated only in browser memory.</p></div>{token ? <><div className="token-value"><code>{token}</code><button onClick={()=>{navigator.clipboard?.writeText(token);notify('Token copied')}}>Copy</button></div><div className="token-actions"><span>Issued just now · Read-only · Starfall Harbor</span><button className="danger-button" onClick={revoke}>Revoke token</button></div></> : <div className="empty-token"><span>⌁</span><p><b>No active demo token</b><small>Issue one to simulate mobile companion access.</small></p><button className="primary-button compact" onClick={issue}>Issue token</button></div>}</div></article><aside className="panel audit-panel"><p className="panel-title">Audit log</p><p className="panel-subtitle">Local demonstration events</p><div className="audit-list"><div><span className="audit-dot green-dot"/><p><b>Cached payload served</b><small>Overview · 2 minutes ago</small></p></div><div><span className="audit-dot purple-dot"/><p><b>Demo key validated</b><small>Setup · Today, 1:58 PM</small></p></div><div><span className="audit-dot"/><p><b>Workspace created</b><small>Demo owner · Today, 1:57 PM</small></p></div></div></aside></div><div className="security-principles"><div><span>01</span><b>Encrypted at rest</b><p>AES-256-GCM design with managed key material.</p></div><div><span>02</span><b>Least privilege</b><p>Poller-only access to raw financial credentials.</p></div><div><span>03</span><b>Individually revocable</b><p>Scoped tokens can be removed without rotating the key.</p></div></div></>;
}

function Settings({ milestone, setMilestone, notify, reset }: { milestone:string; setMilestone:(s:string)=>void; notify:(s:string)=>void; reset:()=>void }) {
  return <><PageHeading eyebrow="PREFERENCES" title="Workspace settings" copy="Configure the local demo experience for Starfall Harbor." /><div className="settings-layout"><article className="panel settings-panel"><div className="settings-section"><div><h2>Milestone target</h2><p>Choose the next round-number goal shown on the dashboard.</p></div><select value={milestone} onChange={(e)=>setMilestone(e.target.value)} aria-label="Milestone target"><option value="15000">15,000 wishlists</option><option value="25000">25,000 wishlists</option><option value="50000">50,000 wishlists</option><option value="100000">100,000 wishlists</option></select></div><div className="settings-section"><div><h2>Data source</h2><p>Use a deterministic local dataset; no Steamworks requests are made.</p></div><span className="demo-badge">SIMULATED</span></div><div className="settings-section"><div><h2>Daily sync</h2><p>Free workspace cadence with optional manual refresh.</p></div><label className="toggle"><input type="checkbox" defaultChecked/><span/></label></div><div className="settings-actions"><button className="primary-button compact" onClick={()=>notify('Settings saved locally')}>Save changes</button></div></article><aside className="panel about-card"><span className="brand-mark">W</span><h2>Wishline MVP</h2><p>Local product demonstration<br/>Version 0.1.0</p><hr/><p>This build uses no external accounts, billing providers, or production credentials.</p><button className="danger-text" onClick={reset}>Reset demo onboarding</button></aside></div></>;
}
