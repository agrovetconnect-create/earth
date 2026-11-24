import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, CheckCircle2, Mountain, ShieldCheck } from 'lucide-react-native';
import { colors, radius, spacing, type, elevation } from '../src/lib/theme';
import { useTheme } from '../src/lib/themeMode';
import {
  verifyGoogleChallenge,
  resendGoogleChallenge,
  type GoogleAuthResponse,
} from '../src/services/communityAuth';
import { signInWithGoogle, GoogleSignInCancelledError } from '../src/lib/googleAuth';
import { useCommunityUser } from '../src/services/communityAuth';

const RESEND_COOLDOWN_SECONDS = 600;

/**
 * The GeneralLoginModal as a full-screen sheet: Google sign-in through the
 * Supabase authorize flow, then the 6-digit email challenge when the server
 * asks for verification — identical wording to the web modal.
 */

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const user = useCommunityUser();
  const { dark, palette: t } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challengeEmail, setChallengeEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);
  const codeRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (user) {
      // Signed in — back to the app.
      router.back();
    }
  }, [user]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const handleGoogle = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response: GoogleAuthResponse = await signInWithGoogle();
      if (response.verification_required && response.challenge_id) {
        setChallengeId(response.challenge_id);
        setChallengeEmail(response.masked_email ?? response.email ?? null);
        setResendIn(RESEND_COOLDOWN_SECONDS);
        codeRef.current?.focus();
      } else if (response.user) {
        router.back();
      } else {
        setError('Google sign-in failed. Try again in a moment.');
      }
    } catch (err) {
      if (err instanceof GoogleSignInCancelledError) {
        // The visitor closed the browser session; stay quiet.
      } else {
        setError(err instanceof Error ? err.message : 'Google sign-in failed. Try again in a moment.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!challengeId || verifying) return;
    if (code.trim().length < 6) {
      setError('Enter the 6-digit verification code received in your email.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await verifyGoogleChallenge(challengeId, code.trim());
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The verification code could not be verified.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!challengeId || resendIn > 0 || verifying || resending) return;
    setResending(true);
    setError(null);
    setStatusMessage('Sending new verification code...');
    try {
      const res = await resendGoogleChallenge(challengeId);
      setChallengeId(res.challenge_id);
      setCode('');
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setStatusMessage(res.message || 'New verification code sent to your email.');
    } catch (err) {
      setStatusMessage(null);
      setError(err instanceof Error ? err.message : 'Could not resend verification code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Close"
        >
          <ArrowLeft size={20} color={t.onSurface} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.brandBadge}>
          <Mountain size={26} color={colors.onPrimary} />
        </View>
        <Text style={[type.title, { color: t.onSurface, textAlign: 'center', marginTop: spacing.lg }]}>
          {challengeId ? 'Verify your account' : 'Sign in to Earth Talk'}
        </Text>
        <Text style={[type.body, { color: t.onSurfaceVariant, textAlign: 'center', marginTop: spacing.sm }]}>
          {challengeId
            ? 'Enter the code sent to your email.'
            : 'Use your Google account to continue securely.'}
        </Text>

        {challengeId ? (
          <View style={{ marginTop: spacing.xl, gap: spacing.md, width: '100%' }}>
            {/* Web copy: the saved-account note, with the masked email in mono. */}
            <Text style={[type.bodySmall, { color: dark ? t.onSurfaceVariant : '#3c4043', lineHeight: 20, textAlign: 'center' }]}>
              Account saved. Code sent to{' '}
              <Text style={{ fontFamily: 'monospace', fontWeight: '500', color: '#0b57d0' }}>
                {challengeEmail ?? 'your Google account email'}
              </Text>
              . Enter it below. Use the same Google account for a new code.
            </Text>

            {statusMessage && !error ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 12,
                  borderRadius: radius.md,
                  backgroundColor: dark ? 'rgba(46,125,50,0.18)' : '#e8f5e9',
                  borderWidth: 1,
                  borderColor: 'rgba(46,125,50,0.2)',
                }}
              >
                <CheckCircle2 size={16} color={dark ? '#81c995' : '#1b5e20'} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: dark ? '#81c995' : '#1b5e20' }}>{statusMessage}</Text>
              </View>
            ) : null}

            {error ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 14,
                  borderRadius: radius.md,
                  backgroundColor: dark ? 'rgba(197,34,31,0.18)' : '#fce8e6',
                }}
              >
                <Text style={{ flex: 1, fontSize: 13, color: dark ? '#f28b82' : '#c5221f' }}>{error}</Text>
              </View>
            ) : null}

            <View>
              <Text style={{ fontSize: 12, fontWeight: '500', color: dark ? t.onSurface : '#3c4043', marginBottom: 6 }}>
                Verification code
              </Text>
              <TextInput
                ref={codeRef}
                style={[styles.codeInput, { backgroundColor: t.surfaceContainer, borderColor: t.outlineVariant, color: t.onSurface }]}
                value={code}
                onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={colors.outline}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { minWidth: 0, marginTop: 0 },
                (verifying || code.length < 6) && { opacity: 0.5 },
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => void handleVerify()}
              disabled={verifying || code.length < 6}
            >
              {verifying ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={[type.body, { color: colors.onPrimary, fontWeight: '500' }]}>Verify and sign in</Text>
              )}
            </Pressable>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 4,
              }}
            >
              <Text style={[type.bodySmall, { color: t.onSurfaceVariant }]}>
                Didn't receive the code?
              </Text>
              <Pressable onPress={() => void handleResend()} disabled={resendIn > 0 || verifying || resending} hitSlop={8}>
                <Text
                  style={[
                    type.bodySmall,
                    { color: resendIn > 0 ? (dark ? '#9aa0a6' : '#5e5e5e') : (dark ? '#8ab4f8' : '#1a73e8'), fontWeight: '500', opacity: resendIn > 0 ? 0.4 : 1 },
                  ]}
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: spacing.xl, alignItems: 'center', gap: spacing.md }}>
            <Text style={[type.bodySmall, { color: dark ? t.onSurfaceVariant : '#444746', textAlign: 'center' }]}>
              Continue with your Google account to submit field observations, sync your private map,
              and join discussions.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, loading && { opacity: 0.7 }, pressed && { opacity: 0.85 }]}
              onPress={() => void handleGoogle()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={[type.body, { color: colors.onPrimary, fontWeight: '600' }]}>Continue with Google</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* The signed-out footer trust line the web modal carries. */}
        {!challengeId ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: spacing.xl,
              borderTopWidth: 1,
              borderTopColor: colors.outlineVariant,
              paddingTop: spacing.md,
            }}
          >
            <ShieldCheck size={14} color={dark ? '#81c995' : '#137333'} />
            <Text style={{ fontSize: 11, color: dark ? '#9aa0a6' : '#707579' }}>Secure Google sign-in for Earth Talk</Text>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  brandBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation[2],
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: spacing.xxl,
    minWidth: 220,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  codeInput: {
    alignSelf: 'stretch',
    height: 48,
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: 20,
    fontFamily: 'monospace',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c7c7c7',
    borderRadius: radius.sm,
    color: colors.onSurface,
  },
});
