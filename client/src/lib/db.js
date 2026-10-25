import Dexie from 'dexie';
import { sha256Hex } from './crypto.js';

// One IndexedDB database per user account on this device: each account's rows are
// encrypted with a key derived from that user's password, so accounts can't read each other's data.
export async function openUserDb(email) {
  const name = `medvault_${(await sha256Hex(email.toLowerCase())).slice(0, 16)}`;
  const db = new Dexie(name);
  db.version(1).stores({
    patients: 'uid, healthIdHash, dirty',
    visits: 'uid, patientId, dirty',
    prescriptions: 'uid, patientId, visitId, dirty',
    labresults: 'uid, patientId, visitId, dirty',
    meta: 'key',
  });
  await db.open();
  return db;
}

export const getMeta = async (db, key, fallback = null) => {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
};
export const setMeta = (db, key, value) => db.meta.put({ key, value });

export function deviceId() {
  try {
    let id = localStorage.getItem('mv_device');
    if (!id) {
      id = `dev-${(crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).slice(0, 8)}`;
      localStorage.setItem('mv_device', id);
    }
    return id;
  } catch {
    return 'dev-volatile';
  }
}
