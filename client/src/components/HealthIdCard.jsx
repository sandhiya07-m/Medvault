import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Health ID card with a QR code that encodes the Health ID (generated fully offline).
export default function HealthIdCard({ patient }) {
  const [qr, setQr] = useState('');
  const id = patient.data.healthId;
  useEffect(() => {
    QRCode.toDataURL(id, { margin: 1, width: 256, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [id]);
  return (
    <div className="idcard">
      <div className="idcard-text">
        <div className="idcard-label">MedVault Health ID</div>
        <div className="idcard-id">{id}</div>
        <div className="idcard-name">{patient.data.name}</div>
        <div className="muted small">Scan this code at any clinic to open the record.</div>
        {qr && <a className="btn small ghost" href={qr} download={`${id}.png`}>Save QR image</a>}
      </div>
      {qr ? <img src={qr} alt={`QR code for ${id}`} width="128" height="128" /> : <div className="qr-ph" />}
    </div>
  );
}
