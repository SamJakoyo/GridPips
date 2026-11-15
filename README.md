# GRIDPIPs — ICT Trading Automation & Exness IB Workspace

GRIDPIPs is a full-stack trading workspace featuring an **ICT Strategy Market Analyzer ($5.25)**, compilable **MQL5 Expert Advisors + MT5 WebRequest Bridge ($5.25)**, **MegaPay M-Pesa Till** & **Crypto (USDT / BTC)** payment gateways, **Exness IB Partner Onboarding**, an **ICT & SMC Education Academy**, an **Influencer Referral System**, and an **Admin Command Center**.

---

## Key Features
- **Exness IB Onboarding & Hybrid Auth**: Scrypt + HMAC-SHA256 HTTP-only sessions + Firebase Google Sign-In (`https://one.exnessonelink.com/a/0p67hxlswg?source=app`).
- **Dual Payment Gateways**:
  - **MegaPay M-Pesa Till** (`KES` live conversion, STK Push initiation, receipt confirmation & webhook).
  - **Crypto Gateway** (`USDT TRC20`, `USDT ERC20`, `BTC` with TXID verification).
- **ICT Strategy Market Analyzer ($5.25)**: Automated FVG (BISI/SIBI), Order Blocks, BSL/SSL liquidity pools, 0.618–0.786 OTE Fibs, and London/NY Killzone mapping anchored to ICT (`UCtjxa77NqamhVC8atV85Rog`).
- **MQL5 EA Bots Pack ($5.25)**: Uncompiled `.mq5` Expert Advisors (`GRIDPIPs_ICT_SilverBullet_EA.mq5` & `GRIDPIPs_SMC_OrderBlock_EA.mq5`), `INSTALLATION_GUIDE.txt` `.zip` download, and MT5 WebRequest Bridge telemetry.
- **Free Exness Member Workspace**: TradingView Live Charts + persistent Watchlist, Unlimited Trading Journal + Screenshot uploads, Analytics Dashboard, 8 Trading Calculators, `$10,000` Paper Trading Simulator, Personal Trading Plan + Checklist, Forex Factory Live Economic Calendar + Market News, and ICT & SMC Academy.
- **Admin Command Center**: Manage USD/KES revenue, M-Pesa & Crypto orders, users/roles/suspensions, security audit logs, influencer payouts, email inbox logs, and live site settings.

---

## Local Development
```bash
npm install
cp .env.example .env
npm run dev
```
Runs Vite + Express full-stack server on `http://localhost:3000`.

---

## GitHub Push Checklist
`.gitignore` automatically excludes:
- `node_modules/`
- `dist/`
- `.env` and `.env*.local`
- `.vercel/`
- `*.db`, `*.db-wal`, `*.db-shm` (SQLite databases)

---

## Vercel Deployment Guide
This repository is configured for Vercel via `vercel.json` and `api/index.ts` (all `/api/*` routes route to `api/index.ts` and SPA routes rewrite to `index.html`):

1. Push this repository to GitHub and import the project into **Vercel**.
2. Keep **Build Command** as `npm run build` and **Output Directory** as `dist`.
3. Configure **Environment Variables** in Vercel Project Settings:
   - `SESSION_SECRET` (strong 32+ char random string)
   - `ADMIN_INITIAL_PASSWORD` (admin login password for `samjakoyo26@gmail.com`)
   - `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, `SQL_PORT=5432` (Cloud SQL PostgreSQL)
   - `MEGAPAY_API_KEY` & `MEGAPAY_EMAIL` (optional — enables live MegaPay STK Push; otherwise runs guided Till checkout)
4. Add your deployed Vercel domain (`*.vercel.app` and custom domain) to **Firebase Console → Authentication → Settings → Authorized domains** so Google Sign-In works in production.
