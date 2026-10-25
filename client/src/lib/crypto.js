// Device-side encryption: AES-256-GCM via the Web Crypto API.
// The key is derived from the user's password (PBKDF2-SHA256) and lives only in memory.
const enc = new TextEncoder();
const dec = new TextDecoder();
const ITERATIONS = 210000;

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJSON(key, obj) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv, ct: new Uint8Array(ct) };
}

export async function decryptJSON(key, blob) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.iv }, key, blob.ct);
  return JSON.parse(dec.decode(pt));
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const VERIFIER_TEXT = 'medvault-ok';
export const makeVerifier = (key) => encryptJSON(key, VERIFIER_TEXT);
export async function checkVerifier(key, blob) {
  try {
    return (await decryptJSON(key, blob)) === VERIFIER_TEXT;
  } catch {
    return false; // wrong password -> AES-GCM auth tag failure
  }
}
