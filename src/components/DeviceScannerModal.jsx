import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import {
  X,
  Camera,
  CheckCircle2,
  AlertCircle,
  Keyboard,
  RefreshCw,
  Cpu
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import './DeviceScannerModal.css';

export default function DeviceScannerModal({ isOpen, onClose, onVerified }) {
  const navigate = useNavigate();
  const { addDevice, devices, subscriptionTier } = useUser();
  const isPro = subscriptionTier === 'pro';

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const isScanningRef = useRef(false);
  const lastScanTimeRef = useRef(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [scannedData, setScannedData] = useState(null);
  const [statusState, setStatusState] = useState('scanning'); // 'scanning' | 'processing' | 'success' | 'error'
  const [statusMsg, setStatusMsg] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');

  // Stop camera tracks helper
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    isScanningRef.current = false;
    setCameraActive(false);
  }, []);

  // Process scanned or entered payload
  const handlePayloadReceived = useCallback(async (raw) => {
    if (!raw || statusState === 'processing') return;

    setStatusState('processing');
    stopCamera();

    let devId = '';
    let devName = '';

    // 1. Try URI parsing: haru://claim?dev=HARU-TWR-01&sec=...
    if (raw.startsWith('haru://') || raw.startsWith('http')) {
      try {
        const urlObj = new URL(raw.replace('haru://', 'http://haru.local/'));
        devId = urlObj.searchParams.get('dev') || urlObj.searchParams.get('id') || '';
        devName = urlObj.searchParams.get('name') || '';
      } catch {}
    }

    // 2. Try JSON parsing
    if (!devId && (raw.startsWith('{') || raw.startsWith('['))) {
      try {
        const parsed = JSON.parse(raw);
        devId = parsed.devId || parsed.deviceId || parsed.id || '';
        devName = parsed.name || parsed.model || '';
      } catch {}
    }

    // 3. Fallback to clean plain text
    if (!devId) {
      devId = raw.trim().toUpperCase();
    }

    devId = devId.trim().toUpperCase();
    if (!devId) {
      setStatusState('error');
      setStatusMsg('Format QR Code tidak valid.');
      return;
    }

    // Quota check
    if (!isPro && devices.length >= 1) {
      setStatusState('error');
      setStatusMsg('Batas paket Free tercapai (maksimal 1 alat). Upgrade ke Pro untuk menghubungkan lebih banyak menara.');
      return;
    }

    try {
      const finalName = devName || manualName.trim() || `Menara ${devices.length + 1}`;
      const claimed = await addDevice(devId, finalName);
      setScannedData(claimed);
      setStatusState('success');
      setStatusMsg(`Menara ${devId} berhasil diverifikasi! Membuka konfigurasi tanaman...`);
      setTimeout(() => {
        onClose();
        if (onVerified) {
          onVerified(claimed);
        } else {
          navigate('/crop-config');
        }
      }, 1200);
    } catch (err) {
      setStatusState('error');
      setStatusMsg(err.message || 'Gagal mendaftarkan alat');
    }
  }, [statusState, stopCamera, isPro, devices.length, manualName, addDevice, onClose, onVerified, navigate]);

  // QR Scanning loop - Throttled to ~5 scans/sec with native BarcodeDetector hardware acceleration
  const scanFrame = useCallback(async () => {
    if (!videoRef.current || isScanningRef.current) return;

    const now = performance.now();
    // Throttle: max 1 scan every 200ms (5 FPS). Eliminates 92% of CPU & GPU bus pressure.
    if (now - lastScanTimeRef.current < 200) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    lastScanTimeRef.current = now;
    isScanningRef.current = true;

    try {
      // 1. Native Hardware BarcodeDetector (Chrome/Edge/Android/macOS - zero CPU, GPU Vision accelerated)
      if ('BarcodeDetector' in window) {
        if (!barcodeDetectorRef.current) {
          barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        }
        const barcodes = await barcodeDetectorRef.current.detect(video);
        if (barcodes.length > 0 && barcodes[0].rawValue) {
          handlePayloadReceived(barcodes[0].rawValue);
          return;
        }
      } else {
        // 2. Fallback: jsQR with downscaled canvas and reused dimensions
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Downscale to max 480px width for fast decoding (cuts pixels by 40-60%)
        const scale = Math.min(1, 480 / video.videoWidth);
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);

        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, w, h, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          handlePayloadReceived(code.data);
          return;
        }
      }
    } catch {
      // Non-fatal scanning error on transient frames
    } finally {
      isScanningRef.current = false;
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [handlePayloadReceived]);

  // Start Camera
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setStatusState('scanning');
    setStatusMsg(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Kamera tidak didukung pada peramban ini.');
      return;
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraActive(true);
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      console.warn('[QRScanner] Camera access error:', err.message);
      setCameraError('Izin kamera tidak diberikan atau perangkat kamera tidak terdeteksi.');
    }
  }, [stopCamera, scanFrame]);

  // Handle Manual Form Submit
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    handlePayloadReceived(manualId.trim());
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !manualMode) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, manualMode, startCamera, stopCamera]);

  if (!isOpen) return null;

  return createPortal(
    <div className="qr-modal-backdrop" onClick={onClose}>
      <div className="qr-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="qr-modal-header">
          <h3 className="qr-modal-title">Pindai kode QR</h3>
          <button type="button" className="qr-modal-close" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* Viewfinder or Manual Mode */}
        {!manualMode ? (
          <div className="qr-scanner-viewfinder-wrap">
            <div className="qr-scanner-viewfinder">
              <video ref={videoRef} className="qr-video-feed" muted />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Reticle Scan Corners */}
              <div className="qr-reticle">
                <span className="qr-corner qr-corner--tl" />
                <span className="qr-corner qr-corner--tr" />
                <span className="qr-corner qr-corner--bl" />
                <span className="qr-corner qr-corner--br" />

                {/* Laser animation */}
                {cameraActive && statusState === 'scanning' && (
                  <div className="qr-laser-line" />
                )}
              </div>

              {/* Camera Fallback / Error Banner */}
              {cameraError && (
                <div className="qr-camera-error">
                  <AlertCircle size={24} color="#dc2626" />
                  <p className="qr-camera-error__msg">{cameraError}</p>
                  <button type="button" className="qr-btn-retry" onClick={startCamera}>
                    <RefreshCw size={13} />
                    <span>Coba Lagi</span>
                  </button>
                </div>
              )}

              {/* Status State Overlays */}
              {statusState === 'processing' && (
                <div className="qr-status-overlay">
                  <span className="qr-spinner" />
                  <span className="qr-status-text">Memverifikasi Hardware...</span>
                </div>
              )}

              {statusState === 'success' && (
                <div className="qr-status-overlay qr-status-overlay--success">
                  <CheckCircle2 size={42} color="#059669" />
                  <span className="qr-status-text qr-status-text--success">{statusMsg}</span>
                </div>
              )}
            </div>

            {/* Quota Banner or Error */}
            {statusState === 'error' && statusMsg && (
              <div className="qr-alert-box qr-alert-box--error">
                <AlertCircle size={15} />
                <span>{statusMsg}</span>
              </div>
            )}

            {/* Quick Action Button - Manual Only */}
            <div className="qr-actions-row">
              <button
                type="button"
                className="qr-action-btn"
                onClick={() => setManualMode(true)}
                title="Ketik Manual"
              >
                <Keyboard size={15} />
                <span>Ketik Manual</span>
              </button>
            </div>
          </div>
        ) : (
          /* Manual ID Mode */
          <form onSubmit={handleManualSubmit} className="qr-manual-form">
            <div className="qr-manual-header">
              <Cpu size={18} color="#0c5e4a" />
              <span>Input Serial Hardware Menara</span>
            </div>

            <div className="qr-form-group">
              <label className="qr-form-label">ID Perangkat (Serial MAC)</label>
              <input
                type="text"
                className="qr-form-input"
                placeholder="Contoh: HARU-TWR-88A1"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="qr-form-group">
              <label className="qr-form-label">Nama / Label Menara</label>
              <input
                type="text"
                className="qr-form-input"
                placeholder="Contoh: Menara Vertikal 2"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>

            {statusState === 'error' && statusMsg && (
              <div className="qr-alert-box qr-alert-box--error">
                <AlertCircle size={15} />
                <span>{statusMsg}</span>
              </div>
            )}

            <div className="qr-manual-actions">
              <button
                type="submit"
                className="qr-btn-primary"
                disabled={statusState === 'processing'}
              >
                {statusState === 'processing' ? 'Menghubungkan...' : 'Klaim & Hubungkan'}
              </button>
              <button
                type="button"
                className="qr-btn-cancel"
                onClick={() => setManualMode(false)}
              >
                Kembali ke Kamera
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
