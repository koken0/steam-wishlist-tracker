'use client';

import { useEffect, useMemo, useState } from 'react';
import packageMetadata from '@/package.json';
import {
  observeWishlineUser,
  signInToWishline,
  signOutOfWishline,
  usesFirebaseAuthentication,
  wishlineAuthorizationHeader,
} from '@/lib/firebase-client';
import type { WishlistDashboardData } from '@/lib/wishlist-contract';
import type { WishlistAnnotation } from '@/lib/wishlist-annotations-core';
import {
  buildWishlistHistory,
  summarizeWishlistRange,
  type WishlistRangeEntry,
} from '@/lib/wishlist-history';

type View = 'overview' | 'projects' | 'widget' | 'security' | 'settings';
type Screen = 'restoring' | 'welcome' | 'onboarding' | 'app';
type PushState = 'checking' | 'unsupported' | 'unconfigured' | 'disabled' | 'denied' | 'working' | 'enabled' | 'error';
type AccessState = { required: boolean; unlocked: boolean };

type PushConfiguration = {
  configured: boolean;
  publicKey: string | null;
  subscribed: boolean;
  latestTest: PushTestReceipt | null;
};

type PushTestReceipt = {
  id: string;
  providerStatus: 'pending' | 'accepted' | 'failed';
  receivedAt: string | null;
  clickedAt: string | null;
  createdAt: string;
};

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
  validation?: { projectName: string; records: number };
};

const previewPoints = [32, 40, 37, 55, 51, 72];
const DEFAULT_MILESTONE = 15_000;

const nav: { id: View; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'projects', label: 'Projects', icon: '◇' },
  { id: 'widget', label: 'Widget', icon: '▣' },
  { id: 'security', label: 'Security', icon: '⌾' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

async function fetchAccessState(): Promise<AccessState> {
  const response = await fetch('/api/access', { cache: 'no-store' });
  if (!response.ok) throw new Error('Beta access could not be checked.');
  return response.json() as Promise<AccessState>;
}

async function unlockBeta(password: string): Promise<void> {
  const response = await fetch('/api/access', {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const payload = await response.json() as AccessState | { error?: { message?: string } };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error?.message || 'Beta access was denied.' : 'Beta access was denied.');
  }
}

async function fetchWishlistDashboard(force = false): Promise<WishlistDashboardData> {
  const authorization = await wishlineAuthorizationHeader();
  const response = await fetch('/api/wishlist', {
    method: force ? 'POST' : 'GET',
    cache: 'no-store',
    headers: force ? { ...authorization, 'X-Wishline-Action': 'refresh' } : authorization,
  });
  const payload = await response.json() as WishlistDashboardData | { error?: { message?: string } };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error?.message || 'Wishlist data could not be loaded.' : 'Wishlist data could not be loaded.');
  }
  return payload as WishlistDashboardData;
}

async function fetchAnnotations(): Promise<WishlistAnnotation[]> {
  const response = await fetch('/api/annotations', { cache: 'no-store', headers: await wishlineAuthorizationHeader() });
  const payload = await response.json() as { annotations?: WishlistAnnotation[]; error?: { message?: string } };
  if (!response.ok || !payload.annotations) throw new Error(payload.error?.message || 'Timeline notes could not be loaded.');
  return payload.annotations;
}

async function mutateAnnotation(method: 'POST' | 'PUT' | 'DELETE', input: { id?: string; date?: string; note?: string }): Promise<WishlistAnnotation | null> {
  const response = await fetch('/api/annotations', {
    method, cache: 'no-store', headers: { ...await wishlineAuthorizationHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as { annotation?: WishlistAnnotation; deleted?: boolean; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || 'Timeline note could not be updated.');
  return payload.annotation || null;
}

async function fetchSetup(): Promise<SetupState> {
  const response = await fetch('/api/setup', {
    cache: 'no-store',
    headers: await wishlineAuthorizationHeader(),
  });
  const payload = await response.json() as SetupState | { error?: { message?: string } };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error?.message || 'Workspace could not be loaded.' : 'Workspace could not be loaded.');
  }
  return payload as SetupState;
}

async function connectSteam(input: { appId: string; apiKey: string; projectName: string }): Promise<SetupState> {
  const authorization = await wishlineAuthorizationHeader();
  const response = await fetch('/api/setup', {
    method: 'POST',
    cache: 'no-store',
    headers: { ...authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as SetupState | { error?: { message?: string } };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error?.message || 'Steam connection could not be saved.' : 'Steam connection could not be saved.');
  }
  return payload as SetupState;
}

async function disconnectSteam(): Promise<SetupState> {
  const authorization = await wishlineAuthorizationHeader();
  const response = await fetch('/api/setup', {
    method: 'DELETE',
    cache: 'no-store',
    headers: { ...authorization, 'X-Wishline-Action': 'disconnect-and-delete' },
  });
  const payload = await response.json() as SetupState | { error?: { message?: string } };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error?.message || 'Steam data could not be deleted.' : 'Steam data could not be deleted.');
  }
  return payload as SetupState;
}

async function deleteAccount(): Promise<void> {
  const authorization = await wishlineAuthorizationHeader();
  const response = await fetch('/api/account', {
    method: 'DELETE',
    cache: 'no-store',
    headers: { ...authorization, 'X-Wishline-Action': 'delete-account' },
  });
  const payload = await response.json() as { deleted?: boolean; error?: { message?: string } };
  if (!response.ok || !payload.deleted) {
    throw new Error(payload.error?.message || 'Wishline account could not be deleted.');
  }
}

async function fetchPushConfiguration(receiptId?: string): Promise<PushConfiguration> {
  const path = receiptId ? `/api/push?receiptId=${encodeURIComponent(receiptId)}` : '/api/push';
  const response = await fetch(path, {
    cache: 'no-store',
    headers: await wishlineAuthorizationHeader(),
  });
  const payload = await response.json() as PushConfiguration | { error?: { message?: string } };
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error?.message || 'Notification settings could not be loaded.' : 'Notification settings could not be loaded.');
  }
  return payload as PushConfiguration;
}

async function saveBrowserPushSubscription(subscription: PushSubscription): Promise<{ testAccepted: boolean; testReceipt: PushTestReceipt }> {
  const response = await fetch('/api/push', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...await wishlineAuthorizationHeader(),
      'Content-Type': 'application/json',
      'X-Wishline-Action': 'subscribe-push',
    },
    body: JSON.stringify(subscription.toJSON()),
  });
  const payload = await response.json() as { subscribed?: boolean; testAccepted?: boolean; testReceipt?: PushTestReceipt; error?: { message?: string } };
  if (!response.ok || !payload.subscribed) throw new Error(payload.error?.message || 'Notifications could not be enabled.');
  if (!payload.testReceipt) throw new Error('The notification test receipt was not returned.');
  return { testAccepted: Boolean(payload.testAccepted), testReceipt: payload.testReceipt };
}

async function sendBrowserPushTest(endpoint: string): Promise<{ testAccepted: boolean; testReceipt: PushTestReceipt }> {
  const response = await fetch('/api/push', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...await wishlineAuthorizationHeader(),
      'Content-Type': 'application/json',
      'X-Wishline-Action': 'send-test-push',
    },
    body: JSON.stringify({ endpoint }),
  });
  const payload = await response.json() as { subscribed?: boolean; testAccepted?: boolean; testReceipt?: PushTestReceipt; error?: { message?: string } };
  if (!response.ok || !payload.subscribed || !payload.testReceipt) {
    throw new Error(payload.error?.message || 'The test notification could not be sent.');
  }
  return { testAccepted: Boolean(payload.testAccepted), testReceipt: payload.testReceipt };
}

async function deleteBrowserPushSubscription(endpoint: string): Promise<void> {
  const response = await fetch('/api/push', {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      ...await wishlineAuthorizationHeader(),
      'Content-Type': 'application/json',
      'X-Wishline-Action': 'unsubscribe-push',
    },
    body: JSON.stringify({ endpoint }),
  });
  const payload = await response.json() as { subscribed?: boolean; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || 'Notifications could not be disabled.');
}

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('restoring');
  const [view, setView] = useState<View>('overview');
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState('');
  const [token, setToken] = useState('');
  const [milestone, setMilestone] = useState(String(DEFAULT_MILESTONE));
  const [wishlistData, setWishlistData] = useState<WishlistDashboardData | null>(null);
  const [dataError, setDataError] = useState('');
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [setupNotice, setSetupNotice] = useState('');
  const [accessRequired, setAccessRequired] = useState(false);
  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem('wishline-theme', nextTheme);
  }

  useEffect(() => {
    let active = true;
    let restoreAttempt = 0;
    let stopObserving: (() => void) | undefined;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    const restoreWorkspace = async (authenticated: boolean) => {
      const currentAttempt = ++restoreAttempt;
      const [setupResult, dashboardResult] = await Promise.allSettled([
        fetchSetup(),
        fetchWishlistDashboard(),
      ]);
      if (!active || currentAttempt !== restoreAttempt) return;

      if (setupResult.status === 'rejected') {
        setSetup(null);
        setWishlistData(null);
        setDataError('');
        if (authenticated) {
          setSetupError(setupResult.reason instanceof Error ? setupResult.reason.message : 'Workspace could not be loaded.');
          setOnboardingStep(1);
          setScreen('onboarding');
        } else {
          setScreen('welcome');
        }
        return;
      }

      const restoredSetup = setupResult.value;
      setSetup(restoredSetup);
      setSetupError('');
      if (!restoredSetup.workspace.connected) {
        setWishlistData(null);
        setDataError('');
        setOnboardingStep(2);
        setScreen('onboarding');
        return;
      }

      if (dashboardResult.status === 'fulfilled') {
        setWishlistData(dashboardResult.value);
        setDataError('');
      } else {
        setWishlistData(null);
        setDataError(dashboardResult.reason instanceof Error ? dashboardResult.reason.message : 'Wishlist data could not be loaded.');
      }
      setScreen('app');
    };
    void fetchAccessState().then((access) => {
      if (!active) return;
      setAccessRequired(access.required);
      if (!access.unlocked) {
        setScreen('welcome');
        return;
      }
      if (!usesFirebaseAuthentication()) {
        void restoreWorkspace(false);
        return;
      }
      stopObserving = observeWishlineUser((user) => {
        if (user) void restoreWorkspace(true);
        else {
          restoreAttempt += 1;
          setSetup(null);
          setWishlistData(null);
          setDataError('');
          setSetupError('');
          setScreen('welcome');
        }
      });
    }).catch(() => {
      if (!active) return;
      setAccessRequired(true);
      setSetupError('Beta access could not be checked.');
      setScreen('welcome');
    });
    return () => {
      active = false;
      restoreAttempt += 1;
      stopObserving?.();
    };
  }, []);

  const milestoneProjectId = setup?.workspace.appId ?? wishlistData?.appId ?? null;

  useEffect(() => {
    if (!milestoneProjectId) return;
    const savedMilestone = window.localStorage.getItem(milestoneStorageKey(milestoneProjectId));
    const timer = window.setTimeout(() => {
      setMilestone(savedMilestone && validMilestone(savedMilestone) ? savedMilestone : String(DEFAULT_MILESTONE));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [milestoneProjectId]);

  const progress = useMemo(() => {
    if (wishlistData?.currentWishlists == null) return 0;
    return Math.min(100, Math.round((wishlistData.currentWishlists / milestoneValue(milestone)) * 100));
  }, [milestone, wishlistData]);

  function saveMilestone() {
    if (!milestoneProjectId || !validMilestone(milestone)) return;
    const normalized = String(Math.round(Number(milestone)));
    window.localStorage.setItem(milestoneStorageKey(milestoneProjectId), normalized);
    setMilestone(normalized);
    notify('Milestone target saved');
  }

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

  async function openOnboarding(password: string) {
    setSetupLoading(true);
    setSetupError('');
    try {
      if (accessRequired) await unlockBeta(password);
      setScreen('onboarding');
      await authenticateAndLoadSetup();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Beta access was denied.');
    } finally {
      setSetupLoading(false);
    }
  }

  async function authenticateAndLoadSetup() {
    setSetupLoading(true);
    setSetupError('');
    try {
      if (usesFirebaseAuthentication()) await signInToWishline();
      const value = await fetchSetup();
      setSetup(value);
      if (value.workspace.connected) {
        setScreen('app');
        setView('overview');
        try {
          const data = await fetchWishlistDashboard();
          setWishlistData(data);
          setDataError('');
        } catch (error) {
          setDataError(error instanceof Error ? error.message : 'Wishlist data could not be loaded.');
        }
      } else {
        setOnboardingStep(2);
      }
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Sign in is required.');
    } finally {
      setSetupLoading(false);
    }
  }

  async function leaveWorkspace() {
    if (usesFirebaseAuthentication()) await signOutOfWishline();
    setSetup(null);
    setWishlistData(null);
    setScreen('welcome');
  }

  async function saveConnection(input: { appId: string; apiKey: string; projectName: string }) {
    setSetupLoading(true);
    setSetupError('');
    setSetupNotice('');
    try {
      const value = await connectSteam(input);
      setSetup(value);
      if (value.validation?.records === 0) {
        setSetupNotice('Steam accepted the connection, but wishlist data for today and yesterday is not available yet. Your connection is saved and Wishline will keep checking.');
      }
      try {
        const data = await fetchWishlistDashboard(true);
        setWishlistData(data);
        setDataError('');
      } catch (error) {
        setWishlistData(null);
        setDataError(error instanceof Error ? error.message : 'Wishlist data is not available yet.');
      }
      setOnboardingStep(3);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Steam connection could not be saved.');
    } finally {
      setSetupLoading(false);
    }
  }

  async function disconnectAndDelete() {
    if (!window.confirm('Delete the saved Steam credential and all wishlist history for this workspace? This cannot be undone.')) return;
    setSetupLoading(true);
    try {
      const value = await disconnectSteam();
      setSetup(value);
      setWishlistData(null);
      setDataError('');
      setSetupError('');
      setOnboardingStep(2);
      setScreen('onboarding');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Steam data could not be deleted.');
    } finally {
      setSetupLoading(false);
    }
  }

  async function deleteAccountAndData() {
    if (!window.confirm('Permanently delete this Wishline account, its encrypted Steam credential, and all stored wishlist data? This cannot be undone.')) return;
    setSetupLoading(true);
    try {
      await deleteAccount();
      if (usesFirebaseAuthentication()) await signOutOfWishline();
      setSetup(null);
      setWishlistData(null);
      setDataError('');
      setSetupError('');
      setScreen('welcome');
      notify('Wishline account deleted');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Wishline account could not be deleted.');
    } finally {
      setSetupLoading(false);
    }
  }

  if (screen === 'restoring') {
    return <SessionRestore />;
  }

  if (screen === 'welcome') {
    return <Welcome accessRequired={accessRequired} error={setupError} loading={setupLoading} onContinue={openOnboarding} />;
  }

  if (screen === 'onboarding') {
    return (
      <Onboarding
        step={onboardingStep}
        data={wishlistData}
        setup={setup}
        error={setupError}
        notice={setupNotice}
        loading={setupLoading}
        authenticate={authenticateAndLoadSetup}
        connect={saveConnection}
        next={() => setOnboardingStep((step) => Math.min(3, step + 1))}
        back={() => onboardingStep === 1 ? setScreen('welcome') : setOnboardingStep((step) => step - 1)}
        finish={finishOnboarding}
      />
    );
  }

  const steamAccessDenied = wishlistData?.syncWarning?.code === 'STEAM_ACCESS_DENIED';
  const updateSteamConnection = () => {
    setScreen('onboarding');
    setOnboardingStep(2);
    setSetupError('');
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" onClick={() => setView('overview')}><span className="brand-mark">W</span><span>Wishline</span><small className="app-version">v{packageMetadata.version}</small></button>
        <nav aria-label="Primary navigation">
          {nav.map((item) => (
            <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className={`sidebar-note ${wishlistData?.source === 'steam' && !steamAccessDenied ? 'live-source' : ''}`}><span className="status-dot" /><div>{steamAccessDenied ? 'Steam access revoked' : wishlistData?.source === 'steam' ? 'Live Steam data' : 'Anonymous fixture'}<small>{steamAccessDenied ? 'Update credentials to continue' : wishlistData?.source === 'steam' ? 'Financial key stays server-side' : 'Safe local contract data'}</small></div></div>
        <button className="profile" onClick={leaveWorkspace}><span className="avatar">{ownerInitials(setup)}</span><span><b>{setup?.user.name || setup?.user.email || 'Wishline owner'}</b><small>{usesFirebaseAuthentication() ? 'Sign out' : 'Local owner'}</small></span><span>↗</span></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="project-picker" onClick={() => setView('projects')}><span className="game-tile">{wishlistData?.projectName?.charAt(0) || 'W'}</span><span><small>Current project</small><b>{wishlistData?.projectName || 'Loading project…'}</b></span><span>⌄</span></button>
          <div className="top-actions"><span className={`freshness freshness-${steamAccessDenied ? 'stale' : wishlistData?.freshness || 'unknown'}`}><i />{steamAccessDenied ? 'Access revoked' : wishlistData ? `${freshnessLabel(wishlistData.freshness)} · ${formatRelativeTime(wishlistData.generatedAt || wishlistData.fetchedAt)}` : 'Connecting…'}</span><button className="icon-button theme-button" aria-label="Switch color theme" onClick={toggleTheme}><span className="theme-moon">☾</span><span className="theme-sun">☀</span></button><button className="icon-button" aria-label="Notifications" onClick={() => notify(wishlistData?.alerts[0]?.message || 'No detected wishlist spikes')}>♢{Boolean(wishlistData?.alerts.length) && <em>{wishlistData?.alerts.filter((alert) => !alert.readAt).length}</em>}</button><button className={`refresh ${refreshing ? 'spinning' : ''}`} disabled={steamAccessDenied} onClick={refreshData}>↻ <span>{refreshing ? 'Syncing…' : 'Refresh'}</span></button></div>
        </header>

        <div className="content">
          {dataError && <div className="data-error" role="alert"><span>!</span><p><b>Data connection needs attention</b><small>{dataError}</small></p><button onClick={refreshData}>Retry</button></div>}
          {steamAccessDenied && <div className="data-error" role="alert"><span>!</span><p><b>Steam access revoked</b><small>Wishline cannot display wishlist data until Steam accepts the connection again.</small></p><button onClick={updateSteamConnection}>Update Steam connection</button></div>}
          {wishlistData?.syncWarning && !steamAccessDenied && <div className="data-warning" role="status"><span>!</span><p><b>Showing last stored data</b><small>{wishlistData.syncWarning.message}</small></p></div>}
          {!wishlistData && !dataError && <div className="loading-card"><span/><p>Loading the server-side data source…</p></div>}
          {!steamAccessDenied && view === 'overview' && wishlistData && <Overview data={wishlistData} progress={progress} milestone={milestoneValue(milestone)} />}
          {!steamAccessDenied && view === 'projects' && wishlistData && <Projects data={wishlistData} onOpen={() => setView('overview')} notify={notify} />}
          {!steamAccessDenied && view === 'widget' && wishlistData && <WidgetPreview data={wishlistData} refreshing={refreshing} onRefresh={refreshData} />}
          {!steamAccessDenied && view === 'security' && <Security data={wishlistData} token={token} setToken={setToken} notify={notify} />}
          {!steamAccessDenied && view === 'settings' && <Settings data={wishlistData} milestone={milestone} setMilestone={setMilestone} saveMilestone={saveMilestone} notify={notify} reset={updateSteamConnection} disconnect={disconnectAndDelete} deleteAccount={deleteAccountAndData} disconnecting={setupLoading} />}
        </div>
      </section>
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

function SessionRestore() {
  return (
    <main className="session-restore" aria-busy="true" aria-live="polite">
      <div className="session-restore-card">
        <div className="brand"><span className="brand-mark">W</span><span>Wishline</span></div>
        <span className="session-spinner" aria-hidden="true" />
        <h1>Identifying you…</h1>
        <p>Checking your saved Wishline session and workspace.</p>
      </div>
    </main>
  );
}

function Welcome({ accessRequired, error, loading, onContinue }: { accessRequired:boolean; error:string; loading:boolean; onContinue:(password:string)=>void }) {
  const [password, setPassword] = useState('');
  return (
    <main className="welcome-screen">
      <section className="welcome-copy">
        <div className="brand welcome-brand"><span className="brand-mark">W</span><span>Wishline</span></div>
        <div className="welcome-content">
          <span className="beta-pill"><i /> PRIVATE BETA DEMO</span>
          <h1>Your Steam wishlists.<br/><em>Finally within reach.</em></h1>
          <p>Track momentum, catch spikes, and celebrate every milestone—without opening another dashboard.</p>
          {accessRequired ? <form className="beta-access-form" onSubmit={(event)=>{event.preventDefault();onContinue(password);}}>
            <label htmlFor="beta-password">Temporary access password</label>
            <div><input id="beta-password" type="password" autoComplete="current-password" required value={password} onChange={(event)=>setPassword(event.target.value)} placeholder="Enter the private beta password"/><button className="primary-button" disabled={loading || !password}>{loading ? 'Checking…' : 'Enter beta'} <span>→</span></button></div>
            {error && <p className="beta-access-error" role="alert">{error}</p>}
          </form> : <button className="primary-button" disabled={loading} onClick={()=>onContinue('')}>Continue to demo <span>→</span></button>}
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

function Onboarding({ step, data, setup, error, notice, loading, authenticate, connect, next, back, finish }: { step:number; data:WishlistDashboardData|null; setup:SetupState|null; error:string; notice:string; loading:boolean; authenticate:()=>void; connect:(input:{appId:string;apiKey:string;projectName:string})=>void; next:()=>void; back:()=>void; finish:()=>void }) {
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
            {notice && <div className="inline-notice" role="status"><b>Connection successful.</b><span>{notice}</span></div>}
            <div className="review-list"><div><span className="game-tile">{setup?.workspace.projectName?.charAt(0) || 'W'}</span><p><small>TRACKING</small><b>{setup?.workspace.projectName || data?.projectName || 'Configured project'}</b></p><em>Live</em></div><div><span>◎</span><p><small>OWNER</small><b>{setup?.user.email || setup?.user.name || 'Authenticated account'}</b></p></div><div><span>◆</span><p><small>CREDENTIAL PROTECTION</small><b>Server-side only</b></p></div></div>
          </>}
          <div className="setup-actions"><button className="secondary-button" onClick={back}>← Back</button>{step === 1 ? setup ? <button className="primary-button compact" disabled={loading} onClick={next}>Continue →</button> : usesFirebaseAuthentication() ? <button className="primary-button compact" disabled={loading} onClick={authenticate}>{loading ? 'Signing in…' : 'Sign in with Google →'}</button> : <button className="primary-button compact" disabled={loading} onClick={authenticate}>{loading ? 'Opening…' : 'Open local workspace →'}</button> : step === 3 ? <button className="primary-button compact" disabled={!setup?.workspace.connected} onClick={finish}>Open dashboard →</button> : null}</div>
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
  const [annotations, setAnnotations] = useState<WishlistAnnotation[]>([]);
  const [annotationDate, setAnnotationDate] = useState(lastDate);
  const [annotationNote, setAnnotationNote] = useState('');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [annotationError, setAnnotationError] = useState('');
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [showAnnotationLabels, setShowAnnotationLabels] = useState(false);
  const recent = data.daily.slice(-7);
  const previous = data.daily.slice(-14, -7);
  const latest = recent.at(-1);
  const average = averageOf(recent.map((day) => day.net));
  const previousAverage = averageOf(previous.map((day) => day.net));
  const pace = previousAverage ? ((average - previousAverage) / previousAverage) * 100 : 0;
  const toGo = data.currentWishlists == null ? null : Math.max(0, milestone - data.currentWishlists);
  const estimatedDays = average > 0 && toGo != null ? Math.ceil(toGo / average) : null;

  const history = useMemo(() => buildWishlistHistory(data.daily, data.currentWishlists), [data]);
  const selected = useMemo(
    () => summarizeWishlistRange(history, fromDate, toDate),
    [fromDate, history, toDate],
  );
  const selectedRepairStates = new Map(
    (data.historyRepairs || [])
      .filter((repair) => selected.missingDates.includes(repair.date))
      .map((repair) => [repair.date, repair.status]),
  );
  const exhaustedRepairs = [...selectedRepairStates.values()].filter((status) => status === 'exhausted').length;
  const pendingRepairs = selectedRepairStates.size - exhaustedRepairs;
  const missingDetail = exhaustedRepairs
    ? `${pendingRepairs ? `${pendingRepairs} pending recovery · ` : ''}${exhaustedRepairs} unavailable after bounded retries`
    : pendingRepairs ? `${pendingRepairs} pending recovery` : `missing ${selected.missingDates.join(', ')}`;

  useEffect(() => {
    let active = true;
    void fetchAnnotations().then((values) => { if (active) setAnnotations(values); }).catch((error) => {
      if (active) setAnnotationError(error instanceof Error ? error.message : 'Timeline notes could not be loaded.');
    });
    return () => { active = false; };
  }, [data.appId]);

  useEffect(() => {
    const saved = window.localStorage.getItem(annotationDisplayStorageKey(data.appId));
    const timer = window.setTimeout(() => setShowAnnotationLabels(saved === 'always'), 0);
    return () => window.clearTimeout(timer);
  }, [data.appId]);

  function changeAnnotationDisplay(always: boolean) {
    setShowAnnotationLabels(always);
    window.localStorage.setItem(annotationDisplayStorageKey(data.appId), always ? 'always' : 'hover');
  }

  function selectAnnotationDate(date: string) {
    const existing = annotations.find((annotation) => annotation.date === date);
    setAnnotationDate(date);
    setAnnotationNote(existing?.note || '');
    setEditingAnnotationId(existing?.id || null);
    setAnnotationError('');
    document.getElementById('timeline-note-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function saveAnnotation(event: React.FormEvent) {
    event.preventDefault();
    setSavingAnnotation(true);
    setAnnotationError('');
    try {
      const saved = await mutateAnnotation(editingAnnotationId ? 'PUT' : 'POST', {
        id: editingAnnotationId || undefined, date: annotationDate, note: annotationNote,
      });
      if (saved) setAnnotations((values) => [saved, ...values.filter((value) => value.id !== saved.id)].sort((a, b) => b.date.localeCompare(a.date)));
      setEditingAnnotationId(saved?.id || null);
    } catch (error) {
      setAnnotationError(error instanceof Error ? error.message : 'Timeline note could not be saved.');
    } finally { setSavingAnnotation(false); }
  }

  async function deleteAnnotation(annotation: WishlistAnnotation) {
    if (!window.confirm(`Delete the note for ${formatShortDate(annotation.date)}?`)) return;
    setSavingAnnotation(true);
    setAnnotationError('');
    try {
      await mutateAnnotation('DELETE', { id: annotation.id });
      setAnnotations((values) => values.filter((value) => value.id !== annotation.id));
      if (editingAnnotationId === annotation.id) {
        setEditingAnnotationId(null);
        setAnnotationNote('');
      }
    } catch (error) {
      setAnnotationError(error instanceof Error ? error.message : 'Timeline note could not be deleted.');
    } finally { setSavingAnnotation(false); }
  }

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
      <div className="range-head"><div><p className="panel-title">History by date range</p><p className="panel-subtitle">Daily net movement and estimated total progression</p></div><div className="date-range"><label>From<input type="date" min={firstDate} max={toDate || lastDate} value={fromDate} onChange={(event)=>setFromDate(event.target.value)} /></label><span>→</span><label>To<input type="date" min={fromDate || firstDate} max={lastDate} value={toDate} onChange={(event)=>setToDate(event.target.value)} /></label></div></div>
      {selected.expectedDays ? <><div className={`range-coverage ${selected.complete ? 'complete' : 'incomplete'}`} role="status"><b>{selected.complete ? 'Complete coverage' : 'Incomplete coverage'}</b><span>{selected.complete ? `${selected.recordedDays} reported days` : `${selected.recordedDays} of ${selected.expectedDays} days have data · ${missingDetail}`}</span></div><div className="range-summary"><div><small>INCLUSIVE PERIOD</small><b>{selected.expectedDays} {selected.expectedDays === 1 ? 'day' : 'days'}</b></div><div><small>REPORTED ADDS</small><b className="green">+{formatCount(selected.adds)}</b></div><div><small>REPORTED DELETES</small><b>-{formatCount(selected.deletes)}</b></div><div><small>REPORTED NET GROWTH</small><b className={selected.net >= 0 ? 'green' : ''}>{signedCount(selected.net)}</b></div></div>{selected.recordedDays ? <WishlistRangeChart entries={selected.entries} annotations={annotations} onSelectDate={selectAnnotationDate} showAnnotationLabels={showAnnotationLabels} onChangeAnnotationDisplay={changeAnnotationDisplay} /> : <div className="empty-range">There are no records in this range. Days are shown as missing, not as zero activity.</div>}</> : <div className="empty-range">Choose a valid range within the available history.</div>}
      <section className="annotation-manager" aria-labelledby="timeline-notes-title">
        <div className="annotation-heading"><div><p className="panel-title" id="timeline-notes-title">Timeline notes</p><p className="panel-subtitle">Explain campaigns, demos, launches, or other actions. Select any day in the chart or use the date field.</p></div><span>{annotations.length} {annotations.length === 1 ? 'NOTE' : 'NOTES'}</span></div>
        <form id="timeline-note-editor" className="annotation-form" onSubmit={saveAnnotation}>
          <label>Date<input type="date" min={firstDate} max={lastDate} required value={annotationDate} onChange={(event) => selectAnnotationDate(event.target.value)} /></label>
          <label>What happened?<textarea maxLength={200} required rows={2} value={annotationNote} onChange={(event) => setAnnotationNote(event.target.value)} placeholder="Example: Launched the demo and shared it on Reddit"/><small>{annotationNote.length}/200</small></label>
          <div className="annotation-form-actions"><button className="primary-button compact" disabled={savingAnnotation || !annotationDate || !annotationNote.trim()}>{savingAnnotation ? 'Saving…' : editingAnnotationId ? 'Save note' : 'Add note'}</button>{editingAnnotationId && <button type="button" className="secondary-button" onClick={() => { setEditingAnnotationId(null); setAnnotationNote(''); }}>Cancel edit</button>}</div>
        </form>
        {annotationError && <div className="inline-error" role="alert"><b>Timeline note error.</b><span>{annotationError}</span></div>}
        <div className="annotation-list" aria-label="Saved timeline notes">{annotations.length ? annotations.map((annotation) => <article key={annotation.id}><span className="annotation-pin">◆</span><div><time dateTime={annotation.date}>{formatShortDate(annotation.date)}</time><p>{annotation.note}</p></div><div><button type="button" onClick={() => selectAnnotationDate(annotation.date)}>Edit</button><button type="button" className="danger-text" disabled={savingAnnotation} onClick={() => deleteAnnotation(annotation)}>Delete</button></div></article>) : <p className="annotation-empty">No notes yet. Select a chart day to record what may have influenced wishlists.</p>}</div>
      </section>
    </article>
    <div className="dashboard-grid">
      <article className="panel trend-panel"><div className="panel-head"><div><p className="panel-title">Last 7 days</p><p className="panel-subtitle">Adds, deletes, and net movement reported by Steam</p></div><div className="legend"><span><i className="legend-now" />Net</span></div></div><div className="daily-table">{recent.slice().reverse().map(day=><div key={day.date}><time>{formatShortDate(day.date)}</time><span className="daily-adds">+{formatCount(day.adds)}</span><span className="daily-deletes">-{formatCount(day.deletes)}</span><b>{signedCount(day.net)}</b></div>)}</div></article>
      <article className="panel milestone-panel"><div className="panel-head"><div><p className="panel-title">Next milestone</p><p className="panel-subtitle">Based on stored coverage</p></div><span className="spark">✦</span></div><div className="milestone-number"><strong>{compactCount(milestone)}</strong><span>{toGo == null ? 'Stored total unavailable' : `${formatCount(toGo)} to go`}</span></div><div className="progress"><span style={{width:`${progress}%`}} /></div><p className="prediction"><b>{estimatedDays ? `Estimated in ${estimatedDays} days` : 'Estimate unavailable'}</b><br/>{coverageLabel(data)}</p></article>
    </div>
    <div className="activity-row"><article className="panel compact-panel"><div className="panel-head"><div><p className="panel-title">Latest Steam record</p><p className="panel-subtitle">All values come from the normalized response</p></div></div><div className="activity-list"><div><span className="activity-icon purple">↗</span><p><b>{formatCount(latest?.adds ?? 0)} wishlist additions</b><small>{formatCount(latest?.addsWindows ?? 0)} Windows · {formatCount(latest?.addsMac ?? 0)} Mac · {formatCount(latest?.addsLinux ?? 0)} Linux</small></p><time>{latest?.date}</time></div><div><span className="activity-icon lime">✓</span><p><b>{formatCount(latest?.purchases ?? 0)} purchases · {formatCount(latest?.gifts ?? 0)} gifts</b><small>{formatCount(latest?.deletes ?? 0)} wishlist deletions</small></p><time>{formatRelativeTime(latest?.generatedAt)}</time></div></div></article><article className="panel compact-panel health"><p className="panel-title">Data health</p><div className="health-status"><span>✓</span><p><b>{data.syncWarning ? 'Steam sync needs attention' : data.source === 'steam' ? 'Steam connector is responding' : 'Contract fixture is valid'}</b><small>{freshnessLabel(data.freshness)} · Browser API caching is disabled</small></p></div><dl><div><dt>Source</dt><dd>{data.source === 'steam' ? 'Steamworks partner API' : 'Anonymous fixture'}</dd></div><div><dt>Coverage</dt><dd>{data.coverageStart || 'Unknown'} → {data.coverageEnd || 'Unknown'}</dd></div><div><dt>Records</dt><dd>{data.daily.length} normalized days</dd></div></dl></article></div>
  </>;
}

function WishlistRangeChart({ entries, annotations, onSelectDate, showAnnotationLabels, onChangeAnnotationDisplay }: { entries: WishlistRangeEntry[]; annotations: WishlistAnnotation[]; onSelectDate: (date:string)=>void; showAnnotationLabels:boolean; onChangeAnnotationDisplay:(always:boolean)=>void }) {
  const width = 900;
  const height = 250;
  const padding = 28;
  const recorded = entries.flatMap((entry, index) => entry.day ? [{ ...entry.day, index }] : []);
  const values = recorded.map((day) => day.total ?? day.net);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const xForIndex = (index: number) => entries.length === 1
    ? width / 2
    : padding + index * ((width - padding * 2) / (entries.length - 1));
  const points = recorded.map((day) => {
    const x = xForIndex(day.index);
    const y = height - padding - (((day.total ?? day.net) - min) / span) * (height - padding * 2);
    return { ...day, x, y };
  });
  const segments = points.reduce<typeof points[]>((result, point) => {
    const previous = result.at(-1)?.at(-1);
    if (!previous || point.index !== previous.index + 1) result.push([point]);
    else result.at(-1)?.push(point);
    return result;
  }, []);
  const labelEvery = Math.max(1, Math.ceil(entries.length / 6));
  const annotationsByDate = new Map(annotations.map((annotation) => [annotation.date, annotation]));

  return (
    <div className="history-chart">
      <div className="annotation-display-controls" role="group" aria-label="Annotation display">
        <span>Notes</span>
        <button type="button" aria-pressed={!showAnnotationLabels} onClick={() => onChangeAnnotationDisplay(false)}>On hover</button>
        <button type="button" aria-pressed={showAnnotationLabels} onClick={() => onChangeAnnotationDisplay(true)}>Always visible</button>
      </div>
      <div className="history-scale"><span>{formatCount(max)}</span><span>{formatCount(min)}</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Wishlist progression over the selected period; striped blocks indicate dates without data">
        <defs>
          <linearGradient id="historyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6755e7" stopOpacity=".28"/>
            <stop offset="1" stopColor="#6755e7" stopOpacity=".02"/>
          </linearGradient>
          <pattern id="missingFill" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#c58a55" strokeWidth="3" opacity=".35"/>
          </pattern>
        </defs>
        <line x1={padding} y1={padding} x2={width-padding} y2={padding}/>
        <line x1={padding} y1={height/2} x2={width-padding} y2={height/2}/>
        <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding}/>
        {entries.map((entry, index) => <rect key={`hit-${entry.date}`} className="chart-day-hit" x={xForIndex(index)-Math.max(7, (width-padding*2)/entries.length/2)} y={padding} width={Math.max(14, (width-padding*2)/entries.length)} height={height-padding*2} onClick={() => onSelectDate(entry.date)}><title>Select {formatShortDate(entry.date)} to add a note</title></rect>)}
        {entries.map((entry, index) => entry.status === 'missing' ? (
          <rect className="history-missing" key={entry.date} x={xForIndex(index)-8} y={padding} width="16" height={height-padding*2}>
            <title>{formatShortDate(entry.date)} · no reported data</title>
          </rect>
        ) : null)}
        {segments.map((segment, index) => {
          const path = segment.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
          const area = `${path} L ${segment.at(-1)?.x} ${height-padding} L ${segment[0]?.x} ${height-padding} Z`;
          return <g key={index}><path className="history-area" d={area}/><path className="history-line" d={path}/></g>;
        })}
        {points.map((point) => <circle className="history-node" key={point.date} cx={point.x} cy={point.y} r="4" role="button" tabIndex={0} aria-label={`Select ${formatShortDate(point.date)} to add a note`} onClick={() => onSelectDate(point.date)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectDate(point.date); }}><title>{formatShortDate(point.date)} · {formatCount(point.total)} stored total · {signedCount(point.net)} net · select to add a note</title></circle>)}
        {entries.map((entry, index) => {
          const annotation = annotationsByDate.get(entry.date);
          if (!annotation) return null;
          const x = xForIndex(index);
          return <g className="annotation-marker" key={`annotation-${annotation.id}`} role="button" tabIndex={0} aria-label={`${formatShortDate(annotation.date)}: ${annotation.note}`} onClick={() => onSelectDate(annotation.date)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectDate(annotation.date); }}><line x1={x} y1={padding} x2={x} y2={height-padding}/><path d={`M ${x-9} ${padding-3} L ${x+9} ${padding-3} L ${x} ${padding+13} Z`}/><title>{formatShortDate(annotation.date)} · {annotation.note}</title></g>;
        })}
        {showAnnotationLabels && entries.flatMap((entry, index) => {
          const annotation = annotationsByDate.get(entry.date);
          if (!annotation) return [];
          const x = Math.max(padding, Math.min(width - 168, xForIndex(index) - 78));
          const y = 45 + (index % 3) * 35;
          return [<foreignObject className="annotation-chart-label" key={`label-${annotation.id}`} x={x} y={y} width="168" height="31"><button type="button" title={annotation.note} onClick={() => onSelectDate(annotation.date)}><time>{formatChartDate(annotation.date)}</time><span>{annotation.note}</span></button></foreignObject>];
        })}
      </svg>
      <div className="history-dates">
        {entries.map((entry, index) => <span className={entry.status === 'missing' ? 'missing' : ''} key={entry.date} style={{left:`${(xForIndex(index)/width)*100}%`}}>{index % labelEvery === 0 || index === entries.length-1 || entry.status === 'missing' ? formatChartDate(entry.date) : ''}</span>)}
      </div>
      <p className="chart-note">The line uses only reported dates and breaks where data is missing; a reported day with zero activity keeps its point. The total is reconstructed only from history stored by Wishline.</p>
    </div>
  );
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

function Settings({ data, milestone, setMilestone, saveMilestone, notify, reset, disconnect, deleteAccount, disconnecting }: { data:WishlistDashboardData|null; milestone:string; setMilestone:(s:string)=>void; saveMilestone:()=>void; notify:(s:string)=>void; reset:()=>void; disconnect:()=>void; deleteAccount:()=>void; disconnecting:boolean }) {
  const [pushState, setPushState] = useState<PushState>('checking');
  const [pushConfiguration, setPushConfiguration] = useState<PushConfiguration | null>(null);
  const [testReceipt, setTestReceipt] = useState<PushTestReceipt | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [pushHelpOpen, setPushHelpOpen] = useState(false);
  const pendingTestReceiptId = testReceipt?.providerStatus === 'accepted' && !testReceipt.receivedAt
    ? testReceipt.id
    : null;

  useEffect(() => {
    let active = true;
    async function checkPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (active) setPushState('unsupported');
        return;
      }
      try {
        const configuration = await fetchPushConfiguration();
        if (!active) return;
        setPushConfiguration(configuration);
        setTestReceipt(configuration.latestTest);
        if (!configuration.configured || !configuration.publicKey) {
          setPushState('unconfigured');
          return;
        }
        const registration = await navigator.serviceWorker.register('/sw.js');
        const subscription = await registration.pushManager.getSubscription();
        if (!active) return;
        setPushState(subscription ? 'enabled' : Notification.permission === 'denied' ? 'denied' : 'disabled');
      } catch {
        if (active) setPushState('error');
      }
    }
    void checkPush();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!pendingTestReceiptId) return;
    let active = true;
    let checks = 0;
    const timer = window.setInterval(async () => {
      checks += 1;
      try {
        const configuration = await fetchPushConfiguration(pendingTestReceiptId);
        if (active && configuration.latestTest) setTestReceipt(configuration.latestTest);
      } catch {
        // Keep the last verified state; a later Settings visit reloads it.
      }
      if (checks >= 40) window.clearInterval(timer);
    }, 1_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pendingTestReceiptId]);

  async function enablePush() {
    if (!pushConfiguration?.publicKey) return;
    setPushState('working');
    let created = false;
    let subscription: PushSubscription | null = null;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushState(permission === 'denied' ? 'denied' : 'disabled');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(pushConfiguration.publicKey),
        });
        created = true;
      }
      const result = await saveBrowserPushSubscription(subscription);
      setTestReceipt(result.testReceipt);
      setPushState('enabled');
      notify(result.testAccepted ? 'A test notification has been sent.' : 'Notifications are enabled, but the test was not accepted by the push service.');
    } catch (error) {
      if (created && subscription) await subscription.unsubscribe().catch(() => false);
      setPushState('error');
      notify(error instanceof Error ? error.message : 'Notifications could not be enabled.');
    }
  }

  async function sendAnotherPushTest() {
    setTestSending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error('Enable notifications on this device before sending a test.');
      const result = await sendBrowserPushTest(subscription.endpoint);
      setTestReceipt(result.testReceipt);
      notify(result.testAccepted ? 'A test notification has been sent.' : 'The test was not accepted by the push service.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The test notification could not be sent.');
    } finally {
      setTestSending(false);
    }
  }

  async function disablePush() {
    setPushState('working');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deleteBrowserPushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setTestReceipt(null);
      setPushState('disabled');
      notify('Browser notifications disabled');
    } catch (error) {
      setPushState('error');
      notify(error instanceof Error ? error.message : 'Notifications could not be disabled.');
    }
  }

  const pushCopy = {
    checking: 'Checking this browser and the server configuration…',
    unsupported: 'This browser does not support Web Push.',
    unconfigured: 'The server push keys have not been configured yet.',
    disabled: 'Receive an alert when Steam publishes changed wishlist activity.',
    denied: 'Notification permission is blocked in this device’s settings.',
    working: 'Updating this device’s notification subscription…',
    enabled: 'This device will be notified after Steam reports a change.',
    error: 'Notification settings could not be verified. Try again.',
  }[pushState];

  const testReceiptCopy = !testReceipt
    ? 'Enable notifications to start the delivery test.'
    : testReceipt.clickedAt
      ? '✓ Test notification received and opened on the device.'
      : testReceipt.receivedAt
        ? '✓ Test notification reached this device.'
        : testReceipt.providerStatus === 'accepted'
          ? 'Test accepted by the push service; waiting for the device receipt…'
          : testReceipt.providerStatus === 'failed'
            ? 'The push service did not accept the latest test. Try again.'
            : 'Sending the test notification…';

  return <>
    <PageHeading
      eyebrow="PREFERENCES"
      title="Workspace settings"
      copy={`Configure the local experience for ${data?.projectName || 'the current project'}.`}
    />
    <div className="settings-layout">
      <article className="panel settings-panel">
        <div className="settings-section">
          <div><h2>Milestone target</h2><p>Enter any wishlist total to use as this project&apos;s next goal.</p></div>
          <input className="milestone-input" type="number" inputMode="numeric" min="1" step="1" value={milestone} onChange={(event) => setMilestone(event.target.value)} aria-label="Milestone target" />
        </div>
        <div className="settings-section">
          <div><h2>Data source</h2><p>{data?.source === 'steam' ? 'Live server-side Steamworks adapter with a protected key.' : 'Deterministic anonymous data for contract validation.'}</p></div>
          <span className={`demo-badge ${data?.source === 'steam' ? 'live' : ''}`}>{data?.source === 'steam' ? 'LIVE STEAM' : 'FIXTURE'}</span>
        </div>
        <div className="settings-section">
          <div><h2>Hourly intraday sync</h2><p>The backend checks today&apos;s GMT record once per hour; Steam may publish changes in batches.</p></div>
          <label className="toggle"><input type="checkbox" defaultChecked disabled aria-label="Hourly intraday sync enabled"/><span/></label>
        </div>
        <div className="settings-section">
          <div className="push-settings-copy">
            <h2>Browser notifications</h2>
            <p>{pushCopy}</p>
            <small className="push-test-status">{testReceiptCopy}</small>
            <button
              type="button"
              className="push-help-button"
              aria-expanded={pushHelpOpen}
              aria-controls="push-notification-help"
              onClick={() => setPushHelpOpen((open) => !open)}
            >
              {pushHelpOpen ? 'Hide help' : 'Need help?'}
            </button>
            {pushHelpOpen && <div id="push-notification-help" className="push-help" role="note">
              <strong>Chrome marked the test as possible spam?</strong>
              <p>This does not necessarily mean delivery failed. Wishline reports three separate checkpoints:</p>
              <ul>
                <li><b>Accepted</b> — the push service accepted the request.</li>
                <li><b>Reached this device</b> — the service worker asked Chrome to display it.</li>
                <li><b>Opened</b> — the notification was clicked.</li>
              </ul>
              <p>If Chrome hid the content, choose <b>Show notification → Always show → Mark as safe</b>, then send another test.</p>
              <p>If you chose <b>Unsubscribe</b>, open Chrome&apos;s site information, then <b>Permissions → Notifications → Allow</b>. Do not disable Safe Browsing globally.</p>
              <a href="https://support.google.com/chrome/answer/3220216?co=GENIE.Platform%3DAndroid&amp;hl=en" target="_blank" rel="noreferrer">Open Chrome notification help ↗</a>
            </div>}
          </div>
          {pushState === 'enabled'
            ? <div className="push-controls">
              <button className="primary-button compact" disabled={testSending} onClick={sendAnotherPushTest}>{testSending ? 'Sending…' : 'Send another test'}</button>
              <button className="secondary-button" disabled={testSending} onClick={disablePush}>Disable</button>
            </div>
            : <button className="primary-button compact" disabled={!['disabled', 'error'].includes(pushState) || data?.source !== 'steam'} onClick={enablePush}>{pushState === 'working' ? 'Updating…' : 'Enable notifications'}</button>}
        </div>
        <div className="settings-actions"><button className="primary-button compact" disabled={!validMilestone(milestone) || !data} onClick={saveMilestone}>Save changes</button></div>
      </article>
      <aside className="panel about-card">
        <span className="brand-mark">W</span>
        <h2>Wishline MVP</h2>
        <p>Local real-data acceptance build<br/>Version {packageMetadata.version}</p>
        <hr/>
        <p>{data?.source === 'steam' ? `Connected to App ID ${data.appId}.` : 'Ready to connect a Steamworks project through onboarding.'}</p>
        <button className="danger-text" onClick={reset}>Update Steam connection</button>
        <button className="danger-button" disabled={disconnecting} onClick={disconnect}>{disconnecting ? 'Deleting…' : 'Disconnect and delete all data'}</button>
        <button className="danger-text" disabled={disconnecting} onClick={deleteAccount}>Delete Wishline account</button>
      </aside>
    </div>
  </>;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function validMilestone(value: string): boolean {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function milestoneValue(value: string): number {
  return validMilestone(value) ? Number(value) : DEFAULT_MILESTONE;
}

function milestoneStorageKey(appId: number): string {
  return `wishline:milestone:${appId}`;
}

function annotationDisplayStorageKey(appId: number): string {
  return `wishline:annotation-display:${appId}`;
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

function ownerInitials(setup: SetupState | null): string {
  const label = setup?.user.name || setup?.user.email || 'Wishline owner';
  const parts = label.split(/[\s@._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'W';
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
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatChartDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}
