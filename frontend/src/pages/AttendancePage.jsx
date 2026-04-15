import { useEffect, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { apiGet, apiPost, buildQueryString } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';

const initialForm = {
  client_id: '',
  access_type: 'membership',
  payment_method: 'cash',
  daily_pass_amount: '',
  notes: ''
};

function getAttendanceTone(status) {
  if (status === 'allowed') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'denied') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-slate-100 text-slate-700';
}

export function AttendancePage() {
  const { user } = useAuth();
  const { settings } = useSettings();
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
  const [checkins, setCheckins] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadDashboard(searchTerm = '', page = 1) {
    setLoading(true);
    setError('');

    try {
      const querySuffix = buildQueryString({
        search: searchTerm.trim(),
        page,
        limit: 8
      });

      const [summaryResponse, checkinsResponse, clientsResponse] = await Promise.all([
        apiGet('/attendance/summary'),
        apiGet('/attendance/checkins'),
        apiGet(`/attendance/clients${querySuffix}`)
      ]);

      setSummary(summaryResponse.data);
      setCheckins(checkinsResponse.data);
      setClients(clientsResponse.data);
      setClientPagination(
        clientsResponse.pagination || {
          page: 1,
          limit: 8,
          totalItems: clientsResponse.data.length,
          totalPages: Math.max(1, Math.ceil(clientsResponse.data.length / 8))
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

  useEffect(() => {
    if (!selectedClient) {
      return;
    }

    if (!selectedClient.can_check_in_with_membership && form.access_type === 'membership') {
      setForm((current) => ({
        ...current,
        access_type: 'daily_pass'
      }));
    }
  }, [form.access_type, selectedClient]);

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
      access_type: client.can_check_in_with_membership ? 'membership' : 'daily_pass',
      daily_pass_amount: client.can_check_in_with_membership ? current.daily_pass_amount : String(settings.routine_price || '')
    }));
    setMessage('');
    setError('');
  }

  useEffect(() => {
    if (form.access_type !== 'daily_pass') {
      return;
    }

    if (Number(form.daily_pass_amount || 0) > 0) {
      return;
    }

    setForm((current) => ({
      ...current,
      daily_pass_amount: String(settings.routine_price || '')
    }));
  }, [form.access_type, form.daily_pass_amount, settings.routine_price]);

  async function handleSearch(event) {
    event.preventDefault();
    setClientPage(1);
    setSubmittedSearch(search);
  }

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
      const response = await apiPost('/attendance/checkins', {
        client_id: Number(form.client_id),
        checked_in_by_user_id: user.id,
        access_type: form.access_type,
        payment_method: form.payment_method,
        daily_pass_amount:
          form.access_type === 'daily_pass'
            ? Number(form.daily_pass_amount || 0)
            : undefined,
        notes: form.notes || null
      });

      const warning = response.data.warning_message ? ` Aviso: ${response.data.warning_message}` : '';
      setMessage(`Asistencia procesada correctamente.${warning}`);
      setForm(initialForm);
      setSelectedClient(null);
      await loadDashboard(submittedSearch, clientPage);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible registrar la asistencia');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Asistencia"
        title="Control de ingreso del gimnasio"
        description="Valida membresias vigentes, cobra accesos diarios y deja trazabilidad de cada entrada."
      />

      {message ? <p className="mb-4 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                            className="h-12 w-12 rounded-full border border-brand-sand/70 object-cover"
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

          <DataPanel title="Ingresos del dia" subtitle="Registro de asistencia procesado hoy.">
            {!checkins.length ? (
              <EmptyState title="Sin asistencias" description="Todavia no hay ingresos registrados hoy." />
            ) : (
              <div className="space-y-3">
                {checkins.map((checkin) => (
                  <article key={checkin.id} className="rounded-2xl border border-brand-sand/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">
                          {checkin.client_code}
                        </p>
                        <h3 className="mt-1 font-semibold text-brand-forest">
                          {checkin.client_first_name} {checkin.client_last_name}
                        </h3>
                        <p className="mt-1 text-sm text-brand-forest/70">
                          {checkin.access_type === 'daily_pass'
                            ? `Pago diario · ${formatCurrency(checkin.payment_amount || 0)}`
                            : `Membresia ${checkin.membership_number || 'sin numero'}`}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getAttendanceTone(checkin.status)}`}
                      >
                        {checkin.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-brand-forest/70">
                      Fecha: {formatDate(checkin.checked_in_at)} · {checkin.notes || 'Sin notas'}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </DataPanel>
        </div>

        <DataPanel
          title="Registrar asistencia"
          subtitle={`Aviso configurado ${settings.membership_expiry_alert_days} dia(s) antes del vencimiento.`}
        >
          {selectedClient ? (
            <div className="mb-4 rounded-2xl border border-brand-sand/70 bg-brand-cream/40 p-4">
              <div className="flex items-start gap-3">
                {selectedClient.photo_url ? (
                  <img
                    alt={`${selectedClient.first_name || ''} ${selectedClient.last_name || ''}`.trim() || 'Cliente'}
                    className="h-14 w-14 rounded-full border border-brand-sand/70 object-cover"
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
                Plan: {selectedClient.plan_name || 'Sin membresia vigente'}
              </p>
              <p className="mt-1 text-sm text-brand-forest/70">
                Vence: {formatDate(selectedClient.end_date)}
              </p>
              {!selectedClient.is_active ? (
                <p className="mt-3 rounded-2xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">
                  El cliente esta inactivo. No se puede registrar asistencia.
                </p>
              ) : null}
              {!selectedClient.can_check_in_with_membership ? (
                <p className="mt-3 rounded-2xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-700">
                  La membresia no esta vigente. Solo se permite ingreso con pago diario.
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState title="Sin cliente seleccionado" description="Selecciona un cliente desde la lista de busqueda." />
          )}

          <form className="mt-4 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Tipo de acceso</span>
              <select
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    access_type: event.target.value
                  }))
                }
                value={form.access_type}
              >
                <option disabled={selectedClient ? !selectedClient.can_check_in_with_membership : false} value="membership">
                  Con membresia
                </option>
                <option value="daily_pass">Pago del dia</option>
              </select>
            </label>

            {form.access_type === 'daily_pass' ? (
              <>
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
              </>
            ) : null}

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
                !selectedClient.is_active ||
                (form.access_type === 'membership' && !selectedClient.can_check_in_with_membership)
              }
              type="submit"
            >
              {saving ? 'Procesando...' : 'Marcar asistencia'}
            </button>
          </form>
        </DataPanel>
      </section>
    </div>
  );
}
