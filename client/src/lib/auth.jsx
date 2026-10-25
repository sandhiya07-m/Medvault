import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { api } from './api.js';
import { openUserDb, getMeta, setMeta, deviceId } from './db.js';
import { deriveKey, randomBytes, makeVerifier, checkVerifier, encryptJSON, decryptJSON } from './crypto.js';
import * as store from './store.js';
import { startSync, stopSync } from './sync.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export class AuthError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { user, token } while unlocked
  const tokenRef = useRef(null);
  const dbRef = useRef(null);

  const logout = useCallback(() => {
    stopSync();
    store.unbind(); // encryption key is dropped from memory
    tokenRef.current = null;
    dbRef.current = null;
    setSession(null);
  }, []);

  /**
   * Sign in. Online: verify against the API (issues JWT). Offline: verify the password by
   * decrypting a verifier with the derived key, then restore the saved session.
   */
  const login = useCallback(async (emailRaw, password, { resetLocal = false } = {}) => {
    const email = emailRaw.trim().toLowerCase();
    const db = await openUserDb(email);
    let salt = await getMeta(db, 'salt');
    let online = null;
    if (navigator.onLine) {
      try {
        online = await api.post('/auth/login', { email, password });
      } catch (e) {
        if (!e.network) throw new AuthError(e.message, 'API'); // wrong credentials, pending approval...
      }
    }
    if (!online && !salt) {
      throw new AuthError('This device is not set up for this account yet. Connect to the internet and sign in once.', 'FIRST_LOGIN_OFFLINE');
    }
    if (resetLocal) {
      for (const t of store.TABLES) await db.table(t).clear();
      await db.meta.clear();
      salt = null;
    }
    if (!salt) { salt = randomBytes(16); await setMeta(db, 'salt', salt); }
    const key = await deriveKey(password, salt);

    const verifier = await getMeta(db, 'verifier');
    if (verifier) {
      if (!(await checkVerifier(key, verifier))) {
        if (online) throw new AuthError('Your password changed since this device was set up. Local data is encrypted with the old password.', 'PASSWORD_CHANGED');
        throw new AuthError('Incorrect password', 'BAD_PASSWORD');
      }
    } else {
      await setMeta(db, 'verifier', await makeVerifier(key));
    }

    let s;
    if (online) {
      s = { user: online.user, token: online.token };
      await setMeta(db, 'session', await encryptJSON(key, s));
    } else {
      const saved = await getMeta(db, 'session');
      if (!saved) throw new AuthError('No saved session on this device. Sign in online first.', 'NO_SESSION');
      s = await decryptJSON(key, saved);
    }
    store.bind(db, key, deviceId());
    dbRef.current = db;
    tokenRef.current = s.token;
    try { localStorage.setItem('mv_last_email', email); } catch { /* ignore */ }
    setSession(s);
    if (s.user.role !== 'admin') startSync({ db, getToken: () => tokenRef.current });
    return s.user;
  }, []);

  const register = useCallback((payload) => api.post('/auth/register', payload), []);

  useEffect(() => () => stopSync(), []);

  const value = { user: session && session.user, token: session && session.token, login, logout, register };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
