import { useEffect, useReducer } from 'react';
import { onChange } from './store.js';

export const today = () => new Date().toISOString().slice(0, 10);

export function age(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d)) return '';
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
  if (y < 2) {
    const months = Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth());
    return `${months} mo`;
  }
  return `${y} y`;
}

export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '');
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

/** Re-render whenever the local store changes (writes or sync merges). */
export function useStoreTick() {
  const [tick, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => onChange(bump), []);
  return tick;
}

/** Resize a photo to max 1280px JPEG so scans stay small enough to store and sync on weak networks. */
export function imageToDataUrl(file, max = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

export const ROLE_LABEL = { healthworker: 'Health worker', doctor: 'Doctor', admin: 'Admin' };
