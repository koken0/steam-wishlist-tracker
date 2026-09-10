'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { observeWishlineUser, signInToWishline, wishlineAuthorizationHeader } from '@/lib/firebase-client';
import styles from '../admin.module.css';

export default function AdminAccessPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => observeWishlineUser(() => setReady(true)), []);

  async function enter() {
    setLoading(true);
    setMessage('');
    try {
      await signInToWishline();
      const response = await fetch('/api/admin/session', { method: 'POST', headers: await wishlineAuthorizationHeader() });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || 'No se pudo abrir la consola.');
      router.replace('/admin');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir la consola.');
      setLoading(false);
    }
  }

  return <main className={styles.gate}><div className={styles.gateCard}>
    <div className={styles.mark}>W</div><p>WISHLINE OPERATOR</p><h1>Consola privada</h1>
    <span>Tu identidad se verificará en el servidor antes de cargar cualquier página administrativa.</span>
    {message && <span className={styles.accessError}>{message}</span>}
    <div className={styles.gateAction}><button className={styles.primary} disabled={!ready || loading} onClick={() => void enter()}>{loading ? 'Verificando…' : 'Continuar con Google'}</button></div>
  </div></main>;
}
