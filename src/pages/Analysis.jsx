import { useState, useCallback, useMemo, useRef } from 'react';
import {
  ChevronRight,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Loader,
  Sun,
  CloudRain,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import { getIntlLocale } from '../locales/translations';
import { runTopicInsight } from '../lib/agronomyService';
import { ShiningText } from '../components/ui/ShiningText';
import './Analysis.css';

const AI_INSIGHTS = [
  {
    type: 'warning',
    icon: AlertTriangle,
    titleKey: 'soil_moisture_alert',
    topic: 'soil moisture levels and irrigation needs',
    boxClass: 'rep-icon-circle--amber',
  },
  {
    type: 'info',
    icon: TrendingUp,
    titleKey: 'harvest_forecast',
    topic: 'harvest timeline and readiness',
    boxClass: 'rep-icon-circle--emerald',
  },
];

const DAY_ABBR = {
  Sun: { en: 'Sun', id: 'Min', zh: '周日', jv: 'Min', ban: 'Rad' },
  Mon: { en: 'Mon', id: 'Sen', zh: '周一', jv: 'Sen', ban: 'Som' },
  Tue: { en: 'Tue', id: 'Sel', zh: '周二', jv: 'Sel', ban: 'Ang' },
  Wed: { en: 'Wed', id: 'Rab', zh: '周三', jv: 'Reb', ban: 'Bud' },
  Thu: { en: 'Thu', id: 'Kam', zh: '周四', jv: 'Kem', ban: 'Wra' },
  Fri: { en: 'Fri', id: 'Jum', zh: '周五', jv: 'Jem', ban: 'Suk' },
  Sat: { en: 'Sat', id: 'Sab', zh: '周六', jv: 'Set', ban: 'San' },
};

const JAVA_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rebo', 'Kemis', 'Jemuwah', 'Setu'];
const BALI_DAYS = ['Radite', 'Soma', 'Anggara', 'Buda', 'Wraspati', 'Sukra', 'Saniscara'];

function getDayName(date, langCode) {
  if (langCode === 'ban') return BALI_DAYS[date.getDay()];
  if (langCode === 'jv') return JAVA_DAYS[date.getDay()];
  return date.toLocaleDateString(getIntlLocale(langCode), { weekday: 'long' });
}

export default function Analysis() {
  const { sensorData, esp32Data, healthScore, realWeather, esp32Connected } = useData();
  const { harvestInfo, cropProfile } = useUser();
  const { lang, t } = useLang();

  const [openInsights, setOpenInsights] = useState({});
  const [insightDescs, setInsightDescs] = useState({});
  const [insightLoading, setInsightLoading] = useState({});
  const [forecastMode, setForecastMode] = useState('hourly');

  const hourlyTabRef = useRef(null);
  const dailyTabRef = useRef(null);
  const insightDescsRef = useRef(insightDescs);
  insightDescsRef.current = insightDescs;

  const generateInsightDesc = useCallback(async (idx, topic) => {
    if (insightDescsRef.current[idx]) return;
    setInsightLoading((prev) => ({ ...prev, [idx]: true }));
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

    setInsightDescs((prev) => ({ ...prev, [idx]: res.success ? res.text : res.error }));
    setInsightLoading((prev) => ({ ...prev, [idx]: false }));
  }, [sensorData, esp32Data, esp32Connected, healthScore, realWeather, cropProfile, harvestInfo, lang, t]);

  const handleInsightToggle = useCallback((idx, topic, isOpen) => {
    setOpenInsights((prev) => ({ ...prev, [idx]: isOpen }));
    if (isOpen) {
      generateInsightDesc(idx, topic);
    }
  }, [generateInsightDesc]);

  const handleTabKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = forecastMode === 'hourly' ? 'daily' : 'hourly';
      setForecastMode(next);
      (next === 'hourly' ? hourlyTabRef : dailyTabRef).current?.focus();
    }
  };

  const currentDayName = useMemo(() => getDayName(new Date(), lang), [lang]);
  const currentTemp = Math.round(sensorData.temperature || 29);
  const rainProb = realWeather.hourly?.[0]?.rain || 0;
  const humidityVal = sensorData.humidity || 70;
  const windVal = realWeather.windSpeed || 18;

  return (
    <main className="rep-page">
      <div className="rep-container">
        <header className="rep-header">
          <h1 className="rep-title">{t('nav_analysis', 'Laporan')}</h1>
          <div className="rep-loc-pill">
            <MapPin size={13} className="rep-loc-pill__icon" aria-hidden="true" />
            <span>
              {realWeather.cityKey
                ? `${t(realWeather.cityKey)}${realWeather.country ? `, ${realWeather.country}` : ''}`
                : realWeather.city
                  ? `${realWeather.city}${realWeather.country ? `, ${realWeather.country}` : ''}`
                  : t('detecting_location')}
            </span>
          </div>
        </header>

        <section className="rep-weather-card" aria-label={t('climate_summary')}>
          <div className="rep-weather-main">
            <div className="rep-weather-left">
              <div className="rep-weather-badge" aria-hidden="true">
                {rainProb > 30 ? <CloudRain size={22} /> : <Sun size={22} />}
              </div>
              <div className="rep-weather-temp-wrap">
                <span className="rep-weather-temp-num">{currentTemp}</span>
                <span className="rep-weather-temp-deg">°C</span>
              </div>
            </div>
            <div className="rep-weather-right">
              <span className="rep-weather-day">{currentDayName}</span>
              <span className="rep-weather-desc">
                {realWeather.descKey ? t(realWeather.descKey) : (realWeather.description || t('partly_sunny'))}
              </span>
            </div>
          </div>

          <div className="rep-weather-metrics">
            <div className="rep-metric-col">
              <span className="rep-metric-val">{rainProb}%</span>
              <span className="rep-metric-lbl">{t('rain_chance')}</span>
            </div>
            <div className="rep-metric-divider" aria-hidden="true" />
            <div className="rep-metric-col">
              <span className="rep-metric-val">{humidityVal}%</span>
              <span className="rep-metric-lbl">{t('humidity')}</span>
            </div>
            <div className="rep-metric-divider" aria-hidden="true" />
            <div className="rep-metric-col">
              <span className="rep-metric-val">{windVal} {t('wind_unit')}</span>
              <span className="rep-metric-lbl">{t('wind_speed')}</span>
            </div>
          </div>

          <div className="rep-card-divider" aria-hidden="true" />

          <div className="rep-forecast-header">
            <span className="rep-forecast-title">
              {t('field_weather_forecast')}
            </span>
            <div
              className="rep-forecast-toggle"
              role="tablist"
              aria-label={t('forecast_interval')}
              onKeyDown={handleTabKeyDown}
            >
              <button
                ref={hourlyTabRef}
                id="rep-tab-hourly"
                type="button"
                role="tab"
                aria-selected={forecastMode === 'hourly'}
                tabIndex={forecastMode === 'hourly' ? 0 : -1}
                className="rep-toggle-btn"
                onClick={() => setForecastMode('hourly')}
              >
                {t('hourly')}
              </button>
              <button
                ref={dailyTabRef}
                id="rep-tab-daily"
                type="button"
                role="tab"
                aria-selected={forecastMode === 'daily'}
                tabIndex={forecastMode === 'daily' ? 0 : -1}
                className="rep-toggle-btn"
                onClick={() => setForecastMode('daily')}
              >
                {t('daily')}
              </button>
            </div>
          </div>

          <div
            role="tabpanel"
            aria-labelledby="rep-tab-hourly"
            hidden={forecastMode !== 'hourly'}
          >
            <div className="rep-forecast-strip">
              {realWeather.hourly && realWeather.hourly.length > 0 ? (
                realWeather.hourly.slice(0, 3).map((h, idx) => (
                  <div
                    key={idx}
                    className={`rep-forecast-pill ${idx === 0 ? 'rep-forecast-pill--active' : ''}`}
                  >
                    <span className="rep-forecast-time">{h.time}</span>
                    {h.rain > 30 ? (
                      <CloudRain size={15} className="rep-forecast-icon--rain" aria-hidden="true" />
                    ) : (
                      <Sun size={15} className="rep-forecast-icon--sun" aria-hidden="true" />
                    )}
                    <span className="rep-forecast-temp">{h.temp}°</span>
                    <span className="rep-forecast-sub">{t('hourly_rain', { pct: h.rain })}</span>
                  </div>
                ))
              ) : (
                <div className="rep-forecast-empty">
                  {t('hourly_unavailable')}
                </div>
              )}
            </div>
          </div>

          <div
            role="tabpanel"
            aria-labelledby="rep-tab-daily"
            hidden={forecastMode !== 'daily'}
          >
            <div className="rep-forecast-strip">
              {realWeather.daily && realWeather.daily.length > 0 ? (
                realWeather.daily.slice(0, 3).map((d, idx) => (
                  <div
                    key={idx}
                    className={`rep-forecast-pill ${idx === 0 ? 'rep-forecast-pill--active' : ''}`}
                  >
                    <span className="rep-forecast-time">
                      {DAY_ABBR[d.day]?.[lang] || DAY_ABBR[d.day]?.en || d.day}
                    </span>
                    <Sun size={15} className="rep-forecast-icon--sun" aria-hidden="true" />
                    <span className="rep-forecast-temp">{d.tempMax}°</span>
                    <span className="rep-forecast-sub">{d.tempMin}° min</span>
                  </div>
                ))
              ) : (
                <div className="rep-forecast-empty">
                  {t('daily_unavailable')}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rep-group-wrap" aria-labelledby="rep-insights-heading">
          <div className="rep-section-hd">
            <h2 id="rep-insights-heading" className="rep-section-title">
              {t('ai_insights').toUpperCase()}
            </h2>
          </div>

          <div className="rep-card-group">
            {AI_INSIGHTS.map((insight, idx) => {
              const Icon = insight.icon;
              const isOpen = Boolean(openInsights[idx]);
              return (
                <details
                  key={idx}
                  className="rep-insight-item"
                  onToggle={(e) => handleInsightToggle(idx, insight.topic, e.currentTarget.open)}
                >
                  <summary className="rep-row">
                    <div className={`rep-row__icon-circle ${insight.boxClass}`} aria-hidden="true">
                      <Icon size={17} />
                    </div>
                    <div className="rep-row__content">
                      <span className="rep-row__label">{t(insight.titleKey)}</span>
                      <span className="rep-row__value">
                        {isOpen ? t('close_recommendation') : t('tap_for_ai_analysis')}
                      </span>
                    </div>
                    <ChevronRight size={17} className="rep-chevron" aria-hidden="true" />
                  </summary>

                  <div className="rep-insight-desc-box">
                    {insightLoading[idx] ? (
                      <div className="rep-insight-loading" role="status" aria-live="polite">
                        <Loader size={14} className="rep-spin" aria-hidden="true" />
                        <ShiningText text={t('generating_insight')} />
                      </div>
                    ) : (
                      <p className="rep-insight-text">
                        {insightDescs[idx] || '…'}
                      </p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
