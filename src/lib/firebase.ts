'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/* ==========================================================================
   Firebase bootstrap.

   Initialised lazily and defensively: a deployment without Firebase env vars
   still builds and renders — auth-gated surfaces show a configuration notice
   instead of throwing. Nothing here runs at module scope, so `next build`
   never evaluates it during static generation.
   ========================================================================== */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** These three are the minimum for auth + Firestore to function. */
export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId);

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function app(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (_app) return _app;
  _app = getApps().length > 0 ? getApp() : initializeApp(config as Required<typeof config>);
  return _app;
}

export function auth(): Auth | null {
  if (_auth) return _auth;
  const a = app();
  if (!a) return null;
  _auth = getAuth(a);
  return _auth;
}

export function db(): Firestore | null {
  if (_db) return _db;
  const a = app();
  if (!a) return null;
  _db = getFirestore(a);
  return _db;
}

/** Firebase error codes are not presentable. Map the ones users actually hit. */
export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists with that email.';
    case 'auth/weak-password':
      return 'Use at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in window was closed.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups and retry.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled for this project.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in your Firebase console.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
