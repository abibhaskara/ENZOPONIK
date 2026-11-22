import { useState, useCallback, useEffect, useRef, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  X,
  Bell,
  Globe,
  RefreshCw,
  MapPin,
  Compass,
  Wallet,
  Camera,
  Check,
  Copy,
  Plus,
  Radio,
  AlertCircle,
  CheckCircle2,
  Droplets,
  HardDrive,
  Trash2,
  Bot,
  Leaf,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { useLang, LANGUAGES } from '../context/LanguageContext';
import { getDeviceControl, updateDeviceControl } from '../lib/firebaseService';
import { measureCloudStorageUsage } from '../lib/deviceService';
import { resetAccountPassword } from '../lib/authService';
import { getAiProvider, setAiProvider } from '../lib/geminiUtils';
import { findCropPreset, getLocalizedCropText } from '../lib/cropUtils';
import { getIntlLocale } from '../locales/translations';
import './Settings.css';

function formatStorageBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

const AVATAR_PRESETS = [
  { name: 'Sophie', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sophie' },
  { name: 'Felix', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Felix' },
  { name: 'Jasper', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Jasper' },
  { name: 'Milo', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Milo' },
  { name: 'Luna', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Luna' },
];

function SwitchInput({ id, checked, onChange, ariaLabel }) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      aria-label={ariaLabel}
      className="set-switch-input"
      checked={Boolean(checked)}
      onChange={onChange}
    />
  );
}

function SettingsDialog({ open, title, onClose, rightAction, closeLabel, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback light dismiss when <dialog closedby="any"> is unsupported (e.g., Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    const outside = (e) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    let pressedOutside = false;
    const onPointerDown = (e) => {
      pressedOutside = dialog.open && outside(e);
    };
    const onPointerUp = (e) => {
      if (pressedOutside && dialog.open && outside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog) dialog.returnValue = '';
    onCloseRef.current();
  };

  return (
    <dialog
      ref={dialogRef}
      className="set-dialog"
      aria-labelledby={titleId}
      closedby="any"
      onClose={handleClose}
    >
      <div className="set-dialog__navbar">
        <h2 id={titleId} className="set-dialog__title">{title}</h2>
        <div className="set-dialog__actions">
          {rightAction}
          <button
            type="button"
            className="set-dialog__close-btn"
            onClick={() => dialogRef.current?.close()}
            aria-label={closeLabel || 'Close dialog'}
          >
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="set-dialog__body">{open ? children : null}</div>
    </dialog>
  );
}

export default function Settings() {
  const { locationConfig, updateLocationConfig, realWeather, pumpActive } = useData();
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
    aiQuota,
    aiUsed,
    aiMaxQuota,
    aiRemaining,
  } = useUser();

  const navigate = useNavigate();
  const { lang, changeLang, t } = useLang();
  const hasDevice = Boolean(activeDeviceId && devices && devices.length > 0);

  const [activeSheet, setActiveSheet] = useState(null);
  const [aiProvider, setAiProviderState] = useState(() => getAiProvider());
  const [pageBanner, setPageBanner] = useState(null);
  const [storageStats, setStorageStats] = useState({ bytes: 0, docCount: 0, loading: false });

  const handleSelectAiProvider = (mode) => {
    const saved = setAiProvider(mode);
    setAiProviderState(saved);
  };

  const [name, setName] = useState(user?.name || t('default_farmer_name'));
  const [email, setEmail] = useState(user?.email || '');
  const [photoUrl, setPhotoUrl] = useState(user?.avatarUrl || AVATAR_PRESETS[0].url);
  const [showPhotoInput, setShowPhotoInput] = useState(false);
  const [password, setPassword] = useState(user?.password || '••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [accountNotice, setAccountNotice] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [copiedId, setCopiedId] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const saveCloseTimerRef = useRef(null);

  useEffect(() => {
    if (activeSheet === 'account') return;
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
    if (user?.avatarUrl) setPhotoUrl(user.avatarUrl);
  }, [activeSheet, user?.name, user?.email, user?.avatarUrl, googleUser]);

  useEffect(() => () => {
    if (saveCloseTimerRef.current) clearTimeout(saveCloseTimerRef.current);
  }, []);

  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [deviceMsg, setDeviceMsg] = useState(null);

  const notificationsEnabled = user?.notificationsEnabled ?? true;
  const [deviceAutoMode, setDeviceAutoMode] = useState(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState(null);
  const [isFlushing, setIsFlushing] = useState(false);

  const autoIrrigation = deviceAutoMode !== null ? deviceAutoMode : (user?.autoIrrigation ?? true);

  const autoIrrigationRef = useRef(user?.autoIrrigation);
  autoIrrigationRef.current = user?.autoIrrigation;

  useEffect(() => {
    setDeviceAutoMode(null);
    setControlError(null);
    if (!activeDeviceId) return;
    let active = true;
    getDeviceControl(activeDeviceId)
      .then((ctrl) => {
        if (!active || !ctrl || typeof ctrl.autoMode !== 'boolean') return;
        setDeviceAutoMode(ctrl.autoMode);
        if (ctrl.autoMode !== autoIrrigationRef.current) {
          updateUser({ autoIrrigation: ctrl.autoMode });
        }
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [activeDeviceId, activeSheet, updateUser]);

  const handleToggleNotifications = useCallback(() => {
    updateUser({ notificationsEnabled: !notificationsEnabled });
  }, [notificationsEnabled, updateUser]);

  const handleToggleAutoIrrigation = useCallback(async () => {
    if (!activeDeviceId || controlBusy) return;
    const prev = autoIrrigation;
    const next = !prev;
    setControlError(null);
    setDeviceAutoMode(next);
    setControlBusy(true);
    try {
      const res = await updateDeviceControl(
        next
          ? { autoMode: true }
          : { autoMode: false, pumpActive: false, flushActive: false, manualTrigger: false, pumpDurationSec: 0 },
        activeDeviceId
      );
      const confirmed = typeof res?.control?.autoMode === 'boolean' ? res.control.autoMode : next;
      setDeviceAutoMode(confirmed);
      if (!confirmed) setIsFlushing(false);
      updateUser({ autoIrrigation: confirmed });
    } catch (err) {
      setDeviceAutoMode(prev);
      setControlError(err.message || t('control_update_failed'));
    } finally {
      setControlBusy(false);
    }
  }, [autoIrrigation, activeDeviceId, controlBusy, updateUser, t]);

  const [locError, setLocError] = useState(null);
  const [locLoading, setLocLoading] = useState(false);

  const isPro = subscriptionTier === 'pro';
  const storageQuotaGb = isPro ? 3 : 1;
  const storageQuotaBytes = storageQuotaGb * 1024 * 1024 * 1024;
  const storageUsedBytes = storageStats.bytes;
  const storagePct = Math.min(100, (storageUsedBytes / storageQuotaBytes) * 100);
  const storageVisualPct = storageUsedBytes > 0 ? Math.max(2, storagePct) : 0;

  useEffect(() => {
    if (activeSheet !== 'storage') return;
    let active = true;
    setStorageStats((prev) => ({ ...prev, loading: true }));
    measureCloudStorageUsage({ devices })
      .then(({ bytes, docCount }) => {
        if (active) setStorageStats({ bytes, docCount, loading: false });
      })
      .catch(() => {
        if (active) setStorageStats((prev) => ({ ...prev, loading: false }));
      });
    return () => {
      active = false;
    };
}, [activeSheet, devices]);
const displayUid = user?.uid ? `${user.uid.slice(0, 10)}...` : 'EZPN-LOCAL';
const displayLocation = realWeather?.cityKey
  ? `${t(realWeather.cityKey)}, ${realWeather.country || 'Indonesia'}`
  : realWeather?.city
    ? `${realWeather.city}, ${realWeather.country || 'Indonesia'}`
    : 'Bandung, Indonesia';
const aiProgressPct = Math.min(100, Math.round(((aiUsed || 0) / (aiMaxQuota || 20)) * 100));

const savedCropPreset = findCropPreset(user?.cropProfile?.cropName);
const displayCropName = user?.cropProfile?.cropName
  ? (savedCropPreset
    ? getLocalizedCropText(savedCropPreset, lang).name
    : user.cropProfile.cropName)
  : '';

const openSheet = (sheet) => {
  if (saveCloseTimerRef.current) clearTimeout(saveCloseTimerRef.current);
  setPageBanner(null);
  setAccountNotice(null);
  setSaveStatus(null);
  setConfirmDeleteId(null);
  if (sheet === 'account') {
    setName(user?.name || t('default_farmer_name'));
    setEmail(user?.email || '');
    setPhotoUrl(user?.avatarUrl || AVATAR_PRESETS[0].url);
    setPassword('••••••••');
  }
  setActiveSheet(sheet);
};

const handleSaveAccount = async () => {
  if (saveCloseTimerRef.current) clearTimeout(saveCloseTimerRef.current);
  setAccountNotice(null);

  const trimmedPhoto = (photoUrl || '').trim();
  if (trimmedPhoto && !/^https?:\/\/.+/i.test(trimmedPhoto)) {
    setAccountNotice({
      type: 'error',
      text: t('invalid_photo_url'),
    });
    return;
  }

  const hasNewPassword = Boolean(password && password !== '••••••••');
  if (hasNewPassword && password.length < 6) {
    setAccountNotice({
      type: 'error',
      text: t('password_min_length'),
    });
    return;
  }

  setSaveStatus('saving');
  const res = await updateUser({
    name: (name || '').trim() || t('default_farmer_name'),
    email: (email || '').trim(),
    avatarUrl: trimmedPhoto || user?.avatarUrl || AVATAR_PRESETS[0].url,
    ...(hasNewPassword ? { password } : {}),
  });

  if (res?.cloudSynced === false && res?.error) {
    setSaveStatus(null);
    setAccountNotice({
      type: 'error',
      text: t('saved_local_cloud_fail'),
    });
    return;
  }

  setSaveStatus('saved');
  saveCloseTimerRef.current = setTimeout(() => {
    setSaveStatus(null);
    setActiveSheet(null);
  }, 550);
};

const handleLogout = async () => {
  setActiveSheet(null);
  await logout();
  navigate('/', { replace: true });
};

const handleResetPassword = async () => {
  setIsResetting(true);
  setAccountNotice(null);
  try {
    const targetEmail = email || user?.email;
    const res = await resetAccountPassword(targetEmail);
    setPassword('');
    if (res.mode === 'email_sent') {
      setAccountNotice({
        type: 'success',
        text: t('password_reset_email_sent', { email: targetEmail }),
      });
    } else {
      setAccountNotice({
        type: 'success',
        text: t('password_reset_local_hint'),
      });
    }
  } catch (err) {
    setAccountNotice({
      type: 'error',
      text: err.message || t('password_reset_failed'),
    });
  } finally {
    setIsResetting(false);
  }
};

const handleCopyUid = (e) => {
  e.stopPropagation();
  navigator.clipboard?.writeText(user?.uid || 'EZPN-UID-01');
  setCopiedId(true);
  setTimeout(() => setCopiedId(false), 2000);
};

const handleAddDevice = async (e) => {
  e.preventDefault();
  if (!newDeviceId.trim()) return;
  if (!isPro && devices.length >= 1) {
    setDeviceMsg({
      type: 'error',
      text: t('free_device_limit'),
    });
    return;
  }
  try {
    await addDevice(newDeviceId.trim(), newDeviceName.trim() || newDeviceId.trim());
    setDeviceMsg({ type: 'success', text: t('device_connected_msg', { id: newDeviceId.trim().toUpperCase() }) });
    setNewDeviceId('');
    setNewDeviceName('');
    setShowAddDevice(false);
    setTimeout(() => setDeviceMsg(null), 3000);
  } catch (err) {
    setDeviceMsg({ type: 'error', text: err.message || t('device_add_failed') });
  }
};

const handleManualFlush = async () => {
  if (!activeDeviceId || controlBusy) return;
  setControlError(null);
  setControlBusy(true);
  setIsFlushing(true);
  try {
    await updateDeviceControl(
      { flushActive: true, pumpActive: true, manualTrigger: true, pumpDurationSec: 15 },
      activeDeviceId
    );
    setTimeout(() => setIsFlushing(false), 2000);
  } catch (err) {
    setIsFlushing(false);
    setControlError(err.message || t('control_update_failed'));
  } finally {
    setControlBusy(false);
  }
};

const handleManualStop = async () => {
  if (!activeDeviceId || controlBusy) return;
  setControlError(null);
  setControlBusy(true);
  setIsFlushing(false);
  try {
    await updateDeviceControl(
      { pumpActive: false, flushActive: false, manualTrigger: false, pumpDurationSec: 0 },
      activeDeviceId
    );
  } catch (err) {
    setControlError(err.message || t('control_update_failed'));
  } finally {
    setControlBusy(false);
  }
};

const handleGetCurrentLocation = useCallback(() => {
  if (!navigator.geolocation) {
    setLocError('geolocation_unsupported');
    return;
  }
  setLocLoading(true);
  setLocError(null);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = parseFloat(pos.coords.latitude.toFixed(6));
      const lon = parseFloat(pos.coords.longitude.toFixed(6));
      updateLocationConfig({ latitude: lat, longitude: lon });
      setLocLoading(false);
    },
    () => {
      setLocError('location_error');
      setLocLoading(false);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}, [updateLocationConfig]);

const sheetMeta = {
  account: {
    title: t('sheet_account'),
    rightAction: (
      <button
        type="button"
        className="set-dialog__save-pill"
        onClick={handleSaveAccount}
        disabled={saveStatus === 'saving'}
      >
        {saveStatus === 'saving' ? t('saving') : saveStatus === 'saved' ? t('saved_plain') : t('save')}
      </button>
    ),
  },
  storage: { title: t('sheet_storage') },
  aiQuota: { title: 'Enzoponik AI' },
  plan: { title: t('sheet_plan') },
  sprinkler: { title: t('sheet_sprinkler') },
  location: { title: t('sheet_location') },
};

const currentMeta = activeSheet ? sheetMeta[activeSheet] : { title: '' };

return (
  <main className="set-page">
    <div className="set-container">
      <header className="set-header">
        <h1 className="set-title">{t('settings_title')}</h1>
      </header>

      {pageBanner && (
        <div className="set-feedback set-feedback--warn" role="status">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{pageBanner}</span>
          <button
            type="button"
            className="set-feedback__dismiss"
            onClick={() => setPageBanner(null)}
            aria-label={t('dismiss_notice')}
          >
            OK
          </button>
        </div>
      )}

      <button
        type="button"
        className="set-profile-card"
        onClick={() => openSheet('account')}
      >
        <div className="set-profile-card__avatar-wrap">
          <img src={photoUrl} alt={name} className="set-profile-card__avatar" />
          <span className="set-profile-card__badge" aria-hidden="true">
            <Camera size={11} color="#ffffff" />
          </span>
        </div>
        <div className="set-profile-card__info">
          <div className="set-profile-card__name-row">
            <h2 className="set-profile-card__name">{name || t('default_farmer_name')}</h2>
            <span className={`set-tier-chip ${isPro ? 'set-tier-chip--pro' : 'set-tier-chip--free'}`}>
              {isPro ? 'PREMIUM' : 'FREE'}
            </span>
          </div>
          <p className="set-profile-card__subtitle">
            {googleUser
              ? `${googleUser.email}`
              : email
                ? `${email} · ${t('tap_manage_profile')}`
                : t('tap_manage_account')}
          </p>
        </div>
        <ChevronRight size={18} className="set-chevron" aria-hidden="true" />
      </button>

      <section className="set-group-wrap" aria-labelledby="set-group-fitur">
        <div className="set-section-hd">
          <h2 id="set-group-fitur" className="set-section-title">{t('section_features')}</h2>
        </div>
        <div className="set-card-group">
          <button type="button" className="set-row" onClick={() => openSheet('storage')}>
            <span className="set-row__icon-circle set-row__icon-circle--amber" aria-hidden="true">
              <HardDrive size={17} />
            </span>
            <span className="set-row__content">
              <span className="set-row__label">{t('storage_label')}</span>
              <span className="set-row__value">
                {isPro ? t('storage_summary_pro') : t('storage_summary_free')}
              </span>
            </span>
            <ChevronRight size={17} className="set-chevron" aria-hidden="true" />
          </button>

          <button type="button" className="set-row" onClick={() => openSheet('aiQuota')}>
            <span className="set-row__icon-circle set-row__icon-circle--brand" aria-hidden="true">
              <Bot size={17} />
            </span>
            <span className="set-row__content">
              <span className="set-row__label">Enzoponik AI</span>
              <span
                className="set-row__value"
                style={{
                  color: aiRemaining === 0 ? '#b91c1c' : aiRemaining <= 5 ? '#b45309' : undefined,
                  fontWeight: aiRemaining <= 5 ? 600 : undefined,
                }}
              >
                {aiUsed}/{aiMaxQuota}
              </span>
            </span>
            <ChevronRight size={17} className="set-chevron" aria-hidden="true" />
          </button>

          <button type="button" className="set-row" onClick={() => openSheet('plan')}>
            <span className="set-row__icon-circle set-row__icon-circle--emerald" aria-hidden="true">
              <Wallet size={17} />
            </span>
            <span className="set-row__content">
              <span className="set-row__label">{t('plan_label')}</span>
              <span className="set-row__value">{isPro ? t('plan_premium') : t('plan_free')}</span>
            </span>
            <ChevronRight size={17} className="set-chevron" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="set-group-wrap" aria-labelledby="set-group-pref">
        <div className="set-section-hd">
          <h2 id="set-group-pref" className="set-section-title">{t('section_preferences')}</h2>
        </div>
        <div className="set-card-group">
          <div className="set-row set-row--static">
            <span className="set-row__icon-circle set-row__icon-circle--cyan" aria-hidden="true">
              <Globe size={17} />
            </span>
            <label htmlFor="set-lang-select" className="set-row__content">
              <span className="set-row__label">{t('language')}</span>
            </label>
            <select
              id="set-lang-select"
              className="set-native-select"
              value={lang}
              onChange={(e) => changeLang(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeLabel}
                </option>
              ))}
            </select>
          </div>

          <button type="button" className="set-row" onClick={() => openSheet('location')}>
            <span className="set-row__icon-circle set-row__icon-circle--rose" aria-hidden="true">
              <MapPin size={17} />
            </span>
            <span className="set-row__content">
              <span className="set-row__label">{t('location_label')}</span>
              <span className="set-row__value">{displayLocation}</span>
            </span>
            <ChevronRight size={17} className="set-chevron" aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`set-row ${!hasDevice ? 'set-row--disabled' : ''}`}
            onClick={() => {
              if (!hasDevice) {
                setPageBanner(t('need_tower_sprinkler_msg'));
                return;
              }
              openSheet('sprinkler');
            }}
          >
            <span className="set-row__icon-circle set-row__icon-circle--teal" aria-hidden="true">
              <Droplets size={17} />
            </span>
            <span className="set-row__content">
              <span className="set-row__label">{t('irrigation_label')}</span>
              <span className="set-row__value">
                {!hasDevice
                  ? t('tower_required')
                  : autoIrrigation
                    ? t('irrigation_auto_val')
                    : t('irrigation_manual_val')}
              </span>
            </span>
            <ChevronRight size={17} className="set-chevron" aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`set-row ${!hasDevice ? 'set-row--disabled' : ''}`}
            onClick={() => {
              if (!hasDevice) {
                setPageBanner(t('need_tower_crop_msg'));
                return;
              }
              navigate('/crop-config');
            }}
          >
            <span className="set-row__icon-circle set-row__icon-circle--emerald" aria-hidden="true">
              <Leaf size={17} />
            </span>
            <span className="set-row__content">
              <span className="set-row__label">{t('crop_config_title')}</span>
              <span className="set-row__value">
                {hasDevice ? displayCropName || t('set_crop_cta') : t('tower_required')}
              </span>
            </span>
            <ChevronRight size={17} className="set-chevron" aria-hidden="true" />
          </button>

          <div className="set-row set-row--static">
            <span className="set-row__icon-circle set-row__icon-circle--red" aria-hidden="true">
              <Bell size={17} />
            </span>
            <label htmlFor="set-notif-switch" className="set-row__content" style={{ cursor: 'pointer' }}>
              <span className="set-row__label">{t('push_notifications')}</span>
            </label>
            <SwitchInput
              id="set-notif-switch"
              checked={notificationsEnabled}
              onChange={handleToggleNotifications}
            />
          </div>
        </div>
      </section>
    </div>

    <SettingsDialog
      open={Boolean(activeSheet)}
      title={currentMeta.title}
      rightAction={currentMeta.rightAction}
      closeLabel={t('close_dialog')}
      onClose={() => setActiveSheet(null)}
    >
      {activeSheet === 'account' && (
        <>
          <div className="set-dialog__hero">
            <div className="set-dialog__avatar-frame">
              <img src={photoUrl} alt={name} />
              <button
                type="button"
                className="set-dialog__avatar-cam"
                onClick={() => setShowPhotoInput((v) => !v)}
                aria-label={t('change_avatar_url')}
              >
                <Camera size={13} color="#ffffff" aria-hidden="true" />
              </button>
            </div>
            <h3 className="set-dialog__hero-title">{name}</h3>
            <p className="set-dialog__hero-sub">{email || t('no_email_yet')}</p>

            {showPhotoInput && (
              <div className="set-pill-field set-pill-field--compact" style={{ marginTop: 12, width: '100%' }}>
                <label htmlFor="set-photo-url" className="visually-hidden">{t('photo_url_label')}</label>
                <Camera size={16} className="set-pill-field__icon" aria-hidden="true" />
                <input
                  id="set-photo-url"
                  type="url"
                  placeholder={t('photo_url_placeholder')}
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                />
              </div>
            )}

            <div className="set-avatar-presets">
              {AVATAR_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`set-preset-dot ${photoUrl === p.url ? 'set-preset-dot--active' : ''}`}
                  onClick={() => setPhotoUrl(p.url)}
                  aria-label={t('choose_avatar', { name: p.name })}
                >
                  <img src={p.url} alt={p.name} />
                </button>
              ))}
            </div>
          </div>

          <div className="set-pill-stack">
            <div className="set-pill-field">
              <label htmlFor="set-account-name" className="visually-hidden">{t('full_name')}</label>
              <User size={17} className="set-pill-field__icon" aria-hidden="true" />
              <input
                id="set-account-name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder={t('full_name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="set-pill-field">
              <label htmlFor="set-account-email" className="visually-hidden">{t('email')}</label>
              <Mail size={17} className="set-pill-field__icon" aria-hidden="true" />
              <input
                id="set-account-email"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                placeholder={t('email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="set-pill-field">
              <label htmlFor="set-account-password" className="visually-hidden">{t('password')}</label>
              <Lock size={17} className="set-pill-field__icon" aria-hidden="true" />
              <input
                id="set-account-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="set-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? t('hide_password') : t('show_password')}
              >
                {showPassword ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="set-reset-pill"
                onClick={handleResetPassword}
                disabled={isResetting}
              >
                {isResetting ? '...' : t('reset_short')}
              </button>
            </div>
          </div>

          {accountNotice && (
            <div
              className={`set-feedback ${accountNotice.type === 'error' ? 'set-feedback--error' : 'set-feedback--success'
                }`}
              role={accountNotice.type === 'error' ? 'alert' : 'status'}
            >
              {accountNotice.type === 'error' ? (
                <AlertCircle size={16} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={16} aria-hidden="true" />
              )}
              <span>{accountNotice.text}</span>
            </div>
          )}

          <div className="set-dialog__group-label">{t('group_details')}</div>
          <div className="set-card-group">
            <div className="set-row set-row--static">
              <div className="set-row__content">
                <span className="set-row__label">{t('account_uid_label')}</span>
                <span className="set-row__value">{displayUid}</span>
              </div>
              <button type="button" className="set-chip set-chip--neutral" onClick={handleCopyUid}>
                {copiedId ? <Check size={12} color="#1d9b67" aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                <span>{copiedId ? t('copied') : t('copy')}</span>
              </button>
            </div>

            <div className="set-row set-row--static">
              <div className="set-row__content">
                <span className="set-row__label">{t('google_status_label')}</span>
                <span className="set-row__value">
                  {googleUser
                    ? t('google_connected', { email: googleUser.email })
                    : t('google_not_connected')}
                </span>
              </div>
              {googleUser ? (
                <button type="button" className="set-chip set-chip--danger" onClick={handleLogout}>
                  {t('disconnect')}
                </button>
              ) : (
                <button type="button" className="set-chip set-chip--primary" onClick={loginWithGoogle}>
                  {t('connect')}
                </button>
              )}
            </div>
          </div>

          <div className="set-dialog__group-label">
            {t('group_registered_devices', { count: devices.length })}
          </div>
          <div className="set-card-group">
            {devices.length === 0 ? (
              <div className="set-row set-row--static">
                <span className="set-row__value">{t('no_registered_devices')}</span>
              </div>
            ) : (
              devices.map((dev) => {
                const devId = dev.id || dev.deviceId;
                const isActive = devId === activeDeviceId;
                const confirming = confirmDeleteId === devId;
                return (
                  <div key={devId} className="set-device-entry">
                    <div className="set-row set-row--static">
                      <button
                        type="button"
                        className="set-device-select-btn"
                        onClick={() => selectActiveDevice(devId)}
                      >
                        <Radio
                          size={16}
                          color={isActive ? '#1d9b67' : '#9ca3af'}
                          style={{ fill: isActive ? '#1d9b67' : 'transparent', flexShrink: 0 }}
                          aria-hidden="true"
                        />
                        <span className="set-row__content">
                          <span className="set-row__label">{dev.name || devId}</span>
                          <span className="set-row__value">{devId}</span>
                        </span>
                        <span className={isActive ? 'set-active-pill' : 'set-standby-pill'}>
                          {isActive ? t('active') : t('choose_option')}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="set-delete-dev-btn"
                        onClick={() => setConfirmDeleteId(confirming ? null : devId)}
                        aria-label={t('delete_device_aria', { id: devId })}
                      >
                        <Trash2 size={14} color="#dc2626" aria-hidden="true" />
                      </button>
                    </div>
                    {confirming && (
                      <div className="set-delete-confirm">
                        <span>{t('remove_confirm', { name: devId })}</span>
                        <div className="set-delete-confirm__actions">
                          <button
                            type="button"
                            className="set-chip set-chip--neutral"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            {t('cancel')}
                          </button>
                          <button
                            type="button"
                            className="set-chip set-chip--danger"
                            onClick={() => {
                              removeDevice(devId);
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
              })
            )}

            <button
              type="button"
              className="set-row set-row--action"
              onClick={() => setShowAddDevice((v) => !v)}
            >
              <Plus size={16} aria-hidden="true" />
              <span>{t('add_device_btn')}</span>
            </button>

            {showAddDevice && (
              <form onSubmit={handleAddDevice} className="set-device-form">
                <div className="set-pill-field set-pill-field--compact">
                  <label htmlFor="new-device-id" className="visually-hidden">{t('device_id_label')}</label>
                  <input
                    id="new-device-id"
                    type="text"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="characters"
                    placeholder={t('device_id_placeholder')}
                    value={newDeviceId}
                    onChange={(e) => setNewDeviceId(e.target.value)}
                    required
                  />
                </div>
                <div className="set-pill-field set-pill-field--compact">
                  <label htmlFor="new-device-name" className="visually-hidden">{t('device_name_label')}</label>
                  <input
                    id="new-device-name"
                    type="text"
                    placeholder={t('device_name_placeholder')}
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                  />
                </div>
                <button type="submit" className="set-cta-pill">
                  {t('connect')}
                </button>
              </form>
            )}

            {deviceMsg && (
              <div
                className={`set-feedback ${deviceMsg.type === 'error' ? 'set-feedback--error' : 'set-feedback--success'
                  }`}
                style={{ margin: 12 }}
                role={deviceMsg.type === 'error' ? 'alert' : 'status'}
              >
                <span>{deviceMsg.text}</span>
              </div>
            )}
          </div>

          <button type="button" className="set-logout-pill" onClick={handleLogout}>
            {t('logout_account')}
          </button>
        </>
      )}

      {activeSheet === 'storage' && (
        <>
          <div className="set-dialog__hero">
            <div className="set-dialog__hero-circle set-dialog__hero-circle--amber" aria-hidden="true">
              <HardDrive size={26} />
            </div>
            <h3 className="set-dialog__hero-title">{t('storage_retention_title')}</h3>
            <p className="set-dialog__hero-sub">
              {isPro ? t('storage_desc_pro') : t('storage_desc_free')}
            </p>
          </div>

          <div className="set-card-group set-storage-card">
            <div className="set-storage-card__top">
              <span className="set-row__label">{t('storage_usage_label')}</span>
              <span className="set-storage-card__quota">
                {storageStats.loading
                  ? t('calculating')
                  : `${formatStorageBytes(storageUsedBytes)} / ${storageQuotaGb} GB`}
              </span>
            </div>

            <div
              className="set-quota-track set-quota-track--full"
              role="progressbar"
              aria-label={t('storage_usage_label')}
              aria-valuenow={Math.round(storagePct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="set-quota-fill"
                style={{
                  width: `${storageVisualPct}%`,
                  background:
                    storagePct >= 90
                      ? '#dc2626'
                      : storagePct >= 75
                        ? '#d98218'
                        : '#36b37e',
                }}
              />
            </div>

            <div className="set-storage-card__meta">
              <span>
                {t('storage_meta', {
                  count: storageStats.docCount,
                  remaining: formatStorageBytes(Math.max(0, storageQuotaBytes - storageUsedBytes)),
                })}
              </span>
            </div>
          </div>

          {!isPro && (
            <button
              type="button"
              className="set-cta-pill"
              onClick={() => openSheet('plan')}
            >
              <span>{t('upgrade_storage_cta')}</span>
            </button>
          )}
        </>
      )}

      {activeSheet === 'aiQuota' && (
        <>
          <div className="set-dialog__hero">
            <div className="set-dialog__hero-circle set-dialog__hero-circle--brand" aria-hidden="true">
              <Bot size={26} />
            </div>
            <h3 className="set-dialog__hero-title">Enzoponik AI</h3>
            <p className="set-dialog__hero-sub">
              {t('ai_quota_sub', { used: aiUsed, max: aiMaxQuota })}
            </p>

            <div className="set-quota-track" role="progressbar" aria-valuenow={aiProgressPct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="set-quota-fill"
                style={{
                  width: `${aiProgressPct}%`,
                  background:
                    aiRemaining === 0
                      ? '#dc2626'
                      : aiProgressPct >= 75
                        ? '#d98218'
                        : '#36b37e',
                }}
              />
            </div>
          </div>

          <div className="set-dialog__group-label">{t('group_ai_quota')}</div>
          <div className="set-card-group">
            <div className="set-row set-row--static">
              <div className="set-row__content">
                <span className="set-row__label">{t('used_today')}</span>
                <span className="set-row__value" style={{ fontWeight: 600 }}>
                  {aiUsed} / {aiMaxQuota} {t('prompt_unit')}
                </span>
              </div>
            </div>
            <div className="set-row set-row--static">
              <div className="set-row__content">
                <span className="set-row__label">{t('last_activity')}</span>
                <span className="set-row__value">
                  {aiQuota?.lastUsedAt
                    ? `${new Date(aiQuota.lastUsedAt).toLocaleTimeString(getIntlLocale(lang), {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}${aiQuota?.lastFeature ? ` · ${aiQuota.lastFeature}` : ''}`
                    : t('unused_today')}
                </span>
              </div>
            </div>
          </div>

          <div className="set-dialog__group-label">{t('group_ai_model')}</div>
          <div className="set-card-group">
            {[
              {
                id: 'auto',
                title: t('ai_auto_title'),
                desc: t('ai_auto_desc'),
              },
              {
                id: 'gemini',
                title: 'Gemini',
                desc: t('ai_gemini_desc'),
              },
              {
                id: 'cloudflare',
                title: 'Cloudflare',
                desc: t('ai_cf_desc'),
              },
            ].map((opt) => {
              const selected = aiProvider === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className="set-row"
                  onClick={() => handleSelectAiProvider(opt.id)}
                >
                  <span className="set-row__content">
                    <span className="set-row__label" style={{ fontWeight: selected ? 700 : 500 }}>
                      {opt.title}
                    </span>
                    <span className="set-row__value">{opt.desc}</span>
                  </span>
                  {selected && <Check size={17} color="#1d9b67" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {!isPro && (
            <button
              type="button"
              className="set-cta-pill"
              onClick={() => openSheet('plan')}
            >
              <span>{t('upgrade_ai_cta')}</span>
            </button>
          )}
        </>
      )}

      {activeSheet === 'plan' && (
        <>
          <div className="set-dialog__hero">
            <div className="set-dialog__hero-circle set-dialog__hero-circle--emerald" aria-hidden="true">
              <Wallet size={26} />
            </div>
            <h3 className="set-dialog__hero-title">
              {isPro ? t('plan_pro_active') : t('plan_free_title')}
            </h3>
            <p className="set-dialog__hero-sub">
              {isPro ? t('plan_pro_desc') : t('plan_free_desc')}
            </p>
          </div>

          <div className="set-dialog__group-label">{t('group_plan_options')}</div>
          <div className="set-card-group">
            <button type="button" className="set-row" onClick={() => setSubscriptionTier('free')}>
              <Radio
                size={17}
                color={!isPro ? '#1d9b67' : '#9ca3af'}
                style={{ fill: !isPro ? '#1d9b67' : 'transparent', flexShrink: 0 }}
                aria-hidden="true"
              />
              <span className="set-row__content">
                <span className="set-row__label">{t('plan_free')}</span>
                <span className="set-row__value">{t('plan_free_meta')}</span>
              </span>
            </button>

            <button type="button" className="set-row" onClick={() => setSubscriptionTier('pro')}>
              <Radio
                size={17}
                color={isPro ? '#1d9b67' : '#9ca3af'}
                style={{ fill: isPro ? '#1d9b67' : 'transparent', flexShrink: 0 }}
                aria-hidden="true"
              />
              <span className="set-row__content">
                <span className="set-row__label">{t('plan_premium')}</span>
                <span className="set-row__value">{t('plan_pro_meta')}</span>
              </span>
            </button>
          </div>
        </>
      )}

      {activeSheet === 'sprinkler' && (
        <>
          <div className="set-dialog__hero">
            <div className="set-dialog__hero-circle set-dialog__hero-circle--teal" aria-hidden="true">
              <Droplets size={26} />
            </div>
            <h3 className="set-dialog__hero-title">{t('irrigation_system_title')}</h3>
            <p className="set-dialog__hero-sub">
              {t('irrigation_system_sub')}
            </p>
          </div>

          <div className="set-dialog__group-label">{t('group_watering_mode')}</div>
          <div className="set-card-group">
            <div className="set-row set-row--static">
              <label htmlFor="set-auto-irrigation" className="set-row__content" style={{ cursor: 'pointer' }}>
                <span className="set-row__label">{t('auto_irrigation')}</span>
                <span className="set-row__value">
                  {autoIrrigation ? t('auto_irrigation_on') : t('auto_irrigation_off')}
                </span>
              </label>
              <SwitchInput
                id="set-auto-irrigation"
                checked={autoIrrigation}
                onChange={handleToggleAutoIrrigation}
              />
            </div>

            <div className="set-row set-row--static">
              <div className="set-row__content">
                <span className="set-row__label">{t('manual_watering')}</span>
                <span className="set-row__value">
                  {pumpActive || isFlushing ? t('irrigating') : t('pump_ready')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="set-chip set-chip--primary"
                  onClick={handleManualFlush}
                  disabled={controlBusy || isFlushing}
                >
                  {isFlushing ? <RefreshCw size={13} className="spin-anim" aria-hidden="true" /> : t('water_now')}
                </button>
                <button
                  type="button"
                  className="set-chip set-chip--danger"
                  onClick={handleManualStop}
                  disabled={controlBusy}
                >
                  {t('stop_pump')}
                </button>
              </div>
            </div>
          </div>

          {controlError && (
            <div className="set-feedback set-feedback--error" role="alert" style={{ marginTop: 12 }}>
              <AlertCircle size={14} aria-hidden="true" />
              <span>{controlError}</span>
            </div>
          )}
        </>
      )}

      {activeSheet === 'location' && (
        <>
          <div className="set-dialog__hero">
            <div className="set-dialog__hero-circle set-dialog__hero-circle--rose" aria-hidden="true">
              <MapPin size={26} />
            </div>
            <h3 className="set-dialog__hero-title">{displayLocation}</h3>
            <p className="set-dialog__hero-sub">
              {t('coordinates_label', {
                lat: locationConfig?.latitude != null ? Number(locationConfig.latitude).toFixed(4) : '-8.4095',
                lon: locationConfig?.longitude != null ? Number(locationConfig.longitude).toFixed(4) : '115.1889',
              })}
            </p>
          </div>

          <div className="set-dialog__group-label">{t('group_location_settings')}</div>
          <div className="set-card-group">
            <div className="set-row set-row--static">
              <label htmlFor="set-lock-coords" className="set-row__content" style={{ cursor: 'pointer' }}>
                <span className="set-row__label">{t('lock_coordinates')}</span>
              </label>
              <SwitchInput
                id="set-lock-coords"
                checked={locationConfig?.isLocked || false}
                onChange={(e) => updateLocationConfig({ isLocked: e.target.checked })}
              />
            </div>

            <button type="button" className="set-row set-row--action" onClick={handleGetCurrentLocation}>
              <Compass size={16} aria-hidden="true" />
              <span>
                {locLoading ? t('detecting_coords') : t('update_location')}
              </span>
            </button>
          </div>

          {locError && (
            <div className="set-feedback set-feedback--error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{t(locError)}</span>
            </div>
          )}
        </>
      )}
    </SettingsDialog>
  </main>
);
}
