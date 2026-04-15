import { useEffect, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { apiGet, apiPost, apiPut, buildQueryString } from '../lib/api';
import { formatDate } from '../lib/format';
import * as XLSX from 'xlsx';

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

export function ClientsPage() {
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
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [form, setForm] = useState(initialClientForm);

  async function loadClients() {
    setLoading(true);
    setError('');

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

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
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
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar la foto del cliente');
    }
  }

  function clearPhoto() {
    setForm((current) => ({
      ...current,
      photo_url: ''
    }));
  }

  function resetForm() {
    setEditingClientId(null);
    setForm(initialClientForm);
    setActiveView('form');
  }

  function startEdit(client) {
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
    setActiveView('form');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

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
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Fecha de ingreso</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="join_date" onChange={handleChange} type="date" value={form.join_date} />
              </label>
            </div>

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
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="phone" onChange={handleChange} value={form.phone} />
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
              <input
                accept="image/png,image/jpeg,image/webp"
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={handlePhotoChange}
                type="file"
              />
              {form.photo_url ? (
                <div className="space-y-3">
                  <img
                    alt="Vista previa de cliente"
                    className="h-44 w-full cursor-pointer rounded-[1.5rem] object-cover"
                    onClick={() => {
                      const blob = dataURLToBlob(form.photo_url);
                      const url = URL.createObjectURL(blob);
                      window.open(url);
                    }}
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
                            className="h-10 w-10 rounded-full border border-brand-sand/70 object-cover"
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
    </div>
  );
}
