import { Router } from "express";
import { pool } from "./db.js";
import * as api from "./footballApi.js";

const router = Router();

// Club detail: manager + full squad (name, position, nationality, ...)
router.get("/clubs/:clubId", async (req, res) => {
  const { clubId } = req.params;
  try {
    const { rows } = await pool.query(`SELECT * FROM clubs_cache WHERE club_id = $1`, [clubId]);
    const leagueId = rows[0]?.league_id || null;
    const season = leagueId ? await api.getCurrentSeason(leagueId) : null;

    if (rows.length > 0 && rows[0].squad && rows[0].squad.length > 0) {
      return res.json({ ...rows[0], season });
    }

    // not cached yet, or cached with empty squad — fetch live and cache it
    const live = await api.getTeamDetail(clubId);
    if (!live) return res.status(404).json({ error: "Club not found" });

    await pool.query(
      `INSERT INTO clubs_cache (club_id, league_id, name, crest, manager, squad, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (club_id) DO UPDATE SET
         name = EXCLUDED.name, crest = EXCLUDED.crest, manager = EXCLUDED.manager,
         squad = EXCLUDED.squad, updated_at = now()`,
      [live.club_id, leagueId, live.name, live.crest, live.manager, JSON.stringify(live.squad)]
    );
    res.json({ ...live, season });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load club" });
  }
});

// Formation — only returns data once the provider has released the lineup,
// which per the spec means roughly 20-30 min before kickoff. If nothing is
// released yet we return { available: false } so the frontend can show a
// "not released yet" placeholder instead of an error.
router.get("/clubs/:clubId/formation", async (req, res) => {
  const { clubId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM matches_cache
       WHERE (home_club_id = $1 OR away_club_id = $1)
         AND status IN ('SCHEDULED','TIMED','IN_PLAY','PAUSED')
       ORDER BY kickoff_at ASC LIMIT 1`,
      [clubId]
    );

    if (rows.length === 0) return res.json({ available: false, reason: "No upcoming match" });

    const match = rows[0];
    const minutesToKickoff = (new Date(match.kickoff_at) - new Date()) / 60000;

    if (!match.lineup) {
      const releasesIn = Math.max(0, Math.round(minutesToKickoff - 30));
      return res.json({
        available: false,
        reason: minutesToKickoff > 30 ? `Lineup releases ~${releasesIn} min before this shows up` : "Waiting on provider release",
      });
    }

    const isHome = match.home_club_id === clubId;
    res.json({
      available: true,
      formation: isHome ? match.lineup.homeFormation : match.lineup.awayFormation,
      lineup: isHome ? match.lineup.home : match.lineup.away,
      match_id: match.match_id,
      kickoff_at: match.kickoff_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load formation" });
  }
});

export default router;
