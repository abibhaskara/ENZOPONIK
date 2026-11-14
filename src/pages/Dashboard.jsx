import { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Droplets, Thermometer, Sun, Wind, Leaf, Bell,
  ChevronDown, Calendar, X, Check, Plus, MapPin, Activity, UserCircle, Cpu, Trash2, Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNavDirection } from '../App';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from 'recharts';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import { runDashboardAnalysis } from '../lib/agronomyService';
import { getDeviceDailySnapshots } from '../lib/deviceService';
import { subscribeToTelemetryHistory } from '../lib/firebaseService';
import { triggerPumpControl } from '../lib/api';
import DeviceScannerModal from '../components/DeviceScannerModal';
import './Dashboard.css';
import hydroImg from '../assets/hydroponic.jpg';
import enzoponikImg from '../assets/icon_enzoponik.png';


const TIME_RANGES = ['3D', '1W', '1M', 'Custom'];


const fmt = (val, unit = '', decimals = 1) =>
  val != null ? `${parseFloat(val).toFixed(decimals)}${unit}` : null;

function getHealthColor(score) {
  if (score == null) return '#94a3b8';
  if (score >= 80)   return '#059669';
  if (score >= 60)   return '#d97706';
  return '#dc2626';
}

export default function Dashboard() {
  const {
    realWeather, sensorData, alerts, markAlertRead,
    esp32Connected, esp32Data, healthScore, backendConnected, detectedNodeId,
  } = useData();
  const {
    user, harvestInfo, cropProfile, activeDeviceId,
    devices, selectActiveDevice, removeDevice
  } = useUser();
  const { lang, t } = useLang();
  const navigate  = useNavigate();
  const { onNavChange } = useNavDirection();

  const plantName = cropProfile?.cropName || 'Hydroponic';

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult,  setAiResult]  = useState(null);
  const [aiError,   setAiError]   = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [chartRange,   setChartRange]   = useState('1W');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [deviceSnapshots, setDeviceSnapshots] = useState([]);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [pumpTriggering, setPumpTriggering] = useState(false);
  const [pumpStatusMsg, setPumpStatusMsg] = useState(null);

  const handleTestRelay = useCallback(async () => {
    if (pumpTriggering) return;
    setPumpTriggering(true);
    setPumpStatusMsg('Mengirim sinyal KLIK ke ESP32...');
    try {
      await triggerPumpControl(true, 5);
      setPumpStatusMsg('Sinyal terkirim! Relay menyala 5 detik (KLIK!)');
      setTimeout(() => {
        setPumpTriggering(false);
        setPumpStatusMsg(null);
      }, 6000);
    } catch (err) {
      setPumpStatusMsg('Gagal mengirim sinyal: ' + err.message);
      setPumpTriggering(false);
    }
  }, [pumpTriggering]);

  const effectiveDeviceId = activeDeviceId || detectedNodeId || (devices && devices[0]?.id) || 'EZPN-396QQVMZ';

  // Fetch real device snapshots if effectiveDeviceId is present
  useEffect(() => {
    let isMounted = true;
    if (!effectiveDeviceId) {
      setDeviceSnapshots([]);
      return;
    }

    getDeviceDailySnapshots(effectiveDeviceId, 30).then((snapshots) => {
      if (isMounted) {
        setDeviceSnapshots(snapshots || []);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [effectiveDeviceId]);

  // Subscribe to live telemetry history collection from Firestore
  useEffect(() => {
    const unsub = subscribeToTelemetryHistory((history) => {
      if (Array.isArray(history) && history.length > 0) {
        setTelemetryHistory(history);
      }
    }, 40);

    return () => unsub();
  }, []);

  const activeDevice = useMemo(() => {
    return devices?.find(d => d.id === effectiveDeviceId) || { id: effectiveDeviceId, name: `Menara ${effectiveDeviceId}` };
  }, [devices, effectiveDeviceId]);

  const hasDevice = Boolean(effectiveDeviceId || backendConnected || esp32Connected);

  const isOnline = backendConnected || esp32Connected;
  const unreadCount = useMemo(() => alerts.filter(a => !a.read).length, [alerts]);

  useEffect(() => {
    if (notifOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [notifOpen]);

  const weatherTemp     = sensorData.temperature;
  const weatherHumidity = sensorData.humidity;
  const weatherWind     = sensorData.windSpeed;
  const weatherUV       = sensorData.uvIndex;

  const displayTemp     = esp32Connected && esp32Data.temperature != null ? esp32Data.temperature : weatherTemp;
  const displayHumidity = esp32Connected && esp32Data.humidity    != null ? esp32Data.humidity    : weatherHumidity;

  const harvestProgress = harvestInfo.currentDay && harvestInfo.totalCycleDays
    ? Math.min(100, (harvestInfo.currentDay / harvestInfo.totalCycleDays) * 100)
    : 0;

  const chartData = useMemo(() => {
    let sourceData = [];

    if (deviceSnapshots.length > 0) {
      sourceData = deviceSnapshots.map(s => {
        const d = new Date(s.date || s.createdAt);
        return {
          time: `${d.getMonth() + 1}/${d.getDate()}`,
          fullDate: s.date || d.toISOString().slice(0, 10),
          timestamp: d.getTime(),
          soil: s.avgMoisture ?? s.soilMoisture ?? null,
          uv: s.avgUv ?? s.uvIndex ?? 0,
        };
      });
    } else if (telemetryHistory.length > 0) {
      sourceData = telemetryHistory.map(t => {
        const d = t.timestamp instanceof Date ? t.timestamp : new Date(t.timestamp || Date.now());
        return {
          time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          fullDate: d.toISOString().slice(0, 10),
          timestamp: d.getTime(),
          soil: t.soil ?? t.soilMoisture ?? null,
          uv: t.uv ?? t.uvIndex ?? 0,
        };
      });
    }

    if (!sourceData.length) return [];

    const now = Date.now();
    if (chartRange === 'Custom') {
      if (!customFrom || !customTo) return [];
      const fromTs = new Date(customFrom).setHours(0, 0, 0, 0);
      const toTs = new Date(customTo).setHours(23, 59, 59, 999);
      return sourceData.filter(d => d.timestamp >= fromTs && d.timestamp <= toTs);
    }
    if (chartRange === '3D') {
      const cutoff = now - 3 * 24 * 60 * 60 * 1000;
      return sourceData.filter(d => d.timestamp >= cutoff);
    }
    if (chartRange === '1W') {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;
      return sourceData.filter(d => d.timestamp >= cutoff);
    }
    if (chartRange === '1M') {
      const cutoff = now - 30 * 24 * 60 * 60 * 1000;
      return sourceData.filter(d => d.timestamp >= cutoff);
    }

    return sourceData;
  }, [deviceSnapshots, telemetryHistory, chartRange, customFrom, customTo]);

  
  const sensors = useMemo(() => [
    {
      icon: Droplets, label: t('soil'),
      value: fmt(sensorData.soilMoisture, '%', 0),
      unit: '%', rawVal: sensorData.soilMoisture,
      ok: sensorData.soilMoisture != null && sensorData.soilMoisture >= 60 && sensorData.soilMoisture <= 80,
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
      ok: displayTemp != null && displayTemp >= 24 && displayTemp <= 32,
    },
    {
      icon: Droplets, label: t('humidity'),
      value: fmt(displayHumidity, '', 0),
      unit: '%', rawVal: displayHumidity,
      ok: displayHumidity != null && displayHumidity >= 70 && displayHumidity <= 90,
    },
    {
      icon: Wind, label: t('wind'),
      value: fmt(weatherWind, '', 0),
      unit: 'km/h', rawVal: weatherWind,
      ok: weatherWind != null,
    },
  ], [t, sensorData, healthScore, weatherUV, displayTemp, displayHumidity, weatherWind]);

  
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

      
      {notifOpen && createPortal(
        <div className="db-overlay" onClick={() => setNotifOpen(false)}>
          <div className="db-notif" onClick={e => e.stopPropagation()}>
            <div className="db-notif__head">
              <span className="db-notif__title">{t('notifications')}</span>
              <button className="db-icon-btn" onClick={() => setNotifOpen(false)}><X size={16} /></button>
            </div>
            <div className="db-notif__list">
              {alerts.map(a => (
                <div
                  key={a.id}
                  className={`db-notif__item db-notif__item--${a.type} ${a.read ? 'db-notif__item--read' : ''}`}
                  onClick={() => markAlertRead(a.id)}
                >
                  <div className="db-notif__dot" />
                  <div className="db-notif__body">
                    <span className="db-notif__item-title">{a.title}</span>
                    <span className="db-notif__meta">{a.zone} · {a.time}</span>
                  </div>
                  {!a.read && <Check size={13} className="db-notif__check" />}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      
      <div className="db-hero">
        <img src={hydroImg} alt="" className="db-hero__bg" />
        <div className="db-hero__overlay" />

        <div className="db-hero__content">
          
          <div className="db-hero__topbar">
            <div className="db-hero__left">
              <button
                className="db-hero__account"
                onClick={() => { onNavChange('/settings'); navigate('/settings'); }}
              >
                {user?.avatarUrl
                  ? <img src={user.avatarUrl} alt="account" className="db-hero__account-img" />
                  : <UserCircle size={20} />}
              </button>
              <div className="db-hero__location">
                <MapPin size={12} />
                <span>
                  {realWeather.city
                    ? `${realWeather.city}${realWeather.country ? ', ' + realWeather.country : ''}`
                    : 'Detecting location…'}
                </span>
              </div>
            </div>
            <button
              className={`db-hero__bell ${unreadCount > 0 ? 'db-hero__bell--active' : ''}`}
              onClick={() => setNotifOpen(true)}
            >
              <Bell size={18} />
              {unreadCount > 0 && <span className="db-hero__badge">{unreadCount}</span>}
            </button>
          </div>

          
          <div className="db-hero__titles">
            <p className="db-hero__greeting">{t('welcome_to')}</p>
            <h1 className="db-hero__name">ENZOPONIK</h1>
          </div>

          
          <div className="db-hero__pills">
            <div className="db-hero__pill">
              <span className="db-hero__pill-val">
                {hasDevice && healthScore != null ? `${Math.round(healthScore)}` : '—'}
              </span>
              <span className="db-hero__pill-lbl">{t('health')}</span>
            </div>
            <div className="db-hero__pill">
              <span className="db-hero__pill-val">{hasDevice && isOnline ? t('connected') : t('offline')}</span>
              <span className="db-hero__pill-lbl">{t('status_label')}</span>
            </div>
            <div
              className="db-hero__pill db-hero__pill--clickable"
              onClick={() => setNotifOpen(true)}
            >
              <span className="db-hero__pill-val">{unreadCount}</span>
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
                {activeDevice?.name || (cropProfile?.cropName ? `${cropProfile.cropName} (${effectiveDeviceId})` : `Menara ${effectiveDeviceId}`)}
              </span>
              <span className="db-field-btn__desc">
                {`ID: ${activeDevice?.id || effectiveDeviceId}`}
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
                <span>Daftar Menara IoT ({devices?.length || 0})</span>
              </div>

              {devices && devices.length > 0 ? (
                <div className="db-field-drop__list">
                  {devices.map((d) => {
                    const isActive = d.id === activeDeviceId;
                    return (
                      <div
                        key={d.id}
                        className={`db-field-drop__device ${isActive ? 'db-field-drop__device--active' : ''}`}
                        onClick={() => {
                          selectActiveDevice(d.id);
                          setDropdownOpen(false);
                        }}
                      >
                        <div className="db-field-drop__device-icon">
                          <Cpu size={15} />
                        </div>
                        <div className="db-field-drop__device-info">
                          <div className="db-field-drop__device-name-row">
                            <span className="db-field-drop__device-name">{d.name || d.id}</span>
                            {isActive && <span className="db-field-drop__active-tag">Aktif</span>}
                          </div>
                          <span className="db-field-drop__device-id">{d.id}</span>
                        </div>
                        <button
                          type="button"
                          className="db-field-drop__delete-btn"
                          title="Putuskan / Hapus Menara"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`Yakin ingin memutuskan koneksi menara ${d.name || d.id}?`)) {
                              await removeDevice(d.id);
                            }
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="db-field-drop__empty">
                  <span>Belum ada alat terhubung. Silakan pindai QR alat untuk menghubungkan.</span>
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
                  <span className="db-field-drop__item-desc">Pindai QR fisik alat</span>
                </div>
              </button>
            </div>
          )}
        </div>

        
        <div className={`db-sensor-card ${!hasDevice ? 'db-sensor-card--inactive' : ''}`}>
          <div className="db-sensor-card__img-wrap">
            <img src={hydroImg} alt={cropProfile?.cropName || t('field_name')} className="db-sensor-card__img" />
            {hasDevice ? (
              <>
                <div className="db-sensor-card__live-badge">
                  <span className="db-sensor-card__live-dot" />
                  <Leaf size={11} />
                  <span>{t('live')}</span>
                </div>
                {!esp32Connected && (
                  <div className="db-sensor-card__offline-tag">
                    {t('esp32_offline_status')}
                  </div>
                )}
              </>
            ) : (
              <div className="db-sensor-card__offline-tag">
                {lang === 'id' ? 'Menara belum terhubung' : 'Tower not connected'}
              </div>
            )}
          </div>

          <div className="db-sensors">
            {sensors.map(s => {
              const hasVal = hasDevice && s.rawVal != null;
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
          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              type="button"
              onClick={handleTestRelay}
              disabled={pumpTriggering}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                border: 'none',
                background: pumpTriggering ? '#059669' : '#10b981',
                color: '#fff',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: pumpTriggering ? 'wait' : 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.28)',
              }}
            >
              <Droplets size={15} />
              <span>{pumpTriggering ? 'Relay Aktif (5 Detik)...' : 'Tes Klik Relay / Nyalakan Pompa (5s)'}</span>
            </button>
            {pumpStatusMsg && (
              <span style={{ fontSize: '11.5px', color: '#059669', textAlign: 'center', fontWeight: 500 }}>
                {pumpStatusMsg}
              </span>
            )}
          </div>
        </div>

        
        <div
          className={`db-ai ${aiResult || aiLoading ? 'db-ai--active' : ''}`}
          onClick={runAnalysis}
          style={{ cursor: aiLoading ? 'wait' : 'pointer' }}
        >
          <div className="db-ai__header">
            <span className="db-ai__label">{t('ai_analysis').toUpperCase()}</span>
            {aiLoading
              ? <div className="db-ai__spinner" />
              : <span className="db-ai__hint">{aiResult ? t('re_analyze') : t('tap_to_analyze')}</span>
            }
          </div>
          {aiLoading && <p className="db-ai__status">{t('analyzing')}</p>}
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
          {!aiLoading && aiError  && <p className="db-ai__error">{aiError}</p>}
          {!aiLoading && !aiResult && !aiError && (
            <p className="db-ai__desc">{t('ai_analysis_desc')}</p>
          )}
        </div>

        
        <div className="db-section-hd" style={{ marginTop: 8 }}>
          <span className="section-title">{t('harvest_progress')}</span>
          {cropProfile?.cropName ? (
            <span className="db-section-tag">{harvestInfo.daysToHarvest} {t('days_left')}</span>
          ) : (
            <span className="db-section-tag">Belum Dikonfigurasi</span>
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
            <div className="db-harvest__empty" style={{ textAlign: 'center', padding: '12px 4px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#6d7d73', display: 'block', marginBottom: 2 }}>
                Belum ada komoditas tanaman aktif
              </span>
              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                Tambahkan menara dan pilih komoditas untuk memulai tracking siklus panen.
              </span>
            </div>
          )}
        </div>

        
        <div className="db-section-hd" style={{ marginTop: 8 }}>
          <span className="section-title">{t('sensor_history')}</span>
          <div className="db-range-wrap">
            <div className="db-range-tabs">
              {TIME_RANGES.map(r => (
                <button
                  key={r}
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
              <Calendar size={13} />
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <span className="db-date-sep">→</span>
            <div className="db-date-field">
              <Calendar size={13} />
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
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
                      <stop offset="5%"  stopColor="#0c5e4a" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#0c5e4a" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradUV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#bbb', fontSize: 10 }} />
                  <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fill: '#bbb', fontSize: 10 }} domain={[40, 100]} />
                  <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#bbb', fontSize: 10 }} domain={[0, 12]} />
                  <Tooltip
                    contentStyle={{
                      background: '#fff', border: '1px solid #f0f0f0',
                      borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', fontSize: 12,
                    }}
                  />
                  <Area yAxisId="l" type="monotone" dataKey="soil" name="Soil %" stroke="#0c5e4a" strokeWidth={2.2} fill="url(#gradSoil)" dot={false} activeDot={{ r: 5, fill: '#0c5e4a' }} />
                  <Area yAxisId="r" type="monotone" dataKey="uv"   name="UV"     stroke="#f59e0b" strokeWidth={2.2} fill="url(#gradUV)"  dot={false} activeDot={{ r: 5, fill: '#f59e0b' }} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="db-chart__legend">
                <span><span className="db-legend-dot" style={{ background: '#0c5e4a' }} />{t('soil')}</span>
                <span><span className="db-legend-dot" style={{ background: '#f59e0b' }} />{t('uv')}</span>
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

      {/* Device QR Scanner Modal */}
      <DeviceScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onVerified={() => {
          setIsScannerOpen(false);
          navigate('/crop-config');
        }}
      />
    </div>
  );
}
