import { useEffect, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { apiGet, apiPost, apiPut, buildQueryString } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';

const initialPlanForm = {
  name: '',
  description: '',
  duration_days: '',
  price: '',
  is_active: true
};

const initialMembershipForm = {
  client_id: '',
  plan_id: '',
  membership_number: '',
  price: '',
  start_date: '',
  end_date: '',
  discount: '',
  amount_paid: '',
  notes: ''
};

const PLAN_PAGE_SIZE = 6;
const MEMBERSHIP_PAGE_SIZE = 6;

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateValue, daysToAdd) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + daysToAdd);
  return formatDateInput(date);
}

export function MembershipsPage() {
  const [activeView, setActiveView] = useState('membership-list');
  const [planOptions, setPlanOptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [clients, setClients] = useState([]);
  const [planSearch, setPlanSearch] = useState('');
  const [membershipSearch, setMembershipSearch] = useState('');
  const [planPage, setPlanPage] = useState(1);
  const [membershipPage, setMembershipPage] = useState(1);
  const [planPagination, setPlanPagination] = useState({
    page: 1,
    limit: PLAN_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });
  const [membershipPagination, setMembershipPagination] = useState({
    page: 1,
    limit: MEMBERSHIP_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });
  const [plansLoading, setPlansLoading] = useState(true);
  const [membershipsLoading, setMembershipsLoading] = useState(true);
  const [planForm, setPlanForm] = useState(initialPlanForm);
  const [membershipForm, setMembershipForm] = useState(initialMembershipForm);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [editingMembershipId, setEditingMembershipId] = useState(null);
  const [error, setError] = useState('');
  const [planSaving, setPlanSaving] = useState(false);
  const [membershipSaving, setMembershipSaving] = useState(false);

  async function loadFormOptions() {
    setError('');

    try {
      const [clientsResponse, plansResponse] = await Promise.all([
        apiGet('/clients?active=true&limit=100'),
        apiGet('/membership-plans?limit=100')
      ]);

      setClients(clientsResponse.data.filter((client) => client.is_active));
      setPlanOptions((currentPlans) => {
        const fetchedPlans = plansResponse.data;

        if (!editingMembershipId || !membershipForm.plan_id) {
          return currentPlans.length ? currentPlans : fetchedPlans;
        }

        const selectedPlan = currentPlans.find(
          (plan) => String(plan.id) === String(membershipForm.plan_id)
        );

        if (!selectedPlan || fetchedPlans.some((plan) => plan.id === selectedPlan.id)) {
          return fetchedPlans;
        }

        return [...fetchedPlans, selectedPlan];
      });
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar la informacion base');
    }
  }

  async function loadPlans() {
    setPlansLoading(true);
    setError('');

    try {
      const query = buildQueryString({
        search: planSearch.trim(),
        page: planPage,
        limit: PLAN_PAGE_SIZE
      });
      const response = await apiGet(`/membership-plans${query}`);
      setPlans(response.data);
      setPlanPagination(
        response.pagination || {
          page: 1,
          limit: PLAN_PAGE_SIZE,
          totalItems: response.data.length,
          totalPages: Math.max(1, Math.ceil(response.data.length / PLAN_PAGE_SIZE))
        }
      );
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar los planes');
    } finally {
      setPlansLoading(false);
    }
  }

  async function loadMemberships() {
    setMembershipsLoading(true);
    setError('');

    try {
      const query = buildQueryString({
        search: membershipSearch.trim(),
        page: membershipPage,
        limit: MEMBERSHIP_PAGE_SIZE
      });
      const response = await apiGet(`/memberships${query}`);
      setMemberships(response.data);
      setMembershipPagination(
        response.pagination || {
          page: 1,
          limit: MEMBERSHIP_PAGE_SIZE,
          totalItems: response.data.length,
          totalPages: Math.max(1, Math.ceil(response.data.length / MEMBERSHIP_PAGE_SIZE))
        }
      );
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar las membresias');
    } finally {
      setMembershipsLoading(false);
    }
  }

  async function loadPageData() {
    setError('');
    await Promise.all([loadFormOptions(), loadPlans(), loadMemberships()]);
  }

  useEffect(() => {
    loadFormOptions();
  }, []);

  useEffect(() => {
    loadPlans();
  }, [planSearch, planPage]);

  useEffect(() => {
    loadMemberships();
  }, [membershipSearch, membershipPage]);

  useEffect(() => {
    setPlanPage(1);
  }, [planSearch]);

  useEffect(() => {
    setMembershipPage(1);
  }, [membershipSearch]);

  function handlePlanChange(event) {
    const { name, value, type, checked } = event.target;
    setPlanForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  }

  function handleMembershipChange(event) {
    const { name, value } = event.target;
    setMembershipForm((current) => {
      const nextForm = {
        ...current,
        [name]: value
      };

      if (!editingMembershipId && name === 'plan_id') {
        const selectedPlan = planOptions.find((plan) => String(plan.id) === value);

        if (selectedPlan) {
          const startDate = current.start_date || formatDateInput(new Date());
          nextForm.start_date = startDate;
          nextForm.end_date = addDays(startDate, Number(selectedPlan.duration_days) - 1);
          nextForm.price = String(selectedPlan.price ?? '');
        } else {
          nextForm.price = '';
        }
      }

      if (!editingMembershipId && name === 'start_date' && current.plan_id) {
        const selectedPlan = planOptions.find((plan) => String(plan.id) === String(current.plan_id));

        if (selectedPlan && value) {
          nextForm.end_date = addDays(value, Number(selectedPlan.duration_days) - 1);
        }
      }

      return nextForm;
    });
  }

  function resetPlanForm() {
    setEditingPlanId(null);
    setPlanForm(initialPlanForm);
    setActiveView('plan-form');
  }

  function resetMembershipForm() {
    setEditingMembershipId(null);
    setMembershipForm(initialMembershipForm);
    setActiveView('membership-form');
  }

  function startEditPlan(plan) {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name || '',
      description: plan.description || '',
      duration_days: String(plan.duration_days || ''),
      price: String(plan.price || ''),
      is_active: Boolean(plan.is_active)
    });
    setActiveView('plan-form');
  }

  function startEditMembership(membership) {
    setEditingMembershipId(membership.id);
    setMembershipForm({
      client_id: String(membership.client_id || ''),
      plan_id: String(membership.plan_id || ''),
      membership_number: membership.membership_number || '',
      price: String(membership.price || ''),
      start_date: membership.start_date ? String(membership.start_date).slice(0, 10) : '',
      end_date: membership.end_date ? String(membership.end_date).slice(0, 10) : '',
      discount: String(membership.discount || ''),
      amount_paid: String(membership.amount_paid || ''),
      notes: membership.notes || ''
    });
    setActiveView('membership-form');
  }

  async function handlePlanSubmit(event) {
    event.preventDefault();
    setPlanSaving(true);
    setError('');

    try {
      const payload = {
        ...planForm,
        duration_days: Number(planForm.duration_days),
        price: Number(planForm.price)
      };

      if (editingPlanId) {
        await apiPut(`/membership-plans/${editingPlanId}`, payload);
      } else {
        await apiPost('/membership-plans', payload);
      }

      setEditingPlanId(null);
      setPlanForm(initialPlanForm);
      await loadPageData();
      setActiveView('plan-list');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible guardar el plan');
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleMembershipSubmit(event) {
    event.preventDefault();
    setMembershipSaving(true);
    setError('');

    try {
      if (editingMembershipId) {
        await apiPut(`/memberships/${editingMembershipId}`, {
          membership_number: membershipForm.membership_number || null,
          price: membershipForm.price === '' ? 0 : Number(membershipForm.price),
          start_date: membershipForm.start_date,
          end_date: membershipForm.end_date || null,
          discount: membershipForm.discount === '' ? 0 : Number(membershipForm.discount),
          amount_paid: membershipForm.amount_paid === '' ? 0 : Number(membershipForm.amount_paid),
          notes: membershipForm.notes || null
        });
      } else {
        await apiPost('/memberships', {
          client_id: Number(membershipForm.client_id),
          plan_id: Number(membershipForm.plan_id),
          membership_number: membershipForm.membership_number || null,
          price: membershipForm.price === '' ? 0 : Number(membershipForm.price),
          start_date: membershipForm.start_date,
          end_date: membershipForm.end_date || null,
          discount: membershipForm.discount === '' ? 0 : Number(membershipForm.discount),
          amount_paid: membershipForm.amount_paid === '' ? 0 : Number(membershipForm.amount_paid),
          notes: membershipForm.notes || null
        });
      }

      setEditingMembershipId(null);
      setMembershipForm(initialMembershipForm);
      await loadPageData();
      setActiveView('membership-list');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible guardar la membresia');
    } finally {
      setMembershipSaving(false);
    }
  }

  async function togglePlanState(plan) {
    setError('');

    try {
      await apiPut(`/membership-plans/${plan.id}`, { is_active: !plan.is_active });
      await loadPageData();
    } catch (requestError) {
      setError(requestError.message || 'No fue posible actualizar el plan');
    }
  }

  async function toggleMembershipState(membership) {
    setError('');

    try {
      await apiPut(`/memberships/${membership.id}`, {
        status: membership.status === 'cancelled' ? 'active' : 'cancelled'
      });
      await loadPageData();
    } catch (requestError) {
      setError(requestError.message || 'No fue posible actualizar la membresia');
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Membresias"
        title="Planes y control de vigencia"
        description="El modulo se divide en ventanas separadas para planes y membresias."
      />

      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <div className="mb-6 flex flex-wrap gap-3">
        <button className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${activeView === 'plan-list' ? 'bg-brand-forest text-white' : 'border border-brand-sand text-brand-forest'}`} onClick={() => setActiveView('plan-list')} type="button">Planes</button>
        <button className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${activeView === 'plan-form' ? 'bg-brand-clay text-white' : 'border border-brand-sand text-brand-forest'}`} onClick={() => { if (!editingPlanId) setPlanForm(initialPlanForm); setActiveView('plan-form'); }} type="button">{editingPlanId ? 'Editar plan' : 'Nuevo plan'}</button>
        <button className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${activeView === 'membership-list' ? 'bg-brand-forest text-white' : 'border border-brand-sand text-brand-forest'}`} onClick={() => setActiveView('membership-list')} type="button">Membresias</button>
        <button className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${activeView === 'membership-form' ? 'bg-brand-clay text-white' : 'border border-brand-sand text-brand-forest'}`} onClick={() => { if (!editingMembershipId) setMembershipForm(initialMembershipForm); setActiveView('membership-form'); }} type="button">{editingMembershipId ? 'Editar membresia' : 'Nueva membresia'}</button>
      </div>

      {activeView === 'plan-form' ? (
        <DataPanel title={editingPlanId ? 'Editar plan' : 'Crear plan'} subtitle="Configura duracion y precio.">
          <form className="grid gap-4" onSubmit={handlePlanSubmit}>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Nombre</span>
              <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="name" onChange={handlePlanChange} required value={planForm.name} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Descripcion</span>
              <textarea className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="description" onChange={handlePlanChange} value={planForm.description} />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Dias</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="1" name="duration_days" onChange={handlePlanChange} required type="number" value={planForm.duration_days} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Precio</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="price" onChange={handlePlanChange} required step="0.01" type="number" value={planForm.price} />
              </label>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold text-brand-forest">
              <input checked={planForm.is_active} name="is_active" onChange={handlePlanChange} type="checkbox" />
              Plan activo
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60" disabled={planSaving} type="submit">
                {planSaving ? 'Guardando...' : editingPlanId ? 'Actualizar plan' : 'Crear plan'}
              </button>
              <button className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-forest" onClick={resetPlanForm} type="button">
                Limpiar
              </button>
            </div>
          </form>
        </DataPanel>
      ) : null}

      {activeView === 'membership-form' ? (
        <DataPanel title={editingMembershipId ? 'Editar membresia' : 'Registrar membresia'} subtitle="Asigna un plan a un cliente activo.">
          <form className="grid gap-4" onSubmit={handleMembershipSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Cliente</span>
                <select className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" disabled={Boolean(editingMembershipId)} name="client_id" onChange={handleMembershipChange} required value={membershipForm.client_id}>
                  <option value="">Selecciona un cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.client_code} - {client.first_name} {client.last_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Plan</span>
                <select className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" disabled={Boolean(editingMembershipId)} name="plan_id" onChange={handleMembershipChange} required value={membershipForm.plan_id}>
                  <option value="">Selecciona un plan</option>
                  {planOptions.filter((plan) => plan.is_active || String(plan.id) === String(membershipForm.plan_id)).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {formatCurrency(plan.price)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Numero</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="membership_number" onChange={handleMembershipChange} value={membershipForm.membership_number} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Costo del plan</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="price" onChange={handleMembershipChange} required step="0.01" type="number" value={membershipForm.price} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Inicio</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="start_date" onChange={handleMembershipChange} required type="date" value={membershipForm.start_date} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Fin opcional</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="end_date" onChange={handleMembershipChange} type="date" value={membershipForm.end_date} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Descuento</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="discount" onChange={handleMembershipChange} step="0.01" type="number" value={membershipForm.discount} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-1">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Monto pagado</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="amount_paid" onChange={handleMembershipChange} step="0.01" type="number" value={membershipForm.amount_paid} />
              </label>
            </div>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Notas</span>
              <textarea className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="notes" onChange={handleMembershipChange} value={membershipForm.notes} />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl bg-brand-clay px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60" disabled={membershipSaving} type="submit">
                {membershipSaving ? 'Guardando...' : editingMembershipId ? 'Actualizar membresia' : 'Crear membresia'}
              </button>
              <button className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-forest" onClick={resetMembershipForm} type="button">
                Limpiar
              </button>
            </div>
          </form>
        </DataPanel>
      ) : null}

      {activeView === 'plan-list' ? (
        <DataPanel title="Planes disponibles" subtitle="Catalogo base para las ventas de membresias.">
          <div className="mb-4">
            <input className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" onChange={(event) => setPlanSearch(event.target.value)} placeholder="Buscar plan por nombre, descripcion o precio" value={planSearch} />
          </div>
          {plansLoading ? <p className="text-sm text-brand-forest/70">Cargando planes...</p> : null}
          {!plansLoading && !plans.length ? <EmptyState title="Sin resultados" description="No hay planes que coincidan con la busqueda actual." /> : null}
          {plans.length ? (
            <div className="grid gap-3">
              {plans.map((plan) => (
                <article key={plan.id} className="rounded-2xl border border-brand-sand/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-brand-forest">{plan.name}</h3>
                      <p className="mt-1 text-sm text-brand-forest/70">{plan.description || 'Sin descripcion'}</p>
                    </div>
                    <span className="rounded-full bg-brand-cream px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-moss">
                      {plan.duration_days} dias
                    </span>
                  </div>
                  <p className="mt-4 text-xl font-bold text-brand-clay">{formatCurrency(plan.price)}</p>
                  <div className="mt-4 flex gap-2">
                    <button className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest" onClick={() => startEditPlan(plan)} type="button">
                      Editar
                    </button>
                    <button className="rounded-xl bg-brand-cream px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-clay" onClick={() => togglePlanState(plan)} type="button">
                      {plan.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          <Pagination currentPage={planPagination.page} itemLabel="planes" onPageChange={setPlanPage} pageSize={planPagination.limit} totalItems={planPagination.totalItems} totalPages={planPagination.totalPages} />
        </DataPanel>
      ) : null}

      {activeView === 'membership-list' ? (
        <DataPanel title="Membresias registradas" subtitle="Seguimiento de cliente, plan, estado y saldo pendiente.">
          <div className="mb-4">
            <input className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" onChange={(event) => setMembershipSearch(event.target.value)} placeholder="Buscar por cliente, codigo, plan, numero o estado" value={membershipSearch} />
          </div>
          {membershipsLoading ? <p className="text-sm text-brand-forest/70">Cargando membresias...</p> : null}
          {!membershipsLoading && !memberships.length ? <EmptyState title="Sin resultados" description="No hay membresias que coincidan con la busqueda actual." /> : null}
          {memberships.length ? (
            <div className="space-y-3">
              {memberships.map((membership) => (
                <div key={membership.id} className="rounded-2xl border border-brand-sand/70 px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-semibold text-brand-forest">
                        {membership.client_first_name} {membership.client_last_name}
                      </p>
                      <p className="mt-1 text-sm text-brand-forest/70">
                        {membership.plan_name} · {membership.membership_number}
                      </p>
                    </div>
                    <StatusBadge value={membership.status} />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-brand-forest/80 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Inicio</p>
                      <p className="mt-1">{formatDate(membership.start_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Vence</p>
                      <p className="mt-1">{formatDate(membership.end_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Saldo</p>
                      <p className="mt-1 font-semibold text-brand-clay">{formatCurrency(membership.balance_due)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest" onClick={() => startEditMembership(membership)} type="button">
                      Editar
                    </button>
                    <button className="rounded-xl bg-brand-cream px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-clay" onClick={() => toggleMembershipState(membership)} type="button">
                      {membership.status === 'cancelled' ? 'Reactivar' : 'Cancelar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <Pagination currentPage={membershipPagination.page} itemLabel="membresias" onPageChange={setMembershipPage} pageSize={membershipPagination.limit} totalItems={membershipPagination.totalItems} totalPages={membershipPagination.totalPages} />
        </DataPanel>
      ) : null}
    </div>
  );
}
