import { googleDriveCredentialMode, hasGoogleDriveCredentials } from "./google-drive.ts";

type EnvLike = Record<string, string | undefined>;

export const REQUIRED_PRODUCTION_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_DRIVE_PARENT_FOLDER_ID",
  "PROFILE_BOOTSTRAP_SECRET",
] as const;

export function missingProductionEnv(env: EnvLike = process.env) {
  const missing: string[] = REQUIRED_PRODUCTION_ENV.filter((key) => !env[key]?.trim());
  if (!hasGoogleDriveCredentials(env)) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY, GOOGLE_CLIENT_EMAIL/PRIVATE_KEY, or GOOGLE_OAUTH_REFRESH_TOKEN");
  }
  return missing;
}

export function productionReadinessSummary(env: EnvLike = process.env) {
  const missing = missingProductionEnv(env);
  const driveCredentialMode = googleDriveCredentialMode(env);
  const warnings = [];
  if (driveCredentialMode === "oauth") {
    warnings.push("Google Drive is using OAuth refresh token fallback. Use service account credentials for production stability.");
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
    driveCredentialMode,
    deferred: {
      emailProvider: true,
      lineProvider: true,
      gisMap: true,
    },
  };
}
