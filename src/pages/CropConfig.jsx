import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Check,
  Leaf,
  Calendar,
  Sprout,
  Clock,
  MapPin,
  Bot,
  AlertTriangle,
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import { SMART_CROPS, findCropPreset, getLocalizedCropText } from '../lib/cropUtils';
import { updateDeviceControl } from '../lib/firebaseService';
import { generateCustomCropRule } from '../lib/agronomyService';
import { ShiningText } from '../components/ui/ShiningText';
import './CropConfig.css';

function buildSavedRuleSnapshot(profile, t) {
  if (!profile || profile.pumpOnThreshold == null) return null;
  return {
    plant_name: profile.cropName,
    scientific_name: profile.scientificName || '',
    is_compatible: true,
    compatibility_reason: t('saved_rule_compat_default'),
    alternative_plants: [],
    climate_adaptation: profile.climateAdaptation || '',
    harvest: {
      min_hst: Number(profile.minHst) || Number(profile.cycleDays) || 30,
      max_hst: Number(profile.maxHst) || Number(profile.cycleDays) || 35,
      harvest_type: profile.harvestType || 'sekali_panen',
    },
    moisture_substrate_pct: {
      ideal_min: Number(profile.pumpOnThreshold),
      ideal_max: Number(profile.pumpOffThreshold),
      pump_on_threshold: Number(profile.pumpOnThreshold),
      pump_off_threshold: Number(profile.pumpOffThreshold),
      critical_dry_alert: Number(profile.criticalDryAlert) || 40,
      overwater_alert: Number(profile.overwaterAlert) || 85,
    },
    temp_ideal_c: {
      ideal_min: Number(profile.tempIdealMin) || 20,
      ideal_max: Number(profile.tempIdealMax) || 28,
      max_tolerance: Number(profile.tempMaxTolerance) || 30,
    },
    vertical_cocopeat_guide: {
      substrate_mix: profile.substrateMix || '',
      tower_placement: profile.towerPlacement || '',
      technical_note: profile.technicalNote || '',
    },
  };
}

export default function CropConfig() {
  const navigate = useNavigate();
  const { user, activeDeviceId, updateUser } = useUser();
  const { lang, t } = useLang();

  const existingProfile = user?.cropProfile || null;
  const matchedCrop = findCropPreset(existingProfile?.cropName);

  const [selectedCropKey, setSelectedCropKey] = useState(() =>
    existingProfile?.cropName ? (matchedCrop ? matchedCrop.key : 'custom') : 'kangkung'
  );
  const [customName, setCustomName] = useState(() =>
    existingProfile?.cropName && !matchedCrop ? existingProfile.cropName : ''
  );
  const [envContext, setEnvContext] = useState(() =>
    existingProfile?.climateAdaptation && !matchedCrop ? existingProfile.climateAdaptation : ''
  );
  const [customCycle, setCustomCycle] = useState(() =>
    existingProfile?.cycleDays ? String(existingProfile.cycleDays) : '35'
  );
  const [plantedDate, setPlantedDate] = useState(() =>
    existingProfile?.plantedAt ? existingProfile.plantedAt.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  const [aiRule, setAiRule] = useState(() =>
    !matchedCrop ? buildSavedRuleSnapshot(existingProfile, t) : null
  );
  const [evaluating, setEvaluating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ruleError, setRuleError] = useState(null);

  const selectedCrop = useMemo(() => {
    const rawBase = SMART_CROPS.find((c) => c.key === selectedCropKey) || SMART_CROPS[0];
    const base = { ...rawBase, ...getLocalizedCropText(rawBase, lang) };
    if (selectedCropKey === 'custom') {
      if (aiRule && aiRule.is_compatible) {
        const m = aiRule.moisture_substrate_pct;
        const tp = aiRule.temp_ideal_c;
        const hv = aiRule.harvest;
        const g = aiRule.vertical_cocopeat_guide;
        return {
          ...base,
          name: aiRule.plant_name,
          nameEn: aiRule.plant_name,
          scientificName: aiRule.scientific_name,
          climate: aiRule.climate_adaptation || base.climate,
          minHst: hv.min_hst,
          maxHst: hv.max_hst,
          cycle: Number(customCycle) || hv.max_hst,
          harvestType: hv.harvest_type,
          soil: `${m.ideal_min}-${m.ideal_max}%`,
          temp: `${tp.ideal_min}-${tp.ideal_max}°C`,
          minSoil: m.pump_on_threshold,
          maxSoil: m.pump_off_threshold,
          criticalDry: m.critical_dry_alert,
          overwaterAlert: m.overwater_alert,
          minTemp: tp.ideal_min,
          maxTemp: tp.ideal_max,
          maxTolerance: tp.max_tolerance,
          substrateMix: g.substrate_mix || base.substrateMix,
          towerPlacement: g.tower_placement || base.towerPlacement,
          technicalNote: g.technical_note || base.technicalNote,
        };
      }
      return {
        ...base,
        name: customName.trim() || t('custom_crop_default'),
        nameEn: customName.trim() || 'Custom Crop',
        cycle: Number(customCycle) || 35,
      };
    }
    return base;
  }, [selectedCropKey, aiRule, customName, customCycle, lang, t]);

  const handleSelectPreset = (key) => {
    setSelectedCropKey(key);
    setRuleError(null);
  };

  const handleEvaluateAiRule = useCallback(async (overrideName = null) => {
    const targetName = (typeof overrideName === 'string' ? overrideName : customName).trim();
    if (!targetName) {
      setRuleError(t('enter_crop_first'));
      return null;
    }

    setEvaluating(true);
    setRuleError(null);
    try {
      const { rule } = await generateCustomCropRule({
        cropName: targetName,
        environmentContext: envContext,
        lang,
      });
      setAiRule(rule);
      if (rule?.is_compatible) {
        setCustomName(rule.plant_name);
        setCustomCycle(String(rule.harvest?.max_hst || rule.harvest?.min_hst || 35));
      }
      return rule;
    } catch (err) {
      setRuleError(err.message || t('eval_rule_failed'));
      return null;
    } finally {
      setEvaluating(false);
    }
  }, [customName, envContext, lang, t]);

  const handlePickAlternative = (altName) => {
    const preset = findCropPreset(altName);
    if (preset) {
      setSelectedCropKey(preset.key);
      setAiRule(null);
      setRuleError(null);
      return;
    }
    setCustomName(altName);
    handleEvaluateAiRule(altName);
  };

  const isCustomBlocked = selectedCropKey === 'custom' && aiRule?.is_compatible === false;

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (evaluating) return;
    setRuleError(null);

    try {
      let activeConfig = selectedCrop;

      if (selectedCropKey === 'custom') {
        const cleanCustom = customName.trim();
        if (!cleanCustom) {
          setRuleError(t('fill_crop_name'));
          return;
        }
        let rule = aiRule;
        if (!rule || rule.plant_name.toLowerCase() !== cleanCustom.toLowerCase()) {
          rule = await handleEvaluateAiRule(cleanCustom);
        }
        if (!rule || !rule.is_compatible) {
          return;
        }
        const m = rule.moisture_substrate_pct;
        const tp = rule.temp_ideal_c;
        const hv = rule.harvest;
        const g = rule.vertical_cocopeat_guide;
        activeConfig = {
          name: rule.plant_name,
          nameEn: rule.plant_name,
          scientificName: rule.scientific_name,
          climate: rule.climate_adaptation,
          minHst: hv.min_hst,
          maxHst: hv.max_hst,
          cycle: Number(customCycle) || hv.max_hst,
          harvestType: hv.harvest_type,
          minSoil: m.pump_on_threshold,
          maxSoil: m.pump_off_threshold,
          criticalDry: m.critical_dry_alert,
          overwaterAlert: m.overwater_alert,
          minTemp: tp.ideal_min,
          maxTemp: tp.ideal_max,
          maxTolerance: tp.max_tolerance,
          substrateMix: g.substrate_mix,
          towerPlacement: g.tower_placement,
          technicalNote: g.technical_note,
        };
      }

      setSaving(true);
      const cropLabel = activeConfig.name;

      const parsedDate = plantedDate ? new Date(plantedDate) : new Date();
      const safeIso = Number.isNaN(parsedDate.getTime())
        ? new Date().toISOString()
        : parsedDate.toISOString();

      const fallbackClimateByLang = {
        en: 'Tropical / Moderate',
        id: 'Tropis / Sedang',
        zh: '热带 / 温和',
        jv: 'Tropis / Sedhengan',
        ban: 'Tropis / Sedeng',
      };

      const newProfile = {
        cropName: cropLabel,
        scientificName: activeConfig.scientificName || '',
        variety: activeConfig.scientificName || 'Standard',
        growthStage: 'vegetative',
        plantedAt: safeIso,
        cycleDays: Number(activeConfig.cycle),
        minHst: Number(activeConfig.minHst),
        maxHst: Number(activeConfig.maxHst),
        harvestType: activeConfig.harvestType || 'sekali_panen',
        climateAdaptation: activeConfig.climate || fallbackClimateByLang[lang] || fallbackClimateByLang.en,
        irrigationMethod: 'cocopeat_hysteresis',
        useCustomThresholds: true,
        optimalMoisture: Math.round((activeConfig.minSoil + activeConfig.maxSoil) / 2),
        optimalTemp: Math.round((activeConfig.minTemp + activeConfig.maxTemp) / 2),
        optimalHumidity: Math.round(((activeConfig.minHum || 60) + (activeConfig.maxHum || 80)) / 2),
        pumpOnThreshold: Number(activeConfig.minSoil),
        pumpOffThreshold: Number(activeConfig.maxSoil),
        criticalDryAlert: Number(activeConfig.criticalDry),
        overwaterAlert: Number(activeConfig.overwaterAlert || 85),
        tempIdealMin: Number(activeConfig.minTemp),
        tempIdealMax: Number(activeConfig.maxTemp),
        tempMaxTolerance: Number(activeConfig.maxTolerance),
        substrateMix: activeConfig.substrateMix || '',
        towerPlacement: activeConfig.towerPlacement || '',
        technicalNote: activeConfig.technicalNote || '',
      };

      await updateUser({ cropProfile: newProfile });
      if (activeDeviceId) {
        await updateDeviceControl(
          {
            cropName: cropLabel,
            pumpOnThreshold: newProfile.pumpOnThreshold,
            pumpOffThreshold: newProfile.pumpOffThreshold,
            criticalDryAlert: newProfile.criticalDryAlert,
            overwaterAlert: newProfile.overwaterAlert,
          },
          activeDeviceId
        );
      }
      navigate('/');
    } catch (err) {
      console.error('[CropConfig] Save error:', err);
      setRuleError(err.message || t('save_config_failed'));
    } finally {
      setSaving(false);
    }
  }, [
    evaluating,
    selectedCrop,
    selectedCropKey,
    customName,
    aiRule,
    handleEvaluateAiRule,
    customCycle,
    lang,
    t,
    plantedDate,
    updateUser,
    activeDeviceId,
    navigate,
  ]);

  return (
    <main className="crop-page">
      <div className="crop-container">
        <div className="crop-topbar">
          <button
            type="button"
            className="crop-back-btn"
            onClick={() => navigate('/')}
            aria-label={t('back_to_dashboard')}
          >
            <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <header className="crop-header">
          <h1 id="crop-config-heading" className="crop-header__title">
            {t('crop_config_title')}
          </h1>
          <p className="crop-header__sub">
            {t('crop_config_subtitle')}
          </p>
        </header>

        <form className="crop-form" onSubmit={handleSubmit} aria-labelledby="crop-config-heading">

          <fieldset className="crop-fieldset">
            <legend className="crop-section-title">
              {t('choose_crop_legend')}
            </legend>

            <div className="crop-grid">
              {SMART_CROPS.map((crop) => {
                const isSelected = selectedCropKey === crop.key;
                const displayName = getLocalizedCropText(crop, lang).name;
                return (
                  <label
                    key={crop.key}
                    className={`crop-card ${isSelected ? 'crop-card--active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="crop-preset"
                      value={crop.key}
                      checked={isSelected}
                      onChange={() => handleSelectPreset(crop.key)}
                      className="visually-hidden"
                    />
                    <div className="crop-card__top">
                      <span className="crop-card__icon" aria-hidden="true">
                        {crop.key === 'custom' ? <Bot size={17} /> : <Leaf size={17} />}
                      </span>
                      {isSelected && (
                        <span className="crop-card__check" aria-hidden="true">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <div className="crop-card__meta">
                      <span className="crop-card__name">{displayName}</span>
                      <span className="crop-card__cycle">
                        {crop.key === 'custom'
                          ? t('ai_validation_badge')
                          : `${crop.minHst}-${crop.maxHst} ${t('hst_unit')}`}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {selectedCropKey === 'custom' && (
            <div className="crop-field-card">
              <div className="crop-field-group">
                <label htmlFor="crop-custom-name" className="crop-input-label">
                  {t('crop_name')} <span aria-hidden="true">*</span>
                </label>
                <div className="crop-pill-field">
                  <Sprout size={17} className="crop-pill-field__icon" aria-hidden="true" />
                  <input
                    id="crop-custom-name"
                    name="custom-name"
                    type="text"
                    enterKeyHint="next"
                    placeholder={t('crop_name_placeholder')}
                    value={customName}
                    onChange={(e) => {
                      setCustomName(e.target.value);
                      if (aiRule) setAiRule(null);
                    }}
                    required
                  />
                </div>
              </div>

              <div className="crop-field-group">
                <label htmlFor="crop-env-context" className="crop-input-label">
                  {t('env_context_label')}
                </label>
                <div className="crop-pill-field">
                  <MapPin size={17} className="crop-pill-field__icon" aria-hidden="true" />
                  <input
                    id="crop-env-context"
                    name="env-context"
                    type="text"
                    enterKeyHint="done"
                    placeholder={t('env_context_placeholder')}
                    value={envContext}
                    onChange={(e) => setEnvContext(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                className="crop-ai-eval-btn"
                onClick={() => handleEvaluateAiRule()}
                disabled={evaluating || !customName.trim()}
              >
                <Bot size={16} aria-hidden="true" />
                {evaluating ? (
                  <ShiningText text={t('eval_ai_loading')} />
                ) : (
                  <span>{t('eval_ai_btn')}</span>
                )}
              </button>

              {aiRule && aiRule.is_compatible && (
                <div className="crop-field-group">
                  <label htmlFor="crop-custom-cycle" className="crop-input-label">
                    {t('target_cycle_label')} <span aria-hidden="true">*</span>
                  </label>
                  <div className="crop-pill-field">
                    <Clock size={17} className="crop-pill-field__icon" aria-hidden="true" />
                    <input
                      id="crop-custom-cycle"
                      name="custom-cycle"
                      type="number"
                      inputMode="numeric"
                      placeholder="35"
                      min="10"
                      max="180"
                      value={customCycle}
                      onChange={(e) => setCustomCycle(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {aiRule && !aiRule.is_compatible && (
                <div className="crop-incompat-box" role="alert">
                  <div className="crop-incompat-box__hd">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>{t('incompat_title')}</span>
                  </div>
                  <p className="crop-incompat-box__reason">{aiRule.compatibility_reason}</p>
                  {aiRule.alternative_plants?.length > 0 && (
                    <div className="crop-incompat-box__alts">
                      <span className="crop-incompat-box__alt-lbl">{t('incompat_alternatives')}</span>
                      <div className="crop-alt-chips">
                        {aiRule.alternative_plants.map((alt) => (
                          <button
                            key={alt}
                            type="button"
                            className="crop-alt-chip"
                            onClick={() => handlePickAlternative(alt)}
                          >
                            {alt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {ruleError && (
                <p className="crop-rule-err" role="alert">{ruleError}</p>
              )}
            </div>
          )}

          <div className="crop-field-group">
            <label htmlFor="crop-planted-date" className="crop-section-title">
              {t('planted_date')}
            </label>
            <div className="crop-pill-field crop-pill-field--date">
              <Calendar size={17} className="crop-pill-field__icon" aria-hidden="true" />
              <input
                id="crop-planted-date"
                name="planted-date"
                type="date"
                value={plantedDate}
                onChange={(e) => setPlantedDate(e.target.value)}
                required
              />
            </div>
          </div>

          {!isCustomBlocked && (
            <section className="crop-ai-preset" aria-label={t('calibrated_rules_aria')}>
              <div className="crop-ai-preset__grid">
                <div className="crop-preset-item">
                  <span className="crop-preset-item__val">
                    {selectedCrop.minHst}-{selectedCrop.maxHst} {t('hst_unit')}
                  </span>
                  <span className="crop-preset-item__lbl">
                    {selectedCrop.harvestType === 'panen_berkala'
                      ? t('harvest_continuous')
                      : t('harvest_single')}
                  </span>
                </div>
                <div className="crop-preset-divider" aria-hidden="true" />
                <div className="crop-preset-item">
                  <span className="crop-preset-item__val">{selectedCrop.soil}</span>
                  <span className="crop-preset-item__lbl">
                    {t('pump_range_badge', { min: selectedCrop.minSoil, max: selectedCrop.maxSoil })}
                  </span>
                </div>
                <div className="crop-preset-divider" aria-hidden="true" />
                <div className="crop-preset-item">
                  <span className="crop-preset-item__val">{selectedCrop.temp}</span>
                  <span className="crop-preset-item__lbl">
                    {t('temp_max_badge', { max: selectedCrop.maxTolerance })}
                  </span>
                </div>
              </div>

              <div className="crop-guide-list">
                <div className="crop-guide-row">
                  <span className="crop-guide-lbl">{t('guide_media_lbl')}</span>
                  <span className="crop-guide-val">{selectedCrop.substrateMix}</span>
                </div>
                <div className="crop-guide-row">
                  <span className="crop-guide-lbl">{t('guide_placement_lbl')}</span>
                  <span className="crop-guide-val">{selectedCrop.towerPlacement}</span>
                </div>
                <div className="crop-guide-row">
                  <span className="crop-guide-lbl">{t('guide_critical_lbl')}</span>
                  <span className="crop-guide-val">
                    {t('guide_critical_val', {
                      dry: selectedCrop.criticalDry,
                      wet: selectedCrop.overwaterAlert,
                    })}
                  </span>
                </div>
                {selectedCrop.technicalNote && (
                  <p className="crop-guide-note">{selectedCrop.technicalNote}</p>
                )}
              </div>
            </section>
          )}

          <button
            type="submit"
            className="crop-submit-btn"
            disabled={saving || evaluating || isCustomBlocked}
          >
            <Check size={18} aria-hidden="true" />
            <span>{saving ? t('saving') : t('save_config')}</span>
          </button>
        </form>
      </div>
    </main>
  );
}
