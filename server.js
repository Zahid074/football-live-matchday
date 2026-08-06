import "dotenv/config";
import express from "express";
import cors from "cors";
import leaguesRouter from "./leagues.js";
import clubsRouter from "./clubs.js";
import matchesRouter from "./matches.js";
import meRouter from "./me.js";
import { startCronJobs } from "./index.js";

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
