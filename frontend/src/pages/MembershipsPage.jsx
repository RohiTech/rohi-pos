import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { apiGet, apiPost, apiPut, buildQueryString } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import { useSettings } from '../context/SettingsContext';
import * as XLSX from 'xlsx';

const initialPlanForm = {
  name: '',
  description: '',
  duration_days: '',
  base_price: '',
  tax_name: 'Exento',
  tax_rate: '0',
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

function calculateAmountPaid(priceValue, discountValue) {
  const price = Number(priceValue);
  const discount = Number(discountValue);
  const safePrice = Number.isFinite(price) ? price : 0;
  const safeDiscount = Number.isFinite(discount) ? discount : 0;
  const amount = Math.max(safePrice - safeDiscount, 0);
  return amount.toFixed(2);
}

export function MembershipsPage() {
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('membership-list');
  const [planOptions, setPlanOptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [clients, setClients] = useState([]);
  const [planSearch, setPlanSearch] = useState('');
  const [membershipSearch, setMembershipSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
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
  const [membershipExporting, setMembershipExporting] = useState(false);
  const [photoViewerSrc, setPhotoViewerSrc] = useState('');
  const [photoViewerAlt, setPhotoViewerAlt] = useState('Foto de cliente');

  const baseTaxOptions =
    Array.isArray(settings?.tax_options) && settings.tax_options.length > 0
      ? settings.tax_options
      : [
          { name: 'Exento', rate: 0 },
          { name: 'IVA', rate: 15 }
        ];

  const selectedTaxValue = `${planForm.tax_name || 'Exento'}|${String(Number(planForm.tax_rate || 0))}`;
  const configuredTaxOptions =
    baseTaxOptions.some((option) => `${String(option?.name || '').trim()}|${Number(option?.rate || 0)}` === selectedTaxValue)
      ? baseTaxOptions
      : [
          ...baseTaxOptions,
          {
            name: planForm.tax_name || 'Exento',
            rate: Number(planForm.tax_rate || 0)
          }
        ];

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
    if (!location.search || editingMembershipId) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const renewClientId = params.get('renew_client_id');

    if (!renewClientId || !clients.length) {
      return;
    }

    const targetClient = clients.find((client) => String(client.id) === String(renewClientId));
    if (!targetClient) {
      return;
    }

    const defaultStartDate = formatDateInput(new Date());
    setEditingMembershipId(null);
    setActiveView('membership-form');
    setMembershipForm((current) => ({
      ...current,
      client_id: String(targetClient.id),
      start_date: current.start_date || defaultStartDate
    }));
    setClientSearch(`${targetClient.client_code} - ${targetClient.first_name} ${targetClient.last_name}`);
    navigate('/memberships', { replace: true });
  }, [clients, editingMembershipId, location.search, navigate]);

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
      [name]: type === 'checkbox' ? checked : value,
      price:
        name === 'base_price' || name === 'tax_rate'
          ? (() => {
              const nextBasePrice = Number(name === 'base_price' ? value : current.base_price || 0);
              const nextTaxRate = Number(name === 'tax_rate' ? value : current.tax_rate || 0);
              const salePrice = nextBasePrice + nextBasePrice * (nextTaxRate / 100);
              return Number.isFinite(salePrice) ? String(salePrice.toFixed(2)) : current.price;
            })()
          : current.price
    }));
  }

  function handlePlanTaxChange(event) {
    const selectedValue = String(event.target.value || 'Exento|0');
    const separatorIndex = selectedValue.lastIndexOf('|');

    if (separatorIndex < 0) {
      setPlanForm((current) => ({
        ...current,
        tax_name: 'Exento',
        tax_rate: '0',
        price: String(Number(current.base_price || 0).toFixed(2))
      }));
      return;
    }

    const taxName = selectedValue.slice(0, separatorIndex).trim() || 'Exento';
    const taxRate = Number(selectedValue.slice(separatorIndex + 1));

    setPlanForm((current) => {
      const basePrice = Number(current.base_price || 0);
      const safeRate = Number.isFinite(taxRate) ? taxRate : 0;
      const salePrice = basePrice + basePrice * (safeRate / 100);

      return {
        ...current,
        tax_name: taxName,
        tax_rate: String(safeRate),
        price: String(Number.isFinite(salePrice) ? salePrice.toFixed(2) : 0)
      };
    });
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
          const planPrice = String(selectedPlan.price ?? '');
          nextForm.start_date = startDate;
          nextForm.end_date = addDays(startDate, Number(selectedPlan.duration_days) - 1);
          nextForm.price = planPrice;
          nextForm.discount = '0';
          nextForm.amount_paid = calculateAmountPaid(planPrice, 0);
        } else {
          nextForm.price = '';
          nextForm.discount = '';
          nextForm.amount_paid = '';
        }
      }

      if (!editingMembershipId && name === 'start_date' && current.plan_id) {
        const selectedPlan = planOptions.find((plan) => String(plan.id) === String(current.plan_id));

        if (selectedPlan && value) {
          nextForm.end_date = addDays(value, Number(selectedPlan.duration_days) - 1);
        }
      }

      if (!editingMembershipId && (name === 'discount' || name === 'price')) {
        nextForm.amount_paid = calculateAmountPaid(nextForm.price, nextForm.discount);
      }

      return nextForm;
    });
  }

  function handleClientSearchChange(event) {
    setClientSearch(event.target.value);
  }

  function selectClient(client) {
    setMembershipForm((current) => ({
      ...current,
      client_id: String(client.id)
    }));
    setClientSearch(`${client.client_code} - ${client.first_name} ${client.last_name}`);
  }

  function getClientPhotoById(clientId) {
    const client = clients.find((item) => String(item.id) === String(clientId));
    return client?.photo_url || null;
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
      base_price: String(plan.base_price || ''),
      tax_name: plan.tax_name || 'Exento',
      tax_rate: String(plan.tax_rate || 0),
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
        base_price: Number(planForm.base_price),
        tax_rate: Number(planForm.tax_rate),
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

  async function fetchAllMembershipsForExport() {
    const trimmedSearch = membershipSearch.trim();
    const firstQuery = buildQueryString({
      search: trimmedSearch,
      page: 1,
      limit: 100
    });

    const firstResponse = await apiGet(`/memberships${firstQuery}`);
    const allMemberships = [...firstResponse.data];
    const totalPages = firstResponse.pagination?.totalPages || 1;

    for (let page = 2; page <= totalPages; page += 1) {
      const pageQuery = buildQueryString({
        search: trimmedSearch,
        page,
        limit: 100
      });
      const pageResponse = await apiGet(`/memberships${pageQuery}`);
      allMemberships.push(...pageResponse.data);
    }

    return allMemberships;
  }

  async function handleExportMembershipsExcel() {
    setError('');
    setMembershipExporting(true);

    try {
      const exportMemberships = await fetchAllMembershipsForExport();

      if (!exportMemberships.length) {
        setError('No hay membresias para exportar con el filtro actual');
        return;
      }

      const rows = exportMemberships.map((membership) => ({
        Cliente: `${membership.client_first_name || ''} ${membership.client_last_name || ''}`.trim(),
        'Codigo cliente': membership.client_code || '--',
        Plan: membership.plan_name || '--',
        'Numero membresia': membership.membership_number || '--',
        Inicio: formatDate(membership.start_date),
        Vence: formatDate(membership.end_date),
        Estado: membership.status || '--',
        Precio: formatCurrency(membership.price),
        Descuento: formatCurrency(membership.discount),
        'Monto pagado': formatCurrency(membership.amount_paid),
        Saldo: formatCurrency(membership.balance_due),
        Notas: membership.notes || '--'
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 26 },
        { wch: 16 },
        { wch: 20 },
        { wch: 18 },
        { wch: 16 },
        { wch: 16 },
        { wch: 12 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 14 },
        { wch: 42 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Membresias');

      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('');

      XLSX.writeFile(workbook, `membresias_${stamp}.xlsx`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar membresias');
    } finally {
      setMembershipExporting(false);
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
                <span className="text-sm font-semibold text-brand-forest">Precio base</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="base_price" onChange={handlePlanChange} required step="0.01" type="number" value={planForm.base_price} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Impuesto</span>
                <select
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  onChange={handlePlanTaxChange}
                  value={selectedTaxValue}
                >
                  {configuredTaxOptions.map((option) => {
                    const optionValue = `${String(option?.name || '').trim()}|${Number(option?.rate || 0)}`;
                    return (
                      <option key={optionValue} value={optionValue}>
                        {String(option?.name || 'Impuesto')} ({Number(option?.rate || 0)}%)
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Tasa impuesto (%)</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" max="100" min="0" name="tax_rate" onChange={handlePlanChange} required step="0.01" type="number" value={planForm.tax_rate} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Precio de venta</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/30 px-4 py-3" min="0" name="price" readOnly step="0.01" type="number" value={planForm.price} />
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
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  disabled={Boolean(editingMembershipId)}
                  name="client_search"
                  onChange={handleClientSearchChange}
                  placeholder="Buscar cliente por codigo, nombre o telefono"
                  value={clientSearch}
                  type="text"
                />
                {!editingMembershipId ? (
                  <div className="max-h-56 overflow-auto rounded-2xl border border-brand-sand bg-white shadow-sm">
                    {clients.filter((client) => {
                      const search = clientSearch.trim().toLowerCase();
                      if (!search) return true;
                      const clientName = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase();
                      const clientCode = String(client.client_code || '').toLowerCase();
                      const clientPhone = String(client.phone_number || '').toLowerCase();
                      return clientName.includes(search) || clientCode.includes(search) || clientPhone.includes(search);
                    }).slice(0, 8).map((client) => (
                      <button
                        className="w-full border-b border-brand-sand/50 px-4 py-3 text-left text-sm text-brand-forest transition hover:bg-brand-cream/60"
                        key={client.id}
                        onClick={() => selectClient(client)}
                        type="button"
                      >
                        <span className="flex items-center gap-3">
                          {client.photo_url ? (
                            <img
                              alt={`${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Cliente'}
                              className="h-10 w-10 cursor-zoom-in rounded-full border border-brand-sand/70 object-cover"
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
                            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-sand/70 bg-brand-cream/70 text-xs font-semibold uppercase text-brand-forest">
                              {`${client.first_name?.[0] || ''}${client.last_name?.[0] || ''}` || '--'}
                            </span>
                          )}
                          <span className="font-semibold">{client.client_code} - {client.first_name} {client.last_name}</span>
                        </span>
                        {client.phone_number ? <span className="block text-xs text-brand-forest/70">{client.phone_number}</span> : null}
                      </button>
                    ))}
                    {!clients.length ? (
                      <p className="px-4 py-3 text-sm text-brand-forest/70">Cargando clientes...</p>
                    ) : null}
                    {clients.length && !clients.some((client) => String(client.id) === String(membershipForm.client_id)) ? null : null}
                  </div>
                ) : (
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    disabled
                    readOnly
                    value={clients.find((client) => String(client.id) === String(membershipForm.client_id)) ? `${clients.find((client) => String(client.id) === String(membershipForm.client_id)).client_code} - ${clients.find((client) => String(client.id) === String(membershipForm.client_id)).first_name} ${clients.find((client) => String(client.id) === String(membershipForm.client_id)).last_name}` : ''}
                  />
                )}

                {membershipForm.client_id && clients.find((client) => String(client.id) === String(membershipForm.client_id))?.photo_url ? (
                  <button
                    className="mt-2 w-fit"
                    onClick={() => {
                      const selectedClient = clients.find((client) => String(client.id) === String(membershipForm.client_id));
                      if (!selectedClient?.photo_url) {
                        return;
                      }

                      openPhotoViewer(
                        selectedClient.photo_url,
                        `${selectedClient.first_name || ''} ${selectedClient.last_name || ''}`.trim() || 'Foto de cliente'
                      );
                    }}
                    type="button"
                  >
                    <img
                      alt="Foto del cliente seleccionado"
                      className="h-16 w-16 cursor-zoom-in rounded-full border border-brand-sand/70 object-cover"
                      src={clients.find((client) => String(client.id) === String(membershipForm.client_id)).photo_url}
                    />
                  </button>
                ) : null}
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
                  <p className="mt-1 text-sm text-brand-forest/70">
                    Base {formatCurrency(plan.base_price || 0)} · Imp. {plan.tax_name || 'Exento'} ({Number(plan.tax_rate || 0)}%)
                  </p>
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
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input className="min-w-72 flex-1 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" onChange={(event) => setMembershipSearch(event.target.value)} placeholder="Buscar por cliente, codigo, plan, numero o estado" value={membershipSearch} />
            <button
              className="rounded-2xl border border-brand-sand px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
              disabled={membershipExporting || membershipsLoading}
              onClick={handleExportMembershipsExcel}
              type="button"
            >
              {membershipExporting ? 'Exportando...' : 'Exportar Excel'}
            </button>
          </div>
          {membershipsLoading ? <p className="text-sm text-brand-forest/70">Cargando membresias...</p> : null}
          {!membershipsLoading && !memberships.length ? <EmptyState title="Sin resultados" description="No hay membresias que coincidan con la busqueda actual." /> : null}
          {memberships.length ? (
            <div className="space-y-3">
              {memberships.map((membership) => (
                <div key={membership.id} className="rounded-2xl border border-brand-sand/70 px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                      {getClientPhotoById(membership.client_id) ? (
                        <img
                          alt={`${membership.client_first_name || ''} ${membership.client_last_name || ''}`.trim() || 'Cliente'}
                          className="h-12 w-12 cursor-zoom-in rounded-full border border-brand-sand/70 object-cover"
                          onClick={() =>
                            openPhotoViewer(
                              getClientPhotoById(membership.client_id),
                              `${membership.client_first_name || ''} ${membership.client_last_name || ''}`.trim() || 'Foto de cliente'
                            )
                          }
                          src={getClientPhotoById(membership.client_id)}
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-sand/70 bg-brand-cream/70 text-xs font-semibold uppercase text-brand-forest">
                          {`${membership.client_first_name?.[0] || ''}${membership.client_last_name?.[0] || ''}` || '--'}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-brand-forest">
                          {membership.client_first_name} {membership.client_last_name}
                        </p>
                        <p className="mt-1 text-sm text-brand-forest/70">
                          {membership.plan_name} · {membership.membership_number}
                        </p>
                      </div>
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
