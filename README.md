# football-live-matchday

# Live Matchday Wire — সেটআপ ও ডিপ্লয় গাইড

এই ফোল্ডারে দুইটা প্রজেক্ট আছে:
- `backend/` → Node.js + Express + PostgreSQL (Neon) + cron jobs
- `frontend/` → React (Vite) + Tailwind

নিচে ধাপে ধাপে সব বলা আছে। প্রতিটা ধাপ ক্রমান্বয়ে করবে।

---

## ধাপ ০ — GitHub এ আপলোড

তুমি বললে GitHub দিয়ে কাজ করবে, তাই পুরো `football-dashboard` ফোল্ডারটাই একটা নতুন GitHub রিপোতে আপলোড করে দাও (backend আর frontend দুইটা ফোল্ডারসহ)। Render/Railway আর Vercel — দুইটাই GitHub রিপো থেকে সরাসরি ডিপ্লয় করা যায়, তাই টার্মিনাল লাগবে না।

---

## ধাপ ১ — Neon Database

Neon এ তো ডাটাবেজ আগেই বানানো আছে বলেছ। Neon dashboard থেকে:
1. তোমার প্রজেক্টে যাও → **Connection string** কপি করো (এটা 'postgresql://neondb_owner:npg_XbTiGj1ItuC5@ep-lucky-flower-ay3e5mnw-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require' দিয়ে শুরু হবে)
2. এটা backend এর env var `DATABASE_URL` এ বসবে (নিচে ধাপ ৩ এ)

টেবিল বানানোর জন্য: backend ডিপ্লয় হওয়ার পর একবার `npm run migrate` চালাতে হবে (Render এ কীভাবে চালাবে সেটা ধাপ ৩ এ বলা আছে)। `backend/src/schema.sql` ফাইলে সব টেবিলের ডেফিনিশন আছে — চাইলে Neon এর SQL editor এ গিয়ে সরাসরি পুরো ফাইলের কনটেন্ট পেস্ট করেও রান করতে পারো, এটাই সবচেয়ে সহজ রাস্তা যদি `npm run migrate` নিয়ে ঝামেলা করতে না চাও।

---

## ধাপ ২ — Google OAuth (Sign in with Google এর জন্য)

1. https://console.cloud.google.com এ যাও → নতুন প্রজেক্ট বানাও (যেকোনো নাম, যেমন "Live Matchday Wire")
2. বাম মেনু থেকে **APIs & Services → OAuth consent screen** → External সিলেক্ট করে বেসিক তথ্য দিয়ে সেভ করো
3. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. **Authorized JavaScript origins** এ যোগ করো:
   - `http://localhost:5173` (লোকাল টেস্টের জন্য)
   - তোমার Vercel এর ফাইনাল URL (যেমন `https://your-app.vercel.app`) — এটা পরে Vercel deploy করার পর যোগ করলেও চলবে
6. Create করলে **Client ID** আর **Client Secret** পাবে — দুইটাই সেভ রাখো।

---

## ধাপ ৩ — Backend ডিপ্লয় (Render.com — ফ্রি)

1. https://render.com এ গিয়ে GitHub দিয়ে সাইন আপ করো
2. **New + → Web Service** → তোমার GitHub রিপো সিলেক্ট করো
3. এই সেটিংস দাও:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. **Environment** ট্যাবে গিয়ে `backend/.env.example` এর প্রতিটা ভ্যারিয়েবল একটা একটা করে বসাও:
   ```
   DATABASE_URL=<Neon connection string>
   FOOTBALL_API_KEY=b405a73a7df1497da4495cf1269a49ca
   FOOTBALL_API_BASE_URL=https://api.football-data.org/v4
   GOOGLE_CLIENT_ID=<ধাপ ২ থেকে>
   GOOGLE_CLIENT_SECRET=<ধাপ ২ থেকে>
   GMAIL_SENDER_ADDRESS=<ধাপ ৪ থেকে>
   GMAIL_APP_PASSWORD=<ধাপ ৪ থেকে>
   JWT_SECRET=<যেকোনো লম্বা র‍্যান্ডম স্ট্রিং>
   FRONTEND_URL=<তোমার Vercel URL, পরে বসাতে পারো>
   ```
5. **Create Web Service** চাপো — ডিপ্লয় শুরু হবে, ২-৩ মিনিট লাগবে।
6. ডিপ্লয় হওয়ার পর, Render এর **Shell** ট্যাব থেকে একবার এই কমান্ড চালাও টেবিল বানানোর জন্য:
   ```
   npm run migrate
   ```
   (Shell ট্যাব না পেলে, বিকল্প: Neon SQL editor এ গিয়ে `backend/src/schema.sql` এর পুরো কনটেন্ট পেস্ট করে রান করো)
7. Render তোমাকে একটা URL দেবে, যেমন `https://your-backend.onrender.com` — এটা মনে রাখো, frontend এ লাগবে।

⚠️ Render এর ফ্রি টিয়ার ১৫ মিনিট নিষ্ক্রিয় থাকলে সার্ভার ঘুমিয়ে যায়, পরের রিকোয়েস্টে ৩০-৫০ সেকেন্ড লাগতে পারে জেগে উঠতে — এটা normal, ফ্রি প্ল্যানের সীমাবদ্ধতা।

---

## ধাপ ৪ — Gmail নোটিফিকেশন সেটআপ

1. একটা নতুন Gmail account বানাও (তোমার পার্সোনাল একাউন্ট ব্যবহার না করাই ভালো), যেমন `liveMatchdayWire@gmail.com`
2. সেই একাউন্টে **2-Step Verification** অন করো (Google Account → Security)
3. তারপর Security পেজেই **App passwords** এ যাও (2FA অন না থাকলে এই অপশন দেখাবে না)
4. একটা নতুন App password বানাও (App: Mail, Device: Other) → ১৬ অক্ষরের একটা পাসওয়ার্ড পাবে
5. এই ইমেইল আর ১৬-অক্ষরের পাসওয়ার্ড backend env var এ বসাও (`GMAIL_SENDER_ADDRESS`, `GMAIL_APP_PASSWORD`)

---

## ধাপ ৫ — Frontend ডিপ্লয় (Vercel — ফ্রি)

1. https://vercel.com এ GitHub দিয়ে সাইন আপ করো
2. **Add New → Project** → তোমার রিপো সিলেক্ট করো
3. **Root Directory**: `frontend`
4. **Environment Variables**:
   ```
   VITE_API_BASE_URL=https://your-backend.onrender.com/api
   VITE_GOOGLE_CLIENT_ID=<ধাপ ২ এর Client ID>
   ```
5. Deploy চাপো। ২ মিনিটের মধ্যে একটা লাইভ URL পাবে (`https://your-app.vercel.app`)
6. এই URL টা এখন ফিরে গিয়ে:
   - Render এর backend env var `FRONTEND_URL` এ বসাও (CORS ঠিক রাখার জন্য)
   - Google Cloud Console → Credentials → তোমার OAuth client → Authorized JavaScript origins এ যোগ করো

---

## এখন কি সব লাইভ?

হ্যাঁ। সারসংক্ষেপ:
- `https://your-app.vercel.app` → তোমার লাইভ ওয়েবসাইট
- Backend প্রতি ৩০ মিনিটে ফিক্সচার/রেজাল্ট সিঙ্ক করবে, প্রতি ৬০ সেকেন্ডে লাইভ ম্যাচের স্কোর, প্রতিদিন স্কোয়াড সিঙ্ক (ট্রান্সফার আপডেট), আর কিকঅফের ২০-৩০ মিনিট আগে ইমেইল পাঠাবে

---

## গুরুত্বপূর্ণ সীমাবদ্ধতা যা জানা দরকার

1. **MLS**: football-data.org এর ফ্রি প্ল্যানে সাধারণত MLS থাকে না। কোড এমনভাবে লেখা যে MLS ট্যাবে গেলে ক্র্যাশ না করে "Unavailable" দেখাবে। প্ল্যান আপগ্রেড করলে বা ভিন্ন provider (যেমন API-Football / RapidAPI) ব্যবহার করলে MLS যোগ করা যাবে — বলো, আমি সেই provider এর জন্য কোড আলাদা করে অ্যাডাপ্ট করে দেব।
2. **ফরমেশনের সঠিক (x,y) পজিশন**: football-data.org শুধু squad list + position label (Goalkeeper/Defence/Midfield/Offence) দেয়, exact pitch coordinates দেয় না সব সময়। তাই Pitch view এ প্লেয়ারদের position অনুযায়ী সারিতে (row) সাজানো হয়েছে, উপরে দেওয়া mock ফাইলের মতো একদম নির্দিষ্ট x/y কোঅর্ডিনেট না। এটা visually এখনও পরিষ্কার, কিন্তু হুবহু এক না।
3. **Rate limit**: ফ্রি প্ল্যানে মিনিটে ১০ রিকোয়েস্ট — কোডে throttle guard বসানো আছে যাতে ব্লক না খায়, কিন্তু ৬ লিগ + অনেক ক্লাব সিঙ্ক করতে কিছুটা সময় লাগবে প্রথমবার (cron চলার সময় ধীরে ধীরে সব লোড হবে)।
4. **Lineup রিলিজ টাইমিং**: provider কখন লাইনআপ পাবলিশ করে সেটা তাদের হাতে — ফ্রি প্ল্যানে কিছু ম্যাচে লাইনআপ নাও আসতে পারে। কোড null হ্যান্ডল করে "not released yet" দেখাবে, ক্র্যাশ করবে না।

---

## লোকালি টেস্ট করতে চাইলে

```bash
# backend
cd backend
cp .env.example .env    # এখানে তোমার আসল ভ্যালুগুলো বসাও
npm install
npm run migrate
npm start

# আরেকটা টার্মিনালে — frontend
cd frontend
cp .env.example .env
npm install
npm run dev
```
তারপর `http://localhost:5173` এ ব্রাউজারে খোলো।
