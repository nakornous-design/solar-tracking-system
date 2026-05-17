import assert from "node:assert/strict";
import test from "node:test";

import { missingProductionEnv, productionReadinessSummary, REQUIRED_PRODUCTION_ENV } from "../lib/readiness.ts";

test("missingProductionEnv reports all required production variables", () => {
  assert.deepEqual(missingProductionEnv({}), [
    ...REQUIRED_PRODUCTION_ENV,
    "GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY, GOOGLE_CLIENT_EMAIL/PRIVATE_KEY, or GOOGLE_OAUTH_REFRESH_TOKEN",
  ]);
});

test("productionReadinessSummary passes when required env is present and marks deferred phase-two providers", () => {
  const env = {
    ...Object.fromEntries(REQUIRED_PRODUCTION_ENV.map((key) => [key, `${key}-value`])),
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_REFRESH_TOKEN: "refresh-token",
  };
  const summary = productionReadinessSummary(env);

  assert.equal(summary.ok, true);
  assert.deepEqual(summary.missing, []);
  assert.deepEqual(summary.warnings, ["Google Drive is using OAuth refresh token fallback. Use service account credentials for production stability."]);
  assert.equal(summary.driveCredentialMode, "oauth");
  assert.equal(summary.deferred.emailProvider, true);
  assert.equal(summary.deferred.lineProvider, true);
  assert.equal(summary.deferred.gisMap, true);
});

test("productionReadinessSummary accepts legacy split Google service account env names", () => {
  const env = {
    ...Object.fromEntries(REQUIRED_PRODUCTION_ENV.map((key) => [key, `${key}-value`])),
    GOOGLE_CLIENT_EMAIL: "solar-drive-access@example.iam.gserviceaccount.com",
    GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n",
  };
  const summary = productionReadinessSummary(env);

  assert.equal(summary.ok, true);
  assert.deepEqual(summary.missing, []);
  assert.deepEqual(summary.warnings, []);
  assert.equal(summary.driveCredentialMode, "service_account");
});
