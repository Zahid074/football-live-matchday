import "dotenv/config";
import express from "express";
import cors from "cors";
import leaguesRouter from "./routes/leagues.js";
import clubsRouter from "./routes/clubs.js";
import matchesRouter from "./routes/matches.js";
import meRouter from "./routes/me.js";
import { startCronJobs } from "./cron/index.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.get("/", (req, res) => res.json({ ok: true, service: "Live Matchday Wire API" }));

app.use("/api", leaguesRouter);
app.use("/api", clubsRouter);
app.use("/api", matchesRouter);
app.use("/api", meRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  startCronJobs();
});
