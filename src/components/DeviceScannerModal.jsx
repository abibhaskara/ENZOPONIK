import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import { X, CheckCircle2, AlertCircle, Keyboard, RefreshCw } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import './DeviceScannerModal.css';

function parseQrPayload(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { devId: '', devName: '' };

  let devId = '';
  let devName = '';

  if (/^(?:enzoponik|haru|https?):\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      devId = url.searchParams.get('dev') || url.searchParams.get('id') || '';
      devName = url.searchParams.get('name') || '';
    } catch {}
  } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      devId = parsed.devId || parsed.deviceId || parsed.id || '';
      devName = parsed.name || parsed.model || '';
    } catch {}
  }

  return {
    devId: (devId || trimmed).trim().toUpperCase(),
    devName: String(devName || '').trim(),
  };
}

export default function DeviceScannerModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { addDevice, devices } = useUser();
  const { t } = useLang();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const detectorRef = useRef(null);
  const successTimerRef = useRef(null);
  const processingRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraRetry, setCameraRetry] = useState(0);
  const [statusState, setStatusState] = useState('scanning');
  const [statusMsg, setStatusMsg] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const handleClose = (e) => {
    if (e) e.stopPropagation();
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    processingRef.current = false;
    stopCamera();
    setStatusState('scanning');
    setStatusMsg(null);
    setCameraError(null);
    setManualMode(false);
    setManualId('');
    setManualName('');
    onClose?.();
  };

  const handlePayloadReceived = async (raw) => {
    if (!raw || processingRef.current) return;

    processingRef.current = true;
    setStatusState('processing');
    setStatusMsg(null);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const { devId, devName } = parseQrPayload(raw);
    if (!devId) {
      processingRef.current = false;
      setStatusState('error');
      setStatusMsg(t('qr_invalid_format'));
      return;
    }

    try {
      const finalName = devName || manualName.trim() || t('default_tower_name', { id: devices.length + 1 });
      await addDevice(devId, finalName);
      stopCamera();
      setStatusState('success');
      setStatusMsg(t('qr_verified_msg', { id: devId }));
      successTimerRef.current = setTimeout(() => {
        handleClose();
        navigate('/crop-config');
      }, 1200);
    } catch (err) {
      processingRef.current = false;
      setStatusState('error');
      setStatusMsg(err.message || t('qr_register_failed'));
    }
  };

  // Keep latest callbacks in refs so parent re-renders never restart the camera stream
  const closeRef = useRef(handleClose);
  closeRef.current = handleClose;
  const payloadHandlerRef = useRef(handlePayloadReceived);
  payloadHandlerRef.current = handlePayloadReceived;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  // Camera lifecycle & throttled 5 FPS scan loop — strictly keyed on modal/mode/retry state
  useEffect(() => {
    if (!isOpen || manualMode) {
      stopCamera();
      return;
    }

    let cancelled = false;
    let scanningFrame = false;
    let lastScanTime = 0;

    processingRef.current = false;
    setCameraError(null);
    setStatusState('scanning');
    setStatusMsg(null);

    const scanFrame = async () => {
      if (cancelled || processingRef.current) return;
      const video = videoRef.current;
      if (!video) return;

      const now = performance.now();
      if (now - lastScanTime < 200 || video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      if (scanningFrame) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      lastScanTime = now;
      scanningFrame = true;

      try {
        if ('BarcodeDetector' in window) {
          if (!detectorRef.current) {
            detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
          }
          const barcodes = await detectorRef.current.detect(video);
          if (!cancelled && barcodes[0]?.rawValue) {
            payloadHandlerRef.current(barcodes[0].rawValue);
            return;
          }
        } else {
          const canvas = canvasRef.current;
          if (canvas) {
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
            const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
            if (!cancelled && code?.data) {
              payloadHandlerRef.current(code.data);
              return;
            }
          }
        }
      } catch {

      } finally {
        scanningFrame = false;
      }

      if (!cancelled && !processingRef.current) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
    };

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(tRef.current('camera_unsupported'));
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          await video.play();
          if (cancelled) {
            stopCamera();
            return;
          }
          setCameraActive(true);
          animFrameRef.current = requestAnimationFrame(scanFrame);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[QRScanner] Camera access error:', err.message);
          setCameraError(tRef.current('camera_denied'));
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, manualMode, cameraRetry]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    handlePayloadReceived(manualId.trim());
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="qr-modal-backdrop" onClick={handleClose}>
      <div className="qr-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="qr-modal-header">
          <h3 className="qr-modal-title">{t('scan_qr_title')}</h3>
          <button type="button" className="qr-modal-close" onClick={handleClose} aria-label={t('close')}>
            <X size={18} />
          </button>
        </div>

        {!manualMode ? (
          <div className="qr-scanner-viewfinder-wrap">
            <div className="qr-scanner-viewfinder">
              <video ref={videoRef} className="qr-video-feed" muted playsInline />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              <div className="qr-reticle">
                <span className="qr-corner qr-corner--tl" />
                <span className="qr-corner qr-corner--tr" />
                <span className="qr-corner qr-corner--bl" />
                <span className="qr-corner qr-corner--br" />

                {cameraActive && statusState === 'scanning' && (
                  <div className="qr-laser-line" />
                )}
              </div>

              {cameraError && (
                <div className="qr-camera-error">
                  <AlertCircle size={24} color="#dc2626" />
                  <p className="qr-camera-error__msg">{cameraError}</p>
                  <button type="button" className="qr-btn-retry" onClick={() => setCameraRetry((n) => n + 1)}>
                    <RefreshCw size={13} />
                    <span>{t('retry')}</span>
                  </button>
                </div>
              )}

              {statusState === 'processing' && (
                <div className="qr-status-overlay">
                  <span className="qr-spinner" />
                  <span className="qr-status-text">{t('verifying_hardware')}</span>
                </div>
              )}

              {statusState === 'success' && (
                <div className="qr-status-overlay qr-status-overlay--success">
                  <CheckCircle2 size={42} color="#059669" />
                  <span className="qr-status-text qr-status-text--success">{statusMsg}</span>
                </div>
              )}
            </div>

            {statusState === 'error' && statusMsg && (
              <div className="qr-alert-box qr-alert-box--error">
                <AlertCircle size={15} />
                <span>{statusMsg}</span>
              </div>
            )}

            <div className="qr-actions-row">
              {statusState === 'error' && (
                <button
                  type="button"
                  className="qr-action-btn"
                  onClick={() => setCameraRetry((n) => n + 1)}
                >
                  <RefreshCw size={15} />
                  <span>{t('retry')}</span>
                </button>
              )}
              <button
                type="button"
                className="qr-action-btn"
                onClick={() => setManualMode(true)}
                title={t('type_manually')}
              >
                <Keyboard size={15} />
                <span>{t('type_manually')}</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="qr-manual-form">
            <div className="qr-form-group">
              <label className="qr-form-label">{t('device_id_label')}</label>
              <input
                type="text"
                className="qr-form-input"
                placeholder={t('device_id_placeholder')}
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="qr-form-group">
              <label className="qr-form-label">{t('device_name_label')}</label>
              <input
                type="text"
                className="qr-form-input"
                placeholder={t('device_name_placeholder')}
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
                {statusState === 'processing' ? t('connecting') : t('connect')}
              </button>
              <button
                type="button"
                className="qr-btn-cancel"
                onClick={() => setManualMode(false)}
              >
                {t('back')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
