function base64Decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("private key is not valid base64");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlEncode(value: Uint8Array): string {
  const binary = String.fromCharCode(...value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signEd25519Message(
  privateKeyPkcs8Base64: string,
  scope: string,
  nonce: number,
  text: string,
): Promise<string> {
  if (!Number.isSafeInteger(nonce) || nonce < 1) {
    throw new Error("nonce must be a positive safe integer");
  }
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    base64Decode(privateKeyPkcs8Base64),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const payload = new TextEncoder().encode(`${scope}|${nonce}|${text}`);
  return base64UrlEncode(
    new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, privateKey, payload)),
  );
}
