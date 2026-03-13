import { useEffect, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { apiGet, apiPost, apiPut } from '../lib/api';
import { formatDate } from '../lib/format';

const initialClientForm = {
  client_code: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  gender: '',
  join_date: '',
  notes: '',
  is_active: true
};

export function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [form, setForm] = useState(initialClientForm);

  async function loadClients() {
    setLoading(true);
    setError('');

    try {
      const response = await apiGet('/clients');
      setClients(response.data);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar clientes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  }

  function resetForm() {
    setEditingClientId(null);
    setForm(initialClientForm);
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
      notes: client.notes || '',
      is_active: Boolean(client.is_active)
    });
    setError('');
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
        notes: form.notes || null
      };

      if (editingClientId) {
        await apiPut(`/clients/${editingClientId}`, payload);
      } else {
        await apiPost('/clients', payload);
      }

      resetForm();
      await loadClients();
    } catch (requestError) {
      setError(requestError.message || 'No fue posible guardar el cliente');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(client) {
    setError('');

    try {
      await apiPut(`/clients/${client.id}`, {
        is_active: !client.is_active
      });
      await loadClients();
    } catch (requestError) {
      setError(requestError.message || 'No fue posible actualizar el estado del cliente');
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Base de clientes"
        title="Clientes del gimnasio"
        description="Ya puedes crear, editar y desactivar clientes desde esta pantalla."
      />

      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
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

        <DataPanel title="Clientes registrados" subtitle="Listado con edicion rapida y activacion o desactivacion.">
          {loading ? <p className="text-sm text-brand-forest/70">Cargando clientes...</p> : null}
          {!loading && !clients.length ? (
            <EmptyState title="Sin clientes" description="Todavia no hay clientes registrados en la base de datos." />
          ) : null}
          {clients.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-brand-forest/70">
                  <tr>
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
        </DataPanel>
      </section>
    </div>
  );
}
