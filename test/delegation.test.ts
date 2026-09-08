import { describe, expect, it } from "vitest";
import { refereeDelegationState } from "../src/delegation";

const delegationEnv = {
  OPERATOR_DID: "did:key:z6MkiW2GPFVvsfyK1DbkS7CNh1ALYhRY5eV1HB9kicS7imSS",
  REFEREE_DID: "did:key:z6MkwWEhe3r55cztmQ7ATt928v1XpVgJ5uEFkawPpnyKsTWt",
  TECHNOCORE_ANNOUNCEMENT_ROOM: "lobby",
  TECHNOCORE_DELEGATION_EXPIRES: "1796643702",
  TECHNOCORE_DELEGATION_NONCE: "1788867702314",
  TECHNOCORE_DELEGATION_SCOPE: "r:lobby",
  TECHNOCORE_DELEGATION_SIGNATURE:
    "EzXHZHcoy9rhN7rAETCixZIVdjIQjcvVPLZc_d9HOHm4H_clI5x7UByWXvMDTAbrJQ3kS3A5K0Qiu1i20A5MBA",
  TECHNOCORE_DELEGATION_URL: "https://technocore.chat/kv/did-69/135f788895017f",
};

describe("referee delegation", () => {
  it("verifies the pinned operator signature and reports its active period", async () => {
    const state = await refereeDelegationState(delegationEnv, Date.parse("2026-09-08T12:00:00Z"));

    expect(state.signatureVerified).toBe(true);
    expect(state.active).toBe(true);
    expect(state.scope).toBe("r:lobby");
    expect(state.expiresAt).toBe("2026-12-07T11:41:42.000Z");
  });

  it("reports a valid signature as inactive after expiry", async () => {
    const state = await refereeDelegationState(delegationEnv, Date.parse("2026-12-07T11:41:42Z"));

    expect(state.signatureVerified).toBe(true);
    expect(state.active).toBe(false);
  });

  it("rejects a modified delegation signature", async () => {
    const invalidEnv = {
      ...delegationEnv,
      TECHNOCORE_DELEGATION_SIGNATURE: `F${delegationEnv.TECHNOCORE_DELEGATION_SIGNATURE.slice(1)}`,
    };

    await expect(
      refereeDelegationState(invalidEnv, Date.parse("2026-09-08T12:00:00Z")),
    ).rejects.toThrow("signature verification failed");
  });
});
