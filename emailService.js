import "dotenv/config";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false, // STARTTLS on 587
  auth: {
    user: process.env.BREVO_SMTP_LOGIN,
    pass: process.env.BREVO_SMTP_KEY,
  },
});

function formatKickoff(kickoffAt) {
  return new Date(kickoffAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function wrapEmail({ eyebrow, title, subtitle, bodyHtml }) {
  return `
    <div style="font-family: sans-serif; background:#0A0D0C; color:#fff; padding:24px; border-radius:12px;">
      <p style="color:#C9FF3D; font-weight:bold; letter-spacing:1px; text-transform:uppercase; font-size:12px;">Live Matchday Wire</p>
      <h2 style="margin:8px 0;">${title}</h2>
      <p style="color:#ccc;">${subtitle}</p>
      ${bodyHtml}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Stage 1 — sent ~24 hours before kickoff. Soft, informational heads-up.
// ---------------------------------------------------------------------------
export async function sendMatch24hReminder({ to, name, homeTeam, awayTeam, kickoffAt, leagueName }) {
  const kickoffTime = formatKickoff(kickoffAt);

  await transporter.sendMail({
    from: `"Live Matchday Wire" <${process.env.GMAIL_SENDER_ADDRESS}>`,
    to,
    subject: `🗓️ Tomorrow: ${homeTeam} vs ${awayTeam}`,
    html: wrapEmail({
      eyebrow: "Live Matchday Wire",
      title: `${homeTeam} vs ${awayTeam}`,
      subtitle: `${leagueName} • Kicks off ${kickoffTime}`,
      bodyHtml: `
        <p style="color:#999; font-size:13px; margin-top:16px;">
          Hi ${name || "there"}, just a friendly heads-up — this match is coming up in about 24 hours.
          We'll send you another note closer to kickoff, and again as soon as the starting lineups are out.
        </p>
        <p style="color:#666; font-size:12px; margin-top:20px;">
          You're receiving this because you follow one of these clubs, or this match, on Live Matchday Wire.
        </p>
      `,
    }),
  });
}

// ---------------------------------------------------------------------------
// Stage 2 — sent ~2 hours before kickoff. Soft nudge that matchday has arrived.
// ---------------------------------------------------------------------------
export async function sendMatch2hReminder({ to, name, homeTeam, awayTeam, kickoffAt, leagueName }) {
  const kickoffTime = formatKickoff(kickoffAt);

  await transporter.sendMail({
    from: `"Live Matchday Wire" <${process.env.GMAIL_SENDER_ADDRESS}>`,
    to,
    subject: `⏰ 2 hours to go: ${homeTeam} vs ${awayTeam}`,
    html: wrapEmail({
      eyebrow: "Live Matchday Wire",
      title: `${homeTeam} vs ${awayTeam}`,
      subtitle: `${leagueName} • Kicks off ${kickoffTime}`,
      bodyHtml: `
        <p style="color:#999; font-size:13px; margin-top:16px;">
          Hi ${name || "there"}, matchday is here — kickoff is roughly 2 hours away.
          We'll follow up one more time the moment the starting lineups are announced.
        </p>
      `,
    }),
  });
}

// ---------------------------------------------------------------------------
// Stage 3 — sent as soon as the starting lineups are released by the provider.
// ---------------------------------------------------------------------------
export async function sendLineupAnnouncement({ to, name, homeTeam, awayTeam, kickoffAt, leagueName, lineup }) {
  const kickoffTime = formatKickoff(kickoffAt);

  const renderSide = (teamName, players, formation) => `
    <div style="margin-top:14px;">
      <p style="color:#C9FF3D; font-size:13px; font-weight:bold; margin-bottom:6px;">
        ${teamName}${formation ? ` <span style="color:#777; font-weight:normal;">(${formation})</span>` : ""}
      </p>
      <p style="color:#ccc; font-size:13px; line-height:1.6; margin:0;">
        ${(players && players.length ? players : [])
          .map((p) => p?.name || p?.shirtNumber || "")
          .filter(Boolean)
          .join(" · ") || "Lineup received, details pending"}
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Live Matchday Wire" <${process.env.GMAIL_SENDER_ADDRESS}>`,
    to,
    subject: `🧾 Lineups are in: ${homeTeam} vs ${awayTeam}`,
    html: wrapEmail({
      eyebrow: "Live Matchday Wire",
      title: `${homeTeam} vs ${awayTeam}`,
      subtitle: `${leagueName} • Kicks off ${kickoffTime}`,
      bodyHtml: `
        <p style="color:#999; font-size:13px; margin-top:16px;">
          Hi ${name || "there"}, the starting lineups have just been confirmed.
        </p>
        ${renderSide(homeTeam, lineup?.home, lineup?.homeFormation)}
        ${renderSide(awayTeam, lineup?.away, lineup?.awayFormation)}
      `,
    }),
  });
}
