import { Router } from "express";
import { pool } from "./db.js";
import { getMatchDetail } from "./apiFootball.js";
import { requireAuth } from "./auth.js";

const router = Router();

// Polled by the frontend every ~15-20s while any match could be live
router.get("/matches/live", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM matches_cache WHERE status IN ('IN_PLAY','PAUSED') ORDER BY kickoff_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load live matches" });
  }
});

// Live or about-to-kickoff (within 30 min) matches involving the user's favourite clubs
router.get("/me/favorites/matches", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT m.* FROM matches_cache m
       WHERE (
         EXISTS (
           SELECT 1 FROM favorites f
           WHERE f.user_id = $1 AND (f.club_id = m.home_club_id OR f.club_id = m.away_club_id)
         )
         OR EXISTS (
           SELECT 1 FROM match_notify_settings mns
           WHERE mns.user_id = $1 AND mns.match_id = m.match_id AND mns.enabled = true
         )
       )
       AND (
         m.status IN ('IN_PLAY','PAUSED')
         OR (m.status IN ('SCHEDULED','TIMED') AND m.kickoff_at <= now() + interval '30 minutes')
       )
       ORDER BY m.kickoff_at ASC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load favourite matches" });
  }
});

// Toggle a per-match kickoff email reminder — independent of favourites
router.post("/matches/:matchId/notify", requireAuth, async (req, res) => {
  const { matchId } = req.params;
  const { enabled } = req.body;
  try {
    await pool.query(
      `INSERT INTO match_notify_settings (user_id, match_id, enabled) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, match_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [req.userId, matchId, enabled]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update match notification" });
  }
});

router.get("/matches/:matchId/detail", async (req, res) => {
  const { matchId } = req.params;
  try {
    const { rows } = await pool.query(`SELECT * FROM matches_cache WHERE match_id = $1`, [matchId]);
    if (!rows[0]) return res.status(404).json({ error: "Match not found" });
    const detail = await getMatchDetail(rows[0]);
    res.json(detail);
  } catch (err) {
    console.error("[matches/:matchId/detail]", err.message);
    res.status(500).json({ error: "Failed to load match stats" });
  }
});

export default router;
