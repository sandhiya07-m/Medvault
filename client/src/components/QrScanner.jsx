import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { normaliseHealthId } from '../lib/ids.js';

// Camera QR scanner with a manual Health ID fallback (cameras can be unavailable on old phones).
//
// html5-qrcode inserts its own <video>/<canvas> nodes into the element it is given. If that element
// is rendered by React, React and the library fight over the DOM (worse under StrictMode, which
// mounts effects twice) and the whole page goes blank. So the camera element is created by hand,
// outside React's control, and torn down only after the camera has fully started or failed.
export default function QrScanner({ onResult, onClose }) {
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [starting, setStarting] = useState(true);
  const hostRef = useRef(null);
  const doneRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let cancelled = false;
    let started = false;
    let scanner = null;
    const el = document.createElement('div');
    el.id = `qr-region-${Math.random().toString(36).slice(2)}`;
    hostRef.current.appendChild(el);

    let startP;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera needs HTTPS (or localhost) and a supported browser. Type the Health ID instead.');
      setStarting(false);
      startP = Promise.resolve();
    } else {
      try {
        scanner = new Html5Qrcode(el.id, false);
        startP = scanner
          .start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (text) => {
              if (doneRef.current || cancelled) return;
              const id = normaliseHealthId(text);
              if (!id) { setError('That QR code is not a MedVault Health ID.'); return; }
              doneRef.current = true;
              onResultRef.current(id);
            },
            () => {} // per-frame "no QR found" noise
          )
          .then(() => { started = true; })
          .catch(() => { if (!cancelled) setError('Camera unavailable or permission denied. Type the Health ID instead.'); })
          .finally(() => { if (!cancelled) setStarting(false); });
      } catch {
        setError('Could not start the camera. Type the Health ID instead.');
        setStarting(false);
        startP = Promise.resolve();
      }
    }

    return () => {
      cancelled = true;
      // Wait for any in-flight start() before stopping, then remove our own element.
      startP.then(async () => {
        if (scanner && started) {
          try { await scanner.stop(); } catch { /* already stopped */ }
          try { scanner.clear(); } catch { /* ignore */ }
        }
        el.remove();
      });
    };
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const id = normaliseHealthId(manual);
    if (!id) { setError('Enter a valid Health ID, like MV-7K3Q-9XPA.'); return; }
    onResult(id);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Scan QR">
      <div className="modal-card">
        <h2>Scan Health ID QR</h2>
        {/* React renders only this empty host; the camera element is added/removed manually. */}
        <div ref={hostRef} className="qr-region" />
        {starting && <p className="muted small">Starting camera… allow access if your browser asks.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <form onSubmit={submit} className="row">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or type Health ID (MV-XXXX-XXXX)" aria-label="Health ID" autoCapitalize="characters" />
          <button className="btn" type="submit">Open</button>
        </form>
        <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
