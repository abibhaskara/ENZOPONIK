import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Droplets, Thermometer, Sun, Wind, Leaf, Bell,
  ChevronDown, Calendar, X, Check, Plus, MapPin, Activity, UserCircle, Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from 'recharts';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import { runDashboardAnalysis } from '../lib/agronomyService';
import { getDeviceDailySnapshots } from '../lib/deviceService';
import { subscribeToTelemetryHistory } from '../lib/firebaseService';
import { getCropThresholds, findCropPreset, getLocalizedCropText } from '../lib/cropUtils';
import DeviceScannerModal from '../components/DeviceScannerModal';
import { ShiningText } from '../components/ui/ShiningText';
import './Dashboard.css';
import hydroImg from '../assets/hydroponic.jpg';
import enzoponikImg from '../assets/icon_enzoponik.png';

const TIME_RANGES = ['D', 'W', 'M', 'Custom'];
const DAY_MS = 24 * 60 * 60 * 1000;

// ponytail: client-side bucket averaging over latest Firestore docs; upgrade to server-side rollups if history scales
function bucketAvg(rows, keyFn, labelFn) {
  const map = new Map();
  for (const r of rows) {
    if (r.soil == null && r.uv == null) continue;
    const key = keyFn(r);
    if (!map.has(key)) map.set(key, { ts: r.timestamp, soil: [], uv: [], label: labelFn(r, key) });
    const g = map.get(key);
    if (r.soil != null) g.soil.push(Number(r.soil));
    if (r.uv != null) g.uv.push(Number(r.uv));
  }
  const avg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
  return [...map.values()]
    .sort((a, b) => a.ts - b.ts)
    .map((g) => ({ time: g.label, timestamp: g.ts, soil: avg(g.soil), uv: avg(g.uv) ?? 0 }));
}

const fmt = (val, unit = '', decimals = 1) =>
  val != null ? `${parseFloat(val).toFixed(decimals)}${unit}` : null;

function formatElapsedDuration(seconds, lang = 'id') {
  if (seconds == null || seconds < 0) return '--';
  const sec = Math.floor(seconds);
  if (sec < 60) {
    if (lang === 'zh') return `${sec} 秒`;
    return `${sec}s`;
  }

  const mins = Math.floor(sec / 60);
  if (mins < 60) {
    if (lang === 'en') return `${mins} min`;
    if (lang === 'zh') return `${mins} 分钟`;
    return `${mins} menit`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    if (lang === 'en') return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
    if (lang === 'zh') return `${hours} 小时`;
    return `${hours} jam`;
  }

  const days = Math.floor(hours / 24);
  if (lang === 'en') return `${days} ${days === 1 ? 'day' : 'days'}`;
  if (lang === 'zh') return `${days} 天`;
  if (lang === 'jv') return `${days} dina`;
  if (lang === 'ban') return `${days} rahina`;
  return `${days} hari`;
}

function getHealthColor(score) {
  if (score == null) return '#9ca3af';
  if (score >= 80) return '#1d9b67';
  if (score >= 60) return '#d98218';
  return '#dc2626';
}

export default function Dashboard() {
  const {
    realWeather, sensorData, alerts, markAlertRead,
    esp32Connected, esp32Data, healthScore, backendConnected,
    lastSeenSecondsAgo,
  } = useData();
  const {
    user, harvestInfo, cropProfile, activeDeviceId,
    devices, selectActiveDevice, removeDevice,
    aiUsed, aiMaxQuota,
  } = useUser();
  const { lang, t } = useLang();
  const navigate = useNavigate();

  const savedCropPreset = findCropPreset(cropProfile?.cropName);
  const plantName = cropProfile?.cropName
    ? (savedCropPreset ? getLocalizedCropText(savedCropPreset, lang).name : cropProfile.cropName)
    : t('general_crop');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [chartRange, setChartRange] = useState('D');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [deviceSnapshots, setDeviceSnapshots] = useState([]);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const notifDialogRef = useRef(null);

  const effectiveDeviceId = activeDeviceId || (devices && devices[0]?.id) || '';

  useEffect(() => {
    let isMounted = true;
    if (!effectiveDeviceId) {
      setDeviceSnapshots([]);
      return;
    }

    getDeviceDailySnapshots(effectiveDeviceId, 35).then((snapshots) => {
      if (isMounted) {
        setDeviceSnapshots(snapshots || []);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [effectiveDeviceId]);

  useEffect(() => {
    if (!effectiveDeviceId) {
      setTelemetryHistory([]);
      return;
    }
    const cleanId = effectiveDeviceId.trim().toUpperCase();
    const unsub = subscribeToTelemetryHistory((history) => {
      if (Array.isArray(history)) {
        const filtered = history.filter((h) => !h.deviceId || String(h.deviceId).toUpperCase() === cleanId);
        setTelemetryHistory(filtered);
      }
    }, 40);

    return () => unsub();
  }, [effectiveDeviceId]);

  const activeDevice = useMemo(() => {
    if (!effectiveDeviceId) return null;
    return devices?.find((d) => (d.id || d.deviceId) === effectiveDeviceId) || { id: effectiveDeviceId, name: t('default_tower_name', { id: effectiveDeviceId }) };
  }, [devices, effectiveDeviceId, t]);

  const hasDevice = Boolean(effectiveDeviceId && devices && devices.length > 0);

  const isOnline = Boolean(hasDevice && (backendConnected || esp32Connected));
  const OFFLINE_TIMEOUT_SEC = 40;
  const timeoutLeftSec = lastSeenSecondsAgo != null ? Math.max(0, OFFLINE_TIMEOUT_SEC - lastSeenSecondsAgo) : null;
  const unreadCount = useMemo(() => alerts.filter(a => !a.read).length, [alerts]);

  useEffect(() => {
    const dialog = notifDialogRef.current;
    if (!dialog) return;
    if (notifOpen && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => dialog.focus());
    } else if (!notifOpen && dialog.open) {
      dialog.close();
    }
  }, [notifOpen]);

  // Fallback light dismiss when <dialog closedby="any"> is unsupported
  useEffect(() => {
    const dialog = notifDialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;
    const outside = (e) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    const onDown = (e) => { pressedOutside = dialog.open && outside(e); };
    const onUp = (e) => {
      if (pressedOutside && dialog.open && outside(e)) dialog.close();
      pressedOutside = false;
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, []);

  const weatherTemp = sensorData.temperature;
  const weatherHumidity = sensorData.humidity;
  const weatherWind = sensorData.windSpeed;
  const weatherUV = sensorData.uvIndex;

  const displayTemp = esp32Connected && esp32Data.temperature != null ? esp32Data.temperature : weatherTemp;
  const displayHumidity = esp32Connected && esp32Data.humidity != null ? esp32Data.humidity : weatherHumidity;

  const harvestProgress = harvestInfo.currentDay && harvestInfo.totalCycleDays
    ? Math.min(100, (harvestInfo.currentDay / harvestInfo.totalCycleDays) * 100)
    : 0;

  const chartData = useMemo(() => {
    const liveRows = telemetryHistory.map((t) => {
      const d = t.timestamp instanceof Date ? t.timestamp : new Date(t.timestamp || Date.now());
      return {
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: d.getTime(),
        soil: t.soil ?? t.soilMoisture ?? null,
        uv: t.uv ?? t.uvIndex ?? weatherUV ?? 0,
      };
    });
    const snapRows = deviceSnapshots.map((s) => {
      const d = new Date(s.date || s.createdAt);
      return {
        time: `${d.getDate()}/${d.getMonth() + 1}`,
        timestamp: d.getTime(),
        soil: s.avgMoisture ?? s.soilMoisture ?? null,
        uv: s.avgUv ?? s.uvIndex ?? weatherUV ?? 0,
      };
    });

    if (chartRange === 'D') {
      return (liveRows.length ? liveRows : snapRows).slice(-5);
    }

    const combined = [...snapRows, ...liveRows].sort((a, b) => a.timestamp - b.timestamp);
    if (!combined.length) return [];

    const now = Date.now();
    if (chartRange === 'W') {
      const recent = combined.filter((r) => r.timestamp >= now - 7 * DAY_MS);
      return bucketAvg(
        recent,
        (r) => new Date(r.timestamp).toLocaleDateString('en-CA'),
        (r) => { const d = new Date(r.timestamp); return `${d.getDate()}/${d.getMonth() + 1}`; }
      ).slice(-7);
    }
    if (chartRange === 'M') {
      const start5W = now - 35 * DAY_MS;
      const recent = combined.filter((r) => r.timestamp >= start5W);
      return bucketAvg(
        recent,
        (r) => Math.min(4, Math.floor((r.timestamp - start5W) / (7 * DAY_MS))),
        (_, wk) => `W${wk + 1}`
      ).slice(-5);
    }
    if (chartRange === 'Custom') {
      if (!customFrom || !customTo) return [];
      const fromTs = new Date(customFrom).setHours(0, 0, 0, 0);
      const toTs = new Date(customTo).setHours(23, 59, 59, 999);
      return combined.filter((r) => r.timestamp >= fromTs && r.timestamp <= toTs);
    }
    return [];
  }, [deviceSnapshots, telemetryHistory, chartRange, customFrom, customTo, weatherUV]);

  const sensors = useMemo(() => {
    const th = getCropThresholds(cropProfile);
    return [
      {
        icon: Droplets, label: t('soil'),
        value: fmt(sensorData.soilMoisture, '%', 0),
        unit: '%', rawVal: sensorData.soilMoisture,
        ok: sensorData.soilMoisture != null && sensorData.soilMoisture >= th.minSoil && sensorData.soilMoisture <= th.maxSoil,
      },
      {
        icon: Leaf, label: t('health'),
        value: healthScore != null ? `${Math.round(healthScore)}` : null,
        unit: '/100', rawVal: healthScore,
        ok: healthScore != null && healthScore >= 75,
        color: getHealthColor(healthScore),
      },
      {
        icon: Sun, label: t('uv'),
        value: fmt(weatherUV, '', 1),
        unit: '', rawVal: weatherUV,
        ok: weatherUV != null && weatherUV <= 7,
      },
      {
        icon: Thermometer, label: t('temp'),
        value: fmt(displayTemp, '', 1),
        unit: '°C', rawVal: displayTemp,
        ok: displayTemp != null && displayTemp >= th.minTemp && displayTemp <= th.maxTemp,
      },
      {
        icon: Droplets, label: t('humidity'),
        value: fmt(displayHumidity, '', 0),
        unit: '%', rawVal: displayHumidity,
        ok: displayHumidity != null && displayHumidity >= th.minHum && displayHumidity <= th.maxHum,
      },
      {
        icon: Wind, label: t('wind'),
        value: fmt(weatherWind, '', 0),
        unit: 'km/h', rawVal: weatherWind,
        ok: weatherWind != null,
      },
    ];
  }, [t, sensorData, healthScore, weatherUV, displayTemp, displayHumidity, weatherWind, cropProfile]);

  const runAnalysis = useCallback(async () => {
    if (aiLoading) return;
    setAiLoading(true); setAiResult(null); setAiError(null);
    const res = await runDashboardAnalysis({
      sensorData,
      temperature: displayTemp,
      humidity: displayHumidity,
      healthScore,
      realWeather,
      cropProfile,
      harvestInfo,
      alerts,
      lang,
      t,
    });
    if (res.success) {
      setAiResult(res.text);
    } else {
      setAiError(res.error);
    }
    setAiLoading(false);
  }, [aiLoading, sensorData, displayTemp, displayHumidity, healthScore, realWeather, cropProfile, harvestInfo, alerts, lang, t]);

  return (
    <div className="db-root">

      <dialog
        ref={notifDialogRef}
        tabIndex={-1}
        className="db-notif"
        closedby="any"
        aria-labelledby="db-notif-heading"
        onClose={() => setNotifOpen(false)}
      >
        <div className="db-notif__head">
          <h2 id="db-notif-heading" className="db-notif__title">{t('notifications')}</h2>
          <button
            type="button"
            className="db-icon-btn"
            onClick={() => notifDialogRef.current?.close()}
            aria-label={t('close', 'Tutup')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="db-notif__list">
          {alerts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`db-notif__item db-notif__item--${a.type} ${a.read ? 'db-notif__item--read' : ''}`}
              onClick={() => markAlertRead(a.id)}
            >
              <span className="db-notif__dot" aria-hidden="true" />
              <span className="db-notif__body">
                <span className="db-notif__item-title">{a.title}</span>
                <span className="db-notif__meta">{a.zone} · {a.time}</span>
              </span>
              {!a.read && <Check size={14} className="db-notif__check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </dialog>

      <div className="db-hero">
        <img src={hydroImg} alt="" className="db-hero__bg" />
        <div className="db-hero__overlay" />

        <div className="db-hero__content">

          <div className="db-hero__topbar">
            <div className="db-hero__left">
              <button
                type="button"
                className="db-hero__account"
                onClick={() => navigate('/settings')}
                aria-label={t('settings_title', 'Pengaturan')}
              >
                {user?.avatarUrl
                  ? <img src={user.avatarUrl} alt="account" className="db-hero__account-img" />
                  : <UserCircle size={20} />}
              </button>
              <div className="db-hero__location">
                <MapPin size={12} aria-hidden="true" />
                <span>
                  {realWeather.cityKey
                    ? `${t(realWeather.cityKey)}${realWeather.country ? ', ' + realWeather.country : ''}`
                    : realWeather.city
                      ? `${realWeather.city}${realWeather.country ? ', ' + realWeather.country : ''}`
                      : t('detecting_location')}
                </span>
              </div>
            </div>
            <button
              type="button"
              className={`db-hero__bell ${hasDevice && isOnline && unreadCount > 0 ? 'db-hero__bell--active' : ''}`}
              onClick={() => setNotifOpen(true)}
              aria-label={t('notifications')}
            >
              <Bell size={18} aria-hidden="true" />
              {hasDevice && isOnline && unreadCount > 0 && <span className="db-hero__badge">{unreadCount}</span>}
            </button>
          </div>

          <div className="db-hero__titles">
            <p className="db-hero__greeting">{t('welcome_to')}</p>
            <h1 className="db-hero__name">ENZOPONIK</h1>
          </div>

          <div className="db-hero__pills">
            <div className="db-hero__pill">
              <span className="db-hero__pill-val">
                {hasDevice && isOnline && healthScore != null ? `${Math.round(healthScore)}` : '-'}
              </span>
              <span className="db-hero__pill-lbl">{t('health')}</span>
            </div>
            <div className="db-hero__pill">
              <span className="db-hero__pill-val">
                {hasDevice && isOnline ? t('connected') : t('offline')}
              </span>
              <span className="db-hero__pill-lbl">{t('status_label')}</span>
            </div>
            <div className="db-hero__pill">
              <span className="db-hero__pill-val">{hasDevice && isOnline ? unreadCount : '-'}</span>
              <span className="db-hero__pill-lbl">{t('alerts')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="db-body">
        <div className="db-field-selector">
          <button
            className={`db-field-btn ${dropdownOpen ? 'db-field-btn--open' : ''}`}
            onClick={() => {
              if (!hasDevice) {
                setIsScannerOpen(true);
              } else {
                setDropdownOpen(o => !o);
              }
            }}
          >
            <img src={enzoponikImg} alt="Enzoponik" className="db-field-btn__thumb" />
            <div className="db-field-btn__info">
              <span className="db-field-btn__name">
                {hasDevice
                  ? (activeDevice?.name || (cropProfile?.cropName ? `${cropProfile.cropName} (${effectiveDeviceId})` : t('default_tower_name', { id: effectiveDeviceId })))
                  : t('connect_new_tower')}
              </span>
              <span className="db-field-btn__desc">
                {hasDevice
                  ? `${activeDevice?.id || effectiveDeviceId} · ${lastSeenSecondsAgo != null
                    ? isOnline && lastSeenSecondsAgo >= 10
                      ? `${formatElapsedDuration(lastSeenSecondsAgo, lang)} (${timeoutLeftSec}s)`
                      : formatElapsedDuration(lastSeenSecondsAgo, lang)
                    : '--'
                  }`
                  : t('tap_scan_or_enter')}
              </span>
            </div>
            {hasDevice ? (
              <ChevronDown size={18} className={`db-field-btn__chev ${dropdownOpen ? 'db-field-btn__chev--open' : ''}`} />
            ) : (
              <Plus size={18} className="db-field-btn__chev" style={{ transform: 'none' }} />
            )}
          </button>
          {hasDevice && dropdownOpen && (
            <div className="db-field-drop">
              <div className="db-field-drop__header">
                <span>{t('iot_tower_list', { count: devices?.length || 0 })}</span>
              </div>

              {devices && devices.length > 0 ? (
                <div className="db-field-drop__list">
                  {devices.map((d) => {
                    const isActive = d.id === activeDeviceId;
                    const isConfirming = confirmDeleteId === d.id;
                    return (
                      <div key={d.id} className="db-field-drop__device-wrap">
                        <div
                          className={`db-field-drop__device ${isActive ? 'db-field-drop__device--active' : ''}`}
                        >
                          <button
                            type="button"
                            className="db-field-drop__device-select"
                            onClick={() => {
                              selectActiveDevice(d.id);
                              setDropdownOpen(false);
                              setConfirmDeleteId(null);
                            }}
                          >
                            <div className="db-field-drop__device-icon" style={{ overflow: 'hidden', padding: 0 }}>
                              <img
                                src={enzoponikImg}
                                alt="Enzoponik"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              />
                            </div>
                            <div className="db-field-drop__device-info">
                              <div className="db-field-drop__device-name-row">
                                <span className="db-field-drop__device-name">{d.name || d.id}</span>
                              </div>
                              <span className="db-field-drop__device-id">{d.id}</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="db-field-drop__delete-btn"
                            title={t('remove_tower_title')}
                            aria-label={`${t('remove')} ${d.name || d.id}`}
                            onClick={() => setConfirmDeleteId(isConfirming ? null : d.id)}
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </div>
                        {isConfirming && (
                          <div className="db-field-drop__confirm">
                            <span>{t('remove_confirm', { name: d.name || d.id })}</span>
                            <div className="db-field-drop__confirm-btns">
                              <button
                                type="button"
                                className="db-field-drop__confirm-cancel"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                {t('cancel')}
                              </button>
                              <button
                                type="button"
                                className="db-field-drop__confirm-del"
                                onClick={async () => {
                                  await removeDevice(d.id);
                                  setConfirmDeleteId(null);
                                }}
                              >
                                {t('remove')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="db-field-drop__empty">
                  <span>{t('no_connected_devices_hint')}</span>
                </div>
              )}

              <div className="db-field-drop__divider" />

              <button
                type="button"
                className="db-field-drop__item db-field-drop__item--add"
                onClick={() => {
                  setDropdownOpen(false);
                  setIsScannerOpen(true);
                }}
              >
                <div className="db-field-drop__icon"><Plus size={16} /></div>
                <div>
                  <span className="db-field-drop__item-name">{t('add_new_device')}</span>
                  <span className="db-field-drop__item-desc">{t('scan_physical_qr')}</span>
                </div>
              </button>
            </div>
          )}
        </div>

        <div className={`db-sensor-card ${!hasDevice ? 'db-sensor-card--inactive' : ''}`}>
          <div className="db-sensor-card__img-wrap">
            <img src={hydroImg} alt={cropProfile?.cropName || t('field_name')} className="db-sensor-card__img" />
            {hasDevice ? (
              !isOnline ? (
                <div className="db-sensor-card__offline-tag">
                  {`OFFLINE · ${formatElapsedDuration(lastSeenSecondsAgo, lang)}`}
                </div>
              ) : lastSeenSecondsAgo != null && lastSeenSecondsAgo >= 10 ? (
                <div className="db-sensor-card__offline-tag">
                  {`${formatElapsedDuration(lastSeenSecondsAgo, lang)} / ${timeoutLeftSec}s`}
                </div>
              ) : null
            ) : (
              <div className="db-sensor-card__offline-tag">
                {t('tower_not_connected')}
              </div>
            )}
          </div>

          <div className="db-sensors">
            {sensors.map(s => {
              const hasVal = hasDevice && isOnline && s.rawVal != null;
              return (
                <div
                  key={s.label}
                  className={`db-sensor ${!hasVal ? 'db-sensor--na' : s.ok ? 'db-sensor--ok' : 'db-sensor--warn'}`}
                >
                  <s.icon size={15} strokeWidth={1.8} />
                  <div className="db-sensor__vals">
                    {hasVal ? (
                      <span className="db-sensor__val">
                        {s.value}
                        <span className="db-sensor__unit">{s.unit}</span>
                      </span>
                    ) : (
                      <span className="db-sensor__na">-</span>
                    )}
                  </div>
                  <span className="db-sensor__lbl">{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className={`db-ai ${aiResult || aiLoading ? 'db-ai--active' : ''}`}
          onClick={runAnalysis}
          style={{ cursor: aiLoading ? 'wait' : 'pointer' }}
        >
          <div className="db-ai__header">
            <span className="db-ai__label">
              {t('ai_analysis').toUpperCase()} · {aiUsed}/{aiMaxQuota}
            </span>
            {aiLoading
              ? <div className="db-ai__spinner" />
              : <span className="db-ai__hint">{aiResult ? t('re_analyze') : t('tap_to_analyze')}</span>
            }
          </div>
          {aiLoading && (
            <div className="db-ai__status" role="status" aria-live="polite">
              <ShiningText text={t('analyzing')} />
            </div>
          )}
          {!aiLoading && aiResult && (
            <div
              className="db-ai__result"
              style={{ animation: `smoothHeight ${aiResult.length * 8 + 200}ms cubic-bezier(0.25, 1, 0.5, 1) forwards` }}
            >
              <div className="db-ai__result-inner">
                {(() => {
                  let charIndex = 0;
                  return aiResult.split('\n').filter(l => l.trim()).map((line, li) => {

                    const parts = line.split(/(\*\*.*?\*\*)/);
                    return (
                      <p key={li} style={{ fontSize: '12.5px', color: '#333', lineHeight: 1.75, margin: '2px 0' }}>
                        {parts.map((part, pi) => {
                          const isBold = part.startsWith('**') && part.endsWith('**');
                          const text = isBold ? part.slice(2, -2) : part;
                          const chars = text.split('');
                          return chars.map((ch, ci) => {
                            const delay = charIndex++ * 8;

                            if (ch === ' ') {
                              return <span key={`${pi}-${ci}`} className="db-ai__char"> </span>;
                            }
                            return (
                              <span
                                key={`${pi}-${ci}`}
                                className="db-ai__char"
                                style={{ animationDelay: `${delay}ms`, fontWeight: isBold ? 700 : 'inherit' }}
                              >
                                {ch}
                              </span>
                            );
                          });
                        })}
                      </p>
                    );
                  });
                })()}
              </div>
            </div>
          )}
          {!aiLoading && aiError && <p className="db-ai__error">{aiError}</p>}
          {!aiLoading && !aiResult && !aiError && (
            <p className="db-ai__desc">{t('ai_analysis_desc')}</p>
          )}
        </div>

        <div className="db-section-hd" style={{ marginTop: 8 }}>
          <span className="section-title">{t('harvest_progress')}</span>
          {cropProfile?.cropName ? (
            <span className="db-section-tag">{harvestInfo.daysToHarvest} {t('days_left')}</span>
          ) : (
            <span className="db-section-tag">{t('not_configured')}</span>
          )}
        </div>

        <div className="db-harvest">
          {cropProfile?.cropName ? (
            <>
              <div className="db-harvest__top">
                <span className="db-harvest__name">{plantName}</span>
                <span className="db-harvest__pct">{harvestProgress.toFixed(0)}%</span>
              </div>
              <p className="db-harvest__sub">{t('day')} {harvestInfo.currentDay} {t('of')} {harvestInfo.totalCycleDays}</p>
              <div className="db-harvest__track">
                <div className="db-harvest__fill" style={{ width: `${harvestProgress}%` }} />
              </div>
            </>
          ) : (
            <div className="db-harvest__empty">
              <span className="db-harvest__empty-title">
                {t('no_active_crop')}
              </span>
              <span className="db-harvest__empty-sub">
                {t('no_active_crop_desc')}
              </span>
            </div>
          )}
        </div>

        <div className="db-section-hd" style={{ marginTop: 8 }}>
          <span className="section-title">{t('sensor_history')}</span>
          <div className="db-range-wrap">
            <div className="db-range-tabs" role="tablist" aria-label={t('sensor_history')}>
              {TIME_RANGES.map(r => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={chartRange === r}
                  className={`db-range-tab ${chartRange === r ? 'db-range-tab--active' : ''}`}
                  onClick={() => setChartRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartRange === 'Custom' && (
          <div className="db-date-row">
            <div className="db-date-field">
              <Calendar size={14} aria-hidden="true" />
              <input type="date" aria-label={t('from_date')} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <span className="db-date-sep" aria-hidden="true">→</span>
            <div className="db-date-field">
              <Calendar size={14} aria-hidden="true" />
              <input type="date" aria-label={t('to_date')} value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}

        <div className="db-chart">
          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSoil" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#36b37e" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#36b37e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradUV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d98218" stopOpacity={0.16} />
                      <stop offset="95%" stopColor="#d98218" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" vertical={false} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} domain={[0, 100]} />
                  <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} domain={[0, 12]} />
                  <Tooltip
                    contentStyle={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 14,
                      boxShadow: 'none',
                      fontSize: 12,
                    }}
                  />
                  <Area yAxisId="l" type="monotone" dataKey="soil" name={`${t('soil')} %`} stroke="#36b37e" strokeWidth={2.3} fill="url(#gradSoil)" dot={false} activeDot={{ r: 5, fill: '#36b37e' }} />
                  <Area yAxisId="r" type="monotone" dataKey="uv" name="UV" stroke="#d98218" strokeWidth={2.2} fill="url(#gradUV)" dot={false} activeDot={{ r: 5, fill: '#d98218' }} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="db-chart__legend">
                <span><span className="db-legend-dot" style={{ background: '#36b37e' }} />{t('soil')}</span>
                <span><span className="db-legend-dot" style={{ background: '#d98218' }} />{t('uv')}</span>
              </div>
            </>
          ) : (
            <div className="db-chart__empty">
              <Activity size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
              <p>{t('no_data')}</p>
              {chartRange === 'Custom' && <p className="db-chart__empty-hint">{t('select_date_range')}</p>}
            </div>
          )}
        </div>

      </div>

      <DeviceScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
      />
    </div>
  );
}
