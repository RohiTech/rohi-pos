import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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

export function AttendanceKioskPage() {
  const { user } = useAuth();
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
      setError(requestError.message || 'No fue posible registrar asistencia');
    } finally {
      setSaving(false);
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
      const errorMessage = requestError.message || 'No fue posible procesar el QR';
      setError(errorMessage);
      setScanInfo(errorMessage);
    } finally {
      scanLockRef.current = false;
    }
  }

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

  return (
    <div className="min-h-screen bg-brand-cream p-4 lg:p-8">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-brand-sand/70 bg-white p-6 shadow-panel lg:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-moss">Modo kiosco</p>
            <h1 className="mt-1 text-3xl font-semibold text-brand-forest">Marcar asistencia</h1>
            <p className="mt-2 text-sm text-brand-forest/70">
              Pantalla exclusiva para check-in por QR o codigo de cliente.
            </p>
          </div>
          <Link
            className="rounded-2xl border border-brand-sand px-4 py-2 text-sm font-semibold text-brand-forest"
            to="/attendance"
          >
            Volver al modulo completo
          </Link>
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

        <section className="mt-6 rounded-2xl border border-brand-sand/70 bg-brand-cream/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-brand-forest">Escaneo QR</h2>
            <button
              className="rounded-2xl border border-brand-sand px-4 py-2 text-sm font-semibold text-brand-forest"
              onClick={() => setScannerEnabled((current) => !current)}
              type="button"
            >
              {scannerEnabled ? 'Desactivar camara' : 'Activar camara'}
            </button>
          </div>

          {cameraError ? <p className="mb-3 text-sm text-rose-700">{cameraError}</p> : null}
          {scanInfo ? <p className="mb-3 text-sm text-brand-forest/80">{scanInfo}</p> : null}
          {lastQrValue ? <p className="mb-3 text-xs text-brand-forest/70">Ultimo QR: {lastQrValue}</p> : null}

          <div
            className={`overflow-hidden rounded-2xl border border-dashed border-brand-sand bg-white ${
              scannerEnabled ? 'min-h-[260px]' : 'min-h-[120px]'
            }`}
          >
            {scannerEnabled ? (
              <div id={scannerElementId} className="h-full w-full p-3" />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-sm text-brand-forest/70">
                Activa la camara para leer codigos QR.
              </div>
            )}
          </div>

          {scannerEnabled && !scannerReady ? (
            <p className="mt-3 text-xs text-brand-forest/70">Iniciando lector...</p>
          ) : null}
        </section>

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
      </div>
    </div>
  );
}
