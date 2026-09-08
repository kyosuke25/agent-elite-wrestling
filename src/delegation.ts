export interface RefereeDelegationConfig {
  OPERATOR_DID: string;
  REFEREE_DID: string;
  TECHNOCORE_ANNOUNCEMENT_ROOM: string;
  TECHNOCORE_DELEGATION_EXPIRES: string;
  TECHNOCORE_DELEGATION_NONCE: string;
  TECHNOCORE_DELEGATION_SCOPE: string;
  TECHNOCORE_DELEGATION_SIGNATURE: string;
  TECHNOCORE_DELEGATION_URL: string;
}

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(value: string): Uint8Array {
  let decoded = 0n;
  for (const character of value) {
    const index = base58Alphabet.indexOf(character);
    if (index < 0) throw new Error("DID contains invalid base58btc data");
    decoded = decoded * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  while (decoded > 0n) {
    bytes.unshift(Number(decoded & 0xffn));
    decoded >>= 8n;
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{85}[AQgw]$/.test(value)) {
    throw new Error("delegation signature must be canonical unpadded Ed25519 base64url");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parsePositiveSafeInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
}

export async function refereeDelegationState(config: RefereeDelegationConfig, now: number) {
  const expectedScope = `r:${config.TECHNOCORE_ANNOUNCEMENT_ROOM}`;
  if (config.TECHNOCORE_DELEGATION_SCOPE !== expectedScope) {
    throw new Error(`Technocore delegation scope must be ${expectedScope}`);
  }
  if (!/^\d{1,19}$/.test(config.TECHNOCORE_DELEGATION_NONCE)) {
    throw new Error("TECHNOCORE_DELEGATION_NONCE must contain 1 to 19 digits");
  }
  const expires = parsePositiveSafeInteger(
    config.TECHNOCORE_DELEGATION_EXPIRES,
    "TECHNOCORE_DELEGATION_EXPIRES",
  );
  const payload = `delegate|${config.OPERATOR_DID}|${config.REFEREE_DID}|${config.TECHNOCORE_DELEGATION_SCOPE}|${expires}|${config.TECHNOCORE_DELEGATION_NONCE}`;
  let verified = false;
  try {
    if (!config.OPERATOR_DID.startsWith("did:key:z")) {
      throw new Error("OPERATOR_DID must be an Ed25519 did:key");
    }
    const didBytes = base58Decode(config.OPERATOR_DID.slice("did:key:z".length));
    if (didBytes.length !== 34 || didBytes[0] !== 0xed || didBytes[1] !== 0x01) {
      throw new Error("OPERATOR_DID must be an Ed25519 did:key");
    }
    const publicKey = await crypto.subtle.importKey(
      "raw",
      didBytes.slice(2),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    verified = await crypto.subtle.verify(
      { name: "Ed25519" },
      publicKey,
      base64UrlDecode(config.TECHNOCORE_DELEGATION_SIGNATURE),
      new TextEncoder().encode(payload),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Technocore delegation configuration: ${message}`);
  }
  if (!verified) throw new Error("Technocore delegation signature verification failed");

  return {
    active: Math.floor(now / 1000) < expires,
    canonicalPayload: payload,
    scope: config.TECHNOCORE_DELEGATION_SCOPE,
    expiresAt: new Date(expires * 1000).toISOString(),
    nonce: config.TECHNOCORE_DELEGATION_NONCE,
    signature: config.TECHNOCORE_DELEGATION_SIGNATURE,
    signatureVerified: true,
    verificationUrl: config.TECHNOCORE_DELEGATION_URL,
  };
}
