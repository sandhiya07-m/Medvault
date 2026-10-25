const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export class ApiError extends Error {
  constructor(message, status, network = false) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

async function request(method, path, { body, token } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server', 0, true); // offline / DNS / CORS / server down
  }
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new ApiError((data && data.message) || `Request failed (${res.status})`, res.status);
  return data;
}

export const api = {
  get: (p, token) => request('GET', p, { token }),
  post: (p, body, token) => request('POST', p, { body, token }),
  patch: (p, body, token) => request('PATCH', p, { body, token }),
};
