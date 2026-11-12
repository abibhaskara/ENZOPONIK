import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  Sliders,
  Bell,
  Globe,
  RefreshCw,
  Wifi,
  ShieldCheck,
  User,
  MapPin,
  Compass,
  Sparkles,
  Cpu,
  Cloud,
  Lock,
  Camera,
  Check,
  KeyRound,
  Copy,
  Plus,
  X,
  Radio,
  AlertCircle,
  Droplets,
  HardDrive,
  Trash2,
  Bot,
  Leaf
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { useLang, LANGUAGES } from '../context/LanguageContext';
import { updateDeviceControl } from '../lib/firebaseService';
import { generateDeviceId } from '../lib/deviceService';
import './Settings.css';

const AVATAR_PRESETS = [
  { name: 'Sophie', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sophie' },
  { name: 'Felix', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Felix' },
  { name: 'Jasper', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Jasper' },
  { name: 'Milo', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Milo' },
  { name: 'Luna', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Luna' },
];

export default function Settings() {
  const {
    locationConfig,
    updateLocationConfig,
    realWeather,
  } = useData();

  const {
    user,
    googleUser,
    updateUser,
    devices,
    activeDeviceId,
    selectActiveDevice,
    addDevice,
    removeDevice,
    subscriptionTier,
    setSubscriptionTier,
    loginWithGoogle,
    logout,
  } = useUser();

  const navigate = useNavigate();
  const { lang, changeLang, t } = useLang();
  const hasDevice = Boolean(activeDeviceId && devices && devices.length > 0);

  // Active Modals / Sheets
  const [activeSheet, setActiveSheet] = useState(null); // 'account' | 'sprinkler' | 'location' | 'plan' | 'aiQuota' | 'storage'

  useEffect(() => {
    if (activeSheet) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeSheet]);

  // Account Sheet State
  const [name, setName] = useState(user?.name || 'Farmer Enzoponik');
  const [email, setEmail] = useState(user?.email || 'farmer@enzoponik.com');
  const [photoUrl, setPhotoUrl] = useState(user?.avatarUrl || AVATAR_PRESETS[0].url);
  const [password, setPassword] = useState(user?.password || '••••••••');
  const [isResetting, setIsResetting] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Multi-device addition
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [deviceMsg, setDeviceMsg] = useState(null);

  // Settings State
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoIrrigation, setAutoIrrigation] = useState(true);
  const [isFlushing, setIsFlushing] = useState(false);

  // Location State
  const [latInput, setLatInput] = useState(locationConfig?.latitude ?? '');
  const [lonInput, setLonInput] = useState(locationConfig?.longitude ?? '');
  const [locError, setLocError] = useState(null);
  const [locLoading, setLocLoading] = useState(false);

  const isPro = subscriptionTier === 'pro';
  const displayUid = user?.uid ? `${user.uid.slice(0, 10)}...` : 'HARU-LOCAL';
  const displayLocation = realWeather?.city
    ? `${realWeather.city}, ${realWeather.country || 'Indonesia'}`
    : 'Bandung, Indonesia';

  const aiMaxQuota = isPro ? 50 : 20;
  const aiUsed = 12;

  const handleSaveAccount = () => {
    setSaveStatus('saving');
    setTimeout(() => {
      updateUser({
        name,
        email,
        avatarUrl: photoUrl || user?.avatarUrl,
        password,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    }, 500);
  };

  const handleResetPassword = () => {
    setIsResetting(true);
    setTimeout(() => {
      setPassword('');
      setIsResetting(false);
      alert(t('password_reset_initiated', 'Instruksi atur ulang kata sandi dikirim. Silakan masukkan kata sandi baru.'));
    }, 1000);
  };

  const handleCopyUid = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(user?.uid || 'HARU-UID-DEMO-01');
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleAddDevice = async (e) => {
    e.preventDefault();
    if (!newDeviceId.trim()) return;
    if (!isPro && devices.length >= 1) {
      setDeviceMsg({ type: 'error', text: 'Batas paket Free: maks 1 alat. Upgrade ke Pro untuk multi-tower.' });
      return;
    }
    try {
      await addDevice(newDeviceId.trim(), newDeviceName.trim() || newDeviceId.trim());
      setDeviceMsg({ type: 'success', text: `Alat ${newDeviceId.trim().toUpperCase()} terhubung!` });
      setNewDeviceId('');
      setNewDeviceName('');
      setShowAddDevice(false);
      setTimeout(() => setDeviceMsg(null), 3000);
    } catch (err) {
      setDeviceMsg({ type: 'error', text: err.message || 'Gagal menambahkan alat' });
    }
  };

  const handleManualFlush = async () => {
    setIsFlushing(true);
    try {
      await updateDeviceControl({ flushActive: true, pumpActive: true, pumpDurationSec: 15 });
      setTimeout(() => setIsFlushing(false), 2000);
    } catch {
      setIsFlushing(false);
    }
  };

  const handleCoordChange = useCallback((field, min, max, setValue) => (e) => {
    const val = e.target.value;
    setValue(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      updateLocationConfig({ [field]: parsed });
    }
  }, [updateLocationConfig]);

  const handleGetCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocError('geolocation_unsupported'); return; }
    setLocLoading(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lon = parseFloat(pos.coords.longitude.toFixed(6));
        setLatInput(lat);
        setLonInput(lon);
        updateLocationConfig({ latitude: lat, longitude: lon });
        setLocLoading(false);
      },
      () => { setLocError('location_error'); setLocLoading(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [updateLocationConfig]);

  return (
    <div className="set-page">
      <div className="set-container">
        {/* Header Title */}
        <header className="set-header">
          <h1 className="set-title">{t('settings_title', 'Pengaturan')}</h1>
        </header>

        {/* APPLE ID STYLE PROFILE BANNER (Card Dashboard Style - Paling Atas) */}
        <div className="set-profile-card" onClick={() => setActiveSheet('account')}>
          <div className="set-profile-card__avatar-wrap">
            <img src={photoUrl} alt={name} className="set-profile-card__avatar" />
            <div className="set-profile-card__badge">
              <Camera size={11} color="#ffffff" />
            </div>
          </div>
          <div className="set-profile-card__info">
            <div className="set-profile-card__name-row">
              <h2 className="set-profile-card__name">{name || 'Farmer Enzoponik'}</h2>
              <span className={`set-tier-chip ${isPro ? 'set-tier-chip--pro' : 'set-tier-chip--free'}`}>
                {isPro ? 'PREMIUM' : 'FREE'}
              </span>
            </div>
            <p className="set-profile-card__subtitle">
              {googleUser ? `Google Cloud Sync · ${isPro ? 'Pro Member' : 'Free Tier'}` : 'Penyimpanan Lokal · Ketuk untuk Masuk'}
            </p>
          </div>
          <ChevronRight size={18} className="set-chevron" />
        </div>

        {/* GRUP 1: FITUR */}
        <div className="set-group-wrap">
          <div className="db-section-hd">
            <span className="section-title">FITUR</span>
          </div>
          <div className="set-card-group">
            <div className="set-row" onClick={() => setActiveSheet('storage')}>
              <div className="set-row__icon-box set-row__icon-box--amber">
                <HardDrive size={16} />
              </div>
              <div className="set-row__content">
                <span className="set-row__label">Storage</span>
                <span className="set-row__value">
                  {isPro ? '365 Hari (12 Bulan)' : '30 Hari (1 Bulan)'}
                </span>
              </div>
              <ChevronRight size={16} className="set-chevron" />
            </div>

            <div className="set-row" onClick={() => setActiveSheet('aiQuota')}>
              <div className="set-row__icon-box set-row__icon-box--brand">
                <Bot size={16} />
              </div>
              <div className="set-row__content">
                <span className="set-row__label">Kuota AI</span>
                <span className="set-row__value">
                  {aiUsed}/{aiMaxQuota}
                </span>
              </div>
              <ChevronRight size={16} className="set-chevron" />
            </div>

            <div className="set-row" onClick={() => setActiveSheet('plan')}>
              <div className="set-row__icon-box set-row__icon-box--emerald">
                <Sparkles size={16} />
              </div>
              <div className="set-row__content">
                <span className="set-row__label">Upgrade Plan</span>
                <span className="set-row__value">
                  {isPro ? 'Aktif (Pro)' : 'Tingkatkan'}
                </span>
              </div>
              <ChevronRight size={16} className="set-chevron" />
            </div>
          </div>
        </div>

        {/* GRUP 2: PREFERENSI */}
        <div className="set-group-wrap">
          <div className="db-section-hd">
            <span className="section-title">PREFERENSI</span>
          </div>
          <div className="set-card-group">
            <div className="set-row">
              <div className="set-row__icon-box set-row__icon-box--cyan">
                <Globe size={16} />
              </div>
              <div className="set-row__content">
                <span className="set-row__label">{t('language', 'Bahasa')}</span>
              </div>
              <select
                className="set-native-select"
                value={lang}
                onChange={(e) => changeLang(e.target.value)}
              >
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="set-row" onClick={() => setActiveSheet('location')}>
              <div className="set-row__icon-box set-row__icon-box--rose">
                <MapPin size={16} />
              </div>
              <div className="set-row__content">
                <span className="set-row__label">Lokasi</span>
                <span className="set-row__value">{displayLocation}</span>
              </div>
              <ChevronRight size={16} className="set-chevron" />
            </div>

            <div
              className={`set-row ${!hasDevice ? 'set-row--disabled' : ''}`}
              onClick={() => {
                if (!hasDevice) {
                  alert('Tambahkan menara terlebih dahulu di Dashboard untuk membuka pengaturan penyiraman.');
                  return;
                }
                setActiveSheet('sprinkler');
              }}
            >
              <div className="set-row__icon-box set-row__icon-box--teal">
                <Droplets size={16} />
              </div>
              <div className="set-row__content">
                <span className="set-row__label">Penyiraman</span>
                <span className="set-row__value">
                  {!hasDevice ? 'Perlu Menara' : autoIrrigation ? 'Otomatis (AI)' : 'Manual'}
                </span>
              </div>
              <ChevronRight size={16} className="set-chevron" />
            </div>

            <div
              className={`set-row ${!hasDevice ? 'set-row--disabled' : ''}`}
              onClick={() => {
                if (!hasDevice) {
                  alert('Tambahkan menara terlebih dahulu di Dashboard.');
                  return;
                }
                navigate('/crop-config');
              }}
            >
              <div className="set-row__icon-box set-row__icon-box--emerald">
                <Leaf size={16} />
              </div>
              <div className="set-row__content">
                <span className="set-row__label">Konfigurasi Tanaman</span>
                <span className="set-row__value">
                  {hasDevice ? (user?.cropProfile?.cropName || 'Atur Tanaman') : 'Perlu Menara'}
                </span>
              </div>
              <ChevronRight size={16} className="set-chevron" />
            </div>

            <div className="set-row">
              <div className="set-row__icon-box set-row__icon-box--red">
                <Bell size={16} />
              </div>
              <div className="set-row__content">
                <span className="set-row__label">{t('push_notifications', 'Notifikasi')}</span>
              </div>
              <label className="set-switch">
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={() => setNotificationsEnabled(v => !v)}
                />
                <span className="set-switch-slider" />
              </label>
            </div>
          </div>
        </div>

        {/* GRUP 3: LOGOUT / KELUAR DARI AKUN */}
        <div className="set-card-group set-card-group--logout">
          <button
            type="button"
            className="set-logout-btn"
            onClick={logout}
          >
            Keluar dari Akun
          </button>
        </div>
      </div>

      {/* ====================================================================
          MODAL SHEETS PORTALED DIRECTLY TO BODY (INDEPENDENT FROM PAGE)
          ==================================================================== */}
      {activeSheet && createPortal(
        <>
          {activeSheet === 'account' && (
            <div className="ios-sheet-backdrop" onClick={() => setActiveSheet(null)}>
          <div className="ios-sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-navbar">
              <button
                type="button"
                className="ios-sheet-navbtn"
                onClick={() => setActiveSheet(null)}
              >
                Tutup
              </button>
              <h3 className="ios-sheet-title">Akun & Profil</h3>
              <button
                type="button"
                className="ios-sheet-navbtn ios-sheet-navbtn--primary"
                onClick={handleSaveAccount}
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? 'Menyimpan...' : saveStatus === 'saved' ? 'Tersimpan' : 'Selesai'}
              </button>
            </div>

            <div className="ios-sheet-body">
              {/* Avatar Center */}
              <div className="ios-sheet-avatar-center">
                <div className="ios-sheet-avatar-frame">
                  <img src={photoUrl} alt={name} />
                  <button
                    type="button"
                    className="ios-sheet-avatar-cam"
                    onClick={() => {
                      const url = prompt('Masukkan URL foto baru:', photoUrl || '');
                      if (url !== null && url.trim()) setPhotoUrl(url.trim());
                    }}
                    title="Ubah URL Foto"
                  >
                    <Camera size={13} color="#ffffff" />
                  </button>
                </div>
                <h4 className="ios-sheet-name">{name}</h4>
                <p className="ios-sheet-email">{email}</p>

                <div className="ios-avatar-presets">
                  {AVATAR_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className={`ios-preset-dot ${photoUrl === p.url ? 'ios-preset-dot--active' : ''}`}
                      onClick={() => setPhotoUrl(p.url)}
                      title={p.name}
                    >
                      <img src={p.url} alt={p.name} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Data Identitas */}
              <div className="ios-group-title">INFORMASI PRIBADI</div>
              <div className="ios-inset-group">
                <div className="ios-row ios-row--field">
                  <span className="ios-field-label">Nama</span>
                  <input
                    type="text"
                    className="ios-field-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama Lengkap"
                  />
                </div>
                <div className="ios-row ios-row--field">
                  <span className="ios-field-label">Email</span>
                  <input
                    type="email"
                    className="ios-field-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@domain.com"
                  />
                </div>
                <div className="ios-row ios-row--field">
                  <span className="ios-field-label">Sandi</span>
                  <input
                    type="password"
                    className="ios-field-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="ios-link-btn"
                    onClick={handleResetPassword}
                    disabled={isResetting}
                  >
                    {isResetting ? 'Mengatur...' : 'Atur Ulang'}
                  </button>
                </div>
              </div>

              {/* Cloud Sync & UID */}
              <div className="ios-group-title">CLOUD & SINKRONISASI</div>
              <div className="ios-inset-group">
                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">ID Akun (UID)</span>
                    <span className="ios-row__value">{displayUid}</span>
                  </div>
                  <button type="button" className="ios-copy-chip" onClick={handleCopyUid}>
                    {copiedId ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                    <span>{copiedId ? 'Tersalin' : 'Salin'}</span>
                  </button>
                </div>

                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">Status Akun Google</span>
                    <span className="ios-row__value">
                      {googleUser ? `Terhubung (${googleUser.email})` : 'Belum Terhubung'}
                    </span>
                  </div>
                  {googleUser ? (
                    <button type="button" className="ios-danger-chip" onClick={logout}>
                      Putuskan
                    </button>
                  ) : (
                    <button type="button" className="ios-primary-chip" onClick={loginWithGoogle}>
                      Hubungkan
                    </button>
                  )}
                </div>
              </div>

              {/* Hardware Registry */}
              <div className="ios-group-title">DAFTAR HARDWARE MENARA IOT ({devices.length})</div>
              <div className="ios-inset-group">
                {devices.length === 0 ? (
                  <div className="ios-row" style={{ color: '#8e8e93', fontSize: '0.85rem' }}>
                    Belum ada perangkat terdaftar
                  </div>
                ) : (
                  devices.map((dev) => {
                    const devId = dev.id || dev.deviceId;
                    const isActive = devId === activeDeviceId;
                    return (
                      <div
                        key={devId}
                        className="ios-row"
                        onClick={() => selectActiveDevice(devId)}
                      >
                        <Radio
                          size={16}
                          color={isActive ? '#059669' : '#c7c7cc'}
                          style={{ fill: isActive ? '#059669' : 'transparent', marginRight: 10 }}
                        />
                        <div className="ios-row__content">
                          <span className="ios-row__label">{dev.name || devId}</span>
                          <span className="ios-row__value">{devId}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isActive ? (
                            <span className="ios-active-pill">Aktif</span>
                          ) : (
                            <span className="ios-standby-pill">Pilih</span>
                          )}
                          <button
                            type="button"
                            className="ios-delete-dev-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Hapus perangkat ${devId}?`)) {
                                removeDevice(devId);
                              }
                            }}
                            title="Hapus Alat"
                          >
                            <Trash2 size={13} color="#ff3b30" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}

                <div
                  className="ios-row ios-row--action"
                  onClick={() => setShowAddDevice(v => !v)}
                >
                  <Plus size={16} color="#007aff" style={{ marginRight: 8 }} />
                  <span className="ios-row__action-label">Tambah Menara IoT Baru</span>
                </div>

                {showAddDevice && (
                  <form onSubmit={handleAddDevice} className="ios-device-form">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        className="ios-field-input"
                        placeholder="ID Serial (mis: ezpn-742kxmpt)"
                        value={newDeviceId}
                        onChange={(e) => setNewDeviceId(e.target.value)}
                        required
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => setNewDeviceId(generateDeviceId('lower'))}
                        className="ios-mini-btn"
                        title="Generate ID acak ezpn-[3 angka][5 huruf]"
                        style={{
                          whiteSpace: 'nowrap',
                          padding: '8px 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#059669',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          cursor: 'pointer'
                        }}
                      >
                        🎲 Acak ID
                      </button>
                    </div>
                    <input
                      type="text"
                      className="ios-field-input"
                      placeholder="Nama Menara (mis: Vertikal Selatan)"
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                    />
                    <button type="submit" className="ios-primary-chip" style={{ width: '100%', marginTop: 8 }}>
                      Hubungkan Hardware
                    </button>
                  </form>
                )}

                {deviceMsg && (
                  <div className={`ios-alert-banner ${deviceMsg.type === 'error' ? 'ios-alert-banner--error' : 'ios-alert-banner--success'}`}>
                    {deviceMsg.text}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 2: STORAGE & RETENTION SHEET
          ==================================================================== */}
      {activeSheet === 'storage' && (
        <div className="ios-sheet-backdrop" onClick={() => setActiveSheet(null)}>
          <div className="ios-sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-navbar">
              <button type="button" className="ios-sheet-navbtn" onClick={() => setActiveSheet(null)}>
                Tutup
              </button>
              <h3 className="ios-sheet-title">Penyimpanan Cloud</h3>
              <div style={{ width: 44 }} />
            </div>
            <div className="ios-sheet-body">
              <div className="ios-sheet-avatar-center">
                <div className="ios-info-hero-icon ios-info-hero-icon--orange">
                  <HardDrive size={32} color="#ffffff" />
                </div>
                <h4 className="ios-sheet-name">Retensi Data Snapshot</h4>
                <p className="ios-sheet-email">
                  {isPro ? 'Penyimpanan cloud aktif selama 12 bulan (365 hari).' : 'Penyimpanan cloud akun gratis dibatasi 30 hari.'}
                </p>
              </div>

              <div className="ios-group-title">STATUS KUOTA STORAGE</div>
              <div className="ios-inset-group">
                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">Masa Retensi</span>
                    <span className="ios-row__value">{isPro ? '365 Hari (12 Bulan)' : '30 Hari (1 Bulan)'}</span>
                  </div>
                </div>
                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">Jadwal Backup</span>
                    <span className="ios-row__value">Otomatis Setiap Hari (00:00 UTC)</span>
                  </div>
                </div>
                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">Database Engine</span>
                    <span className="ios-row__value">Google Cloud Firestore</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 3: KUOTA AI SHEET
          ==================================================================== */}
      {activeSheet === 'aiQuota' && (
        <div className="ios-sheet-backdrop" onClick={() => setActiveSheet(null)}>
          <div className="ios-sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-navbar">
              <button type="button" className="ios-sheet-navbtn" onClick={() => setActiveSheet(null)}>
                Tutup
              </button>
              <h3 className="ios-sheet-title">Kuota ENZOPONIK AI</h3>
              <div style={{ width: 44 }} />
            </div>
            <div className="ios-sheet-body">
              <div className="ios-sheet-avatar-center">
                <div className="ios-info-hero-icon ios-info-hero-icon--orange">
                  <Bot size={32} color="#ffffff" />
                </div>
                <h4 className="ios-sheet-name">Analisis Cerdas & Chatbot</h4>
                <p className="ios-sheet-email">
                  {aiUsed} dari {aiMaxQuota} kuota prompt telah digunakan hari ini.
                </p>
              </div>

              <div className="ios-group-title">RINCIAN KUOTA AI</div>
              <div className="ios-inset-group">
                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">Tersisa Hari Ini</span>
                    <span className="ios-row__value" style={{ color: '#059669', fontWeight: 600 }}>
                      {aiMaxQuota - aiUsed} Pertanyaan
                    </span>
                  </div>
                </div>
                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">Model AI Aktif</span>
                    <span className="ios-row__value">Gemini 1.5 Flash</span>
                  </div>
                </div>
                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">Reset Kuota</span>
                    <span className="ios-row__value">Besok, 00:00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 4: UPGRADE PLAN SHEET
          ==================================================================== */}
      {activeSheet === 'plan' && (
        <div className="ios-sheet-backdrop" onClick={() => setActiveSheet(null)}>
          <div className="ios-sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-navbar">
              <button type="button" className="ios-sheet-navbtn" onClick={() => setActiveSheet(null)}>
                Tutup
              </button>
              <h3 className="ios-sheet-title">Paket Langganan</h3>
              <div style={{ width: 44 }} />
            </div>
            <div className="ios-sheet-body">
              <div className="ios-sheet-avatar-center">
                <div className="ios-info-hero-icon ios-info-hero-icon--green">
                  <Sparkles size={32} color="#ffffff" />
                </div>
                <h4 className="ios-sheet-name">
                  {isPro ? 'Paket Premium / Pro Aktif' : 'Paket Free Tier'}
                </h4>
                <p className="ios-sheet-email">
                  {isPro ? 'Akses tanpa batas multi-tower dan histori 12 bulan.' : 'Tingkatkan untuk multi-alat dan analisis data 365 hari.'}
                </p>
              </div>

              <div className="ios-group-title">PILIHAN PAKET</div>
              <div className="ios-inset-group">
                <div className="ios-row" onClick={() => setSubscriptionTier('free')}>
                  <Radio
                    size={16}
                    color={!isPro ? '#059669' : '#c7c7cc'}
                    style={{ fill: !isPro ? '#059669' : 'transparent', marginRight: 10 }}
                  />
                  <div className="ios-row__content">
                    <span className="ios-row__label">Free Plan</span>
                    <span className="ios-row__value">1 Menara • 30 Hari Cloud</span>
                  </div>
                </div>

                <div className="ios-row" onClick={() => setSubscriptionTier('pro')}>
                  <Radio
                    size={16}
                    color={isPro ? '#059669' : '#c7c7cc'}
                    style={{ fill: isPro ? '#059669' : 'transparent', marginRight: 10 }}
                  />
                  <div className="ios-row__content">
                    <span className="ios-row__label">Pro / Premium</span>
                    <span className="ios-row__value">Multi-Alat • 365 Hari Cloud</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 5: PENYIRAMAN & SPRINKLER SHEET
          ==================================================================== */}
      {activeSheet === 'sprinkler' && (
        <div className="ios-sheet-backdrop" onClick={() => setActiveSheet(null)}>
          <div className="ios-sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-navbar">
              <button type="button" className="ios-sheet-navbtn" onClick={() => setActiveSheet(null)}>
                Tutup
              </button>
              <h3 className="ios-sheet-title">Kontrol Penyiraman</h3>
              <div style={{ width: 44 }} />
            </div>
            <div className="ios-sheet-body">
              <div className="ios-sheet-avatar-center">
                <div className="ios-info-hero-icon ios-info-hero-icon--teal">
                  <Droplets size={32} color="#ffffff" />
                </div>
                <h4 className="ios-sheet-name">Sistem Pompa Irigasi</h4>
                <p className="ios-sheet-email">Kelola penyiraman otomatis cerdas dan siram manual ESP32.</p>
              </div>

              <div className="ios-group-title">MODE PENYIRAMAN</div>
              <div className="ios-inset-group">
                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">Penyiraman Otomatis AI</span>
                    <span className="ios-row__value">{autoIrrigation ? 'Aktif' : 'Mati'}</span>
                  </div>
                  <label className="ios-switch">
                    <input
                      type="checkbox"
                      checked={autoIrrigation}
                      onChange={() => setAutoIrrigation(v => !v)}
                    />
                    <span className="ios-switch-slider" />
                  </label>
                </div>

                <div className="ios-row" onClick={handleManualFlush}>
                  <div className="ios-row__content">
                    <span className="ios-row__label">Uji Siram Manual (Flush)</span>
                    <span className="ios-row__value">{isFlushing ? 'Menyiram...' : 'Pompa Siap'}</span>
                  </div>
                  <button
                    type="button"
                    className={`ios-action-pill ${isFlushing ? 'ios-action-pill--active' : ''}`}
                    disabled={isFlushing}
                  >
                    {isFlushing ? <RefreshCw size={12} className="spin-anim" /> : 'Siram'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 6: LOKASI & GEOLOCATION SHEET
          ==================================================================== */}
      {activeSheet === 'location' && (
        <div className="ios-sheet-backdrop" onClick={() => setActiveSheet(null)}>
          <div className="ios-sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ios-sheet-navbar">
              <button type="button" className="ios-sheet-navbtn" onClick={() => setActiveSheet(null)}>
                Tutup
              </button>
              <h3 className="ios-sheet-title">Lokasi Alat (IoT)</h3>
              <div style={{ width: 44 }} />
            </div>
            <div className="ios-sheet-body">
              <div className="ios-sheet-avatar-center">
                <div className="ios-info-hero-icon ios-info-hero-icon--pink">
                  <MapPin size={32} color="#ffffff" />
                </div>
                <h4 className="ios-sheet-name">{displayLocation}</h4>
                <p className="ios-sheet-email">
                  Koordinat: {locationConfig?.latitude?.toFixed(4) || '-8.4095'}, {locationConfig?.longitude?.toFixed(4) || '115.1889'}
                </p>
              </div>

              <div className="ios-group-title">PENGATURAN GPS</div>
              <div className="ios-inset-group">
                <div className="ios-row">
                  <div className="ios-row__content">
                    <span className="ios-row__label">Kunci Koordinat Cuaca</span>
                  </div>
                  <label className="ios-switch">
                    <input
                      type="checkbox"
                      checked={locationConfig?.isLocked || false}
                      onChange={(e) => updateLocationConfig({ isLocked: e.target.checked })}
                    />
                    <span className="ios-switch-slider" />
                  </label>
                </div>

                <div className="ios-row ios-row--action" onClick={handleGetCurrentLocation}>
                  <Compass size={16} color="#007aff" style={{ marginRight: 8 }} />
                  <span className="ios-row__action-label">
                    {locLoading ? 'Mendeteksi Koordinat...' : 'Perbarui ke Lokasi GPS Saat Ini'}
                  </span>
                </div>
              </div>

              {locError && (
                <div className="ios-alert-banner ios-alert-banner--error" style={{ margin: '0 16px' }}>
                  {t(locError)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </>,
        document.body
      )}
    </div>
  );
}
