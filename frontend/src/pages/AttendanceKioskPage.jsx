import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { apiPost } from '../lib/api';

const SCAN_COOLDOWN_MS = 3000;

function parseQrPayload(rawValue) {
  const rawText = String(rawValue || '').trim();

  if (!rawText) {
    return '';
  }

  try {
    const parsed = JSON.parse(rawText);

    if (typeof parsed === 'string') {
      return parsed.trim();
    }

    if (parsed && typeof parsed === 'object') {
      return String(
        parsed.client_code ||
          parsed.clientCode ||
          parsed.code ||
          parsed.client_id ||
          parsed.clientId ||
          ''
      ).trim();
    }
  } catch (_error) {
    // Ignore JSON parse errors because many QR payloads are plain text.
  }

  return rawText;
}

function normalizeMessage(message) {
  return String(message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function translateAttendanceErrorMessage(message) {
  const normalizedMessage = normalizeMessage(message);

  if (normalizedMessage.includes('client code not found')) {
    return 'Codigo de cliente no encontrado.';
  }

  return String(message || '');
}

function shouldClearClientCodeOnError(message) {
  const normalizedMessage = normalizeMessage(message);

  return (
    isDuplicateAttendanceMessage(normalizedMessage) ||
    normalizedMessage.includes('client code not found')
  );
}

function isDuplicateAttendanceMessage(message) {
  const normalizedMessage = normalizeMessage(message);

  return (
    normalizedMessage.includes('ya marco asistencia') ||
    normalizedMessage.includes('ya registro asistencia') ||
    (normalizedMessage.includes('ya registraste') && normalizedMessage.includes('asistencia')) ||
    (normalizedMessage.includes('ya marco') && normalizedMessage.includes('asistencia'))
  );
}

export function AttendanceKioskPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const clientCodeInputRef = useRef(null);
  const scannerInstanceId = useId().replace(/:/g, '');
  const scannerElementId = `attendance-kiosk-qr-scanner-${scannerInstanceId}`;
  const scannerRef = useRef(null);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef({ value: '', timestamp: 0 });

  const [clientCode, setClientCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [scannerEnabled, setScannerEnabled] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanInfo, setScanInfo] = useState('');
  const [lastQrValue, setLastQrValue] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lastCheckin, setLastCheckin] = useState(null);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  function focusClientCodeInput() {
    requestAnimationFrame(() => {
      clientCodeInputRef.current?.focus();
    });
  }

  function openUnlockModal() {
    setUnlockModalOpen(true);
    setUnlockError('');
    setAdminUsername('');
    setAdminPassword('');
  }

  function closeUnlockModal() {
    if (unlockLoading) {
      return;
    }

    setUnlockModalOpen(false);
    setUnlockError('');
    setAdminUsername('');
    setAdminPassword('');
  }

  async function handleUnlockKiosk(event) {
    event.preventDefault();

    const normalizedUsername = String(adminUsername || '').trim();
    const normalizedPassword = String(adminPassword || '');

    if (!normalizedUsername || !normalizedPassword) {
      setUnlockError('Ingresa usuario y clave de administrador.');
      return;
    }

    setUnlockLoading(true);
    setUnlockError('');

    try {
      const response = await apiPost('/auth/login', {
        username: normalizedUsername,
        password: normalizedPassword
      });
      const roleName = String(response?.data?.user?.role_name || '').toLowerCase();

      if (roleName !== 'admin') {
        setUnlockError('El usuario no tiene permisos de administrador.');
        return;
      }

      closeUnlockModal();
      navigate('/attendance');
    } catch (_error) {
      setUnlockError('Clave de administrador invalida.');
    } finally {
      setUnlockLoading(false);
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current;

    if (!scanner) {
      return;
    }

    scannerRef.current = null;

    try {
      await scanner.stop();
    } catch (_stopError) {
      // Ignore stop errors when scanner is already stopped.
    }

    try {
      await scanner.clear();
    } catch (_clearError) {
      // Ignore clear errors if container is already unavailable.
    }
  }

  async function submitCheckin(rawCode, notes) {
    const normalizedCode = String(rawCode || '').trim();

    if (!normalizedCode) {
      throw new Error('Ingresa un codigo de cliente valido.');
    }

    if (!user?.id) {
      throw new Error('No se detecto la sesion activa. Inicia sesion nuevamente.');
    }

    const response = await apiPost('/attendance/checkins/by-code', {
      client_code: normalizedCode,
      checked_in_by_user_id: user.id,
      access_type: 'membership',
      notes
    });

    const data = response.data || {};
    const warning = data.warning_message ? ` Aviso: ${data.warning_message}` : '';

    setLastCheckin({
      checkedAt: data.checked_in_at,
      status: data.status || 'allowed',
      accessType: data.access_type || 'membership'
    });

    setMessage(`Asistencia registrada correctamente.${warning}`);
    setError('');
    setClientCode('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await submitCheckin(clientCode, 'Check-in por codigo de cliente');
    } catch (requestError) {
      const originalMessage = requestError.message || 'No fue posible registrar asistencia';
      const errorMessage = translateAttendanceErrorMessage(originalMessage);
      setError(errorMessage);

      if (shouldClearClientCodeOnError(originalMessage)) {
        setClientCode('');
      }
    } finally {
      setSaving(false);
      focusClientCodeInput();
    }
  }

  async function handleQrScan(decodedText) {
    const parsedValue = parseQrPayload(decodedText);
    const now = Date.now();
    const lastScan = lastScanRef.current;

    if (scanLockRef.current) {
      return;
    }

    if (lastScan.value === parsedValue && now - lastScan.timestamp < SCAN_COOLDOWN_MS) {
      return;
    }

    scanLockRef.current = true;
    lastScanRef.current = {
      value: parsedValue,
      timestamp: now
    };

    setLastQrValue(parsedValue || decodedText || '');
    setScanInfo('QR detectado. Procesando...');
    setError('');
    setMessage('');

    try {
      await submitCheckin(parsedValue, 'Check-in por escaneo QR');
      setScanInfo('Ingreso registrado por QR.');
    } catch (requestError) {
      const originalMessage = requestError.message || 'No fue posible procesar el QR';
      const errorMessage = translateAttendanceErrorMessage(originalMessage);
      setError(errorMessage);
      setScanInfo(errorMessage);

      if (shouldClearClientCodeOnError(originalMessage)) {
        setClientCode('');
      }
    } finally {
      scanLockRef.current = false;
      focusClientCodeInput();
    }
  }

  useEffect(() => {
    focusClientCodeInput();
  }, []);

  useEffect(() => {
    // Keep kiosk route protected when user presses browser back button.
    window.history.pushState({ kiosk_guard: true }, '', window.location.href);

    const handlePopState = () => {
      setUnlockModalOpen(true);
      setUnlockError('');
      setAdminUsername('');
      setAdminPassword('');
      window.history.pushState({ kiosk_guard: true }, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!scannerEnabled) {
      setScannerReady(false);
      setCameraError('');
      setScanInfo('');
      setLastQrValue('');
      stopScanner();
      return;
    }

    let isCancelled = false;

    async function startScanner() {
      setCameraError('');
      setScannerReady(false);

      try {
        const { Html5Qrcode } = await import('html5-qrcode');

        if (isCancelled) {
          return;
        }

        const scanner = new Html5Qrcode(scannerElementId);
        scannerRef.current = scanner;
        const scannerConfig = {
          fps: 10,
          qrbox: {
            width: 240,
            height: 240
          },
          aspectRatio: 1
        };

        const onSuccess = (decodedText) => {
          handleQrScan(decodedText);
        };

        try {
          await scanner.start({ facingMode: 'environment' }, scannerConfig, onSuccess, () => {});
        } catch (_cameraByFacingModeError) {
          const cameras = await Html5Qrcode.getCameras();

          if (!cameras?.length) {
            throw new Error('No se detectaron camaras disponibles');
          }

          await scanner.start(cameras[0].id, scannerConfig, onSuccess, () => {});
        }

        if (isCancelled) {
          await stopScanner();
          return;
        }

        setScannerReady(true);
      } catch (_startError) {
        setCameraError('No se pudo iniciar la camara. Verifica permisos y usa HTTPS o localhost.');
        setScannerEnabled(false);
      }
    }

    startScanner();

    return () => {
      isCancelled = true;
      stopScanner();
    };
  }, [scannerEnabled, scannerElementId]);

  const companyName = settings.company_name || 'RohiPOS';
  const kioskLogo = settings.kiosk_logo_data_url || settings.company_logo_data_url || null;
  const kioskBackground = settings.kiosk_background_data_url || null;
  const currentDate = currentDateTime.toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const currentTime = currentDateTime
    .toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
    .toLowerCase();

  return (
    <div
      className="min-h-screen bg-brand-cream p-4 lg:p-8"
      style={
        kioskBackground
          ? {
              backgroundImage: `linear-gradient(rgba(248,245,236,0.84), rgba(248,245,236,0.9)), url(${kioskBackground})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }
          : undefined
      }
    >
      <div className="relative mx-auto max-w-3xl rounded-[2rem] border border-white/45 bg-white/30 p-6 shadow-panel backdrop-blur-[4px] lg:p-8">
        <button
          aria-label="Salir del modo kiosco"
          className="absolute right-4 top-4 rounded-xl border border-brand-sand px-3 py-1 text-lg font-bold leading-none text-brand-forest"
          onClick={openUnlockModal}
          type="button"
        >
          X
        </button>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-4">
            {kioskLogo ? (
              <img
                alt="Logo empresa"
                className="h-20 w-28 rounded-2xl border border-brand-sand/60 bg-white/35 p-2 object-contain"
                src={kioskLogo}
              />
            ) : null}
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-brand-moss">Modo kiosco</p>
              <h1 className="mt-1 text-3xl font-semibold text-brand-forest">Marcar asistencia</h1>
              <p className="mt-2 text-sm text-brand-forest/70">
              Pantalla exclusiva para check-in por codigo de cliente. {companyName}
              </p>
              <p className="mt-2 text-sm font-semibold text-brand-forest/85">
                Fecha: {currentDate} | Hora: {currentTime}
              </p>
            </div>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : null}
        {message ? (
          <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-brand-forest">Codigo de cliente</span>
            <input
              ref={clientCodeInputRef}
              className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3 text-lg"
              onChange={(event) => setClientCode(event.target.value)}
              placeholder="Ej: CLI-0101"
              value={clientCode}
            />
          </label>

          <button
            className="rounded-2xl bg-brand-moss px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? 'Procesando...' : 'Marcar asistencia'}
          </button>
        </form>

        <section className="mt-6 rounded-2xl border border-brand-sand/70 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-moss">Ultimo registro</h2>
          {!lastCheckin ? (
            <p className="mt-3 text-sm text-brand-forest/70">Aun no se ha registrado asistencia en esta sesion.</p>
          ) : (
            <div className="mt-3 grid gap-1 text-brand-forest">
              <p className="text-sm">Estado: {lastCheckin.status === 'allowed' ? 'Permitido' : 'Denegado'}</p>
              <p className="text-sm">Tipo de acceso: {lastCheckin.accessType === 'membership' ? 'Membresia' : 'Pase diario'}</p>
              <p className="text-sm">
                Hora: {lastCheckin.checkedAt ? new Date(lastCheckin.checkedAt).toLocaleString('es-NI') : '--'}
              </p>
            </div>
          )}
        </section>

        {unlockModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-brand-sand/70 bg-white p-5 shadow-panel">
              <h2 className="text-xl font-semibold text-brand-forest">Salida protegida</h2>
              <p className="mt-2 text-sm text-brand-forest/70">
                Ingresa credenciales de administrador para salir del modo kiosco.
              </p>

              <form className="mt-4 grid gap-3" onSubmit={handleUnlockKiosk}>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Usuario admin</span>
                  <input
                    autoComplete="username"
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    onChange={(event) => setAdminUsername(event.target.value)}
                    placeholder="Ej: admin"
                    value={adminUsername}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Clave admin</span>
                  <input
                    autoComplete="current-password"
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    onChange={(event) => setAdminPassword(event.target.value)}
                    placeholder="Ingresa la clave"
                    type="password"
                    value={adminPassword}
                  />
                </label>

                {unlockError ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{unlockError}</p>
                ) : null}

                <div className="mt-1 flex justify-end gap-2">
                  <button
                    className="rounded-2xl border border-brand-sand px-4 py-2 text-sm font-semibold text-brand-forest"
                    onClick={closeUnlockModal}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="rounded-2xl bg-brand-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={unlockLoading}
                    type="submit"
                  >
                    {unlockLoading ? 'Validando...' : 'Confirmar salida'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
