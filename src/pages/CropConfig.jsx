import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Leaf,
  Sparkles,
  Cpu,
  Calendar,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import { SMART_CROPS } from '../lib/cropUtils';
import { saveUserCropProfile } from '../lib/firebaseService';
import './CropConfig.css';

export default function CropConfig() {
  const navigate = useNavigate();
  const { user, activeDeviceId, devices, updateUser } = useUser();
  const { lang, t } = useLang();

  const [selectedCropKey, setSelectedCropKey] = useState('pakcoy');
  const [customName, setCustomName] = useState('');
  const [customCycle, setCustomCycle] = useState('45');
  const [plantedDate, setPlantedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const selectedCrop = useMemo(() => {
    const base = SMART_CROPS.find(c => c.key === selectedCropKey) || SMART_CROPS[0];
    if (selectedCropKey === 'custom') {
      return {
        ...base,
        name: customName.trim() || 'Tanaman Kustom',
        nameEn: customName.trim() || 'Custom Crop',
        cycle: Number(customCycle) || 45,
      };
    }
    return base;
  }, [selectedCropKey, customName, customCycle]);

  const activeDevice = useMemo(() => {
    return devices?.find(d => d.id === activeDeviceId) || null;
  }, [devices, activeDeviceId]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      const cropLabel = selectedCropKey === 'custom'
        ? (customName.trim() || 'Tanaman Kustom')
        : (lang === 'en' ? selectedCrop.nameEn : selectedCrop.name);

      const newProfile = {
        cropName: cropLabel,
        variety: 'Standard',
        growthStage: 'vegetative',
        plantedAt: new Date(plantedDate).toISOString(),
        cycleDays: Number(selectedCrop.cycle),
        irrigationMethod: 'drip_irrigation',
        useCustomThresholds: false,
      };

      updateUser({
        cropProfile: newProfile,
      });

      if (user?.uid) {
        try {
          await saveUserCropProfile(user.uid, newProfile);
        } catch (e) {
          console.warn('[CropConfig] Firestore save warning:', e);
        }
      }

      navigate('/');
    } catch (err) {
      console.error('[CropConfig] Save error:', err);
      navigate('/');
    } finally {
      setSaving(false);
    }
  }, [selectedCropKey, customName, lang, selectedCrop, plantedDate, updateUser, user?.uid, navigate]);

  return (
    <div className="crop-root animate-in">
      {/* Topbar */}
      <div className="crop-topbar">
        <button
          type="button"
          className="crop-back-btn"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={16} />
          <span>Dashboard</span>
        </button>
      </div>

      {/* Header */}
      <div className="crop-header">
        <div className="crop-header__badge">
          <Sparkles size={12} />
          <span>Setup Menara IoT</span>
        </div>
        <h1 className="crop-header__title">Konfigurasi Tanaman</h1>
        <p className="crop-header__subtitle">
          Pilih komoditas yang sedang ditanam. AI HARU akan mengoptimalkan siklus panen, kebutuhan nutrisi, dan kelembapan ideal secara otomatis.
        </p>
      </div>

      {/* Verified Device Card */}
      <div className="crop-device-card">
        <div className="crop-device-card__icon">
          <Cpu size={20} />
        </div>
        <div className="crop-device-card__info">
          <span className="crop-device-card__tag">Menara Terverifikasi</span>
          <p className="crop-device-card__id">{activeDevice?.name || activeDeviceId || 'HARU-TOWER-01'}</p>
        </div>
        <div className="crop-device-card__status">
          <CheckCircle2 size={13} />
          <span>Terhubung</span>
        </div>
      </div>

      {/* Crop Selection Section */}
      <div className="crop-section-title">Pilih Komoditas Hidroponik</div>
      <div className="crop-grid">
        {SMART_CROPS.map((crop) => {
          const isSelected = selectedCropKey === crop.key;
          const displayName = lang === 'en' ? crop.nameEn : crop.name;
          return (
            <div
              key={crop.key}
              className={`crop-card ${isSelected ? 'crop-card--active' : ''}`}
              onClick={() => setSelectedCropKey(crop.key)}
            >
              <div className="crop-card__top">
                <div className="crop-card__icon">
                  <Leaf size={16} />
                </div>
                {isSelected && (
                  <div className="crop-card__check">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </div>
              <div>
                <p className="crop-card__name">{displayName}</p>
                <span className="crop-card__cycle">Siklus ~{crop.cycle} Hari</span>
                <p className="crop-card__desc">{crop.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Crop Inputs */}
      {selectedCropKey === 'custom' && (
        <div className="crop-input-wrap animate-in">
          <label className="crop-input-label">Nama Tanaman Kustom</label>
          <input
            type="text"
            className="crop-input"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Contoh: Mint, Kemangi, Kale..."
          />
          <div style={{ marginTop: 12 }}>
            <label className="crop-input-label">Estimasi Hari Panen (Hari)</label>
            <input
              type="number"
              className="crop-input"
              value={customCycle}
              onChange={(e) => setCustomCycle(e.target.value)}
              placeholder="Contoh: 40"
              min="10"
              max="180"
            />
          </div>
        </div>
      )}

      {/* Planting Date Selection */}
      <div className="crop-section-title">Waktu Tanam</div>
      <div className="crop-input-wrap">
        <label className="crop-input-label">Tanggal Mulai Tanam</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={16} color="#0c5e4a" />
          <input
            type="date"
            className="crop-input"
            value={plantedDate}
            onChange={(e) => setPlantedDate(e.target.value)}
          />
        </div>
      </div>

      {/* AI Preset Card */}
      <div className="crop-section-title">Preset Otomatis AI</div>
      <div className="crop-ai-preset">
        <div className="crop-ai-preset__head">
          <Sparkles size={16} />
          <span>Algoritma Presisi untuk {selectedCrop.name}</span>
        </div>
        <div className="crop-ai-preset__grid">
          <div className="crop-preset-item">
            <span className="crop-preset-item__lbl">Siklus Panen</span>
            <span className="crop-preset-item__val">{selectedCrop.cycle} Hari</span>
          </div>
          <div className="crop-preset-item">
            <span className="crop-preset-item__lbl">Target Lembap</span>
            <span className="crop-preset-item__val">{selectedCrop.soil}</span>
          </div>
          <div className="crop-preset-item">
            <span className="crop-preset-item__lbl">Suhu Optimal</span>
            <span className="crop-preset-item__val">{selectedCrop.temp}</span>
          </div>
        </div>
      </div>

      {/* Submit Action */}
      <div className="crop-action-bar">
        <button
          type="button"
          className="crop-submit-btn"
          onClick={handleSave}
          disabled={saving}
        >
          <Check size={18} />
          <span>{saving ? 'Menyimpan...' : 'Simpan & Aktifkan Menara'}</span>
        </button>
      </div>
    </div>
  );
}

