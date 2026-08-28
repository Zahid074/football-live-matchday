import "dotenv/config";
import { google } from "googleapis";
import fs from "fs";
import path from "path";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const TOKEN_PATH = path.join(process.cwd(), "gmail-token.json");

export function getGmailAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
  });
}

export async function saveGmailCode(code) {
  const { tokens } = await oauth2Client.getToken(code);

  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify(tokens, null, 2)
  );

  oauth2Client.setCredentials(tokens);

  return tokens;
}

export function getGmailClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      "Gmail is not connected. Visit /auth/gmail first."
    );
  }

  const tokens = JSON.parse(
    fs.readFileSync(TOKEN_PATH, "utf8")
  );

  oauth2Client.setCredentials(tokens);

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
}
