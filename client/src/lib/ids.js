const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (matches server)

export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

export function generateHealthId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32];
  return `MV-${s.slice(0, 4)}-${s.slice(4)}`;
}

export const HEALTH_ID_RE = /^MV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** Normalise user/QR input ("mv 7k3q 9xpa", "MV-7K3Q-9XPA") to canonical form or null. */
export function normaliseHealthId(input) {
  const raw = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const m = /^MV([0-9A-Z]{8})$/.exec(raw);
  if (!m) return null;
  const id = `MV-${m[1].slice(0, 4)}-${m[1].slice(4)}`;
  return HEALTH_ID_RE.test(id) ? id : null;
}
