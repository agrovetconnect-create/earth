import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
<<<<<<< HEAD
import { useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import {
  AccountUser,
  AuthCodeRequested,
  fetchAuthSession,
  requestAuthCode,
  signOutAuthSession,
  updateAccountProfile,
  verifyAuthCode,
  requestEmailAuthCode,
  verifyEmailAuthCode,
  linkWhatsAppAccount,
  verifyWhatsAppLink as verifyWhatsAppLinkApi,
  loginWithGoogle as loginWithGoogleApi,
  verifyGoogleChallengeApi,
  resendGoogleChallengeApi,
  restoreGoogleAvatar as restoreGoogleAvatarApi,
  type MobileGoogleAuthResponse,
} from '../services/api';
=======
import { Platform } from 'react-native';
import { AccountUser, AuthCodeRequested, fetchAuthSession, requestAuthCode, signOutAuthSession, updateAccountProfile, verifyAuthCode } from '../services/api';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

const SESSION_KEY = 'earth-talk-session-v1';
interface AuthValue {
  ready: boolean;
  token: string | null;
  user: AccountUser | null;
  restoreFailed: boolean;
<<<<<<< HEAD
  /** @deprecated Use requestEmailCode */
  requestCode(phone: string): Promise<AuthCodeRequested>;
  /** @deprecated Use verifyEmailCode */
  verifyCode(phone: string, code: string): Promise<void>;
  requestEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  loginWithGoogle(email: string, displayName?: string | null, avatarUrl?: string | null): Promise<MobileGoogleAuthResponse>;
  verifyGoogleChallenge(challengeId: string, code: string, displayName?: string | null, avatarUrl?: string | null): Promise<void>;
  resendGoogleChallenge(challengeId: string): Promise<{ ok: true; challenge_id: string; expires_in_seconds: number }>;
  restoreGoogleAvatar(): Promise<void>;
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
  updateDisplayName(name: string | null): Promise<void>;
  linkWhatsApp(phone: string): Promise<void>;
  verifyWhatsAppLink(phone: string, code: string): Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);

let webMemorySessionToken: string | null = null;

const getStoredSession = async (): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') return webMemorySessionToken;
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
};

const setStoredSession = async (token: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      webMemorySessionToken = token;
    } else {
      await SecureStore.setItemAsync(SESSION_KEY, token);
    }
  } catch {
    // Non-fatal if storage fails
  }
};

const deleteStoredSession = async (): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      webMemorySessionToken = null;
    } else {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  } catch {
    // Non-fatal
  }
};

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
=======
  requestCode(phone: string): Promise<AuthCodeRequested>;
  verifyCode(phone: string, code: string): Promise<void>;
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
  updateDisplayName(name: string | null): Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);
const canStoreSecurely = Platform.OS !== 'web';

export function AuthProvider({ children }: PropsWithChildren) {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);

  const refreshSession = useCallback(async () => {
<<<<<<< HEAD
    const saved = await getStoredSession();
=======
    if (!canStoreSecurely) { setReady(true); return; }
    const saved = await SecureStore.getItemAsync(SESSION_KEY);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    if (!saved) { setToken(null); setUser(null); setRestoreFailed(false); setReady(true); return; }
    setToken(saved);
    try {
      const session = await fetchAuthSession(saved);
      if (session.authenticated && session.user) { setUser(session.user); setRestoreFailed(false); }
<<<<<<< HEAD
      else { await deleteStoredSession(); setToken(null); setUser(null); setRestoreFailed(false); }
=======
      else { await SecureStore.deleteItemAsync(SESSION_KEY); setToken(null); setUser(null); setRestoreFailed(false); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    } catch { setUser(null); setRestoreFailed(true); }
    finally { setReady(true); }
  }, []);

  useEffect(() => { void refreshSession().catch(() => { setRestoreFailed(true); setReady(true); }); }, [refreshSession]);

  const requestCode = useCallback(async (phone: string) => {
    return requestAuthCode(phone);
  }, []);
  const verifyCode = useCallback(async (phone: string, code: string) => {
<<<<<<< HEAD
    const result = await verifyAuthCode(phone, code);
    await setStoredSession(result.token);
=======
    if (!canStoreSecurely) throw new Error('Sign-in is available in the native mobile app, not the web preview.');
    const result = await verifyAuthCode(phone, code);
    await SecureStore.setItemAsync(SESSION_KEY, result.token);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    setToken(result.token);
    setUser(result.user);
    setRestoreFailed(false);
  }, []);
<<<<<<< HEAD

  const requestEmailCode = useCallback(async (email: string) => {
    await requestEmailAuthCode(email);
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const result = await verifyEmailAuthCode(email, code);
    await setStoredSession(result.token);
    setToken(result.token);
    setUser(result.user);
    setRestoreFailed(false);
  }, []);

  const loginWithGoogle = useCallback(async (email: string, displayName?: string | null, avatarUrl?: string | null) => {
    const result = await loginWithGoogleApi(email, displayName, avatarUrl);
    if (!result.verification_required && result.token && result.user) {
      await setStoredSession(result.token);
      setToken(result.token);
      setUser(result.user);
      setRestoreFailed(false);
    }
    return result;
  }, []);

  const verifyGoogleChallenge = useCallback(async (challengeId: string, code: string, displayName?: string | null, avatarUrl?: string | null) => {
    const result = await verifyGoogleChallengeApi(challengeId, code, displayName, avatarUrl);
    await setStoredSession(result.token);
    setToken(result.token);
    setUser(result.user);
    setRestoreFailed(false);
  }, []);

  const resendGoogleChallenge = useCallback(async (challengeId: string) => {
    return resendGoogleChallengeApi(challengeId);
  }, []);

  const restoreGoogleAvatar = useCallback(async () => {
    if (!token) throw new Error('Sign in first.');
    await restoreGoogleAvatarApi(token);
    await refreshSession();
  }, [token, refreshSession]);

  const signOut = useCallback(async () => {
    try {
      if (token) await signOutAuthSession(token);
    } catch {
      // Best-effort server token revocation; local session must always clear even if offline.
    } finally {
      await deleteStoredSession();
      setToken(null);
      setUser(null);
      setRestoreFailed(false);
      queryClient.removeQueries({ queryKey: ['account'] });
      queryClient.removeQueries({ queryKey: ['post-detail'] });
    }
  }, [token, queryClient]);

=======
  const signOut = useCallback(async () => {
    if (token) await signOutAuthSession(token);
    if (canStoreSecurely) await SecureStore.deleteItemAsync(SESSION_KEY);
    setToken(null);
    setUser(null);
    setRestoreFailed(false);
  }, [token]);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  const updateDisplayName = useCallback(async (name: string | null) => {
    if (!token) throw new Error('Sign in to update your profile.');
    const result = await updateAccountProfile(token, name);
    setUser(result.user);
  }, [token]);

<<<<<<< HEAD
  const linkWhatsApp = useCallback(async (phone: string) => {
    if (!token) throw new Error('Sign in to link WhatsApp.');
    await linkWhatsAppAccount(token, phone);
  }, [token]);

  const verifyWhatsAppLink = useCallback(async (phone: string, code: string) => {
    if (!token) throw new Error('Sign in to link WhatsApp.');
    await verifyWhatsAppLinkApi(token, phone, code);
    await refreshSession();
  }, [token, refreshSession]);

  const value = useMemo(
    () => ({
      ready,
      token,
      user,
      restoreFailed,
      requestCode,
      verifyCode,
      requestEmailCode,
      verifyEmailCode,
      loginWithGoogle,
      verifyGoogleChallenge,
      resendGoogleChallenge,
      restoreGoogleAvatar,
      refreshSession,
      signOut,
      updateDisplayName,
      linkWhatsApp,
      verifyWhatsAppLink,
    }),
    [
      ready,
      token,
      user,
      restoreFailed,
      requestCode,
      verifyCode,
      requestEmailCode,
      verifyEmailCode,
      loginWithGoogle,
      verifyGoogleChallenge,
      resendGoogleChallenge,
      restoreGoogleAvatar,
      refreshSession,
      signOut,
      updateDisplayName,
      linkWhatsApp,
      verifyWhatsAppLink,
    ]
  );
=======
  const value = useMemo(() => ({ ready, token, user, restoreFailed, requestCode, verifyCode, refreshSession, signOut, updateDisplayName }), [ready, token, user, restoreFailed, requestCode, verifyCode, refreshSession, signOut, updateDisplayName]);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
