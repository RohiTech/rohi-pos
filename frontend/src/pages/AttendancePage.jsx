import { useEffect, useId, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { apiGet, apiPost, authToken, buildQueryString } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';

const initialForm = {
  client_id: '',
  payment_method: 'cash',
  daily_pass_amount: '',
  notes: ''
};

const SCAN_COOLDOWN_MS = 3000;
const DAILY_PAYMENTS_PAGE_SIZE = 8;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
      return String(parsed.client_code || parsed.clientCode || parsed.code || parsed.client_id || parsed.clientId || '').trim();
    }
  } catch (_error) {
    // The QR usually comes as plain text client code; ignore JSON parse errors.
  }

  return rawText;
}

function getAttendanceTone(status) {
  if (status === 'allowed') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'denied') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-slate-100 text-slate-700';
}

function getExportStamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('');
}

function exportRowsToExcel(sheetName, rows, fileName, widths = []) {
  const worksheet = XLSX.utils.json_to_sheet(rows);

  if (widths.length) {
    worksheet['!cols'] = widths.map((wch) => ({ wch }));
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}_${getExportStamp()}.xlsx`);
}

function exportRowsToPdf(title, columns, rows, fileName) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;
  const rowHeight = 18;
  const usableWidth = pageWidth - margin * 2;
  const colWidth = usableWidth / columns.length;
  let y = margin;

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, margin, y);
    y += 24;
    doc.setFontSize(9);
    columns.forEach((column, index) => {
      doc.text(column, margin + index * colWidth + 2, y);
    });
    y += 8;
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  drawHeader();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  rows.forEach((row) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    row.forEach((value, index) => {
      const text = doc.splitTextToSize(String(value ?? '--'), colWidth - 6)[0] || '--';
      doc.text(text, margin + index * colWidth + 2, y);
    });

    y += rowHeight;
  });

  doc.save(`${fileName}_${getExportStamp()}.pdf`);
}

export function AttendancePage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const scannerInstanceId = useId().replace(/:/g, '');
  const scannerElementId = `attendance-qr-scanner-${scannerInstanceId}`;
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [clientPage, setClientPage] = useState(1);
  const [clients, setClients] = useState([]);
  const [clientPagination, setClientPagination] = useState({
    page: 1,
    limit: 8,
    totalItems: 0,
    totalPages: 1
  });
  const [summary, setSummary] = useState(null);
  const [dailyPayments, setDailyPayments] = useState([]);
  const [dailyPaymentsSearch, setDailyPaymentsSearch] = useState('');
  const [dailyPaymentsPage, setDailyPaymentsPage] = useState(1);
  const [reprintingPaymentId, setReprintingPaymentId] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scannerEnabled, setScannerEnabled] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanInfo, setScanInfo] = useState('');
  const [lastQrValue, setLastQrValue] = useState('');
  const [photoViewerSrc, setPhotoViewerSrc] = useState('');
  const [photoViewerAlt, setPhotoViewerAlt] = useState('Foto de cliente');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const scannerRef = useRef(null);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef({ value: '', timestamp: 0 });
  const userIdRef = useRef(null);
  const formRef = useRef(initialForm);
  const submittedSearchRef = useRef('');
  const clientPageRef = useRef(1);

  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    submittedSearchRef.current = submittedSearch;
  }, [submittedSearch]);

  useEffect(() => {
    clientPageRef.current = clientPage;
  }, [clientPage]);

  async function openDailyPassReceipt(paymentId) {
    if (!paymentId) {
      return;
    }

    const response = await fetch(`${API_URL}/attendance/daily-pass-payments/${paymentId}/receipt/pdf`, {
      headers: authToken
        ? {
            Authorization: `Bearer ${authToken}`
          }
        : {}
    });

    if (!response.ok) {
      throw new Error('No se pudo abrir el recibo del pago diario.');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  }

  async function handleReprintReceipt(paymentId) {
    if (!paymentId) {
      return;
    }

    setError('');

    try {
      setReprintingPaymentId(paymentId);
      await openDailyPassReceipt(paymentId);
    } catch (requestError) {
      setError(requestError.message || 'No se pudo reimprimir el recibo.');
    } finally {
      setReprintingPaymentId(null);
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
      // Ignore stop errors when the scanner was not running.
    }

    try {
      await scanner.clear();
    } catch (_clearError) {
      // Ignore clear errors because the scanner container may already be gone.
    }
  }

  async function loadDashboard(searchTerm = '', page = 1) {
    setLoading(true);
    setError('');

    try {
      const querySuffix = buildQueryString({
        search: searchTerm.trim(),
        page,
        limit: 8,
        only_without_active_membership: true
      });

      const [summaryResponse, dailyPaymentsResponse, attendanceClientsResponse, clientsResponse] = await Promise.all([
        apiGet('/attendance/summary'),
        apiGet('/attendance/daily-pass-payments'),
        apiGet(`/attendance/clients${querySuffix}`),
        apiGet(`/clients${querySuffix}`)
      ]);

      const clientsPhotoById = new Map(
        (clientsResponse.data || []).map((client) => [String(client.id), client.photo_url || null])
      );

      const attendanceClients = (attendanceClientsResponse.data || []).map((client) => ({
        ...client,
        photo_url: client.photo_url || clientsPhotoById.get(String(client.id)) || null
      }));

      setSummary(summaryResponse.data);
      setDailyPayments(dailyPaymentsResponse.data || []);
      setClients(attendanceClients);
      setClientPagination(
        attendanceClientsResponse.pagination || {
          page: 1,
          limit: 8,
          totalItems: attendanceClients.length,
          totalPages: Math.max(1, Math.ceil(attendanceClients.length / 8))
        }
      );
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar asistencia');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard(submittedSearch, clientPage);
  }, [submittedSearch, clientPage]);

  function handleSelectClient(client) {
    if (!client.is_active) {
      setSelectedClient(client);
      setForm(initialForm);
      setMessage('');
      setError('El cliente seleccionado esta inactivo y no puede marcar asistencia.');
      return;
    }

    setSelectedClient(client);
    setForm((current) => ({
      ...current,
      client_id: String(client.id),
      daily_pass_amount: String(settings.routine_price || current.daily_pass_amount || '')
    }));
    setMessage('');
    setError('');
  }

  useEffect(() => {
    if (Number(form.daily_pass_amount || 0) > 0) {
      return;
    }

    setForm((current) => ({
      ...current,
      daily_pass_amount: String(settings.routine_price || '')
    }));
  }, [form.daily_pass_amount, settings.routine_price]);

  async function handleSearch(event) {
    event.preventDefault();
    setClientPage(1);
    setSubmittedSearch(search);
  }

  async function resolveClientFromQr(decodedText) {
    const parsedValue = parseQrPayload(decodedText);

    if (!parsedValue) {
      throw new Error('El QR no contiene un codigo de cliente valido.');
    }

    const querySuffix = buildQueryString({
      search: parsedValue,
      page: 1,
      limit: 8
    });

    const clientsResponse = await apiGet(`/attendance/clients${querySuffix}`);
    const foundClients = clientsResponse.data || [];

    if (!foundClients.length) {
      throw new Error(`No se encontro cliente para el codigo ${parsedValue}.`);
    }

    const normalized = parsedValue.toLowerCase();
    const exactMatch = foundClients.find(
      (client) => String(client.client_code || '').toLowerCase() === normalized
    );

    return exactMatch || foundClients[0];
  }

  async function registerAttendance(client, payloadOverrides = {}) {
    const checkedInByUserId = userIdRef.current;

    if (!checkedInByUserId) {
      throw new Error('No se detecto la sesion del usuario. Recarga la pagina e intenta de nuevo.');
    }

    const currentForm = formRef.current;

    const payload = {
      client_id: Number(client.id),
      checked_in_by_user_id: checkedInByUserId,
      access_type: payloadOverrides.access_type || currentForm.access_type,
      payment_method: payloadOverrides.payment_method || currentForm.payment_method,
      daily_pass_amount:
        (payloadOverrides.access_type || currentForm.access_type) === 'daily_pass'
          ? Number((payloadOverrides.daily_pass_amount ?? currentForm.daily_pass_amount) || 0)
          : undefined,
      notes: (payloadOverrides.notes ?? currentForm.notes) || null
    };

    const response = await apiPost('/attendance/checkins', payload);
    const warning = response.data.warning_message ? ` Aviso: ${response.data.warning_message}` : '';
    setMessage(`Asistencia procesada correctamente.${warning}`);
    setForm(initialForm);
    setSelectedClient(null);
    await loadDashboard(submittedSearchRef.current, clientPageRef.current);
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

    setError('');
    setMessage('');
    setScanInfo('QR detectado. Procesando...');

    try {
      const client = await resolveClientFromQr(decodedText);
      handleSelectClient(client);
      await registerAttendance(client, {
        access_type: 'membership',
        notes: 'Check-in por escaneo QR'
      });
      setScanInfo(`Ingreso registrado para ${client.first_name} ${client.last_name}.`);
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
          await scanner.start(
            { facingMode: 'environment' },
            scannerConfig,
            onSuccess,
            () => {}
          );
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

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedClient) {
      setError('Selecciona un cliente antes de registrar asistencia');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const checkedInByUserId = userIdRef.current;
      if (!checkedInByUserId) {
        throw new Error('No se detecto la sesion del usuario. Recarga la pagina e intenta de nuevo.');
      }

      const paymentResponse = await apiPost('/attendance/daily-pass-payments', {
        client_id: Number(selectedClient.id),
        received_by_user_id: checkedInByUserId,
        payment_method: form.payment_method,
        daily_pass_amount: Number(form.daily_pass_amount || 0),
        notes: form.notes || null
      });

      await openDailyPassReceipt(paymentResponse?.data?.payment?.id);

      setMessage('Pago diario registrado correctamente. El cliente ya puede marcar asistencia hoy.');
      setForm(initialForm);
      setSelectedClient(null);
      await loadDashboard(submittedSearchRef.current, clientPageRef.current);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible registrar el pago diario');
    } finally {
      setSaving(false);
    }
  }

  function openPhotoViewer(src, alt = 'Foto de cliente') {
    if (!src) {
      return;
    }

    setPhotoViewerSrc(src);
    setPhotoViewerAlt(alt);
  }

  function closePhotoViewer() {
    setPhotoViewerSrc('');
    setPhotoViewerAlt('Foto de cliente');
  }

  const normalizedDailyPaymentsSearch = dailyPaymentsSearch.trim().toLowerCase();
  const filteredDailyPayments = dailyPayments.filter((payment) => {
    if (!normalizedDailyPaymentsSearch) {
      return true;
    }

    const fullName = `${payment.client_first_name || ''} ${payment.client_last_name || ''}`.trim().toLowerCase();
    const clientCode = String(payment.client_code || '').toLowerCase();
    const paymentMethod = String(payment.payment_method || '').toLowerCase();
    const notes = String(payment.notes || '').toLowerCase();

    return (
      fullName.includes(normalizedDailyPaymentsSearch) ||
      clientCode.includes(normalizedDailyPaymentsSearch) ||
      paymentMethod.includes(normalizedDailyPaymentsSearch) ||
      notes.includes(normalizedDailyPaymentsSearch)
    );
  });
  const dailyPaymentsTotalPages = Math.max(1, Math.ceil(filteredDailyPayments.length / DAILY_PAYMENTS_PAGE_SIZE));
  const safeDailyPaymentsPage = Math.min(dailyPaymentsPage, dailyPaymentsTotalPages);
  const paginatedDailyPayments = filteredDailyPayments.slice(
    (safeDailyPaymentsPage - 1) * DAILY_PAYMENTS_PAGE_SIZE,
    safeDailyPaymentsPage * DAILY_PAYMENTS_PAGE_SIZE
  );
  const pendingCheckinCount = dailyPayments.filter((payment) => !payment.used_for_checkin_today).length;

  useEffect(() => {
    setDailyPaymentsPage((currentPage) => Math.min(currentPage, dailyPaymentsTotalPages));
  }, [dailyPaymentsTotalPages]);

  function handleExportClientsExcel() {
    if (!clients.length) {
      setError('No hay clientes para exportar.');
      return;
    }

    setError('');
    exportRowsToExcel(
      'Clientes rutina',
      clients.map((client) => ({
        Codigo: client.client_code || '--',
        Nombre: `${client.first_name || ''} ${client.last_name || ''}`.trim() || '--',
        Telefono: client.phone || '--',
        Plan: client.plan_name || 'Sin plan registrado',
        Estado: client.is_active ? 'Activo' : 'Inactivo',
        Membresia: client.membership_effective_status || 'Sin membresia',
        Vence: formatDate(client.end_date)
      })),
      'clientes_pago_rutina',
      [14, 26, 16, 24, 12, 18, 14]
    );
  }

  function handleExportClientsPdf() {
    if (!clients.length) {
      setError('No hay clientes para exportar.');
      return;
    }

    setError('');
    exportRowsToPdf(
      'Clientes encontrados - Pago Rutina',
      ['Codigo', 'Nombre', 'Telefono', 'Plan', 'Estado', 'Membresia', 'Vence'],
      clients.map((client) => [
        client.client_code || '--',
        `${client.first_name || ''} ${client.last_name || ''}`.trim() || '--',
        client.phone || '--',
        client.plan_name || 'Sin plan',
        client.is_active ? 'Activo' : 'Inactivo',
        client.membership_effective_status || 'Sin membresia',
        formatDate(client.end_date)
      ]),
      'clientes_pago_rutina'
    );
  }

  function handleExportDailyPaymentsExcel() {
    if (!filteredDailyPayments.length) {
      setError('No hay pagos para exportar.');
      return;
    }

    setError('');
    exportRowsToExcel(
      'Pagos rutina',
      filteredDailyPayments.map((payment) => ({
        Codigo: payment.client_code || '--',
        Cliente: `${payment.client_first_name || ''} ${payment.client_last_name || ''}`.trim() || '--',
        Monto: Number(payment.amount || 0),
        Metodo: payment.payment_method || '--',
        Estado: payment.used_for_checkin_today ? 'Asistencia usada' : 'Pendiente de marcar',
        Fecha: formatDate(payment.paid_at),
        Notas: payment.notes || 'Sin notas'
      })),
      'pagos_rutina',
      [14, 26, 12, 16, 20, 16, 36]
    );
  }

  function handleExportDailyPaymentsPdf() {
    if (!filteredDailyPayments.length) {
      setError('No hay pagos para exportar.');
      return;
    }

    setError('');
    exportRowsToPdf(
      'Pagos de rutina del dia',
      ['Codigo', 'Cliente', 'Monto', 'Metodo', 'Estado', 'Fecha', 'Notas'],
      filteredDailyPayments.map((payment) => [
        payment.client_code || '--',
        `${payment.client_first_name || ''} ${payment.client_last_name || ''}`.trim() || '--',
        formatCurrency(payment.amount || 0),
        payment.payment_method || '--',
        payment.used_for_checkin_today ? 'Asistencia usada' : 'Pendiente',
        formatDate(payment.paid_at),
        payment.notes || 'Sin notas'
      ]),
      'pagos_rutina'
    );
  }

  return (
    <div>
      {message ? <p className="mb-4 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <DataPanel title="Ingresos hoy" subtitle="Check-ins procesados hoy.">
          <p className="text-4xl font-bold text-brand-forest">{summary?.total_today ?? 0}</p>
        </DataPanel>
        <DataPanel title="Permitidos" subtitle="Clientes con acceso aprobado hoy.">
          <p className="text-4xl font-bold text-emerald-600">{summary?.allowed_today ?? 0}</p>
        </DataPanel>
        <DataPanel title="Denegados" subtitle="Clientes con problema de acceso hoy.">
          <p className="text-4xl font-bold text-rose-600">{summary?.denied_today ?? 0}</p>
        </DataPanel>
        <DataPanel title="Cobros diarios" subtitle="Ingreso por pases del dia.">
          <p className="text-4xl font-bold text-brand-clay">
            {formatCurrency(summary?.daily_pass_income_today ?? 0)}
          </p>
        </DataPanel>
        <DataPanel title="Pendiente de Marcar" subtitle="Pagaron hoy pero aun no registran asistencia.">
          <p className="text-4xl font-bold text-amber-600">{pendingCheckinCount}</p>
        </DataPanel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-6">
          <DataPanel title="Buscar cliente" subtitle="Busca por codigo, nombre o telefono.">
            <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSearch}>
              <input
                className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ej. CLI-0100, Maria o telefono"
                value={search}
              />
              <button
                className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
                type="submit"
              >
                Buscar
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-2xl border border-brand-sand px-4 py-2 text-sm font-semibold text-brand-forest disabled:opacity-60"
                disabled={!clients.length}
                onClick={handleExportClientsExcel}
                type="button"
              >
                Exportar Excel
              </button>
              <button
                className="rounded-2xl border border-brand-sand px-4 py-2 text-sm font-semibold text-brand-forest disabled:opacity-60"
                disabled={!clients.length}
                onClick={handleExportClientsPdf}
                type="button"
              >
                Exportar PDF
              </button>
            </div>

            {loading ? <p className="mt-4 text-sm text-brand-forest/70">Cargando clientes...</p> : null}

            {!loading && !clients.length ? (
              <div className="mt-4">
                <EmptyState title="Sin coincidencias" description="No hay clientes para el criterio actual." />
              </div>
            ) : null}

            {clients.length ? (
              <div className="mt-4 space-y-3">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedClient?.id === client.id
                        ? 'border-brand-clay bg-brand-cream/70'
                        : client.is_active
                          ? 'border-brand-sand/70 bg-white hover:bg-brand-cream/40'
                          : 'border-slate-200 bg-slate-100/80 opacity-70'
                    }`}
                    onClick={() => handleSelectClient(client)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {client.photo_url ? (
                          <img
                            alt={`${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Cliente'}
                            className="h-12 w-12 cursor-zoom-in rounded-full border border-brand-sand/70 object-cover"
                            onClick={(event) => {
                              event.stopPropagation();
                              openPhotoViewer(
                                client.photo_url,
                                `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Foto de cliente'
                              );
                            }}
                            src={client.photo_url}
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-sand/70 bg-brand-cream/70 text-sm font-semibold uppercase text-brand-forest">
                            {`${client.first_name?.[0] || ''}${client.last_name?.[0] || ''}` || '--'}
                          </div>
                        )}
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">
                            {client.client_code}
                          </p>
                          <h3 className="mt-1 font-semibold text-brand-forest">
                            {client.first_name} {client.last_name}
                          </h3>
                          <p className="mt-1 text-sm text-brand-forest/70">
                            {client.plan_name || 'Sin plan registrado'}
                          </p>
                        </div>
                      </div>
                      {!client.is_active ? (
                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                          inactivo
                        </span>
                      ) : client.membership_effective_status ? (
                        <StatusBadge value={client.membership_effective_status} />
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                          sin membresia
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-sm text-brand-forest/70">
                      Vence: {formatDate(client.end_date)}
                    </p>
                    {!client.is_active ? (
                      <p className="mt-2 text-sm font-semibold text-rose-700">
                        Cliente inactivo. No se permite registrar asistencia.
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            <Pagination currentPage={clientPagination.page} itemLabel="clientes" onPageChange={setClientPage} pageSize={clientPagination.limit} totalItems={clientPagination.totalItems} totalPages={clientPagination.totalPages} />
          </DataPanel>
        </div>

        <div className="grid content-start gap-6">
          <DataPanel
            title="Registrar pago de rutina"
            subtitle="Solo clientes sin membresia activa. El pago habilita asistencia durante hoy."
          >
            {selectedClient ? (
              <div className="mb-4 rounded-2xl border border-brand-sand/70 bg-brand-cream/40 p-4">
                <div className="flex items-start gap-3">
                  {selectedClient.photo_url ? (
                    <img
                      alt={`${selectedClient.first_name || ''} ${selectedClient.last_name || ''}`.trim() || 'Cliente'}
                      className="h-14 w-14 cursor-zoom-in rounded-full border border-brand-sand/70 object-cover"
                      onClick={() =>
                        openPhotoViewer(
                          selectedClient.photo_url,
                          `${selectedClient.first_name || ''} ${selectedClient.last_name || ''}`.trim() || 'Foto de cliente'
                        )
                      }
                      src={selectedClient.photo_url}
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand-sand/70 bg-brand-cream/70 text-sm font-semibold uppercase text-brand-forest">
                      {`${selectedClient.first_name?.[0] || ''}${selectedClient.last_name?.[0] || ''}` || '--'}
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">
                      {selectedClient.client_code}
                    </p>
                    <h3 className="mt-1 font-semibold text-brand-forest">
                      {selectedClient.first_name} {selectedClient.last_name}
                    </h3>
                  </div>
                </div>
                <p className="mt-2 text-sm text-brand-forest/70">
                  Plan actual: {selectedClient.plan_name || 'Sin membresia activa'}
                </p>
                <p className="mt-1 text-sm text-brand-forest/70">
                  Vence: {formatDate(selectedClient.end_date)}
                </p>
                {!selectedClient.is_active ? (
                  <p className="mt-3 rounded-2xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">
                    El cliente esta inactivo. No se puede registrar asistencia.
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState title="Sin cliente seleccionado" description="Selecciona un cliente sin membresia activa desde la lista." />
            )}

            <form className="mt-4 grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Precio de la rutina</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  min="0.01"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      daily_pass_amount: event.target.value
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={form.daily_pass_amount}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Metodo de pago</span>
                <select
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      payment_method: event.target.value
                    }))
                  }
                  value={form.payment_method}
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                  <option value="mobile">Pago movil</option>
                  <option value="other">Otro</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Notas</span>
                <textarea
                  className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                      client_id: selectedClient ? String(selectedClient.id) : current.client_id
                    }))
                  }
                  value={form.notes}
                />
              </label>

              <button
                className="rounded-2xl bg-brand-clay px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                disabled={
                  saving ||
                  !selectedClient ||
                  !selectedClient.is_active
                }
                type="submit"
              >
                {saving ? 'Procesando...' : 'Registrar pago diario'}
              </button>
            </form>
          </DataPanel>

          <DataPanel title="Pagos de rutina del dia" subtitle="Clientes que ya pagaron su rutina hoy.">
            <input
              className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
              onChange={(event) => {
                setDailyPaymentsSearch(event.target.value);
                setDailyPaymentsPage(1);
              }}
              placeholder="Buscar por codigo, cliente, metodo o nota"
              value={dailyPaymentsSearch}
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-2xl border border-brand-sand px-4 py-2 text-sm font-semibold text-brand-forest disabled:opacity-60"
                disabled={!filteredDailyPayments.length}
                onClick={handleExportDailyPaymentsExcel}
                type="button"
              >
                Exportar Excel
              </button>
              <button
                className="rounded-2xl border border-brand-sand px-4 py-2 text-sm font-semibold text-brand-forest disabled:opacity-60"
                disabled={!filteredDailyPayments.length}
                onClick={handleExportDailyPaymentsPdf}
                type="button"
              >
                Exportar PDF
              </button>
            </div>

            {!dailyPayments.length ? (
              <div className="mt-4">
                <EmptyState title="Sin pagos" description="Todavia no hay pagos diarios registrados hoy." />
              </div>
            ) : !filteredDailyPayments.length ? (
              <div className="mt-4">
                <EmptyState title="Sin coincidencias" description="No hay pagos que coincidan con tu busqueda." />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {paginatedDailyPayments.map((payment) => (
                  <article key={payment.id} className="rounded-2xl border border-brand-sand/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">
                          {payment.client_code}
                        </p>
                        <h3 className="mt-1 font-semibold text-brand-forest">
                          {payment.client_first_name} {payment.client_last_name}
                        </h3>
                        <p className="mt-1 text-sm text-brand-forest/70">
                          Pago diario · {formatCurrency(payment.amount || 0)} · Metodo: {payment.payment_method}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                            payment.used_for_checkin_today
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {payment.used_for_checkin_today ? 'Asistencia usada' : 'Pendiente de marcar'}
                        </span>
                        <button
                          className="rounded-full bg-brand-forest px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-60"
                          disabled={reprintingPaymentId === payment.id}
                          onClick={() => handleReprintReceipt(payment.id)}
                          type="button"
                        >
                          {reprintingPaymentId === payment.id ? 'Imprimiendo...' : 'Reimprimir recibo'}
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-brand-forest/70">
                      Fecha pago: {formatDate(payment.paid_at)} · {payment.notes || 'Sin notas'}
                    </p>
                  </article>
                ))}
                <Pagination
                  currentPage={safeDailyPaymentsPage}
                  itemLabel="pagos"
                  onPageChange={setDailyPaymentsPage}
                  pageSize={DAILY_PAYMENTS_PAGE_SIZE}
                  totalItems={filteredDailyPayments.length}
                  totalPages={dailyPaymentsTotalPages}
                />
              </div>
            )}
          </DataPanel>
        </div>
      </section>

      {photoViewerSrc ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={closePhotoViewer}
          role="presentation"
        >
          <div className="relative max-h-[90vh] w-full max-w-5xl" onClick={(event) => event.stopPropagation()} role="presentation">
            <button
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold uppercase tracking-[0.12em] text-white"
              onClick={closePhotoViewer}
              type="button"
            >
              Cerrar
            </button>
            <img
              alt={photoViewerAlt}
              className="max-h-[90vh] w-full rounded-2xl object-contain"
              src={photoViewerSrc}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
