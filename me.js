import { Router } from "express";
import { pool } from "./db.js";
import { loginWithGoogle, requireAuth } from "./auth.js";

const router = Router();

// Frontend sends the Google ID token it got from Google Sign-In
router.post("/auth/google", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: "idToken required" });
  try {
    const { token, user } = await loginWithGoogle(idToken);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Google sign-in failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query(
      `SELECT id, email, name, theme FROM users WHERE id = $1`,
      [req.userId]
    );
    const { rows: favRows } = await pool.query(
      `SELECT club_id, league_id FROM favorites WHERE user_id = $1`,
      [req.userId]
    );
    const { rows: notifyRows } = await pool.query(
      `SELECT club_id, enabled FROM notify_settings WHERE user_id = $1`,
      [req.userId]
    );
    res.json({ user: userRows[0], favorites: favRows, notifySettings: notifyRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

router.post("/favorites", requireAuth, async (req, res) => {
  const { clubId, leagueId } = req.body;
  if (!clubId || !leagueId) return res.status(400).json({ error: "clubId and leagueId required" });
  try {
    await pool.query(
      `INSERT INTO favorites (user_id, league_id, club_id) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, club_id) DO NOTHING`,
      [req.userId, leagueId, clubId]
    );
    // default: notifications ON when a club is favourited
    await pool.query(
      `INSERT INTO notify_settings (user_id, club_id, enabled) VALUES ($1, $2, true)
       ON CONFLICT (user_id, club_id) DO NOTHING`,
      [req.userId, clubId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add favourite" });
  }
});

router.delete("/favorites/:clubId", requireAuth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM favorites WHERE user_id = $1 AND club_id = $2`, [
      req.userId,
      req.params.clubId,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove favourite" });
  }
});

router.post("/notify-settings", requireAuth, async (req, res) => {
  const { clubId, enabled } = req.body;
  try {
    await pool.query(
      `INSERT INTO notify_settings (user_id, club_id, enabled) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, club_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [req.userId, clubId, enabled]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update notify setting" });
  }
});

router.patch("/me/theme", requireAuth, async (req, res) => {
  const { theme } = req.body;
  if (!["light", "dark"].includes(theme)) return res.status(400).json({ error: "theme must be light or dark" });
  try {
    await pool.query(`UPDATE users SET theme = $1 WHERE id = $2`, [theme, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update theme" });
  }
});

export default router;
