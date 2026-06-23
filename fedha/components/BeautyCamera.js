import { useEffect, useRef, useState } from 'react';

// Downscale a source (video frame or image) to a compact JPEG data URL.
function toCompactJpeg(source, sw, sh, maxDim = 640, quality = 0.72) {
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export default function BeautyCamera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const runningRef = useRef(true);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [msg, setMsg] = useState('Opening camera…');

  useEffect(() => {
    let stream = null;
    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
        });
        if (!runningRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('ready');
      } catch (err) {
        setStatus('error');
        setMsg(
          err.message?.includes('Permission') || err.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access, or upload a photo instead.'
            : `Camera error: ${err.message}`
        );
      }
    }
    init();
    return () => {
      runningRef.current = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const data = toCompactJpeg(v, v.videoWidth || 720, v.videoHeight || 960);
    onCapture(data);
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => onCapture(toCompactJpeg(img, img.width, img.height));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 400, display: 'flex', flexDirection: 'column', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} playsInline muted />

        {/* Face guide */}
        {status === 'ready' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '62%', maxWidth: 280, aspectRatio: '3 / 4', border: '2px dashed rgba(255,255,255,0.55)', borderRadius: '50% 50% 46% 46%' }} />
          </div>
        )}

        {status === 'ready' && (
          <div style={{ position: 'absolute', top: 20, left: 16, right: 16, textAlign: 'center', background: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
            Center your face in good light. Smile to include your teeth, and show your hairline for hair tips.
          </div>
        )}

        {status === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: 24 }}>
            <div style={{ fontSize: 44, marginBottom: 14, animation: 'spin 1s linear infinite' }}>📸</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{msg}</div>
          </div>
        )}

        {status === 'error' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>⚠️</div>
            <div style={{ color: '#EF4444', fontSize: 14, fontWeight: 600, textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>{msg}</div>
            <label style={{ padding: '12px 24px', background: '#EC4899', color: '#fff', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Upload a photo
              <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
            </label>
            <button onClick={onClose} style={{ marginTop: 14, padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, color: '#fff', fontSize: 14, cursor: 'pointer' }}>Go Back</button>
          </div>
        )}

        <button onClick={onClose} aria-label="Close camera" style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      {/* Shutter bar */}
      {status === 'ready' && (
        <div style={{ background: '#0A0D17', borderTop: '1px solid #1F2D45', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
            Upload
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          </label>
          <button onClick={capture} aria-label="Take photo" style={{ width: 72, height: 72, borderRadius: '50%', background: '#EC4899', border: '4px solid rgba(255,255,255,0.85)', cursor: 'pointer' }} />
          <div style={{ width: 48 }} />
        </div>
      )}
    </div>
  );
}
