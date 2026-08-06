import "dotenv/config";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_SENDER_ADDRESS,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendKickoffReminder({ to, name, homeTeam, awayTeam, kickoffAt, leagueName }) {
  const kickoffTime = new Date(kickoffAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  await transporter.sendMail({
    from: `"Live Matchday Wire" <${process.env.GMAIL_SENDER_ADDRESS}>`,
    to,
    subject: `⚽ Kickoff soon: ${homeTeam} vs ${awayTeam}`,
    html: `
      <div style="font-family: sans-serif; background:#0A0D0C; color:#fff; padding:24px; border-radius:12px;">
        <p style="color:#C9FF3D; font-weight:bold; letter-spacing:1px; text-transform:uppercase; font-size:12px;">Live Matchday Wire</p>
        <h2 style="margin:8px 0;">${homeTeam} vs ${awayTeam}</h2>
        <p style="color:#ccc;">${leagueName} • Kicks off ${kickoffTime}</p>
        <p style="color:#999; font-size:13px; margin-top:16px;">Hi ${name || ""}, one of your favourite clubs plays in about 25 minutes.</p>
      </div>
    `,
  });
}
