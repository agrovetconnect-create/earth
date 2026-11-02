# Earth Talk — Production Deployment Guide

This guide covers building the Earth Talk web frontend as static assets, deploying to cloud providers like Vercel or Netlify, setting up the Node.js / Express backend service, configuring production environment variables, and compiling mobile binaries with Expo EAS.

---

## Architecture Overview

Earth Talk is structured into three layers:
1. **Frontend Web App (`web/`)**: React 19 SPA bundled with Vite into `dist/client`.
2. **Backend API (`src/server.ts`)**: Express + TypeScript REST API and WhatsApp webhook receiver compiled into `dist/server.js`. In monolithic mode, the backend can also serve `dist/client`.
3. **Mobile App (`mobile/`)**: React Native + Expo app configured for iOS and Android deployment via Expo Application Services (EAS).

---

## 1. Frontend Static Build & Hosting (Vercel / Netlify / Cloudflare Pages)

### Step 1: Build the Static Assets
Run the build script from the root repository:

```bash
# Install dependencies
npm install

# Compile the web frontend and type check
npm run build
```

- **Output Directory**: `dist/client`
- **Entry File**: `dist/client/index.html`
- **Asset Bundles**: `dist/client/assets/*.js`, `dist/client/assets/*.css`

### Step 2: Client Environment Variables
Frontend variables must be prefixed with `VITE_` to be bundled by Vite at build time.

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Base URL of the deployed Express backend | `https://api.earthtalk.org` |
| `VITE_WHATSAPP_PHONE_NUMBER` | Public WhatsApp helpline phone number | `+250788000000` |
| `VITE_SUPABASE_URL` | Supabase project URL (optional client access) | `https://xyzcompany.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public Supabase anonymous client key | `eyJhbGciOi...` |

---

### Step 3A: Deploying Frontend to Vercel

1. **Connect Repository**: Import the repository in the Vercel Dashboard.
2. **Project Settings**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (or leave blank)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/client`
   - **Install Command**: `npm install`
3. **SPA Routing Configuration (`vercel.json`)**:
   Create a `vercel.json` file in the root if not using the single-host setup:
   ```json
   {
     "outputDirectory": "dist/client",
     "rewrites": [
       { "source": "/api/(.*)", "destination": "https://api.earthtalk.org/api/$1" },
       { "source": "/(.*)", "destination": "/index.html" }
     ],
     "headers": [
       {
         "source": "/assets/(.*)",
         "headers": [
           { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
         ]
       }
     ]
   }
   ```
4. **Add Environment Variables**: Add `VITE_API_BASE_URL` and `VITE_WHATSAPP_PHONE_NUMBER` under **Project Settings > Environment Variables**.
5. **Deploy**: Trigger a production deployment or push to your `main` branch.

---

### Step 3B: Deploying Frontend to Netlify

1. **Connect Repository**: Link Git provider to Netlify.
2. **Build & Deploy Settings**:
   - **Base directory**: (empty)
   - **Build command**: `npm run build`
   - **Publish directory**: `dist/client`
3. **SPA Routing Configuration (`netlify.toml`)**:
   Add `netlify.toml` in the project root:
   ```toml
   [build]
     command = "npm run build"
     publish = "dist/client"

   # Proxy API requests to backend
   [[redirects]]
     from = "/api/*"
     to = "https://api.earthtalk.org/api/:splat"
     status = 200
     force = true

   # SPA fallback for React Router
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```
4. **Add Environment Variables**: Set `VITE_API_BASE_URL` in **Site Configuration > Environment variables**.

---

## 2. Backend Express API Deployment (Render / Fly.io / Cloud Run / Railway)

The backend is an Express Node.js application (`src/server.ts`).

### Step 1: Compile Backend
```bash
npx tsc
```
This produces `dist/server.js` and associated compiled modules.

### Step 2: Start Command
```bash
node dist/server.js
```

### Step 3: Required Production Environment Variables

| Variable | Required | Description / Recommended Value |
| :--- | :---: | :--- |
| `NODE_ENV` | **Yes** | `production` |
| `PORT` | **Yes** | Provided by host (`3000`, `8080`, or `10000`) |
| `SUPABASE_URL` | **Yes** | Your Supabase project URL (`https://<project-ref>.supabase.co`) |
| `SUPABASE_SECRET_KEY` | **Yes** | Supabase service-role key with schema access |
| `SUPABASE_ANON_KEY` | Optional | Supabase anonymous public key |
| `USER_HASH_SECRET` | **Yes** | High-entropy 64+ char random secret used to hash phone numbers |
| `EXPERT_SESSION_SECRET`| **Yes** | Secret used to sign expert validation JWT/cookies |
| `WHATSAPP_ACCESS_TOKEN`| **Yes** | Meta Graph API permanent access token for sending replies |
| `WHATSAPP_PHONE_NUMBER_ID` | **Yes** | Meta Cloud API Phone Number ID |
| `WHATSAPP_VERIFY_TOKEN`| **Yes** | Custom webhook handshake verification token configured in Meta App |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key for automated geological classification |
| `CORS_ALLOWED_ORIGINS` | **Yes** | Comma-separated list of allowed origins, e.g.: `https://earthtalk.org,https://earthtalk.vercel.app` |

### Step 4: Docker Container Deployment (Cloud Run / AWS ECS / Fly.io)
You can containerize the app using the following multi-stage `Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

---

## 3. Database & Migrations (Supabase / PostgreSQL)

1. **Apply Migrations**: Execute the SQL files located in `supabase/migrations/` sequentially against your Supabase or PostgreSQL database.
2. **Storage Buckets**: Create the following storage buckets in Supabase:
   - `observations` (Private or signed access, for uploaded field photos)
   - `avatars` (Public read, for user profile pictures)
3. **Database Indexes**: Verify the spatial indexes (`GIST` on geometry columns) and compound indexes on `user_hash` and `created_at` are created.

---

## 4. Full-Stack Single-Host Option (Monolith)

Because `src/server.ts` is configured to serve `dist/client` statically in production:
1. Build both frontend and backend:
   ```bash
   npm run build
   ```
2. Start the service:
   ```bash
   node dist/server.js
   ```
3. A single service on Render, Railway, or Google Cloud Run handles:
   - Static HTML/CSS/JS delivery at `/*`
   - API endpoints at `/api/*`
   - WhatsApp webhook intake at `/webhook`
   - Single domain eliminates CORS issues.

---

## 5. Mobile Application Deployment (Expo EAS Build)

### Step 1: Install EAS CLI & Authenticate
```bash
npm install -g eas-cli
eas login
```

### Step 2: Initialize EAS in Mobile Workspace
```bash
cd mobile
eas init --id <your-expo-project-id>
```

### Step 3: Build for Google Play Store (.aab)
```bash
# Build Android App Bundle for production
eas build --platform android --profile production
```

### Step 4: Build for Apple App Store (.ipa)
```bash
# Build iOS binary for App Store submission
eas build --platform ios --profile production
```

### Step 5: Submit to Stores
```bash
# Submit Android build to Google Play Console
eas submit -p android

# Submit iOS build to Apple App Store Connect
eas submit -p ios
```

---

## 6. Verification Checklist Before Going Live

- [ ] All tests passing: `npm test` and `npm --prefix mobile test`.
- [ ] Database schema migrations applied up to date.
- [ ] Supabase storage buckets initialized with proper CORS and RLS rules.
- [ ] Meta Graph WhatsApp webhook verified with live test payload.
- [ ] Gemini API quota confirmed for multi-modal observations.
- [ ] Production secrets populated (`USER_HASH_SECRET`, `EXPERT_SESSION_SECRET`).
- [ ] SSL/TLS certificates active on all production domains.
