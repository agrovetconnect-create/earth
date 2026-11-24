import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { GoogleAuthResponse } from '../services/communityAuth';
import { completeGoogleOAuthCallback } from '../services/communityAuth';

/**
 * Google sign-in for mobile, mirroring the web's Supabase implicit authorize
 * flow: open the Supabase `/auth/v1/authorize?provider=google` endpoint in an
 * auth session, catch the redirect, extract the access token from the URL
 * fragment, and exchange it on the shared API (`/api/auth/google-callback`).
 */

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');

export class GoogleSignInCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled.');
    this.name = 'GoogleSignInCancelledError';
  }
}

function extractFragmentParam(url: string, name: string): string | null {
  const hashIdx = url.indexOf('#');
  if (hashIdx === -1) return null;
  const fragment = url.slice(hashIdx + 1);
  for (const pair of fragment.split('&')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    if (pair.slice(0, eq) === name) {
      try {
        return decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
      } catch {
        return pair.slice(eq + 1);
      }
    }
  }
  return null;
}

function extractQueryParam(url: string, name: string): string | null {
  const queryIdx = url.indexOf('?');
  if (queryIdx === -1) return null;
  const query = url.slice(queryIdx + 1).split('#')[0];
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    if (pair.slice(0, eq) === name) {
      try {
        return decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
      } catch {
        return pair.slice(eq + 1);
      }
    }
  }
  return null;
}

/** Opens the Google OAuth session and completes the shared-API callback. */
export async function signInWithGoogle(): Promise<GoogleAuthResponse> {
  if (!SUPABASE_URL) {
    throw new Error(
      'Sign-in is not configured for this build (missing Supabase URL). Ask the project owner to set EXPO_PUBLIC_SUPABASE_URL.'
    );
  }
  const redirectUrl = Linking.createURL('/auth/callback');
  const authorizeUrl =
    `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
    `&redirect_to=${encodeURIComponent(redirectUrl)}` +
    `&flow_type=implicit&prompt=select_account`;

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUrl);
  if (result.type !== 'success') {
    throw new GoogleSignInCancelledError();
  }
  const finalUrl = result.url;

  const oauthError = extractQueryParam(finalUrl, 'error_description') ?? extractFragmentParam(finalUrl, 'error_description');
  if (oauthError) {
    throw new Error(
      'Google sign-in failed. The sign-in provider may not be configured for this app yet. Try again later or contact support.'
    );
  }

  const accessToken = extractFragmentParam(finalUrl, 'access_token');
  const code = extractQueryParam(finalUrl, 'code');
  if (!accessToken && !code) {
    throw new Error(
      'Google sign-in failed. The sign-in provider may not be configured for this app yet. Try again later or contact support.'
    );
  }

  return completeGoogleOAuthCallback({ accessToken, code });
}
