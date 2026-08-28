import "dotenv/config";
import express from "express";
import cors from "cors";
import leaguesRouter from "./leagues.js";
import clubsRouter from "./clubs.js";
import matchesRouter from "./matches.js";
import meRouter from "./me.js";
import { startCronJobs } from "./index.js";
import { getGmailAuthUrl, saveGmailCode } from "./gmailAuth.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.get("/", (req, res) => res.json({ ok: true, service: "Live Matchday Wire API" }));

app.use("/api", leaguesRouter);
app.use("/api", clubsRouter);
app.use("/api", matchesRouter);
app.use("/api", meRouter);

app.get("/auth/gmail", (req, res) => {
  const url = getGmailAuthUrl();
  res.redirect(url);
});

app.get("/auth/gmail/callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("Missing authorization code.");
    }

    await saveGmailCode(code);

    res.send(`
      <h2>Gmail connected successfully ✅</h2>
      <p>You can close this page.</p>
    `);
  } catch (error) {
    console.error("Gmail OAuth error:", error);
    res.status(500).send("Gmail authorization failed.");
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  startCronJobs();
});
