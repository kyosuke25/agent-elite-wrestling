import { generateKeyPairSync, verify as verifySignature } from "node:crypto";
import { describe, expect, it } from "vitest";
import { nextMatchBoundary, parseEntryIntent, rankEntrants } from "../src/game";
import { signEd25519Message } from "../src/signing";

describe("parseEntryIntent", () => {
  it("accepts a valid compact entry", () => {
    expect(
      parseEntryIntent(
        '{"protocol":"aew/1","action":"enter","event":1,"name":"Null Crusher","style":"power","finisher":"Stack Overflow"}',
      ),
    ).toEqual({
      protocol: "aew/1",
      action: "enter",
      event: 1,
      name: "Null Crusher",
      style: "power",
      finisher: "Stack Overflow",
    });
  });

  it("ignores unrelated room messages", () => {
    expect(parseEntryIntent("gm")).toBeNull();
    expect(parseEntryIntent('{"protocol":"someone-else/1"}')).toBeNull();
  });

  it("rejects malformed AEW messages instead of substituting defaults", () => {
    expect(() =>
      parseEntryIntent(
        '{"protocol":"aew/1","action":"enter","event":1,"name":"Bot","style":"unknown","finisher":"Move"}',
      ),
    ).toThrow("style must be one of");
  });
});

describe("nextMatchBoundary", () => {
  it("uses the next six-hour UTC boundary offset to 01:00", () => {
    expect(nextMatchBoundary(Date.parse("2026-09-08T09:00:00Z"))).toBe(
      Date.parse("2026-09-08T13:00:00Z"),
    );
    expect(nextMatchBoundary(Date.parse("2026-09-08T13:00:00Z"))).toBe(
      Date.parse("2026-09-08T19:00:00Z"),
    );
  });
});

describe("rankEntrants", () => {
  it("is deterministic and publishes reproducible scores", async () => {
    const entrants = [
      { did: "did:key:z6MkA", name: "Alpha", style: "power" as const, finisher: "A", entrySeq: 2 },
      { did: "did:key:z6MkB", name: "Beta", style: "speed" as const, finisher: "B", entrySeq: 3 },
    ];
    const first = await rankEntrants(1, 123456, entrants);
    const second = await rankEntrants(1, 123456, [...entrants].reverse());
    expect(second).toEqual(first);
    expect(first.seed).toMatch(/^[0-9a-f]{64}$/);
    expect(first.rankings).toHaveLength(2);
    expect(first.rankings[0].score).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("signEd25519Message", () => {
  it("creates a canonical Technocore-compatible signature", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privateKeyBase64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const nonce = 1_700_000_000_000;
    const text = "AEW Agent Battle #001 is open.";
    const signature = await signEd25519Message(privateKeyBase64, "lobby", nonce, text);

    expect(signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(
      verifySignature(
        null,
        Buffer.from(`lobby|${nonce}|${text}`),
        publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });
});
