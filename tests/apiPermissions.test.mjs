import test from "node:test";
import assert from "node:assert/strict";

import { authorizeRequest } from "../lib/api-permissions.ts";
import { fakeSupabase } from "./helpers/fakeSupabase.mjs";

function requestWithToken(token) {
  return new Request("https://local.test/api", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function permissionClient(db, usersByToken = {}) {
  return {
    ...fakeSupabase(db),
    auth: {
      async getUser(token) {
        const user = usersByToken[token] || null;
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: new Error("invalid token") };
      },
    },
  };
}

async function withAuthEnv(env, fn) {
  const previousAuth = process.env.AUTH_ENFORCEMENT;
  const previousVercel = process.env.VERCEL_ENV;
  if (Object.prototype.hasOwnProperty.call(env, "AUTH_ENFORCEMENT")) process.env.AUTH_ENFORCEMENT = env.AUTH_ENFORCEMENT;
  else delete process.env.AUTH_ENFORCEMENT;
  if (Object.prototype.hasOwnProperty.call(env, "VERCEL_ENV")) process.env.VERCEL_ENV = env.VERCEL_ENV;
  else delete process.env.VERCEL_ENV;

  try {
    await fn();
  } finally {
    if (previousAuth === undefined) delete process.env.AUTH_ENFORCEMENT;
    else process.env.AUTH_ENFORCEMENT = previousAuth;
    if (previousVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercel;
  }
}

test("authorizeRequest allows local advisory mode without a token", async () => {
  await withAuthEnv({}, async () => {
    const result = await authorizeRequest(permissionClient({ profiles: [] }), requestWithToken(null), ["admin"]);

    assert.equal(result.ok, true);
    assert.equal(result.userId, null);
    assert.equal(result.role, null);
    assert.deepEqual(result.roles, []);
    assert.equal(result.enforced, false);
  });
});

test("authorizeRequest enforces authentication automatically in production", async () => {
  await withAuthEnv({ VERCEL_ENV: "production" }, async () => {
    const result = await authorizeRequest(permissionClient({ profiles: [] }), requestWithToken(null), ["admin"]);

    assert.equal(result.ok, false);
    assert.equal(result.response.status, 401);
    assert.deepEqual(await result.response.json(), { error: "Authentication is required." });
  });
});

test("authorizeRequest accepts active profiles with allowed roles", async () => {
  await withAuthEnv({ AUTH_ENFORCEMENT: "strict" }, async () => {
    const result = await authorizeRequest(
      permissionClient(
        { profiles: [{ id: "user-1", role: "ops", is_active: true }] },
        { "token-1": { id: "user-1" } },
      ),
      requestWithToken("token-1"),
      ["admin", "ops"],
    );

    assert.equal(result.ok, true);
    assert.equal(result.userId, "user-1");
    assert.equal(result.role, "ops");
    assert.deepEqual(result.roles, ["ops"]);
    assert.equal(result.enforced, true);
  });
});

test("authorizeRequest accepts active additional roles", async () => {
  await withAuthEnv({ AUTH_ENFORCEMENT: "strict" }, async () => {
    const result = await authorizeRequest(
      permissionClient(
        {
          profiles: [{ id: "user-1", role: "system_admin", is_active: true }],
          user_roles: [{ user_id: "user-1", role_id: "sales", revoked_at: null, expires_at: null }],
        },
        { "token-1": { id: "user-1" } },
      ),
      requestWithToken("token-1"),
      ["sales"],
    );

    assert.equal(result.ok, true);
    assert.equal(result.userId, "user-1");
    assert.equal(result.role, "system_admin");
    assert.deepEqual(result.roles, ["system_admin", "sales"]);
    assert.equal(result.enforced, true);
  });
});

test("authorizeRequest rejects invalid tokens, inactive profiles, and disallowed roles", async () => {
  await withAuthEnv({ AUTH_ENFORCEMENT: "strict" }, async () => {
    const invalidToken = await authorizeRequest(
      permissionClient({ profiles: [] }, {}),
      requestWithToken("bad-token"),
      ["admin"],
    );
    assert.equal(invalidToken.ok, false);
    assert.equal(invalidToken.response.status, 401);

    const inactive = await authorizeRequest(
      permissionClient(
        { profiles: [{ id: "user-1", role: "admin", is_active: false }] },
        { "token-1": { id: "user-1" } },
      ),
      requestWithToken("token-1"),
      ["admin"],
    );
    assert.equal(inactive.ok, false);
    assert.equal(inactive.response.status, 403);

    const disallowed = await authorizeRequest(
      permissionClient(
        { profiles: [{ id: "user-2", role: "sales", is_active: true }] },
        { "token-2": { id: "user-2" } },
      ),
      requestWithToken("token-2"),
      ["admin", "ops"],
    );
    assert.equal(disallowed.ok, false);
    assert.equal(disallowed.response.status, 403);
  });
});
