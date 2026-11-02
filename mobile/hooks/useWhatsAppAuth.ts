import { useState, useEffect, useCallback } from 'react';
import {
  sendWhatsAppOtp,
  confirmWhatsAppOtp,
  getActiveWhatsAppUser,
  signOutWhatsAppUser,
  isWhatsAppConfigured,
  openWhatsApp,
} from '../services/whatsapp.js';
import type { AccountUser } from '../services/api.js';

export function useWhatsAppAuth() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'phone' | 'otp' | 'authenticated'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      const activeUser = await getActiveWhatsAppUser();
      setUser(activeUser);
      setStep(activeUser ? 'authenticated' : 'phone');
    } catch {
      setUser(null);
      setStep('phone');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const requestOtp = async (phoneNumber: string) => {
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const result = await sendWhatsAppOtp(phoneNumber);
      setPhone(phoneNumber);
      setStep('otp');
      setInfoMessage(result?.message || 'Verification code sent to your WhatsApp.');
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send WhatsApp code.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async (otpCode: string) => {
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const result = await confirmWhatsAppOtp(phone, otpCode);
      if (result?.user) {
        setUser(result.user);
        setStep('authenticated');
        return true;
      }
      return false;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    setSubmitting(true);
    try {
      await signOutWhatsAppUser();
      setUser(null);
      setStep('phone');
      setPhone('');
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    user,
    loading,
    submitting,
    step,
    phone,
    code,
    error,
    infoMessage,
    isConfigured: isWhatsAppConfigured(),
    requestOtp,
    verifyOtp,
    logout,
    openWhatsApp,
    setPhone,
    setCode,
    refreshSession: checkSession,
  };
}
