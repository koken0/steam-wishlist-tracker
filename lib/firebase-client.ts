'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDj6et74IAQBOiBTVmuMsYEN1cj3xUZ5jI',
  authDomain: 'wishline-staging.firebaseapp.com',
  projectId: 'wishline-staging',
  storageBucket: 'wishline-staging.firebasestorage.app',
  messagingSenderId: '204255028366',
  appId: '1:204255028366:web:32f4db10caf0d0b99295df',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.useDeviceLanguage();

export function usesFirebaseAuthentication(): boolean {
  if (typeof window === 'undefined') return false;
  return !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

export function observeWishlineUser(callback: (user: User | null) => void): () => void {
  return onIdTokenChanged(auth, callback);
}

export async function signInToWishline(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return (await signInWithPopup(auth, provider)).user;
}

export async function signOutOfWishline(): Promise<void> {
  await signOut(auth);
}

export async function wishlineAuthorizationHeader(): Promise<Record<string, string>> {
  if (!usesFirebaseAuthentication()) return {};
  const user = auth.currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}
