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
      `SELECT s.club_id, s.position, s.played, s.won, s.draw, s.lost, s.points, s.goal_diff,
              c.name, c.crest
       FROM standings_cache s
       LEFT JOIN clubs_cache c ON c.club_id = s.club_id
       WHERE s.league_id = $1 ORDER BY s.position ASC`,
      [leagueId]
    );

    // Self-heal: a handful of clubs sometimes never made it into clubs_cache
    // (daily squad sync hit a rate limit, newly promoted team, etc). Backfill
    // just those from the live standings response — it always carries the
    // team name + crest — so both this request and future ones are fixed.
    const missing = rows.filter((r) => !r.name);
    if (missing.length > 0) {
      const live = await api.getStandings(leagueId);
      if (live) {
        const byId = new Map(live.map((l) => [l.club_id, l]));
        for (const row of missing) {
          const found = byId.get(row.club_id);
          if (!found) continue;
          row.name = found.name;
          row.crest = found.crest;
          await pool.query(
            `INSERT INTO clubs_cache (club_id, league_id, name, crest, updated_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (club_id) DO UPDATE SET
               name = EXCLUDED.name, crest = EXCLUDED.crest, updated_at = now()`,
            [row.club_id, leagueId, found.name, found.crest]
          );
        }
      }
    }

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

router.get("/leagues/:leagueId/season", async (req, res) => {
  try {
    const season = await api.getCurrentSeason(req.params.leagueId);
    res.json(season || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load season" });
  }
});

export default router;
