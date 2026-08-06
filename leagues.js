import { Router } from "express";
import { pool } from "./db.js";
import * as api from "./footballApi.js";

const router = Router();

const LEAGUES = [
  { id: "laliga", name: "La Liga", country: "Spain", color: "#FF4438" },
  { id: "epl", name: "Premier League", country: "England", color: "#3D195B" },
  { id: "bundesliga", name: "Bundesliga", country: "Germany", color: "#D3010C" },
  { id: "seriea", name: "Serie A", country: "Italy", color: "#024494" },
  { id: "ligue1", name: "Ligue 1", country: "France", color: "#0D1A5C" },
  { id: "mls", name: "MLS", country: "USA/Canada", color: "#A5122A" },
];

router.get("/leagues", (req, res) => {
  res.json(LEAGUES);
});

// Standings — served from cache (kept fresh by cron), falls back to live fetch if cache is empty
router.get("/leagues/:leagueId/table", async (req, res) => {
  const { leagueId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT club_id, position, played, won, draw, lost, points, goal_diff
       FROM standings_cache WHERE league_id = $1 ORDER BY position ASC`,
      [leagueId]
    );
    if (rows.length > 0) return res.json(rows);

    const live = await api.getStandings(leagueId);
    if (!live) return res.json([]); // e.g. MLS unavailable on current plan
    res.json(live);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load table" });
  }
});

router.get("/leagues/:leagueId/results", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM matches_cache WHERE league_id = $1 AND status = 'FINISHED'
       ORDER BY kickoff_at DESC LIMIT 50`,
      [req.params.leagueId]
    );
    if (rows.length > 0) return res.json(rows);
    const live = await api.getMatches(req.params.leagueId, { status: "FINISHED" });
    res.json(live);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load results" });
  }
});

router.get("/leagues/:leagueId/fixtures", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM matches_cache WHERE league_id = $1 AND status IN ('SCHEDULED','TIMED')
       ORDER BY kickoff_at ASC LIMIT 50`,
      [req.params.leagueId]
    );
    if (rows.length > 0) return res.json(rows);
    const live = await api.getMatches(req.params.leagueId, { status: "SCHEDULED" });
    res.json(live);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load fixtures" });
  }
});

router.get("/leagues/:leagueId/clubs", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT club_id, league_id, name, crest, manager FROM clubs_cache WHERE league_id = $1 ORDER BY name ASC`,
      [req.params.leagueId]
    );
    if (rows.length > 0) return res.json(rows);
    const live = await api.getTeams(req.params.leagueId);
    res.json(live);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load clubs" });
  }
});

export default router;
