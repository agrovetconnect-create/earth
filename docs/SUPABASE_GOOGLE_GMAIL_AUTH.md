# Earth Talk — Supabase Google OAuth & Gmail OTP Configuration Guide

This document outlines the manual setup and configuration required in the Supabase Dashboard and Google Cloud Console to enable Google OAuth and Gmail OTP authentication for Earth Talk.

---

## 1. Supabase Auth Configuration

1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **Authentication** > **Providers**.
3. **Google OAuth**:
   - Enable the **Google** provider.
   - Enter your **Google Client ID** and **Google Client Secret** obtained from the Google Cloud Console.
   - Authorized redirect URI: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
4. **Email OTP**:
   - Enable **Email** provider.
   - Disable **Enable Magic Link** if you strictly require numeric verification codes (or configure templates to send code-based OTP).
   - In **Authentication** > **Email Templates** > **Sign In / OTP**, customize the template to include `{{ .Token }}` (a 6-digit numeric verification code).

---

## 2. Google Cloud Console OAuth Setup

1. Go to the [Google Cloud Console APIs & Services Credentials](https://console.cloud.google.com/apis/credentials).
2. Click **Create Credentials** > **OAuth client ID**.
3. Select **Web application** (and/or Mobile client IDs if using native Expo OAuth).
4. Authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://<your-production-domain>`
5. Authorized redirect URIs:
   - `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
6. Copy the **Client ID** and **Client Secret** into your Supabase Dashboard.

---

## 3. Database Migration (`038_google_gmail_profiles.sql`)

Apply migration `038_google_gmail_profiles.sql` to provision the `public.profiles` table, foreign keys referencing `auth.users(id)`, RLS policies, and automatic profile synchronization trigger on auth user creation.

---

## 4. Supabase Storage & RLS Policies

1. Create a private or public Storage bucket named `user-avatars` for custom profile image uploads.
2. Enable RLS on Storage objects:
   - Users may upload avatars to their own folder: `auth.uid() = owner`
   - Users may read public approved avatars.

---

## 5. Environment Variables

Ensure production environment variables are set:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (service role key for backend operations)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
