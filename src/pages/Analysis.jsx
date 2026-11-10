import { useState, useCallback, useMemo, useRef } from 'react';
import {
  ChevronRight,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Loader,
  Sun,
  CloudRain
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import { runTopicInsight } from '../lib/agronomyService';
import './Analysis.css';

const AI_INSIGHTS = [
  {
    type: 'warning',
    icon: AlertTriangle,
    titleKey: 'soil_moisture_alert',
    topic: 'soil moisture levels and irrigation needs',
    boxClass: 'rep-icon-box--amber',
  },
  {
    type: 'info',
    icon: TrendingUp,
    titleKey: 'harvest_forecast',
    topic: 'harvest timeline and readiness',
    boxClass: 'rep-icon-box--emerald',
  },
];

const DAY_ABBR = {
  Sun: { en: 'Sun', id: 'Min', ban: 'Rad' },
  Mon: { en: 'Mon', id: 'Sen', ban: 'Som' },
  Tue: { en: 'Tue', id: 'Sel', ban: 'Ang' },
  Wed: { en: 'Wed', id: 'Rab', ban: 'Bud' },
  Thu: { en: 'Thu', id: 'Kam', ban: 'Wra' },
  Fri: { en: 'Fri', id: 'Jum', ban: 'Suk' },
  Sat: { en: 'Sat', id: 'Sab', ban: 'San' },
};

const BALI_DAYS = ['Radite', 'Soma', 'Anggara', 'Buda', 'Wraspati', 'Sukra', 'Saniscara'];

function getDayName(date, langCode) {
  if (langCode === 'ban') return BALI_DAYS[date.getDay()];
  return date.toLocaleDateString(langCode === 'id' ? 'id-ID' : 'en-US', { weekday: 'long' });
}

export default function Analysis() {
  const { sensorData, esp32Data, healthScore, realWeather, esp32Connected } = useData();
  const { harvestInfo, cropProfile } = useUser();
  const { lang, t } = useLang();

  const [expandedInsight, setExpandedInsight] = useState(null);
  const [insightDescs, setInsightDescs] = useState({});
  const [insightLoading, setInsightLoading] = useState({});
  const [forecastMode, setForecastMode] = useState('hourly'); // 'hourly' | 'daily'

  const insightDescsRef = useRef(insightDescs);
  insightDescsRef.current = insightDescs;

  const generateInsightDesc = useCallback(async (idx, topic) => {
    if (insightDescsRef.current[idx]) return;
    setInsightLoading(prev => ({ ...prev, [idx]: true }));
    const currentTemp = sensorData.temperature ?? (esp32Connected ? esp32Data.temperature : null);
    const currentHumidity = sensorData.humidity ?? (esp32Connected ? esp32Data.humidity : null);

    const res = await runTopicInsight({
      topic,
      sensorData,
      temperature: currentTemp,
      humidity: currentHumidity,
      healthScore,
      realWeather,
      cropProfile,
      harvestInfo,
      lang,
      t,
    });

    setInsightDescs(prev => ({ ...prev, [idx]: res.success ? res.text : res.error }));
    setInsightLoading(prev => ({ ...prev, [idx]: false }));
  }, [sensorData, esp32Data, esp32Connected, healthScore, realWeather, cropProfile, harvestInfo, lang, t]);

  const handleInsightClick = useCallback((idx, topic) => {
    setExpandedInsight(prev => {
      const isExpanded = prev === idx;
      if (!isExpanded) generateInsightDesc(idx, topic);
      return isExpanded ? null : idx;
    });
  }, [generateInsightDesc]);

  const currentDayName = useMemo(() => getDayName(new Date(), lang), [lang]);
  const currentTemp = Math.round(sensorData.temperature || 29);
  const rainProb = realWeather.hourly?.[0]?.rain || 0;
  const humidityVal = sensorData.humidity || 70;
  const windVal = realWeather.windSpeed || 18;

  return (
    <div className="rep-page">
      <div className="rep-container">
        {/* Header Title */}
        <header className="rep-header">
          <div className="rep-header__info">
            <h1 className="rep-title">{t('nav_analysis', 'Laporan')}</h1>
            <p className="rep-subtitle">Analisis cuaca mikroklimat, agronomi cerdas, dan proyeksi panen</p>
          </div>
          <div className="rep-loc-pill">
            <MapPin size={12} />
            <span>
              {realWeather.city
                ? `${realWeather.city}${realWeather.country ? ', ' + realWeather.country : ''}`
                : t('detecting_location')}
            </span>
          </div>
        </header>

        {/* WEATHER & CLIMATE SUMMARY CARD */}
        <div className="rep-weather-card">
          <div className="rep-weather-main">
            <div className="rep-weather-left">
              <div className="rep-weather-icon-box">
                <Sun size={28} />
              </div>
              <div className="rep-weather-temp-wrap">
                <span className="rep-weather-temp-num">{currentTemp}</span>
                <span className="rep-weather-temp-deg">°C</span>
              </div>
            </div>
            <div className="rep-weather-right">
              <span className="rep-weather-day">{currentDayName}</span>
              <span className="rep-weather-desc">{realWeather.description || t('partly_sunny')}</span>
            </div>
          </div>

          <div className="rep-weather-metrics">
            <div className="rep-metric-col">
              <span className="rep-metric-val">{rainProb}%</span>
              <span className="rep-metric-lbl">Curah Hujan</span>
            </div>
            <div className="rep-metric-divider" />
            <div className="rep-metric-col">
              <span className="rep-metric-val">{humidityVal}%</span>
              <span className="rep-metric-lbl">Kelembaban</span>
            </div>
            <div className="rep-metric-divider" />
            <div className="rep-metric-col">
              <span className="rep-metric-val">{windVal} km/j</span>
              <span className="rep-metric-lbl">Kecepatan Angin</span>
            </div>
          </div>

          {/* Forecast Header with Hourly vs Daily Toggle */}
          <div className="rep-forecast-header">
            <span className="rep-forecast-title">Prakiraan Cuaca Lahan</span>
            <div className="rep-forecast-toggle">
              <button
                type="button"
                className={`rep-toggle-btn ${forecastMode === 'hourly' ? 'rep-toggle-btn--active' : ''}`}
                onClick={() => setForecastMode('hourly')}
              >
                Per Jam
              </button>
              <button
                type="button"
                className={`rep-toggle-btn ${forecastMode === 'daily' ? 'rep-toggle-btn--active' : ''}`}
                onClick={() => setForecastMode('daily')}
              >
                Harian
              </button>
            </div>
          </div>

          {/* Hourly or Daily Forecast Strip */}
          {forecastMode === 'hourly' ? (
            <div className="rep-forecast-strip">
              {realWeather.hourly && realWeather.hourly.length > 0 ? (
                realWeather.hourly.map((h, idx) => (
                  <div
                    key={idx}
                    className={`rep-forecast-pill ${idx === 0 ? 'rep-forecast-pill--active' : ''}`}
                  >
                    <span className="rep-forecast-time">{h.time}</span>
                    {h.rain > 30 ? (
                      <CloudRain size={14} className="rep-forecast-icon--rain" />
                    ) : (
                      <Sun size={14} className="rep-forecast-icon--sun" />
                    )}
                    <span className="rep-forecast-temp">{h.temp}°</span>
                    <span className="rep-forecast-sub">{h.rain}% hujan</span>
                  </div>
                ))
              ) : (
                <div className="rep-forecast-empty">Data prakiraan per jam belum tersedia</div>
              )}
            </div>
          ) : (
            <div className="rep-forecast-strip">
              {realWeather.daily && realWeather.daily.length > 0 ? (
                realWeather.daily.slice(0, 7).map((d, idx) => (
                  <div
                    key={idx}
                    className={`rep-forecast-pill ${idx === 0 ? 'rep-forecast-pill--active' : ''}`}
                  >
                    <span className="rep-forecast-time">
                      {DAY_ABBR[d.day]?.[lang] || DAY_ABBR[d.day]?.en || d.day}
                    </span>
                    <Sun size={14} className="rep-forecast-icon--sun" />
                    <span className="rep-forecast-temp">{d.tempMax}°</span>
                    <span className="rep-forecast-sub">{d.tempMin}° min</span>
                  </div>
                ))
              ) : (
                <div className="rep-forecast-empty">Data prakiraan harian belum tersedia</div>
              )}
            </div>
          )}
        </div>

        {/* GRUP 1: INSIGHT AI */}
        <div className="rep-group-wrap">
          <div className="db-section-hd">
            <span className="section-title">INSIGHT AI</span>
            <span className="rep-section-badge">AGRONOMI CERDAS</span>
          </div>

          <div className="rep-card-group">
            {AI_INSIGHTS.map((insight, idx) => {
              const Icon = insight.icon;
              const isExpanded = expandedInsight === idx;
              return (
                <div key={idx} className="rep-insight-item">
                  <div
                    className="rep-row"
                    onClick={() => handleInsightClick(idx, insight.topic)}
                  >
                    <div className={`rep-row__icon-box ${insight.boxClass}`}>
                      <Icon size={16} />
                    </div>
                    <div className="rep-row__content">
                      <span className="rep-row__label">{t(insight.titleKey)}</span>
                      <span className="rep-row__value">
                        {isExpanded ? 'Tutup rekomendasi' : 'Ketuk untuk analisis AI'}
                      </span>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`rep-chevron ${isExpanded ? 'rep-chevron--open' : ''}`}
                    />
                  </div>

                  {isExpanded && (
                    <div className="rep-insight-desc-box">
                      {insightLoading[idx] ? (
                        <div className="rep-insight-loading">
                          <Loader size={14} className="rep-spin" />
                          <span>{t('generating_insight')}</span>
                        </div>
                      ) : (
                        <p className="rep-insight-text">
                          {insightDescs[idx] || '…'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
