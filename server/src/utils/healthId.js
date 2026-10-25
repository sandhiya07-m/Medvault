const crypto = require('crypto');
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I L O U)

function generateHealthId() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % 32];
  return `MV-${s.slice(0, 4)}-${s.slice(4)}`;
}

const HEALTH_ID_RE = /^MV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
module.exports = { generateHealthId, HEALTH_ID_RE };
