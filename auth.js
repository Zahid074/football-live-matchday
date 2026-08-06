import "dotenv/config";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/** Verifies the Google ID token sent from the frontend, upserts the user, returns our own JWT. */
export async function loginWithGoogle(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const { sub: googleId, email, name } = payload;

  const { rows } = await pool.query(
    `INSERT INTO users (google_id, email, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (google_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
     RETURNING id, google_id, email, name, theme`,
    [googleId, email, name]
  );
  const user = rows[0];

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
  return { token, user };
}

/** Express middleware — requires a valid Bearer JWT, attaches req.userId */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

/** Optional auth — attaches req.userId if present, but doesn't block the request */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      req.userId = jwt.verify(token, process.env.JWT_SECRET).userId;
    } catch {
      /* ignore invalid token, just treat as anonymous */
    }
  }
  next();
}
