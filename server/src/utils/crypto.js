// AES-256-GCM encryption of patient payloads at rest (server side).
const crypto = require('crypto');
const env = require('../config/env');

const key = Buffer.from(env.dataKey, 'hex');
if (key.length !== 32) throw new Error('DATA_KEY must be 64 hex characters (32 bytes)');

function encryptJSON(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptJSON(b64) {
  if (!b64) return {};
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

module.exports = { encryptJSON, decryptJSON };
