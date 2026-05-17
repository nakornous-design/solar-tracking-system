import { google } from "googleapis";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

function serviceAccountCredentials() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    return {
      client_email: parsed.client_email,
      private_key: String(parsed.private_key || "").replace(/\\n/g, "\n"),
    };
  }

  const clientEmail = (
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    || process.env.GOOGLE_CLIENT_EMAIL
  )?.trim();
  const privateKey = (
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    || process.env.GOOGLE_PRIVATE_KEY
  )?.trim()?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return { client_email: clientEmail, private_key: privateKey };
  }

  return null;
}

type EnvLike = Record<string, string | undefined>;

export function hasGoogleDriveServiceAccount(env: EnvLike = process.env) {
  const hasSplitServiceAccount = Boolean(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
  const hasLegacySplitServiceAccount = Boolean(
    env.GOOGLE_CLIENT_EMAIL?.trim() && env.GOOGLE_PRIVATE_KEY?.trim(),
  );

  return Boolean(
    env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
      || hasSplitServiceAccount
      || hasLegacySplitServiceAccount,
  );
}

export function hasGoogleDriveOAuth(env: EnvLike = process.env) {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID?.trim()
      && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
      && env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim(),
  );
}

export function hasGoogleDriveCredentials(env: EnvLike = process.env) {
  return hasGoogleDriveServiceAccount(env) || hasGoogleDriveOAuth(env);
}

export function googleDriveCredentialMode(env: EnvLike = process.env) {
  if (hasGoogleDriveServiceAccount(env)) return "service_account";
  if (hasGoogleDriveOAuth(env)) return "oauth";
  return "missing";
}

export function createDriveClient() {
  const serviceAccount = serviceAccountCredentials();
  if (serviceAccount) {
    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: DRIVE_SCOPES,
    });
    return google.drive({ version: "v3", auth });
  }

  if (hasGoogleDriveOAuth()) {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground",
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    return google.drive({ version: "v3", auth });
  }

  throw new Error("Google Drive credentials are not configured. Configure a Google service account or OAuth refresh token.");
}

export function isGoogleDriveAuthError(error: any) {
  return error?.message === "invalid_grant"
    || error?.response?.data?.error === "invalid_grant"
    || error?.code === 401
    || error?.response?.status === 401;
}

export function googleDriveAuthErrorMessage() {
  if (hasGoogleDriveServiceAccount()) {
    return "Google Drive service account is not authorized for this folder. Share the parent Drive folder with the service account email and grant Editor access.";
  }

  return "Google Drive OAuth refresh token expired or was revoked. Permanent fix: configure GOOGLE_SERVICE_ACCOUNT_JSON and share the parent Drive folder with the service account.";
}
