import { useEffect, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { PageHeader } from '../components/PageHeader';
import SimpleModal from '../components/SimpleModal';
import { apiGet, authToken, buildQueryString } from '../lib/api';

const reportModules = [
  {
    title: 'Ventas',
    description: 'Reportes para caja, ingresos y rendimiento comercial.',
    items: ['Ventas diarias', 'Ventas por producto', 'Resumen de caja', 'Ventas por vendedor']
  },
  {
    title: 'Clientes',
    description: 'Informes sobre cartera, crecimiento y retención.',
    items: ['Clientes activos', 'Clientes nuevos', 'Clientes inactivos', 'Membresías por cliente']
  },
  {
    title: 'Membresías',
    description: 'Visión sobre vigencias, renovaciones y saldo.',
    items: ['Membresías vigentes', 'Membresías por plan', 'Renovaciones próximas', 'Ingresos recurrentes']
  },
  {
    title: 'Inventario',
    description: 'Reportes sobre existencias, movimientos y control de productos.',
    items: [
      'Inventario actual',
      'Productos bajos en stock',
      'Movimientos de inventario',
      'Kardex de producto'
    ]
  }
];

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function ReportsPage() {
  const [openDailySalesModal, setOpenDailySalesModal] = useState(false);
  const [openProductSalesModal, setOpenProductSalesModal] = useState(false);
  const [openCashSummaryModal, setOpenCashSummaryModal] = useState(false);
  const [openSellerSalesModal, setOpenSellerSalesModal] = useState(false);
  const [openActiveClientsModal, setOpenActiveClientsModal] = useState(false);
  const [openNewClientsModal, setOpenNewClientsModal] = useState(false);
  const [openInactiveClientsModal, setOpenInactiveClientsModal] = useState(false);
  const [openMembershipsByClientModal, setOpenMembershipsByClientModal] = useState(false);
  const [dailyParams, setDailyParams] = useState({
    fechaInicio: getTodayDateString(),
    fechaFin: getTodayDateString(),
    cashierUserId: '',
    saleStatus: '',
    cashSessionId: ''
  });
  const [sellerParams, setSellerParams] = useState({
    fechaInicio: getTodayDateString(),
    fechaFin: getTodayDateString(),
    sellerUserId: '',
    saleStatus: '',
    cashSessionId: ''
  });
  const [cashiers, setCashiers] = useState([]);
  const [params, setParams] = useState({
    fechaInicio: '',
    fechaFin: '',
    categoryId: '',
    productSearch: '',
    productId: ''
  });
  const [categories, setCategories] = useState([]);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [cashParams, setCashParams] = useState({
    fechaInicio: '',
    fechaFin: '',
    sessionId: '',
    sessionStatus: ''
  });
  const [cashSessions, setCashSessions] = useState([]);
  const [activeClientsParams, setActiveClientsParams] = useState({
    fechaInicio: getTodayDateString(),
    fechaFin: getTodayDateString(),
    search: '',
    onlyWithActiveMembership: false
  });
  const [newClientsParams, setNewClientsParams] = useState({
    fechaInicio: getTodayDateString(),
    fechaFin: getTodayDateString(),
    search: '',
    activeStatus: '',
    withMembership: false
  });
  const [inactiveClientsParams, setInactiveClientsParams] = useState({
    fechaInicio: getTodayDateString(),
    fechaFin: getTodayDateString(),
    search: '',
    withMembership: false
  });
  const [membershipsByClientParams, setMembershipsByClientParams] = useState({
    fechaInicio: getTodayDateString(),
    fechaFin: getTodayDateString(),
    clientSearch: '',
    status: '',
    planId: '',
    onlyActiveClients: false
  });
  const [membershipPlans, setMembershipPlans] = useState([]);

  useEffect(() => {
    let isMounted = true;

    apiGet('/product-categories')
      .then((response) => {
        if (isMounted) {
          setCategories(response.data || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCategories([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!openProductSalesModal) {
      return () => {
        isMounted = false;
      };
    }

    const term = params.productSearch.trim();
    if (term.length < 2) {
      setProductSuggestions([]);
      setLoadingSuggestions(false);
      return () => {
        isMounted = false;
      };
    }

    setLoadingSuggestions(true);
    apiGet(
      `/products${buildQueryString({
        search: term,
        active: true,
        limit: 8,
        category_id: params.categoryId || ''
      })}`
    )
      .then((response) => {
        if (isMounted) {
          setProductSuggestions(response.data || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setProductSuggestions([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingSuggestions(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [openProductSalesModal, params.productSearch, params.categoryId]);

  useEffect(() => {
    let isMounted = true;

    if (!(openDailySalesModal || openSellerSalesModal)) {
      return () => {
        isMounted = false;
      };
    }

    Promise.all([
      apiGet('/users?active=true&limit=100'),
      apiGet('/reports/cash-sessions/options')
    ])
      .then(([usersResponse, sessionsResponse]) => {
        if (isMounted) {
          setCashiers(usersResponse.data || []);
          setCashSessions(sessionsResponse.data || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCashiers([]);
          setCashSessions([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [openDailySalesModal, openSellerSalesModal]);

  useEffect(() => {
    let isMounted = true;

    if (!openCashSummaryModal) {
      return () => {
        isMounted = false;
      };
    }

    apiGet('/reports/cash-sessions/options')
      .then((response) => {
        if (isMounted) {
          setCashSessions(response.data || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCashSessions([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [openCashSummaryModal]);

  useEffect(() => {
    let isMounted = true;

    if (!openMembershipsByClientModal) {
      return () => {
        isMounted = false;
      };
    }

    apiGet('/membership-plans?limit=100')
      .then((response) => {
        if (isMounted) {
          setMembershipPlans(response.data || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setMembershipPlans([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [openMembershipsByClientModal]);

  const handleOpenDailySales = () => setOpenDailySalesModal(true);
  const handleCloseDailySales = () => setOpenDailySalesModal(false);
  const handleOpenProductSales = () => setOpenProductSalesModal(true);
  const handleCloseProductSales = () => {
    setOpenProductSalesModal(false);
    setProductSuggestions([]);
    setLoadingSuggestions(false);
  };
  const handleOpenCashSummary = () => setOpenCashSummaryModal(true);
  const handleCloseCashSummary = () => setOpenCashSummaryModal(false);
  const handleOpenSellerSales = () => setOpenSellerSalesModal(true);
  const handleCloseSellerSales = () => setOpenSellerSalesModal(false);
  const handleOpenActiveClients = () => setOpenActiveClientsModal(true);
  const handleCloseActiveClients = () => setOpenActiveClientsModal(false);
  const handleOpenNewClients = () => setOpenNewClientsModal(true);
  const handleCloseNewClients = () => setOpenNewClientsModal(false);
  const handleOpenInactiveClients = () => setOpenInactiveClientsModal(true);
  const handleCloseInactiveClients = () => setOpenInactiveClientsModal(false);
  const handleOpenMembershipsByClient = () => setOpenMembershipsByClientModal(true);
  const handleCloseMembershipsByClient = () => setOpenMembershipsByClientModal(false);
  const handleParamsChange = (e) => {
    const { name, value } = e.target;

    if (name === 'productSearch') {
      setParams((prev) => ({ ...prev, productSearch: value, productId: '' }));
      return;
    }

    if (name === 'categoryId') {
      setParams((prev) => ({ ...prev, categoryId: value, productId: '' }));
      return;
    }

    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleCashParamsChange = (e) => {
    const { name, value } = e.target;
    setCashParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleDailyParamsChange = (e) => {
    const { name, value } = e.target;
    setDailyParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleSellerParamsChange = (e) => {
    const { name, value } = e.target;
    setSellerParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleActiveClientsParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setActiveClientsParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleNewClientsParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewClientsParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleInactiveClientsParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setInactiveClientsParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleMembershipsByClientParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setMembershipsByClientParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSelectProduct = (product) => {
    setParams((prev) => ({
      ...prev,
      productId: String(product.id),
      productSearch: product.name
    }));
    setProductSuggestions([]);
  };

  const handleProductSalesReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: params.fechaInicio,
      fechaFin: params.fechaFin,
      category_id: params.categoryId,
      product_id: params.productId,
      product_search: params.productId ? '' : params.productSearch.trim()
    });
    fetch(`http://localhost:3001/api/reports/product-sales/pdf${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    })
      .then(response => {
        if (!response.ok) throw new Error('No se pudo descargar el PDF');
        return response.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ventas_por_producto.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));
    setOpenProductSalesModal(false);
  };

  const handleDailySalesReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: dailyParams.fechaInicio,
      fechaFin: dailyParams.fechaFin,
      cashier_user_id: dailyParams.cashierUserId,
      status: dailyParams.saleStatus,
      cash_register_session_id: dailyParams.cashSessionId
    });

    fetch(`http://localhost:3001/api/reports/daily-sales/pdf${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo descargar el PDF');
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ventas_diarias.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenDailySalesModal(false);
  };

  const handleCashSummaryReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: cashParams.fechaInicio,
      fechaFin: cashParams.fechaFin,
      session_id: cashParams.sessionId,
      session_status: cashParams.sessionStatus
    });

    fetch(`http://localhost:3001/api/reports/cash-summary/pdf${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo descargar el PDF');
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'resumen_caja.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenCashSummaryModal(false);
  };

  const handleSellerSalesReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: sellerParams.fechaInicio,
      fechaFin: sellerParams.fechaFin,
      seller_user_id: sellerParams.sellerUserId,
      status: sellerParams.saleStatus,
      cash_register_session_id: sellerParams.cashSessionId
    });

    fetch(`http://localhost:3001/api/reports/seller-sales/pdf${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo descargar el PDF');
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ventas_por_vendedor.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenSellerSalesModal(false);
  };

  const handleActiveClientsReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: activeClientsParams.fechaInicio,
      fechaFin: activeClientsParams.fechaFin,
      search: activeClientsParams.search.trim(),
      only_with_active_membership: activeClientsParams.onlyWithActiveMembership
    });

    fetch(`http://localhost:3001/api/reports/active-clients/pdf${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo descargar el PDF');
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clientes_activos.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenActiveClientsModal(false);
  };

  const handleNewClientsReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: newClientsParams.fechaInicio,
      fechaFin: newClientsParams.fechaFin,
      search: newClientsParams.search.trim(),
      active_status: newClientsParams.activeStatus,
      with_membership: newClientsParams.withMembership
    });

    fetch(`http://localhost:3001/api/reports/new-clients/pdf${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo descargar el PDF');
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clientes_nuevos.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenNewClientsModal(false);
  };

  const handleInactiveClientsReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: inactiveClientsParams.fechaInicio,
      fechaFin: inactiveClientsParams.fechaFin,
      search: inactiveClientsParams.search.trim(),
      with_membership: inactiveClientsParams.withMembership
    });

    fetch(`http://localhost:3001/api/reports/inactive-clients/pdf${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo descargar el PDF');
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clientes_inactivos.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenInactiveClientsModal(false);
  };

  const handleMembershipsByClientReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: membershipsByClientParams.fechaInicio,
      fechaFin: membershipsByClientParams.fechaFin,
      client_search: membershipsByClientParams.clientSearch.trim(),
      status: membershipsByClientParams.status,
      plan_id: membershipsByClientParams.planId,
      only_active_clients: membershipsByClientParams.onlyActiveClients
    });

    fetch(`http://localhost:3001/api/reports/memberships-by-client/pdf${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo descargar el PDF');
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'membresias_por_cliente.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenMembershipsByClientModal(false);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Reportes"
        title="Menú de reportes por módulo"
        description="Accede rápidamente a los reportes más importantes de cada módulo de la plataforma."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {reportModules.map((module) => (
          <DataPanel key={module.title} title={module.title} subtitle={module.description}>
            <ul className="grid gap-3">
              {module.items.map((report) => (
                <li key={report} className="rounded-2xl border border-brand-sand/70 bg-brand-cream/40 p-4">
                  {report === 'Ventas diarias' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenDailySales}
                    >
                      {report} (PDF)
                    </button>
                  ) : report === 'Ventas por producto' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenProductSales}
                    >
                      {report}
                    </button>
                  ) : report === 'Resumen de caja' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenCashSummary}
                    >
                      {report}
                    </button>
                  ) : report === 'Ventas por vendedor' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenSellerSales}
                    >
                      {report}
                    </button>
                  ) : report === 'Clientes activos' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenActiveClients}
                    >
                      {report}
                    </button>
                  ) : report === 'Clientes nuevos' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenNewClients}
                    >
                      {report}
                    </button>
                  ) : report === 'Clientes inactivos' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenInactiveClients}
                    >
                      {report}
                    </button>
                  ) : report === 'Membresías por cliente' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenMembershipsByClient}
                    >
                      {report}
                    </button>
                  ) : (
                    <p className="font-semibold text-brand-forest">{report}</p>
                  )}
                </li>
              ))}
            </ul>
          </DataPanel>
        ))}
      </div>

      <SimpleModal open={openDailySalesModal} onClose={handleCloseDailySales}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de ventas diarias</h2>
        <form onSubmit={handleDailySalesReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={dailyParams.fechaInicio}
              onChange={handleDailyParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={dailyParams.fechaFin}
              onChange={handleDailyParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Cajero (opcional)</span>
            <select
              name="cashierUserId"
              value={dailyParams.cashierUserId}
              onChange={handleDailyParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos</option>
              {cashiers.map((cashier) => (
                <option key={cashier.id} value={cashier.id}>
                  {cashier.username}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Estado (opcional)</span>
            <select
              name="saleStatus"
              value={dailyParams.saleStatus}
              onChange={handleDailyParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Completadas (por defecto)</option>
              <option value="completed">Completadas</option>
              <option value="pending">Pendientes</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Sesión de caja (opcional)</span>
            <select
              name="cashSessionId"
              value={dailyParams.cashSessionId}
              onChange={handleDailyParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todas</option>
              {cashSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  Sesión #{session.id} - {session.status === 'open' ? 'Abierta' : 'Cerrada'} -{' '}
                  {new Date(session.opened_at).toLocaleDateString('es-NI')}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseDailySales} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openProductSalesModal} onClose={handleCloseProductSales}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de ventas por producto</h2>
        <form onSubmit={handleProductSalesReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input type="date" name="fechaInicio" value={params.fechaInicio} onChange={handleParamsChange} required className="border rounded px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input type="date" name="fechaFin" value={params.fechaFin} onChange={handleParamsChange} required className="border rounded px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Categoria (opcional)</span>
            <select
              name="categoryId"
              value={params.categoryId}
              onChange={handleParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todas las categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Producto (busqueda opcional)</span>
            <input
              type="text"
              name="productSearch"
              value={params.productSearch}
              onChange={handleParamsChange}
              placeholder="Escribe nombre o SKU del producto"
              className="border rounded px-2 py-1"
            />
          </label>
          {(loadingSuggestions || productSuggestions.length > 0) && (
            <div className="rounded border border-brand-sand/70 bg-white max-h-40 overflow-auto">
              {loadingSuggestions && (
                <p className="px-3 py-2 text-sm text-slate-500">Buscando productos...</p>
              )}
              {!loadingSuggestions && productSuggestions.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-500">Sin coincidencias</p>
              )}
              {!loadingSuggestions &&
                productSuggestions.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelectProduct(product)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-brand-cream/60"
                  >
                    {product.name}
                    {product.sku ? ` (${product.sku})` : ''}
                  </button>
                ))}
            </div>
          )}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseProductSales} className="px-3 py-1 rounded bg-gray-200">Cancelar</button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">Ver reporte</button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openCashSummaryModal} onClose={handleCloseCashSummary}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de resumen de caja</h2>
        <form onSubmit={handleCashSummaryReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={cashParams.fechaInicio}
              onChange={handleCashParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={cashParams.fechaFin}
              onChange={handleCashParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Sesión de caja (opcional)</span>
            <select
              name="sessionId"
              value={cashParams.sessionId}
              onChange={handleCashParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todas las sesiones</option>
              {cashSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  Sesión #{session.id} - {session.status === 'open' ? 'Abierta' : 'Cerrada'} -{' '}
                  {new Date(session.opened_at).toLocaleDateString('es-NI')}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Estado de sesión (opcional)</span>
            <select
              name="sessionStatus"
              value={cashParams.sessionStatus}
              onChange={handleCashParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos</option>
              <option value="open">Abierta</option>
              <option value="closed">Cerrada</option>
            </select>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseCashSummary}
              className="px-3 py-1 rounded bg-gray-200"
            >
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openSellerSalesModal} onClose={handleCloseSellerSales}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de ventas por vendedor</h2>
        <form onSubmit={handleSellerSalesReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={sellerParams.fechaInicio}
              onChange={handleSellerParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={sellerParams.fechaFin}
              onChange={handleSellerParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Vendedor (opcional)</span>
            <select
              name="sellerUserId"
              value={sellerParams.sellerUserId}
              onChange={handleSellerParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos</option>
              {cashiers.map((cashier) => (
                <option key={cashier.id} value={cashier.id}>
                  {cashier.username}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Estado (opcional)</span>
            <select
              name="saleStatus"
              value={sellerParams.saleStatus}
              onChange={handleSellerParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Completadas (por defecto)</option>
              <option value="completed">Completadas</option>
              <option value="pending">Pendientes</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Sesión de caja (opcional)</span>
            <select
              name="cashSessionId"
              value={sellerParams.cashSessionId}
              onChange={handleSellerParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todas</option>
              {cashSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  Sesión #{session.id} - {session.status === 'open' ? 'Abierta' : 'Cerrada'} -{' '}
                  {new Date(session.opened_at).toLocaleDateString('es-NI')}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseSellerSales}
              className="px-3 py-1 rounded bg-gray-200"
            >
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openActiveClientsModal} onClose={handleCloseActiveClients}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de clientes activos</h2>
        <form onSubmit={handleActiveClientsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={activeClientsParams.fechaInicio}
              onChange={handleActiveClientsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={activeClientsParams.fechaFin}
              onChange={handleActiveClientsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={activeClientsParams.search}
              onChange={handleActiveClientsParamsChange}
              placeholder="Código, nombre, correo o teléfono"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="onlyWithActiveMembership"
              checked={activeClientsParams.onlyWithActiveMembership}
              onChange={handleActiveClientsParamsChange}
            />
            <span className="text-sm font-semibold">Solo con membresía activa vigente</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseActiveClients}
              className="px-3 py-1 rounded bg-gray-200"
            >
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openNewClientsModal} onClose={handleCloseNewClients}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de clientes nuevos</h2>
        <form onSubmit={handleNewClientsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={newClientsParams.fechaInicio}
              onChange={handleNewClientsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={newClientsParams.fechaFin}
              onChange={handleNewClientsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={newClientsParams.search}
              onChange={handleNewClientsParamsChange}
              placeholder="Código, nombre, correo o teléfono"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Estado del cliente (opcional)</span>
            <select
              name="activeStatus"
              value={newClientsParams.activeStatus}
              onChange={handleNewClientsParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="withMembership"
              checked={newClientsParams.withMembership}
              onChange={handleNewClientsParamsChange}
            />
            <span className="text-sm font-semibold">Solo clientes con membresía</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseNewClients}
              className="px-3 py-1 rounded bg-gray-200"
            >
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openInactiveClientsModal} onClose={handleCloseInactiveClients}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de clientes inactivos</h2>
        <form onSubmit={handleInactiveClientsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={inactiveClientsParams.fechaInicio}
              onChange={handleInactiveClientsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={inactiveClientsParams.fechaFin}
              onChange={handleInactiveClientsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={inactiveClientsParams.search}
              onChange={handleInactiveClientsParamsChange}
              placeholder="Código, nombre, correo o teléfono"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="withMembership"
              checked={inactiveClientsParams.withMembership}
              onChange={handleInactiveClientsParamsChange}
            />
            <span className="text-sm font-semibold">Solo clientes con membresía</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseInactiveClients}
              className="px-3 py-1 rounded bg-gray-200"
            >
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openMembershipsByClientModal} onClose={handleCloseMembershipsByClient}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de membresías por cliente</h2>
        <form onSubmit={handleMembershipsByClientReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={membershipsByClientParams.fechaInicio}
              onChange={handleMembershipsByClientParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={membershipsByClientParams.fechaFin}
              onChange={handleMembershipsByClientParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Cliente (búsqueda opcional)</span>
            <input
              type="text"
              name="clientSearch"
              value={membershipsByClientParams.clientSearch}
              onChange={handleMembershipsByClientParamsChange}
              placeholder="Código, nombre, correo o teléfono"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Estado de membresía (opcional)</span>
            <select
              name="status"
              value={membershipsByClientParams.status}
              onChange={handleMembershipsByClientParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos</option>
              <option value="active">Activa</option>
              <option value="pending">Pendiente</option>
              <option value="expired">Expirada</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Plan (opcional)</span>
            <select
              name="planId"
              value={membershipsByClientParams.planId}
              onChange={handleMembershipsByClientParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos los planes</option>
              {membershipPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="onlyActiveClients"
              checked={membershipsByClientParams.onlyActiveClients}
              onChange={handleMembershipsByClientParamsChange}
            />
            <span className="text-sm font-semibold">Solo clientes activos</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseMembershipsByClient}
              className="px-3 py-1 rounded bg-gray-200"
            >
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>
    </div>
  );
}
