import { Router } from "express";
import { pool } from "../db.js";

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

export default router;
