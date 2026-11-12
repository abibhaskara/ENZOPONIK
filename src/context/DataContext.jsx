import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getLatestObservations } from '../lib/api';
import { useMqtt } from '../lib/useMqtt';
import { useUser } from './UserContext';
import { useLang } from './LanguageContext';
import {
  subscribeToLiveTelemetry,
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
  mapWmoToTheme,
  convertOwmToWmo,
  formatRelativeTime,
} from '../lib/cropUtils';

const DataContext = createContext(null);

const LOCATION_KEY = 'enzoponik_location_config';

const DEFAULT_LOCATION = {
  isLocked: false,
  latitude: -8.409518,  
  longitude: 115.188919,
};

function loadLocationConfig() {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_LOCATION;
  } catch {
    return DEFAULT_LOCATION;
  }
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DataProvider({ children }) {
  const { lang } = useLang();
  const { activeDeviceId, subscriptionTier } = useUser();
  const [locationConfig, setLocationConfig] = useState(() => loadLocationConfig());

  const updateLocationConfig = useCallback((partial) => {
    setLocationConfig(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem(LOCATION_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  
  const { esp32Data, esp32Connected, esp32Error } = useMqtt();
  const [weatherState, setWeatherState] = useState('sunny');

  const [realWeather, setRealWeather] = useState({
    city: null, country: null, description: null, emoji: null,
    windSpeed: null, uvIndex: null, daily: [], hourly: [],
    loading: true, error: null,
  });

  const [sensorData, setSensorData] = useState({
    soilMoisture: null, lightLevel: null, uvIndex: null,
    rainfall: null, windSpeed: null, temperature: null, humidity: null,
  });

  const [sprinklers, setSprinklers] = useState({ A: false, B: false, C: false, D: false });

  const [alerts, setAlerts] = useState(() => {
    try {
      const stored = localStorage.getItem('enzoponik_alerts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [backendConnected, setBackendConnected] = useState(false);
  const backendConnectedRef = useRef(false);
  const [firebaseConnected, setFirebaseConnected] = useState(false);

  // Real-time Firestore sync (active device telemetry + fallback live telemetry)
  useEffect(() => {
    // 1. Listen to active device liveTelemetry if claimed
    let unsubDevice = () => {};
    if (activeDeviceId) {
      unsubDevice = subscribeToDevice(activeDeviceId, (device) => {
        if (!device || !device.liveTelemetry) return;
        const tel = device.liveTelemetry;
        setSensorData(prev => ({
          ...prev,
          soilMoisture: tel.soilMoisture ?? prev.soilMoisture,
          temperature:  tel.temperature  ?? prev.temperature,
          humidity:     tel.humidity     ?? prev.humidity,
          lightLevel:   tel.lightLevel   ?? prev.lightLevel,
          uvIndex:      tel.uvIndex      ?? prev.uvIndex,
          windSpeed:    tel.windSpeed    ?? prev.windSpeed,
          rainfall:     tel.rainfall     ?? prev.rainfall,
        }));
        setFirebaseConnected(true);
      });
    }

    // 2. Global live telemetry listener
    const unsubTelemetry = subscribeToLiveTelemetry((telemetry) => {
      if (!telemetry) return;
      setSensorData(prev => ({
        ...prev,
        soilMoisture: telemetry.soilMoisture ?? prev.soilMoisture,
        temperature:  telemetry.temperature  ?? prev.temperature,
        humidity:     telemetry.humidity     ?? prev.humidity,
        lightLevel:   telemetry.lightLevel   ?? prev.lightLevel,
        uvIndex:      telemetry.uvIndex      ?? prev.uvIndex,
        windSpeed:    telemetry.windSpeed    ?? prev.windSpeed,
        rainfall:     telemetry.rainfall     ?? prev.rainfall,
      }));
      setFirebaseConnected(true);
    });

    const unsubAlerts = subscribeToAlerts((fbAlerts) => {
      if (Array.isArray(fbAlerts) && fbAlerts.length > 0) {
        setAlerts(fbAlerts);
      }
    });

    return () => {
      unsubDevice();
      unsubTelemetry();
      unsubAlerts();
    };
  }, [activeDeviceId]);

  // Automated Daily Snapshot Recorder (1 per day per device with Freemium TTL)
  useEffect(() => {
    if (!activeDeviceId) return;
    const today = new Date().toISOString().slice(0, 10);
    const markerKey = `enzoponik_snapshot_${activeDeviceId}_${today}`;
    if (localStorage.getItem(markerKey)) return;

    const timer = setTimeout(() => {
      saveDailySnapshot(activeDeviceId, {
        date: today,
        avgTemp: sensorData.temperature ?? 27.5,
        avgHumidity: sensorData.humidity ?? 78,
        avgMoisture: sensorData.soilMoisture ?? 70,
        healthScore: 92,
      }, subscriptionTier);
      localStorage.setItem(markerKey, 'recorded');
    }, 6000);

    return () => clearTimeout(timer);
  }, [activeDeviceId, subscriptionTier, sensorData.temperature, sensorData.humidity, sensorData.soilMoisture]);


  
  const fetchSensorData = useCallback(async () => {
    try {
      const data = await getLatestObservations();
      if (!Array.isArray(data) || data.length === 0) return;

      const targetNodeId = import.meta.env.VITE_TARGET_NODE_ID || 'b37eae24f4f1a39d49cd64a0a2c3430e';
      const node = data.find(n =>
        n.node_id === targetNodeId || n.node === targetNodeId || n.id === targetNodeId
      ) || data[0];

      if (node) {
        setSensorData(prev => ({
          ...prev,
          soilMoisture: node.soilMoisture != null ? parseFloat(node.soilMoisture.toFixed(1)) : prev.soilMoisture,
          lightLevel:   node.lightLevel   != null ? parseFloat(node.lightLevel.toFixed(1))   : prev.lightLevel,
          temperature:  node.temperature  != null ? parseFloat(node.temperature.toFixed(1))  : prev.temperature,
          humidity:     node.humidity     != null ? parseFloat(node.humidity.toFixed(1))     : prev.humidity,
        }));
      }

      if (!backendConnectedRef.current) {
        console.info(`[ENZOPONIK API] Connected — ${data.length} node(s) online`);
        backendConnectedRef.current = true;
        setBackendConnected(true);
      }
    } catch (err) {
      if (backendConnectedRef.current) {
        console.warn('[ENZOPONIK API] Backend unreachable:', err.message);
        backendConnectedRef.current = false;
        setBackendConnected(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchSensorData();
    const poll = setInterval(fetchSensorData, 10_000);
    return () => clearInterval(poll);
  }, [fetchSensorData]);

  
  const fetchWeather = useCallback(async (lat, lon) => {
    try {
      const owmKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
      if (!owmKey) {
        console.warn('[fetchWeather] VITE_OPENWEATHER_API_KEY is not configured.');
        setRealWeather(prev => ({ ...prev, loading: false, error: 'Weather API key missing' }));
        return;
      }
      const [weatherRes, forecastRes] = await Promise.all([
        fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${owmKey}`),
        fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${owmKey}`),
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

      const wmoCode       = convertOwmToWmo(owmCode);
      const { desc, emoji } = getWmoInfo(wmoCode);
      const theme         = mapWmoToTheme(wmoCode, isDay);

      
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
            const { desc: dDesc, emoji: dEmoji } = getWmoInfo(convertOwmToWmo(commonCode), true);
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

      
      const city    = weatherData.name || null;
      const country = weatherData.sys?.country || null;

      setWeatherState(theme);
      setRealWeather({ city, country, description: desc, emoji, windSpeed: windSpeedKmh, uvIndex, daily: dailyForecasts, hourly: hourlyForecasts, loading: false, error: null });
      setSensorData(prev => ({ ...prev, temperature, humidity, windSpeed: windSpeedKmh, uvIndex, rainfall: theme === 'rainy' ? 8 : 0 }));
    } catch (err) {
      console.error('[fetchWeather] error:', err);
      setRealWeather(prev => ({ ...prev, loading: false, error: err.message }));
    }
  }, []);

  
  useEffect(() => {
    const doFetch = () => {
      if (locationConfig.isLocked && locationConfig.latitude != null && locationConfig.longitude != null) {
        fetchWeather(Number(locationConfig.latitude), Number(locationConfig.longitude));
        return;
      }
      if (!navigator.geolocation) {
        setRealWeather(prev => ({ ...prev, loading: false, error: 'Geolocation not supported' }));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => setRealWeather(prev => ({ ...prev, loading: false, error: 'Location access denied' })),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    };

    doFetch();
    const refresh = setInterval(doFetch, 10 * 60 * 1000);
    return () => clearInterval(refresh);
  }, [fetchWeather, locationConfig.isLocked, locationConfig.latitude, locationConfig.longitude]);

  
  const { cropProfile } = useUser();

  const effectiveEsp32Connected = esp32Connected || firebaseConnected;
  const effectiveBackendConnected = backendConnected || firebaseConnected;
  const effectiveEsp32Data = esp32Data;

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

    addAlert('soil', activeSoil, thresholds.minSoil, thresholds.maxSoil, {
      en:  (v, l) => v < l ? `Low soil moisture: ${v}% (optimal: >${l}%)`  : `High soil moisture: ${v}% (optimal: <${l}%)`,
      id:  (v, l) => v < l ? `Kelembapan tanah rendah: ${v}% (optimal: >${l}%)` : `Kelembapan tanah tinggi: ${v}% (optimal: <${l}%)`,
      ban: (v, l) => v < l ? `Kelembaban tanah bawak: ${v}% (optimal: >${l}%)`  : `Kelembaban tanah tegeh: ${v}% (optimal: <${l}%)`,
    });

    addAlert('temp', activeTemp, thresholds.minTemp, thresholds.maxTemp, {
      en:  (v, l) => v < l ? `Low temperature: ${v.toFixed(1)}°C (optimal: >${l}°C)`  : `High temperature: ${v.toFixed(1)}°C (optimal: <${l}°C)`,
      id:  (v, l) => v < l ? `Suhu rendah terdeteksi: ${v.toFixed(1)}°C (optimal: >${l}°C)` : `Suhu tinggi terdeteksi: ${v.toFixed(1)}°C (optimal: <${l}°C)`,
      ban: (v, l) => v < l ? `Suhu dingin kapanggihin: ${v.toFixed(1)}°C (optimal: >${l}°C)` : `Suhu panes kapanggihin: ${v.toFixed(1)}°C (optimal: >${l}°C)`,
    });

    addAlert('hum', activeHumidity, thresholds.minHum, thresholds.maxHum, {
      en:  (v, l) => v < l ? `Low air humidity: ${v}% (optimal: >${l}%)`  : `High air humidity: ${v}% (optimal: <${l}%)`,
      id:  (v, l) => v < l ? `Kelembapan udara rendah: ${v}% (optimal: >${l}%)` : `Kelembapan udara tinggi: ${v}% (optimal: <${l}%)`,
      ban: (v, l) => v < l ? `Kelembaban udara bawak: ${v}% (optimal: >${l}%)`  : `Kelembaban udara tegeh: ${v}% (optimal: <${l}%)`,
    });

    if (newAlerts.length > 0) {
      setAlerts(prev => {
        const next = [...newAlerts, ...prev].slice(0, 20);
        try { localStorage.setItem('enzoponik_alerts', JSON.stringify(next)); }
        catch (e) { console.warn('[Storage] failed to save alerts:', e.message); }
        return next;
      });
    }
  }, [activeSoil, activeTemp, activeHumidity, cropProfile, lang]);

  
  const toggleSprinkler = useCallback((zoneId) =>
    setSprinklers(prev => ({ ...prev, [zoneId]: !prev[zoneId] }))
  , []);

  
  const persistAlerts = (next) => {
    try { localStorage.setItem('enzoponik_alerts', JSON.stringify(next)); }
    catch (e) { console.warn('[Storage] failed to save alerts:', e.message); }
    return next;
  };

  const markAlertRead = useCallback((id) => {
    setAlerts(prev => persistAlerts(prev.map(a => a.id === id ? { ...a, read: true } : a)));
    markFirebaseAlertRead(id);
  }, []);

  
  const formattedAlerts = useMemo(() =>
    alerts.map(a => ({
      ...a,
      time: a.timestamp ? formatRelativeTime(a.timestamp, lang) : a.time,
    }))
  , [alerts, lang]);

  const unreadAlertCount = useMemo(
    () => formattedAlerts.filter(a => !a.read).length,
    [formattedAlerts]
  );

  return (
    <DataContext.Provider value={{
      weatherState, realWeather, sensorData, healthScore,
      sprinklers, toggleSprinkler,
      alerts: formattedAlerts, markAlertRead, unreadAlertCount,
      backendConnected: effectiveBackendConnected,
      firebaseConnected,
      esp32Data: effectiveEsp32Data,
      esp32Connected: effectiveEsp32Connected,
      esp32Error,
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
