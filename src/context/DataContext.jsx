import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getLatestObservations, fetchWithTimeout, getEdgeWeather } from '../lib/api';
import { useUser } from './UserContext';
import { useLang } from './LanguageContext';
import { translateKey } from '../locales/translations';
import {
  subscribeToAlerts,
  markAlertAsRead as markFirebaseAlertRead,
} from '../lib/firebaseService';
import {
  subscribeToDevice,
  saveDailySnapshot,
} from '../lib/deviceService';
import {
  getCropThresholds,
  computeHealthScore,
  getWmoInfo,
  convertOwmToWmo,
  formatRelativeTime,
} from '../lib/cropUtils';

const DataContext = createContext(null);

const DEFAULT_LOCATION = {
  isLocked: false,
  latitude: -8.409518,
  longitude: 115.188919,
};

function getLocationStorageKey(uid) {
  return `enzoponik_location_${uid || 'anon'}`;
}

function getAlertsStorageKey(uid) {
  return `enzoponik_alerts_${uid || 'anon'}`;
}

function loadLocationConfig(uid) {
  try {
    const raw = localStorage.getItem(getLocationStorageKey(uid));
    return raw ? JSON.parse(raw) : DEFAULT_LOCATION;
  } catch {
    return DEFAULT_LOCATION;
  }
}

function loadStoredAlerts(uid) {
  if (!uid) return [];
  try {
    const stored = localStorage.getItem(getAlertsStorageKey(uid));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DataProvider({ children }) {
  const { lang } = useLang();
  const { user, activeDeviceId, subscriptionTier, cropProfile, updateUser } = useUser();
  const uid = user?.uid || null;

  const [locationConfig, setLocationConfig] = useState(() => user?.locationConfig || loadLocationConfig(uid));
  const locationConfigRef = useRef(locationConfig);
  locationConfigRef.current = locationConfig;
  const userLocationRef = useRef(user?.locationConfig);
  userLocationRef.current = user?.locationConfig;

  const updateLocationConfig = useCallback((partial) => {
    const next = { ...locationConfigRef.current, ...partial };
    locationConfigRef.current = next;
    try {
      localStorage.setItem(getLocationStorageKey(uid), JSON.stringify(next));
    } catch {}
    setLocationConfig(next);
    if (uid) {
      updateUser({ locationConfig: next });
    }
  }, [uid, updateUser]);

  useEffect(() => {
    if (user?.locationConfig && user.locationConfig.latitude != null && user.locationConfig.longitude != null) {
      setLocationConfig((prev) => {
        if (
          prev.latitude === user.locationConfig.latitude &&
          prev.longitude === user.locationConfig.longitude &&
          Boolean(prev.isLocked) === Boolean(user.locationConfig.isLocked)
        ) {
          return prev;
        }
        try {
          localStorage.setItem(getLocationStorageKey(uid), JSON.stringify(user.locationConfig));
        } catch {}
        locationConfigRef.current = user.locationConfig;
        return user.locationConfig;
      });
    }
  }, [user?.locationConfig, uid]);

  const [realWeather, setRealWeather] = useState({
    city: null, country: null, description: null, emoji: null,
    windSpeed: null, uvIndex: null, daily: [], hourly: [],
    loading: true, error: null,
  });

  const [sensorData, setSensorData] = useState({
    soilMoisture: null, lightLevel: null, uvIndex: null,
    rainfall: null, windSpeed: null, temperature: null, humidity: null,
  });

  const [alerts, setAlerts] = useState(() => loadStoredAlerts(uid));

  const persistAlerts = useCallback((next) => {
    try { localStorage.setItem(getAlertsStorageKey(uid), JSON.stringify(next)); }
    catch (e) { console.warn('[Storage] failed to save alerts:', e.message); }
    return next;
  }, [uid]);

  const [backendConnected, setBackendConnected] = useState(false);
  const backendConnectedRef = useRef(false);
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [lastHeartbeatMs, setLastHeartbeatMs] = useState(null);
  const [lastSeenSecondsAgo, setLastSeenSecondsAgo] = useState(null);
  const [deviceUptimeSec, setDeviceUptimeSec] = useState(null);
  const [detectedNodeId, setDetectedNodeId] = useState(null);
  const [pumpActive, setPumpActive] = useState(false);
  const [pumpDurationSec, setPumpDurationSec] = useState(0);
  const prevOnlineRef = useRef(null);
  const prevPumpRef = useRef(null);

  useEffect(() => {
    const restoredLoc = userLocationRef.current || loadLocationConfig(uid);
    locationConfigRef.current = restoredLoc;
    setLocationConfig(restoredLoc);
    setAlerts(loadStoredAlerts(uid));
    prevOnlineRef.current = null;
    prevPumpRef.current = null;
  }, [uid]);

  useEffect(() => {
    setBackendConnected(false);
    backendConnectedRef.current = false;
    setFirebaseConnected(false);
    setLastHeartbeatMs(null);
    setLastSeenSecondsAgo(null);
    setDeviceUptimeSec(null);
    setDetectedNodeId(null);
    setSensorData((prev) => ({
      ...prev,
      soilMoisture: null,
      lightLevel: null,
    }));
  }, [activeDeviceId, uid]);

  const parseHeartbeatMs = useCallback((val) => {
    if (!val) return null;
    if (typeof val === 'number') return val;
    if (typeof val?.toDate === 'function') return val.toDate().getTime();
    if (typeof val?.seconds === 'number') return val.seconds * 1000;
    const parsed = new Date(val).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }, []);

  useEffect(() => {
    if (!activeDeviceId) return;
    const cleanActiveId = activeDeviceId.trim().toUpperCase();

    const unsubDevice = subscribeToDevice(cleanActiveId, (device) => {
      if (!device || !device.liveTelemetry) return;
      const tel = device.liveTelemetry;
      setSensorData((prev) => ({
        ...prev,
        soilMoisture: tel.soilMoisture ?? prev.soilMoisture,
        temperature:  tel.temperature  ?? prev.temperature,
        humidity:     tel.humidity     ?? prev.humidity,
        lightLevel:   tel.lightLevel   ?? prev.lightLevel,
        uvIndex:      tel.uvIndex      ?? prev.uvIndex,
        windSpeed:    tel.windSpeed    ?? prev.windSpeed,
        rainfall:     tel.rainfall     ?? prev.rainfall,
      }));
      if (tel.pumpActive != null) {
        setPumpActive(Boolean(tel.pumpActive));
      }
      if (tel.pumpDurationSec != null) {
        setPumpDurationSec(Number(tel.pumpDurationSec) || 0);
      }
      const hbMs = parseHeartbeatMs(tel.lastHeartbeatAt || tel.timestamp || device.lastSeen);
      if (hbMs) {
        setLastHeartbeatMs((prev) => (!prev || hbMs > prev ? hbMs : prev));
        const isFresh = (Date.now() - hbMs) <= 40000;
        setFirebaseConnected(isFresh);
      }
    });

    const unsubAlerts = subscribeToAlerts((fbAlerts) => {
      if (Array.isArray(fbAlerts) && fbAlerts.length > 0) {
        const filtered = fbAlerts.filter((a) => !a.deviceId || a.deviceId.toUpperCase() === cleanActiveId);
        if (filtered.length > 0) {
          setAlerts((prev) => {
            const byId = new Map(prev.map((a) => [String(a.id), a]));
            for (const item of filtered) byId.set(String(item.id), item);
            return [...byId.values()]
              .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
              .slice(0, 20);
          });
        }
      }
    });

    return () => {
      unsubDevice();
      unsubAlerts();
    };
  }, [activeDeviceId, parseHeartbeatMs]);

  useEffect(() => {
    if (
      !activeDeviceId ||
      sensorData.soilMoisture == null ||
      sensorData.temperature == null ||
      sensorData.humidity == null
    ) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const markerKey = `enzoponik_snapshot_${activeDeviceId}_${today}`;
    if (localStorage.getItem(markerKey)) return;

    const snapshotHealth = computeHealthScore({
      soilMoisture: sensorData.soilMoisture,
      humidity: sensorData.humidity,
      temperature: sensorData.temperature,
      lightLevel: sensorData.lightLevel,
      thresholds: getCropThresholds(cropProfile),
    });
    if (snapshotHealth == null) return;

    const timer = setTimeout(() => {
      saveDailySnapshot(activeDeviceId, {
        date: today,
        avgTemp: sensorData.temperature,
        avgHumidity: sensorData.humidity,
        avgMoisture: sensorData.soilMoisture,
        healthScore: snapshotHealth,
      }, subscriptionTier);
      localStorage.setItem(markerKey, 'recorded');
    }, 3000);

    return () => clearTimeout(timer);
  }, [activeDeviceId, subscriptionTier, cropProfile, sensorData.temperature, sensorData.humidity, sensorData.soilMoisture, sensorData.lightLevel]);

  const fetchSensorData = useCallback(async () => {
    if (!activeDeviceId) return;
    try {
      const cleanActiveId = activeDeviceId.trim().toUpperCase();
      const data = await getLatestObservations(cleanActiveId);
      if (!Array.isArray(data) || data.length === 0) return;

      const node = data.find((n) => {
        const id = (n.node_id || n.deviceId || n.node || n.id || '').toUpperCase();
        return id === cleanActiveId;
      });

      if (node) {
        const nodeId = (node.node_id || node.deviceId || node.node || node.id || '').toUpperCase();
        if (nodeId) setDetectedNodeId(nodeId);

        setSensorData((prev) => ({
          ...prev,
          soilMoisture: node.soilMoisture != null ? parseFloat(Number(node.soilMoisture).toFixed(1)) : prev.soilMoisture,
          lightLevel:   node.lightLevel   != null ? parseFloat(Number(node.lightLevel).toFixed(1))   : prev.lightLevel,
          temperature:  node.temperature  != null ? parseFloat(Number(node.temperature).toFixed(1))  : prev.temperature,
          humidity:     node.humidity     != null ? parseFloat(Number(node.humidity).toFixed(1))     : prev.humidity,
        }));

        if (node.uptime != null) {
          setDeviceUptimeSec(Number(node.uptime));
        }
        if (node.pumpActive != null) {
          setPumpActive(Boolean(node.pumpActive));
        }
        if (node.pumpDurationSec != null) {
          setPumpDurationSec(Number(node.pumpDurationSec) || 0);
        }

        let isNodeOnline = false;
        if (typeof node.ageSeconds === 'number') {
          const computedHbMs = Date.now() - node.ageSeconds * 1000;
          setLastHeartbeatMs(computedHbMs);
          setLastSeenSecondsAgo(node.ageSeconds);
          isNodeOnline = Boolean(node.online ?? (node.ageSeconds <= 40));
        } else {
          const hbMs = parseHeartbeatMs(node.lastSeen || node.timestamp);
          if (hbMs) {
            setLastHeartbeatMs(hbMs);
            const ageSec = Math.max(0, Math.round((Date.now() - hbMs) / 1000));
            setLastSeenSecondsAgo(ageSec);
            isNodeOnline = ageSec <= 40;
          }
        }

        backendConnectedRef.current = isNodeOnline;
        setBackendConnected(isNodeOnline);
      } else {
        backendConnectedRef.current = false;
        setBackendConnected(false);
      }
    } catch (err) {
      if (backendConnectedRef.current) {
        console.warn('[ENZOPONIK API] Backend unreachable:', err.message);
        backendConnectedRef.current = false;
        setBackendConnected(false);
      }
    }
  }, [activeDeviceId, parseHeartbeatMs]);

  useEffect(() => {
    const runIfVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        fetchSensorData();
      }
    };
    runIfVisible();
    const poll = setInterval(runIfVisible, 5_000);
    document.addEventListener('visibilitychange', runIfVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', runIfVisible);
    };
  }, [fetchSensorData]);

  useEffect(() => {
    const syncElapsed = () => {
      if (!lastHeartbeatMs) return;
      const ageSec = Math.max(0, Math.floor((Date.now() - lastHeartbeatMs) / 1000));
      setLastSeenSecondsAgo(ageSec);
      const isFresh = ageSec <= 40;
      setBackendConnected(isFresh);
      setFirebaseConnected(isFresh);
    };
    syncElapsed();
    const watchdog = setInterval(syncElapsed, 2000);
    return () => clearInterval(watchdog);
  }, [lastHeartbeatMs]);

  const fetchWeather = useCallback(async (lat, lon) => {
    try {
      const owmKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
      if (!owmKey) throw new Error('Weather API key missing');
      const [weatherRes, forecastRes] = await Promise.all([
        fetchWithTimeout(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${owmKey}`, {}, 6000),
        fetchWithTimeout(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${owmKey}`, {}, 6000),
      ]);

      if (!weatherRes.ok)  throw new Error(`Weather error ${weatherRes.status}`);
      if (!forecastRes.ok) throw new Error(`Forecast error ${forecastRes.status}`);

      const weatherData  = await weatherRes.json();
      const forecastData = await forecastRes.json();

      const temperature  = weatherData.main?.temp    != null ? parseFloat(weatherData.main.temp.toFixed(1)) : null;
      const humidity     = weatherData.main?.humidity ?? null;
      const windSpeedMs  = weatherData.wind?.speed   ?? null;
      const windSpeedKmh = windSpeedMs != null ? Math.round(windSpeedMs * 3.6) : null;
      const owmCode      = weatherData.weather?.[0]?.id ?? null;
      const isDay        = weatherData.dt != null && weatherData.sys?.sunrise != null && weatherData.sys?.sunset != null
        ? weatherData.dt >= weatherData.sys.sunrise && weatherData.dt <= weatherData.sys.sunset
        : true;
      const uvIndex      = isDay ? 6.5 : 0;

      const wmoCode = convertOwmToWmo(owmCode);
      const { descKey, desc, emoji } = getWmoInfo(wmoCode, lang);

      const dailyMap = {};
      forecastData.list?.forEach(item => {
        const dayName = DAYS_OF_WEEK[new Date(item.dt * 1000).getDay()];
        if (!dailyMap[dayName]) dailyMap[dayName] = { temps: [], codes: [] };
        dailyMap[dayName].temps.push(item.main.temp);
        dailyMap[dayName].codes.push(item.weather?.[0]?.id);
      });

      const dailyForecasts = forecastData.list
        ? Object.keys(dailyMap).slice(0, 7).map(dayName => {
            const { temps, codes } = dailyMap[dayName];
            const occurrences = codes.reduce((acc, code) => {
              acc[code] = (acc[code] || 0) + 1;
              return acc;
            }, {});
            const commonCode = parseInt(Object.keys(occurrences).reduce((a, b) =>
              occurrences[a] > occurrences[b] ? a : b
            ));
            const { desc: dDesc, emoji: dEmoji } = getWmoInfo(convertOwmToWmo(commonCode), lang);
            return {
              day: dayName,
              tempMax: Math.round(Math.max(...temps)),
              tempMin: Math.round(Math.min(...temps)),
              description: dDesc,
              emoji: dEmoji,
            };
          })
        : [];

      const hourlyForecasts = forecastData.list
        ? forecastData.list.slice(0, 8).map(h => ({
            time: `${new Date(h.dt * 1000).getHours().toString().padStart(2, '0')}.00`,
            temp: Math.round(h.main.temp),
            rain: h.pop != null ? Math.round(h.pop * 100) : 0,
            wind: h.wind?.speed != null ? Math.round(h.wind.speed * 3.6) : 0,
          }))
        : [];

      const city = weatherData.name || null;
      const country = weatherData.sys?.country || null;

      setRealWeather({ city, country, descKey, description: desc, emoji, windSpeed: windSpeedKmh, uvIndex, daily: dailyForecasts, hourly: hourlyForecasts, loading: false, error: null });
      setSensorData(prev => ({ ...prev, temperature, humidity, windSpeed: windSpeedKmh, uvIndex, rainfall: wmoCode >= 51 ? 8 : 0 }));
    } catch (owmErr) {
      try {
        const edge = await getEdgeWeather(lat, lon);
        const cur = edge.current || {};
        const wmo = cur.weather_code ?? 0;
        const { descKey, desc, emoji } = getWmoInfo(wmo, lang);
        const temperature = cur.temperature_2m != null ? parseFloat(Number(cur.temperature_2m).toFixed(1)) : null;
        const humidity = cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null;
        const windSpeedKmh = cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null;
        const uvIndex = cur.uv_index != null ? parseFloat(Number(cur.uv_index).toFixed(1)) : 5.0;

        const dailyForecasts = (edge.daily?.time || []).slice(0, 7).map((dateStr, i) => ({
          day: DAYS_OF_WEEK[new Date(dateStr).getDay()],
          tempMax: Math.round(edge.daily.temperature_2m_max?.[i] ?? 30),
          tempMin: Math.round(edge.daily.temperature_2m_min?.[i] ?? 24),
          description: desc,
          emoji,
        }));
        const hourlyForecasts = (edge.hourly?.time || []).slice(0, 8).map((tStr, i) => ({
          time: `${new Date(tStr).getHours().toString().padStart(2, '0')}.00`,
          temp: Math.round(edge.hourly.temperature_2m?.[i] ?? 28),
          rain: 0,
          wind: windSpeedKmh ?? 0,
        }));

        setRealWeather({
          cityKey: 'tower_location',
          city: translateKey(lang, 'tower_location'),
          country: 'ID',
          descKey,
          description: desc,
          emoji,
          windSpeed: windSpeedKmh,
          uvIndex,
          daily: dailyForecasts,
          hourly: hourlyForecasts,
          loading: false,
          error: null,
        });
        setSensorData(prev => ({ ...prev, temperature, humidity, windSpeed: windSpeedKmh, uvIndex, rainfall: wmo >= 51 ? 8 : 0 }));
      } catch (edgeErr) {
        console.warn('[fetchWeather] OWM & Edge fallback failed:', owmErr.message, edgeErr.message);
        setRealWeather(prev => ({ ...prev, loading: false, error: owmErr.message }));
      }
    }
  }, [lang]);

  useEffect(() => {
    const doFetch = () => {
      const fallbackLat = Number(locationConfig?.latitude ?? DEFAULT_LOCATION.latitude);
      const fallbackLon = Number(locationConfig?.longitude ?? DEFAULT_LOCATION.longitude);

      if ((locationConfig.isLocked || user?.locationConfig?.latitude != null) && locationConfig.latitude != null && locationConfig.longitude != null) {
        fetchWeather(fallbackLat, fallbackLon);
        return;
      }
      if (!navigator.geolocation) {
        fetchWeather(fallbackLat, fallbackLon);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latestLoc = locationConfigRef.current;
          if (latestLoc?.isLocked && latestLoc.latitude != null && latestLoc.longitude != null) {
            fetchWeather(Number(latestLoc.latitude), Number(latestLoc.longitude));
            return;
          }
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lon = parseFloat(pos.coords.longitude.toFixed(6));
          fetchWeather(lat, lon);

          if (uid && !userLocationRef.current && !latestLoc?.isLocked) {
            updateLocationConfig({ latitude: lat, longitude: lon, isLocked: false });
          }
        },
        () => fetchWeather(fallbackLat, fallbackLon),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    };

    doFetch();
    const refresh = setInterval(doFetch, 10 * 60 * 1000);
    return () => clearInterval(refresh);
  }, [fetchWeather, locationConfig.isLocked, locationConfig.latitude, locationConfig.longitude, uid, user?.locationConfig, updateLocationConfig]);

  const effectiveBackendConnected = Boolean(activeDeviceId && (backendConnected || firebaseConnected));
  const effectiveEsp32Connected = effectiveBackendConnected;
  const effectiveEsp32Data = {
    temperature: sensorData.temperature,
    humidity: sensorData.humidity,
  };

  useEffect(() => {
    if (!activeDeviceId || lastSeenSecondsAgo === null || user?.notificationsEnabled === false) return;
    if (prevOnlineRef.current === null) {
      prevOnlineRef.current = effectiveEsp32Connected;
      return;
    }
    if (prevOnlineRef.current !== effectiveEsp32Connected) {
      prevOnlineRef.current = effectiveEsp32Connected;
      const devLabel = detectedNodeId || activeDeviceId || 'ENZOPONIK';
      const now = Date.now();
      const onlineTitles = {
        en: `Device ${devLabel} is back ONLINE (Connected)`,
        id: `Alat ${devLabel} kembali ONLINE (Terhubung)`,
        zh: `设备 ${devLabel} 已恢复在线（已连接）`,
        jv: `Piranti ${devLabel} wis ONLINE maneh (Kasambung)`,
        ban: `Alat ${devLabel} malih ONLINE (Kasambung)`,
      };
      const offlineTitles = {
        en: `Device ${devLabel} disconnected (OFFLINE — no signal >40s)`,
        id: `Alat ${devLabel} terputus (OFFLINE — tidak ada sinyal >40 detik)`,
        zh: `设备 ${devLabel} 已断开连接（离线 — 超过 40 秒无信号）`,
        jv: `Piranti ${devLabel} pedhot (OFFLINE — ora ana sinyal >40 detik)`,
        ban: `Alat ${devLabel} pegat (OFFLINE — nenten wenten sinyal >40 detik)`,
      };
      const statusAlert = {
        id: now + Math.random(),
        type_key: 'device_conn_status',
        type: effectiveEsp32Connected ? 'info' : 'danger',
        title: effectiveEsp32Connected
          ? (onlineTitles[lang] || onlineTitles.en)
          : (offlineTitles[lang] || offlineTitles.en),
        zone: devLabel,
        timestamp: now,
        read: false,
      };
      setAlerts(prev => persistAlerts([statusAlert, ...prev].slice(0, 20)));
    }
  }, [effectiveEsp32Connected, lastSeenSecondsAgo, detectedNodeId, activeDeviceId, user?.notificationsEnabled, lang, persistAlerts]);

  useEffect(() => {
    if (!activeDeviceId || user?.notificationsEnabled === false) return;
    if (prevPumpRef.current === null) {
      prevPumpRef.current = pumpActive;
      return;
    }
    if (!prevPumpRef.current && pumpActive) {
      const devLabel = detectedNodeId || activeDeviceId || 'ENZOPONIK';
      const now = Date.now();
      const durLabels = {
        en: ` (${pumpDurationSec}s)`,
        id: ` (${pumpDurationSec} detik)`,
        zh: `（${pumpDurationSec} 秒）`,
        jv: ` (${pumpDurationSec} detik)`,
        ban: ` (${pumpDurationSec} detik)`,
      };
      const durLabel = pumpDurationSec > 0 ? (durLabels[lang] || durLabels.en) : '';
      const pumpTitles = {
        en: `Water pump ${devLabel} ON${durLabel}`,
        id: `Pompa air ${devLabel} HIDUP${durLabel}`,
        zh: `水泵 ${devLabel} 已开启${durLabel}`,
        jv: `Pompa banyu ${devLabel} URIP${durLabel}`,
        ban: `Pompa toya ${devLabel} MURUB${durLabel}`,
      };
      const notifTitles = {
        en: 'ENZOPONIK · Pump Active',
        id: 'ENZOPONIK · Pompa Hidup',
        zh: 'ENZOPONIK · 水泵运行中',
        jv: 'ENZOPONIK · Pompa Urip',
        ban: 'ENZOPONIK · Pompa Murub',
      };
      const notifBodies = {
        en: `Water pump ${devLabel} is irrigating${durLabel}.`,
        id: `Pompa air ${devLabel} sedang menyiram${durLabel}.`,
        zh: `水泵 ${devLabel} 正在灌溉${durLabel}。`,
        jv: `Pompa banyu ${devLabel} lagi nyiram${durLabel}.`,
        ban: `Pompa toya ${devLabel} sedeng nyiram${durLabel}.`,
      };
      const pumpAlert = {
        id: now + Math.random(),
        type_key: 'pump_active_status',
        type: 'info',
        title: pumpTitles[lang] || pumpTitles.en,
        zone: devLabel,
        timestamp: now,
        read: false,
      };
      setAlerts(prev => persistAlerts([pumpAlert, ...prev].slice(0, 20)));
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(
            notifTitles[lang] || notifTitles.en,
            {
              body: notifBodies[lang] || notifBodies.en,
            }
          );
        } catch {

        }
      }
    }
    prevPumpRef.current = pumpActive;
  }, [pumpActive, pumpDurationSec, detectedNodeId, activeDeviceId, user?.notificationsEnabled, lang, persistAlerts]);

  const activeTemp     = sensorData.temperature ?? (effectiveEsp32Connected ? effectiveEsp32Data.temperature : null);
  const activeHumidity = sensorData.humidity    ?? (effectiveEsp32Connected ? effectiveEsp32Data.humidity    : null);
  const activeSoil     = sensorData.soilMoisture;

  const healthScore = useMemo(() => {
    const thresholds = getCropThresholds(cropProfile);
    return computeHealthScore({
      soilMoisture: activeSoil,
      humidity:     activeHumidity,
      temperature:  activeTemp,
      lightLevel:   sensorData.lightLevel,
      thresholds,
    });
  }, [activeSoil, activeHumidity, activeTemp, sensorData.lightLevel, cropProfile]);

  const alertsRef = useRef(alerts);
  useEffect(() => { alertsRef.current = alerts; }, [alerts]);

  useEffect(() => {
    if (!cropProfile?.cropName) return;

    const thresholds = getCropThresholds(cropProfile);
    const now        = Date.now();
    const newAlerts  = [];

    const addAlert = (typeKey, value, minVal, maxVal, titleFns) => {
      if (value == null) return;
      const isHigh     = value > maxVal;
      const isViolated = value < minVal || isHigh;
      if (!isViolated) return;

      const hasUnread = alertsRef.current.some(a => a.type_key === typeKey && !a.read);
      if (hasUnread) return;

      const same = alertsRef.current.filter(a => a.type_key === typeKey);
      if (same.length > 0) {
        const last    = same.reduce((l, c) => c.timestamp > l.timestamp ? c : l, same[0]);
        if (now - last.timestamp < 15 * 60 * 1000) return;
      }

      const limit = isHigh ? maxVal : minVal;
      const title = titleFns[lang]?.(value, limit) ?? titleFns.en(value, limit);

      newAlerts.push({
        id: now + Math.random(),
        type_key: typeKey,
        type: isHigh && typeKey !== 'temp' ? 'warning' : 'danger',
        title,
        zone: 'ENZOPONIK 1',
        timestamp: now,
        read: false,
      });
    };

    addAlert('soil', activeSoil, thresholds.minSoil, thresholds.overwaterAlert ?? 85, {
      en:  (v, l) => v < l ? `Low soil moisture: ${v}% (optimal: >=${l}%)`  : `Overwater risk on cocopeat: ${v}% (limit: <${l}%)`,
      id:  (v, l) => v < l ? `Kelembapan cocopeat rendah: ${v}% (ideal: >=${l}%)` : `Kelembapan cocopeat terlalu jenuh: ${v}% (batas: <${l}%)`,
      zh:  (v, l) => v < l ? `椰糠基质湿度偏低：${v}%（理想：>=${l}%）` : `椰糠基质过湿风险：${v}%（上限：<${l}%）`,
      jv:  (v, l) => v < l ? `Kelembapan cocopeat cendhek: ${v}% (ideal: >=${l}%)` : `Cocopeat kebacut teles: ${v}% (wates: <${l}%)`,
      ban: (v, l) => v < l ? `Kelembaban cocopeat bawak: ${v}% (optimal: >=${l}%)` : `Kelembaban cocopeat kelangkung belus: ${v}% (batas: <${l}%)`,
    });

    addAlert('temp', activeTemp, thresholds.minTemp, thresholds.maxTemp, {
      en:  (v, l) => v < l ? `Low temperature: ${v.toFixed(1)}°C (optimal: >${l}°C)`  : `High temperature: ${v.toFixed(1)}°C (optimal: <${l}°C)`,
      id:  (v, l) => v < l ? `Suhu rendah terdeteksi: ${v.toFixed(1)}°C (optimal: >${l}°C)` : `Suhu tinggi terdeteksi: ${v.toFixed(1)}°C (optimal: <${l}°C)`,
      zh:  (v, l) => v < l ? `检测到低温：${v.toFixed(1)}°C（理想：>${l}°C）` : `检测到高温：${v.toFixed(1)}°C（理想：<${l}°C）`,
      jv:  (v, l) => v < l ? `Suhu adhem kadeteksi: ${v.toFixed(1)}°C (optimal: >${l}°C)` : `Suhu panas kadeteksi: ${v.toFixed(1)}°C (optimal: <${l}°C)`,
      ban: (v, l) => v < l ? `Suhu dingin kapanggihin: ${v.toFixed(1)}°C (optimal: >${l}°C)` : `Suhu panes kapanggihin: ${v.toFixed(1)}°C (optimal: <${l}°C)`,
    });

    addAlert('hum', activeHumidity, thresholds.minHum, thresholds.maxHum, {
      en:  (v, l) => v < l ? `Low air humidity: ${v}% (optimal: >${l}%)`  : `High air humidity: ${v}% (optimal: <${l}%)`,
      id:  (v, l) => v < l ? `Kelembapan udara rendah: ${v}% (optimal: >${l}%)` : `Kelembapan udara tinggi: ${v}% (optimal: <${l}%)`,
      zh:  (v, l) => v < l ? `空气湿度偏低：${v}%（理想：>${l}%）` : `空气湿度偏高：${v}%（理想：<${l}%）`,
      jv:  (v, l) => v < l ? `Kelembapan hawa cendhek: ${v}% (optimal: >${l}%)` : `Kelembapan hawa dhuwur: ${v}% (optimal: <${l}%)`,
      ban: (v, l) => v < l ? `Kelembaban udara bawak: ${v}% (optimal: >${l}%)`  : `Kelembaban udara tegeh: ${v}% (optimal: <${l}%)`,
    });

    if (newAlerts.length > 0) {
      setAlerts((prev) => persistAlerts([...newAlerts, ...prev].slice(0, 20)));
    }
  }, [activeSoil, activeTemp, activeHumidity, cropProfile, lang, persistAlerts]);

  const markAlertRead = useCallback((id) => {
    setAlerts((prev) => persistAlerts(prev.map((a) => (a.id === id ? { ...a, read: true } : a))));
    if (typeof id === 'string') {
      markFirebaseAlertRead(id);
    }
  }, [persistAlerts]);

  const formattedAlerts = useMemo(
    () =>
      alerts.map((a) => {
        const tsMs = typeof a.timestamp === 'number'
          ? a.timestamp
          : (a.timestamp?.toDate?.()?.getTime() ?? (Date.parse(a.timestamp) || null));
        return {
          ...a,
          time: tsMs ? formatRelativeTime(tsMs, lang) : (typeof a.time === 'string' ? a.time : ''),
        };
      }),
    [alerts, lang]
  );

  const unreadAlertCount = useMemo(
    () => formattedAlerts.filter((a) => !a.read).length,
    [formattedAlerts]
  );

  return (
    <DataContext.Provider value={{
      realWeather, sensorData, healthScore,
      alerts: formattedAlerts, markAlertRead, unreadAlertCount,
      backendConnected: effectiveBackendConnected,
      firebaseConnected,
      esp32Data: effectiveEsp32Data,
      esp32Connected: effectiveEsp32Connected,
      detectedNodeId,
      lastSeenSecondsAgo,
      lastHeartbeatMs,
      deviceUptimeSec,
      pumpActive,
      pumpDurationSec,
      locationConfig, updateLocationConfig,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
}
