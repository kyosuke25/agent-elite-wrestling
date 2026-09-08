export const STYLES = ["power", "speed", "technique"] as const;
export const MIN_ENTRANTS = 2;

export type WrestlingStyle = (typeof STYLES)[number];

export interface EntryIntent {
  protocol: "aew/1";
  action: "enter";
  event: number;
  name: string;
  style: WrestlingStyle;
  finisher: string;
  promo?: string;
  challengedBy?: string;
}

export interface RankedEntrant {
  did: string;
  name: string;
  style: WrestlingStyle;
  finisher: string;
  entrySeq: number;
  score: string;
}

export interface EntrantForRanking {
  did: string;
  name: string;
  style: WrestlingStyle;
  finisher: string;
  entrySeq: number;
}

const forbiddenCharacters = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;
const ed25519Did = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBoundedText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  if (value !== value.trim()) {
    throw new Error(`${field} must not have leading or trailing whitespace`);
  }
  const length = [...value].length;
  if (length < minimum || length > maximum) {
    throw new Error(`${field} must contain ${minimum}-${maximum} characters`);
  }
  if (forbiddenCharacters.test(value)) {
    throw new Error(`${field} contains a forbidden character`);
  }
  return value;
}

export function parseEntryIntent(text: string): EntryIntent | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(value) || value.protocol !== "aew/1") {
    return null;
  }
  if (value.action !== "enter") {
    throw new Error("action must be enter");
  }
  if (!Number.isSafeInteger(value.event) || (value.event as number) < 1) {
    throw new Error("event must be a positive safe integer");
  }
  if (typeof value.style !== "string" || !STYLES.includes(value.style as WrestlingStyle)) {
    throw new Error(`style must be one of: ${STYLES.join(", ")}`);
  }

  const promo =
    value.promo === undefined ? undefined : requireBoundedText(value.promo, "promo", 1, 180);
  const challengedBy =
    value.challengedBy === undefined
      ? undefined
      : requireBoundedText(value.challengedBy, "challengedBy", 56, 56);
  if (challengedBy !== undefined && !ed25519Did.test(challengedBy)) {
    throw new Error("challengedBy must be an Ed25519 did:key");
  }

  return {
    protocol: "aew/1",
    action: "enter",
    event: value.event as number,
    name: requireBoundedText(value.name, "name", 1, 32),
    style: value.style as WrestlingStyle,
    finisher: requireBoundedText(value.finisher, "finisher", 1, 64),
    ...(promo === undefined ? {} : { promo }),
    ...(challengedBy === undefined ? {} : { challengedBy }),
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function rankEntrants(
  event: number,
  closesAt: number,
  entrants: readonly EntrantForRanking[],
): Promise<{ seed: string; rankings: RankedEntrant[] }> {
  const canonicalRoster = [...entrants]
    .sort((left, right) => left.entrySeq - right.entrySeq || left.did.localeCompare(right.did))
    .map((entrant) => `${entrant.did}|${entrant.entrySeq}|${entrant.style}|${entrant.finisher}`)
    .join("\n");
  const seed = await sha256Hex(`aew/1|event:${event}|closes:${closesAt}|${canonicalRoster}`);
  const rankings = await Promise.all(
    entrants.map(async (entrant) => ({
      ...entrant,
      score: await sha256Hex(
        `${seed}|${entrant.did}|${entrant.entrySeq}|${entrant.style}|${entrant.finisher}`,
      ),
    })),
  );
  rankings.sort(
    (left, right) => right.score.localeCompare(left.score) || left.did.localeCompare(right.did),
  );
  return { seed, rankings };
}

export function nextMatchBoundary(now: number): number {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("now must be a non-negative safe integer");
  }
  const interval = 6 * 60 * 60 * 1000;
  const offset = 60 * 60 * 1000;
  return Math.floor((now - offset) / interval + 1) * interval + offset;
}

export function registrationNeedsExtension(entrantCount: number): boolean {
  if (!Number.isSafeInteger(entrantCount) || entrantCount < 0) {
    throw new Error("entrantCount must be a non-negative safe integer");
  }
  return entrantCount < MIN_ENTRANTS;
}

export function announcementHour(now: number): number {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("now must be a non-negative safe integer");
  }
  return Math.floor(now / (60 * 60 * 1000));
}
