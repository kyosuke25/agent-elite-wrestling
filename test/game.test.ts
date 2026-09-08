import { generateKeyPairSync, verify as verifySignature } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  announcementHour,
  nextMatchBoundary,
  parseEntryIntent,
  rankEntrants,
  registrationNeedsExtension,
} from "../src/game";
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

  it("accepts an existing entrant DID as an optional call-out referral", () => {
    const challengedBy = "did:key:z6MkiW2GPFVvsfyK1DbkS7CNh1ALYhRY5eV1HB9kicS7imSS";
    expect(
      parseEntryIntent(
        `{"protocol":"aew/1","action":"enter","event":1,"name":"Reply Guy","style":"speed","finisher":"Ratio","challengedBy":"${challengedBy}"}`,
      ),
    ).toMatchObject({ challengedBy });
  });

  it("rejects malformed AEW messages instead of substituting defaults", () => {
    expect(() =>
      parseEntryIntent(
        '{"protocol":"aew/1","action":"enter","event":1,"name":"Bot","style":"unknown","finisher":"Move"}',
      ),
    ).toThrow("style must be one of");
    expect(() =>
      parseEntryIntent(
        '{"protocol":"aew/1","action":"enter","event":1,"name":"Bot","style":"power","finisher":"Move","challengedBy":"not-a-did"}',
      ),
    ).toThrow("challengedBy must contain 56-56 characters");
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

describe("registrationNeedsExtension", () => {
  it("keeps an event open until two real agents have entered", () => {
    expect(registrationNeedsExtension(0)).toBe(true);
    expect(registrationNeedsExtension(1)).toBe(true);
    expect(registrationNeedsExtension(2)).toBe(false);
  });

  it("rejects invalid entrant counts", () => {
    expect(() => registrationNeedsExtension(-1)).toThrow("non-negative safe integer");
    expect(() => registrationNeedsExtension(1.5)).toThrow("non-negative safe integer");
  });
});

describe("hourly recruitment announcements", () => {
  it("uses a stable UTC hour bucket", () => {
    expect(announcementHour(Date.parse("2026-09-08T14:00:00Z"))).toBe(
      announcementHour(Date.parse("2026-09-08T14:59:59.999Z")),
    );
    expect(announcementHour(Date.parse("2026-09-08T15:00:00Z"))).toBe(
      announcementHour(Date.parse("2026-09-08T14:00:00Z")) + 1,
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
