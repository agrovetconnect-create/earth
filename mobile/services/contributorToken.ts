<<<<<<< HEAD
import { fetchContributorToken } from './api.ts';

const TOKEN_KEY = 'earth-talk-community-contributor-token';
let inFlight: Promise<string> | undefined;
let memoryToken: string | null = null;

async function getSecureItem(key: string): Promise<string | null> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (SecureStore?.getItemAsync) {
      return await SecureStore.getItemAsync(key);
    }
  } catch {
    // fallback
  }
  return memoryToken;
}

async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (SecureStore?.setItemAsync) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
  } catch {
    // fallback
  }
  memoryToken = value;
}

async function deleteSecureItem(key: string): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (SecureStore?.deleteItemAsync) {
      await SecureStore.deleteItemAsync(key);
      return;
    }
  } catch {
    // fallback
  }
  memoryToken = null;
}

/** Obtain the API's pseudonymous token and persist it only in native secure storage. */
export async function getContributorToken(): Promise<string> {
  const existing = await getSecureItem(TOKEN_KEY);
  if (existing) return existing;
  if (!inFlight) {
    inFlight = fetchContributorToken().then(async ({ contributor_token }) => {
      await setSecureItem(TOKEN_KEY, contributor_token);
=======
import * as SecureStore from 'expo-secure-store';
import { fetchContributorToken } from './api';

const TOKEN_KEY = 'earth-talk-community-contributor-token';
let inFlight: Promise<string> | undefined;

/** Obtain the API's pseudonymous token and persist it only in native secure storage. */
export async function getContributorToken(): Promise<string> {
  const existing = await SecureStore.getItemAsync(TOKEN_KEY);
  if (existing) return existing;
  if (!inFlight) {
    inFlight = fetchContributorToken().then(async ({ contributor_token }) => {
      await SecureStore.setItemAsync(TOKEN_KEY, contributor_token);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      return contributor_token;
    }).finally(() => { inFlight = undefined; });
  }
  return inFlight;
}
<<<<<<< HEAD

export async function setStoredContributorToken(token: string): Promise<void> {
  await setSecureItem(TOKEN_KEY, token);
}

export async function getStoredContributorToken(): Promise<string | null> {
  return getSecureItem(TOKEN_KEY);
}

export async function clearStoredContributorToken(): Promise<void> {
  await deleteSecureItem(TOKEN_KEY);
}
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
