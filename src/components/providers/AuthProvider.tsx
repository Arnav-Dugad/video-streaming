'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup,
  signOut as fbSignOut, updateProfile as fbUpdateProfile, type User,
} from 'firebase/auth';

import { auth, authErrorMessage, isFirebaseConfigured } from '@/lib/firebase';
import { ensureProfile, updatePreferences as dbUpdatePreferences, DEFAULT_PREFERENCES } from '@/lib/db';
import type { UserProfile } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  /** True until the first auth state resolution — distinct from "signed out". */
  loading: boolean;
  configured: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  setPreference<K extends keyof UserProfile['preferences']>(
    key: K, value: UserProfile['preferences'][K],
  ): Promise<void>;
  refreshProfile(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Nothing to wait for when Firebase is absent — start resolved.
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const a = auth();
    if (!a) return;

    return onAuthStateChanged(a, async (u) => {
      setUser(u);
      if (u) {
        try {
          const p = await ensureProfile(u.uid, {
            email: u.email,
            displayName: u.displayName ?? u.email?.split('@')[0] ?? 'Viewer',
            photoURL: u.photoURL,
          });
          if (mounted.current) setProfile(p);
        } catch (err) {
          // A Firestore rules misconfiguration must not lock the user out of
          // the app — fall back to an in-memory profile.
          console.error('[auth] profile load failed', err);
          if (mounted.current) {
            setProfile({
              uid: u.uid,
              email: u.email,
              displayName: u.displayName ?? 'Viewer',
              photoURL: u.photoURL,
              handle: u.uid.slice(0, 8),
              createdAt: Date.now(),
              interests: [],
              preferences: { ...DEFAULT_PREFERENCES },
            });
          }
        }
      } else {
        setProfile(null);
      }
      if (mounted.current) setLoading(false);
    });
  }, []);

  const guard = useCallback(() => {
    const a = auth();
    if (!a) throw new Error('Authentication is not configured for this deployment.');
    return a;
  }, []);

  const wrap = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      throw new Error(code ? authErrorMessage(code) : (err as Error).message);
    }
  }, []);

  const signIn = useCallback(
    (email: string, password: string) =>
      wrap(() => signInWithEmailAndPassword(guard(), email.trim(), password)),
    [guard, wrap],
  );

  const signUp = useCallback(
    (name: string, email: string, password: string) =>
      wrap(async () => {
        const cred = await createUserWithEmailAndPassword(guard(), email.trim(), password);
        const displayName = name.trim() || email.split('@')[0];
        await fbUpdateProfile(cred.user, { displayName });
        await ensureProfile(cred.user.uid, {
          email: cred.user.email,
          displayName,
          photoURL: cred.user.photoURL,
        });
      }),
    [guard, wrap],
  );

  const signInWithGoogle = useCallback(
    () =>
      wrap(async () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(guard(), provider);
      }),
    [guard, wrap],
  );

  const signOut = useCallback(() => wrap(() => fbSignOut(guard())), [guard, wrap]);

  const resetPassword = useCallback(
    (email: string) => wrap(() => sendPasswordResetEmail(guard(), email.trim())),
    [guard, wrap],
  );

  const setPreference = useCallback<AuthContextValue['setPreference']>(
    async (key, value) => {
      if (!user || !profile) return;
      // Optimistic — preference toggles must feel instant.
      setProfile({ ...profile, preferences: { ...profile.preferences, [key]: value } });
      try {
        await dbUpdatePreferences(user.uid, { [key]: value });
      } catch (err) {
        console.error('[auth] preference write failed', err);
        setProfile(profile);
      }
    },
    [user, profile],
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await ensureProfile(user.uid, {
      email: user.email,
      displayName: user.displayName ?? 'Viewer',
      photoURL: user.photoURL,
    });
    setProfile(p);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user, profile, loading, configured: isFirebaseConfigured,
      signIn, signUp, signInWithGoogle, signOut, resetPassword, setPreference, refreshProfile,
    }),
    [user, profile, loading, signIn, signUp, signInWithGoogle, signOut, resetPassword, setPreference, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
