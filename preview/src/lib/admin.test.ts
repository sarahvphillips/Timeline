import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OWNER_EMAIL,
  defaultState,
  grantAdmin,
  isOwnerEmail,
  normalizeEmail,
  revokeAdmin,
  roleOf,
  setGate,
  canUseFeature,
  blockUser,
} from "./admin.ts";

describe("admin roles", () => {
  it("treats Sarah as owner regardless of case", () => {
    assert.equal(isOwnerEmail("Sarah.V.Phillips@googlemail.com"), true);
    assert.equal(normalizeEmail("  SARAH.V.PHILLIPS@googlemail.com "), OWNER_EMAIL);
  });

  it("only the owner can grant admin", () => {
    const asUser = { ...defaultState(), signedInEmail: "friend@example.com" };
    const denied = grantAdmin(asUser, "new@example.com");
    assert.equal(denied.ok, false);

    const asOwner = defaultState();
    const ok = grantAdmin(asOwner, " New@example.com ");
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.deepEqual(ok.state.admins, ["new@example.com"]);
      assert.equal(roleOf("new@example.com", ok.state), "admin");
    }
  });

  it("cannot remove the owner", () => {
    const r = revokeAdmin(defaultState(), OWNER_EMAIL);
    assert.equal(r.ok, false);
  });

  it("owner-only gates hide banking from regular users", () => {
    const gated = setGate(defaultState(), "banking", "admin");
    assert.equal(gated.ok, true);
    if (gated.ok) {
      assert.equal(canUseFeature("banking", gated.state, OWNER_EMAIL), true);
      assert.equal(canUseFeature("banking", gated.state, "pal@example.com"), false);
    }
  });

  it("cannot block the owner", () => {
    const r = blockUser(defaultState(), OWNER_EMAIL);
    assert.equal(r.ok, false);
  });
});
