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
      `SELECT f.club_id, f.league_id, c.name AS club_name, c.crest AS crest
       FROM favorites f
       LEFT JOIN clubs_cache c ON c.club_id = f.club_id
       WHERE f.user_id = $1`,
      [req.userId]
    );
    const { rows: notifyRows } = await pool.query(
      `SELECT club_id, enabled FROM notify_settings WHERE user_id = $1`,
      [req.userId]
    );
    const { rows: matchNotifyRows } = await pool.query(
      `SELECT match_id, enabled FROM match_notify_settings WHERE user_id = $1`,
      [req.userId]
    );
    res.json({ user: userRows[0], favorites: favRows, notifySettings: notifyRows, matchNotifications: matchNotifyRows });
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

// Deletes the signed-in user's account, but only if the email they typed
// in the confirmation box matches their account email exactly.
router.delete("/me", requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ error: "email required" });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT email FROM users WHERE id = $1`, [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: "User not found" });

    const matches = rows[0].email.trim().toLowerCase() === email.trim().toLowerCase();
    if (!matches) {
      return res.status(400).json({ error: "Email does not match your account" });
    }

    await client.query("BEGIN");
    await client.query(`DELETE FROM match_notify_settings WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM notify_settings WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM favorites WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [req.userId]);
    await client.query("COMMIT");

    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Failed to delete account" });
  } finally {
    client.release();
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
