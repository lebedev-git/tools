const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const keyData = encoder.encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// Convert ArrayBuffer to base64url string
function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// Convert base64url to ArrayBuffer
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function signToken(payload: Record<string, any>, secret: string): Promise<string> {
  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = bufferToBase64Url(encoder.encode(payloadStr));
  const key = await getCryptoKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadBase64));
  const signatureBase64 = bufferToBase64Url(signature);
  return `${payloadBase64}.${signatureBase64}`;
}

export async function verifyToken(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadBase64, signatureBase64] = parts;
    const key = await getCryptoKey(secret);
    const signatureBytes = new Uint8Array(base64UrlToArrayBuffer(signatureBase64));
    const dataBytes = encoder.encode(payloadBase64);
    const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, dataBytes);
    if (!isValid) return null;
    const payloadBytes = new Uint8Array(base64UrlToArrayBuffer(payloadBase64));
    const payloadStr = decoder.decode(payloadBytes);
    const payload = JSON.parse(payloadStr);
    
    // Check expiration
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}
