import "dotenv/config";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export function getGmailAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
  });
}

export async function saveGmailCode(code) {
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token received from Google. Try OAuth again with prompt=consent."
    );
  }

  console.log("Gmail OAuth successful.");
  console.log("REFRESH TOKEN:");
  console.log(tokens.refresh_token);
  console.log("Save this value as GMAIL_REFRESH_TOKEN in Render.");

  return tokens;
}

export function getGmailClient() {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error(
      "Gmail is not connected. GMAIL_REFRESH_TOKEN is missing."
    );
  }

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
}
