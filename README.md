<div align="center">

# ⚽ Live Matchday Wire

### Real-time football tracking, kickoff reminders & lineup alerts — straight to your inbox

[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-Build-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

[![Deployed on Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)
[![Deployed on Render](https://img.shields.io/badge/Backend-Render-46E3B7?style=flat-square&logo=render&logoColor=white)](https://render.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](#-license)

</div>

---

## 📖 Overview

**Live Matchday Wire** is a full-stack football companion app that keeps fans connected to the clubs and matches they care about — live scores, staged kickoff email reminders, starting lineups the moment they're released, and squad tracking across Europe's top leagues.

Sign in with Google, follow your favourite clubs (or just individual matches), and let the backend do the watching — you get notified exactly when it matters.

---

## ✨ Features

| Category | What it does |
|---|---|
| 🔴 **Live Match Tracking** | Polls in-play matches every 60s and reflects live score, status, and match minute |
| 📧 **Staged Email Reminders** | Three-stage notification pipeline — **24h before**, **2h before**, and **starting lineup announced** |
| 🎯 **Per-Match Notifications** | Opt in to alerts for a *specific* match, independent of your followed clubs |
| ⭐ **Favourite Clubs** | Follow clubs across La Liga, Premier League, Bundesliga, Serie A, Ligue 1 & MLS |
| 👥 **Squad Sync** | Daily squad refresh — transferred-out players are automatically dropped |
| 🔐 **Google OAuth** | Secure sign-in via `@react-oauth/google` + JWT session handling |
| 🏆 **Live Standings** | League tables refreshed every 30 minutes |
| 🌗 **Theming** | Light/dark theme support via React Context |

---

## 🏗️ Tech Stack

<table>
<tr>
<td valign="top" width="50%">

### Frontend
- ⚛️ React 18 + Vite
- 🎨 Tailwind CSS
- 🔑 `@react-oauth/google`
- 🎯 `lucide-react` icons
- ▲ Deployed on **Vercel**

</td>
<td valign="top" width="50%">

### Backend
- 🟢 Node.js + Express
- 🐘 PostgreSQL (**Neon**, serverless)
- ⏰ `node-cron` scheduled jobs
- ✉️ `nodemailer` (Gmail SMTP)
- 🔐 `jsonwebtoken` + Google Auth Library
- 🚀 Deployed on **Render**

</td>
</tr>
</table>

**External API:** [football-data.org](https://www.football-data.org/) v4 — fixtures, results, standings, squads & lineups

---

## 📂 Project Structure

```
football-live-matchday/
├── backend/
│   ├── server.js          # Express app entrypoint
│   ├── index.js           # Cron job orchestration
│   ├── footballApi.js     # football-data.org API wrapper (rate-limit safe)
│   ├── emailService.js    # Nodemailer templates & sending logic
│   ├── db.js               # PostgreSQL (Neon) pool
│   ├── auth.js             # Google OAuth + JWT middleware
│   ├── matches.js          # Live match & notification routes
│   ├── clubs.js            # Club & squad routes
│   ├── leagues.js          # League/standings routes
│   ├── me.js                # Authenticated user routes
│   └── migrate.js          # Database schema migration
│
└── frontend/
    ├── App.jsx              # Root component
    ├── ThemeContext.jsx     # Light/dark theme provider
    ├── api.js                # Backend API client
    └── main.jsx              # Vite entrypoint
```

---

## ⚙️ How It Works — Cron Pipeline

| Job | Frequency | Purpose |
|---|---|---|
| `syncSquads` | Daily (4 AM) | Refresh club squads across all leagues |
| `syncFixturesResults` | Every 30 min | Refresh standings + match fixtures/results |
| `pollLiveMatches` | Every 60 sec | Update score/status for in-play matches |
| `pollLineupsAndNotify` | Every 5 min | Fetch lineups near kickoff → trigger lineup emails |
| `send24hReminders` | Every 5 min | Email users ~24h before their match kicks off |
| `send2hReminders` | Every 5 min | Email users ~2h before kickoff |

> 💡 Reminder windows are intentionally wide and de-duplicated via a `(user_id, match_id, stage)` table — so if the server is ever asleep or restarting when a reminder should fire, it self-heals and still sends on the next tick instead of missing it.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A [Neon](https://neon.tech/) PostgreSQL database
- A [football-data.org](https://www.football-data.org/) API key
- A Google Cloud OAuth Client ID
- A Gmail account with an **App Password** enabled

### 1. Clone the repo
```bash
git clone https://github.com/<your-username>/football-live-matchday.git
cd football-live-matchday
```

### 2. Backend setup
```bash
cd backend
cp .env.example .env    # fill in your credentials
npm install
npm run migrate         # sets up database tables
npm start
```

### 3. Frontend setup
```bash
cd frontend
cp .env.example .env    # fill in your credentials
npm install
npm run dev
```

Visit **http://localhost:5173** 🎉

### Environment Variables

<details>
<summary><strong>Backend (<code>.env</code>)</strong></summary>

```env
DATABASE_URL=              # Neon PostgreSQL connection string
FOOTBALL_API_KEY=          # football-data.org API key
FOOTBALL_API_BASE_URL=https://api.football-data.org/v4
GOOGLE_CLIENT_ID=          # Google OAuth client ID
GOOGLE_CLIENT_SECRET=      # Google OAuth client secret
GMAIL_SENDER_ADDRESS=      # Gmail address used to send notifications
GMAIL_APP_PASSWORD=        # Gmail App Password (NOT your normal password)
JWT_SECRET=                # Long random string for session signing
FRONTEND_URL=              # Deployed frontend URL (CORS)
PORT=4000
```
</details>

<details>
<summary><strong>Frontend (<code>.env</code>)</strong></summary>

```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_GOOGLE_CLIENT_ID=
```
</details>

---

## ⚠️ Known Limitations

- **MLS coverage** — Not included in football-data.org's free tier; the app fails gracefully and shows "Unavailable" instead of crashing.
- **Formation layout** — Free tier gives position labels (GK/DEF/MID/FWD), not exact pitch coordinates, so the pitch view groups players by row rather than exact x/y position.
- **Rate limits** — Free tier allows 10 requests/minute; a built-in throttle guard paces requests automatically.
- **Lineup timing** — Provider-dependent; typically available 20–30 minutes before kickoff, not guaranteed for every match.

---

## 🗺️ Deployment

| Service | Platform | Notes |
|---|---|---|
| Frontend | **Vercel** | Auto-deploys from `main` |
| Backend | **Render** | Free web service (spins down after 15 min idle) |
| Database | **Neon** | Serverless PostgreSQL |

---

## 📜 License

This project is licensed under the **MIT License**.

---

<div align="center">

Made with ⚽ + ☕ by **Zahid**

</div>
