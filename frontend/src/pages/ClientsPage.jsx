import { useEffect, useRef, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { apiGet, apiPost, apiPut, buildQueryString, authToken } from '../lib/api';
import { formatDate } from '../lib/format';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

const MAX_CLIENT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_CLIENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('No fue posible leer la imagen seleccionada'));
    reader.readAsDataURL(file);
  });
}

function dataURLToBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/webp';
  const bstr = atob(arr[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

const initialClientForm = {
  client_code: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  gender: '',
  join_date: '',
  photo_url: '',
  notes: '',
  is_active: true
};

const PAGE_SIZE = 8;
const REPORTS_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function ClientsPage() {
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [activeView, setActiveView] = useState('list');
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('user');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [qrGenerating, setQrGenerating] = useState(false);
  const [photoViewerSrc, setPhotoViewerSrc] = useState('');
  const [photoViewerAlt, setPhotoViewerAlt] = useState('Foto de cliente');
  const [editingClientId, setEditingClientId] = useState(null);
  const [form, setForm] = useState(initialClientForm);

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

  async function loadClients() {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const query = buildQueryString({
        search: search.trim(),
        page: currentPage,
        limit: PAGE_SIZE
      });
      const response = await apiGet(`/clients${query}`);
      setClients(response.data);
      setPagination(
        response.pagination || {
          page: 1,
          limit: PAGE_SIZE,
          totalItems: response.data.length,
          totalPages: Math.max(1, Math.ceil(response.data.length / PAGE_SIZE))
        }
      );
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar clientes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, [search, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
    };
  }, []);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));

    if (name === 'client_code' && qrCodeDataUrl) {
      setQrCodeDataUrl('');
    }
  }

  async function generateClientQrCode(clientCode) {
    const normalizedCode = String(clientCode || '').trim();

    if (!normalizedCode) {
      setError('Ingresa el codigo del cliente para generar el QR');
      return;
    }

    setQrGenerating(true);
    setError('');
    setMessage('');

    try {
      const qrDataUrl = await QRCode.toDataURL(normalizedCode, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M'
      });
      setQrCodeDataUrl(qrDataUrl);
    } catch (_error) {
      setError('No fue posible generar el codigo QR del cliente');
    } finally {
      setQrGenerating(false);
    }
  }

  function handleGenerateQr() {
    generateClientQrCode(form.client_code);
  }

  function handleDownloadQr() {
    if (!qrCodeDataUrl) {
      return;
    }

    const anchor = document.createElement('a');
    const normalizedCode = String(form.client_code || 'cliente').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    anchor.href = qrCodeDataUrl;
    anchor.download = `qr_cliente_${normalizedCode}.png`;
    anchor.click();
  }

  function normalizeWhatsappPhone(rawPhone) {
    const cleaned = String(rawPhone || '').replace(/[^\d+]/g, '').trim();

    if (!cleaned) {
      return '';
    }

    let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    }

    if (/^\d{8}$/.test(digits)) {
      return `505${digits}`;
    }

    return digits;
  }

  async function ensureQrCodeDataUrl(clientCode) {
    const normalizedCode = String(clientCode || '').trim();

    if (!normalizedCode) {
      throw new Error('Ingresa el codigo del cliente antes de enviar por WhatsApp');
    }

    if (qrCodeDataUrl) {
      return qrCodeDataUrl;
    }

    const generatedQrDataUrl = await QRCode.toDataURL(normalizedCode, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M'
    });
    setQrCodeDataUrl(generatedQrDataUrl);
    return generatedQrDataUrl;
  }

  async function handleSendWhatsappQr() {
    setError('');
    setMessage('');

    const normalizedPhone = normalizeWhatsappPhone(form.phone);

    setSendingWhatsapp(true);

    try {
      const qrDataUrl = await ensureQrCodeDataUrl(form.client_code);
      const qrBlob = dataURLToBlob(qrDataUrl);
      const clientCode = String(form.client_code || '').trim();
      const clientName = `${form.first_name || ''} ${form.last_name || ''}`.trim() || 'cliente';
      const fileNameCode = clientCode.replace(/[^a-zA-Z0-9_-]/g, '_') || 'cliente';
      const qrFile = new File([qrBlob], `qr_cliente_${fileNameCode}.png`, { type: 'image/png' });
      const whatsappMessage = [
        `Hola ${clientName},`,
        `te compartimos tu codigo QR de acceso (${clientCode}).`,
        'Presentalo en recepcion para marcar asistencia.'
      ].join(' ');

      const canShareImage =
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [qrFile] });

      if (canShareImage) {
        await navigator.share({
          title: 'Codigo QR RohiPOS',
          text: whatsappMessage,
          files: [qrFile]
        });
        setMessage('QR listo para enviar por WhatsApp. Selecciona el contacto del cliente.');
        return;
      }

      const anchor = document.createElement('a');
      anchor.href = qrDataUrl;
      anchor.download = `qr_cliente_${fileNameCode}.png`;
      anchor.click();

      const whatsappBaseUrl = normalizedPhone
        ? `https://wa.me/${normalizedPhone}`
        : 'https://wa.me/';
      const whatsappUrl = `${whatsappBaseUrl}?text=${encodeURIComponent(
        `${whatsappMessage} Te adjuntamos la imagen del QR descargada.`
      )}`;
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      setMessage('Se abrio WhatsApp y se descargo el QR para adjuntarlo como imagen.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible preparar el envio por WhatsApp');
    } finally {
      setSendingWhatsapp(false);
    }
  }

  async function handleCopyPhone() {
    setError('');
    setMessage('');

    const phone = String(form.phone || '').trim();

    if (!phone) {
      setError('No hay numero de telefono para copiar');
      return;
    }

    try {
      await navigator.clipboard.writeText(phone);
      setMessage('Numero de telefono copiado al portapapeles.');
    } catch (_error) {
      setError('No fue posible copiar el numero. Verifica permisos del navegador.');
    }
  }

  async function openMembershipCardPdf() {
    if (!editingClientId) {
      setError('Guarda el cliente antes de generar el carnet de membresia');
      return;
    }

    const previewWindow = window.open('', '_blank');

    if (!previewWindow) {
      setError('El navegador bloqueo la ventana emergente del carnet. Habilita popups para este sitio.');
      return;
    }

    previewWindow.document.write('<p style="font-family: sans-serif; padding: 16px;">Generando carnet...</p>');

    setCardLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        `${REPORTS_API_URL}/reports/membership-card/client/${editingClientId}/pdf`,
        {
          headers: authToken
            ? {
                Authorization: `Bearer ${authToken}`
              }
            : {}
        }
      );

      if (!response.ok) {
        let message = 'No fue posible generar el carnet de membresia';
        try {
          const data = await response.json();
          message = data.message || message;
        } catch (_error) {
          // ignore parse error and use default message
        }
        throw new Error(message);
      }

      const pdfBlob = await response.blob();
      const pdfUrl = URL.createObjectURL(pdfBlob);
      previewWindow.location.href = pdfUrl;
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (requestError) {
      previewWindow.close();
      setError(requestError.message || 'No fue posible abrir el carnet de membresia');
    } finally {
      setCardLoading(false);
    }
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0] || null;

    if (!file) {
      return;
    }

    if (!ALLOWED_CLIENT_IMAGE_TYPES.has(file.type)) {
      setError('La foto debe ser JPG, PNG o WEBP');
      return;
    }

    if (file.size > MAX_CLIENT_IMAGE_SIZE_BYTES) {
      setError('La foto no debe superar 5 MB');
      return;
    }

    try {
      const photoDataUrl = await readFileAsDataUrl(file);
      setForm((current) => ({
        ...current,
        photo_url: photoDataUrl
      }));
      setError('');
      setMessage('Foto del cliente cargada correctamente.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar la foto del cliente');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  }

  function stopCamera() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    setIsCameraOpen(false);
  }

  async function startCamera(preferredFacingMode = 'user') {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no soporta camara en vivo para capturar foto.');
      return;
    }

    setStartingCamera(true);

    try {
      stopCamera();

      const secondaryFacingMode = preferredFacingMode === 'user' ? 'environment' : 'user';
      let stream;
      let resolvedFacingMode = preferredFacingMode;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: preferredFacingMode
          },
          audio: false
        });
      } catch (_preferredCameraError) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: secondaryFacingMode
            },
            audio: false
          });
          resolvedFacingMode = secondaryFacingMode;
        } catch (_secondaryCameraError) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      cameraStreamRef.current = stream;
      setIsCameraOpen(true);

      // Wait one frame so the camera overlay and <video> element are mounted.
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      if (!cameraVideoRef.current) {
        throw new Error('No fue posible preparar la vista de camara');
      }

      cameraVideoRef.current.srcObject = stream;
      await new Promise((resolve) => {
        const videoElement = cameraVideoRef.current;

        if (!videoElement) {
          resolve();
          return;
        }

        if (videoElement.readyState >= 1) {
          resolve();
          return;
        }

        const onReady = () => {
          videoElement.removeEventListener('loadedmetadata', onReady);
          clearTimeout(metadataTimeoutId);
          resolve();
        };

        videoElement.addEventListener('loadedmetadata', onReady);

        const metadataTimeoutId = setTimeout(() => {
          videoElement.removeEventListener('loadedmetadata', onReady);
          resolve();
        }, 3000);
      });

      await cameraVideoRef.current.play().catch(() => {});
      setCameraFacingMode(resolvedFacingMode);
      setIsCameraOpen(true);
      setMessage('Camara activa. Ajusta el encuadre y presiona capturar.');
    } catch (_cameraError) {
      setError('No se pudo abrir la camara en vivo. Verifica permisos de camara y que el sitio este en localhost o HTTPS.');
      stopCamera();
    } finally {
      setStartingCamera(false);
    }
  }

  async function handleTakePhoto() {
    setError('');
    setMessage('');
    await startCamera(cameraFacingMode || 'user');
  }

  async function handleSwitchCamera() {
    setError('');
    setMessage('');
    const nextFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    await startCamera(nextFacingMode);
  }

  function handleCaptureFromCamera() {
    setError('');
    setMessage('');

    if (!cameraVideoRef.current) {
      setError('La camara no esta disponible para capturar foto');
      return;
    }

    const { videoWidth, videoHeight } = cameraVideoRef.current;

    if (!videoWidth || !videoHeight) {
      setError('Esperando imagen de camara. Intenta capturar nuevamente.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      setError('No fue posible procesar la captura de la camara');
      return;
    }

    context.drawImage(cameraVideoRef.current, 0, 0, videoWidth, videoHeight);
    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    setForm((current) => ({
      ...current,
      photo_url: photoDataUrl
    }));
    setMessage('Foto capturada correctamente.');
    stopCamera();
  }

  function clearPhoto() {
    setForm((current) => ({
      ...current,
      photo_url: ''
    }));
  }

  function resetForm() {
    stopCamera();
    setEditingClientId(null);
    setForm(initialClientForm);
    setQrCodeDataUrl('');
    setActiveView('form');
  }

  function startEdit(client) {
    stopCamera();
    setEditingClientId(client.id);
    setForm({
      client_code: client.client_code || '',
      first_name: client.first_name || '',
      last_name: client.last_name || '',
      email: client.email || '',
      phone: client.phone || '',
      gender: client.gender || '',
      join_date: client.join_date ? String(client.join_date).slice(0, 10) : '',
      photo_url: client.photo_url || '',
      notes: client.notes || '',
      is_active: Boolean(client.is_active)
    });
    setError('');
    setQrCodeDataUrl('');
    setActiveView('form');
    generateClientQrCode(client.client_code);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        ...form,
        email: form.email || null,
        phone: form.phone || null,
        gender: form.gender || null,
        join_date: form.join_date || null,
        photo_url: form.photo_url || null,
        notes: form.notes || null
      };

      if (editingClientId) {
        await apiPut(`/clients/${editingClientId}`, payload);
      } else {
        await apiPost('/clients', payload);
      }

      setEditingClientId(null);
      setForm(initialClientForm);
      setQrCodeDataUrl('');
      stopCamera();
      await loadClients();
      setActiveView('list');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible guardar el cliente');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(client) {
    setError('');
    setMessage('');

    try {
      await apiPut(`/clients/${client.id}`, { is_active: !client.is_active });
      await loadClients();
    } catch (requestError) {
      setError(requestError.message || 'No fue posible actualizar el estado del cliente');
    }
  }

  async function fetchAllClientsForExport() {
    const trimmedSearch = search.trim();
    const firstQuery = buildQueryString({
      search: trimmedSearch,
      page: 1,
      limit: 100
    });

    const firstResponse = await apiGet(`/clients${firstQuery}`);
    const allClients = [...firstResponse.data];
    const totalPages = firstResponse.pagination?.totalPages || 1;

    for (let page = 2; page <= totalPages; page += 1) {
      const pageQuery = buildQueryString({
        search: trimmedSearch,
        page,
        limit: 100
      });
      const pageResponse = await apiGet(`/clients${pageQuery}`);
      allClients.push(...pageResponse.data);
    }

    return allClients;
  }

  async function handleExportExcel() {
    setError('');
    setMessage('');
    setExporting(true);

    try {
      const exportClients = await fetchAllClientsForExport();

      if (!exportClients.length) {
        setError('No hay clientes para exportar con el filtro actual');
        return;
      }

      const rows = exportClients.map((client) => ({
        Codigo: client.client_code || '--',
        Nombre: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
        Correo: client.email || '--',
        Telefono: client.phone || '--',
        'Fecha ingreso': formatDate(client.join_date),
        Estado: client.is_active ? 'Activo' : 'Inactivo',
        Notas: client.notes || '--'
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 14 },
        { wch: 24 },
        { wch: 30 },
        { wch: 16 },
        { wch: 16 },
        { wch: 12 },
        { wch: 40 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('');

      XLSX.writeFile(workbook, `clientes_${stamp}.xlsx`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar clientes');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Base de clientes"
        title="Clientes del gimnasio"
        description="El modulo se divide en ventanas separadas para listado y formulario."
      />

      {message ? <p className="mb-4 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${
            activeView === 'list' ? 'bg-brand-forest text-white' : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => setActiveView('list')}
          type="button"
        >
          Listado
        </button>
        <button
          className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${
            activeView === 'form' ? 'bg-brand-clay text-white' : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => {
            if (!editingClientId) {
              setForm(initialClientForm);
            }
            setActiveView('form');
          }}
          type="button"
        >
          {editingClientId ? 'Editar cliente' : 'Nuevo cliente'}
        </button>
      </div>

      {activeView === 'form' ? (
        <DataPanel
          title={editingClientId ? 'Editar cliente' : 'Registrar cliente'}
          subtitle="Formulario inicial para recepcion y administracion."
        >
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Codigo</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="client_code" onChange={handleChange} required value={form.client_code} />
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60" disabled={qrGenerating || !String(form.client_code || '').trim()} onClick={handleGenerateQr} type="button">
                    {qrGenerating ? 'Generando...' : 'Generar QR'}
                  </button>
                  {qrCodeDataUrl ? (
                    <button className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest" onClick={handleDownloadQr} type="button">
                      Descargar QR
                    </button>
                  ) : null}
                  <button
                    className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
                    disabled={sendingWhatsapp || !String(form.client_code || '').trim()}
                    onClick={handleSendWhatsappQr}
                    type="button"
                  >
                    {sendingWhatsapp ? 'Enviando...' : 'Enviar WhatsApp'}
                  </button>
                </div>
                <p className="text-xs text-brand-forest/70">
                  En tablet/movil comparte la imagen directo; en desktop abre WhatsApp y descarga el QR.
                </p>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Fecha de ingreso</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="join_date" onChange={handleChange} type="date" value={form.join_date} />
              </label>
            </div>

            {qrCodeDataUrl ? (
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Codigo QR del cliente</span>
                <img
                  alt="Codigo QR del cliente"
                  className="h-44 w-44 cursor-pointer rounded-2xl border border-brand-sand/70 bg-white p-2"
                  onClick={() => window.open(qrCodeDataUrl)}
                  src={qrCodeDataUrl}
                />
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Nombre</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="first_name" onChange={handleChange} required value={form.first_name} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Apellido</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="last_name" onChange={handleChange} required value={form.last_name} />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Correo</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="email" onChange={handleChange} type="email" value={form.email} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Telefono</span>
                <div className="flex flex-wrap gap-2">
                  <input className="min-w-0 flex-1 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="phone" onChange={handleChange} value={form.phone} />
                  <button
                    className="rounded-2xl border border-brand-sand px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
                    disabled={!String(form.phone || '').trim()}
                    onClick={handleCopyPhone}
                    type="button"
                  >
                    Copiar
                  </button>
                </div>
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Genero</span>
              <select className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="gender" onChange={handleChange} value={form.gender}>
                <option value="">No especificado</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
                <option value="other">Otro</option>
                <option value="prefer_not_to_say">Prefiero no decirlo</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Foto del cliente</span>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-2xl border border-brand-sand px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
                  disabled={startingCamera}
                  onClick={handleTakePhoto}
                  type="button"
                >
                  {startingCamera ? 'Abriendo camara...' : isCameraOpen ? 'Reiniciar camara' : 'Camara'}
                </button>
              </div>

              {isCameraOpen ? (
                <div className="fixed inset-0 z-50 bg-black">
                  <div className="relative h-full w-full">
                    <video
                      autoPlay
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      ref={cameraVideoRef}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/45" />

                    <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
                      <button
                        className="rounded-full border border-white/60 bg-black/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white"
                        onClick={stopCamera}
                        type="button"
                      >
                        Cerrar
                      </button>
                      <button
                        className="rounded-full border border-white/60 bg-black/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-50"
                        disabled={startingCamera}
                        onClick={handleSwitchCamera}
                        type="button"
                      >
                        Cambiar
                      </button>
                    </div>

                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="h-72 w-52 rounded-3xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.2)]" />
                    </div>

                    <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center">
                      <button
                        className="h-20 w-20 rounded-full border-4 border-white bg-white/20"
                        onClick={handleCaptureFromCamera}
                        type="button"
                      >
                        <span className="sr-only">Capturar foto</span>
                      </button>
                    </div>

                    <p className="absolute bottom-32 left-0 right-0 text-center text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
                      Centra al cliente y captura
                    </p>
                  </div>
                </div>
              ) : null}

              {!isCameraOpen ? (
                <>
                  <p className="text-xs text-brand-forest/70">Tambien puedes cargar una imagen desde el dispositivo.</p>
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    onChange={handlePhotoChange}
                    type="file"
                  />
                </>
              ) : null}

              {form.photo_url ? (
                <div className="space-y-3">
                  <img
                    alt="Vista previa de cliente"
                    className="h-44 w-full cursor-pointer rounded-[1.5rem] object-cover"
                    onClick={() => openPhotoViewer(form.photo_url, 'Foto ampliada del cliente')}
                    src={form.photo_url}
                  />
                  <button className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest" onClick={clearPhoto} type="button">
                    Quitar foto
                  </button>
                </div>
              ) : null}
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Notas</span>
              <textarea className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="notes" onChange={handleChange} value={form.notes} />
            </label>

            <label className="flex items-center gap-3 text-sm font-semibold text-brand-forest">
              <input checked={form.is_active} name="is_active" onChange={handleChange} type="checkbox" />
              Cliente activo
            </label>

            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60" disabled={saving} type="submit">
                {saving ? 'Guardando...' : editingClientId ? 'Actualizar cliente' : 'Crear cliente'}
              </button>
              <button className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-forest disabled:opacity-60" disabled={cardLoading || !editingClientId} onClick={openMembershipCardPdf} type="button">
                {cardLoading ? 'Generando carnet...' : 'Ver carnet PDF'}
              </button>
              <button className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-forest" onClick={resetForm} type="button">
                Limpiar
              </button>
            </div>
          </form>
        </DataPanel>
      ) : (
        <DataPanel title="Clientes registrados" subtitle="Listado con edicion rapida y activacion o desactivacion.">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              className="min-w-72 flex-1 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por codigo, nombre, correo o telefono"
              value={search}
            />
            <button
              className="rounded-2xl border border-brand-sand px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
              disabled={exporting || loading}
              onClick={handleExportExcel}
              type="button"
            >
              {exporting ? 'Exportando...' : 'Exportar Excel'}
            </button>
          </div>
          {loading ? <p className="text-sm text-brand-forest/70">Cargando clientes...</p> : null}
          {!loading && !clients.length ? (
            <EmptyState title="Sin resultados" description="No hay clientes que coincidan con la busqueda actual." />
          ) : null}
          {clients.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-brand-forest/70">
                  <tr>
                    <th className="pb-3">Foto</th>
                    <th className="pb-3">Codigo</th>
                    <th className="pb-3">Nombre</th>
                    <th className="pb-3">Contacto</th>
                    <th className="pb-3">Ingreso</th>
                    <th className="pb-3">Estado</th>
                    <th className="pb-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="border-t border-brand-sand/60">
                      <td className="py-3">
                        {client.photo_url ? (
                          <img
                            alt={`${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Cliente'}
                            className="h-10 w-10 cursor-pointer rounded-full border border-brand-sand/70 object-cover"
                            onClick={() =>
                              openPhotoViewer(
                                client.photo_url,
                                `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Foto de cliente'
                              )
                            }
                            src={client.photo_url}
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-sand/70 bg-brand-cream/70 text-xs font-semibold uppercase text-brand-forest">
                            {`${client.first_name?.[0] || ''}${client.last_name?.[0] || ''}` || '--'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 font-semibold text-brand-forest">{client.client_code}</td>
                      <td className="py-3">{client.first_name} {client.last_name}</td>
                      <td className="py-3">
                        <div>{client.email || '--'}</div>
                        <div className="text-brand-forest/60">{client.phone || '--'}</div>
                      </td>
                      <td className="py-3">{formatDate(client.join_date)}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${client.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                          {client.is_active ? 'activo' : 'inactivo'}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <button className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest" onClick={() => startEdit(client)} type="button">
                            Editar
                          </button>
                          <button className="rounded-xl bg-brand-cream px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-clay" onClick={() => toggleActive(client)} type="button">
                            {client.is_active ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <Pagination currentPage={pagination.page} itemLabel="clientes" onPageChange={setCurrentPage} pageSize={pagination.limit} totalItems={pagination.totalItems} totalPages={pagination.totalPages} />
        </DataPanel>
      )}

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
