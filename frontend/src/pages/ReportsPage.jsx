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

function downloadDailySalesPdf() {
  fetch('http://localhost:3001/api/reports/daily-sales/pdf', {
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
      a.download = 'ventas_diarias.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    })
    .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));
}

export function ReportsPage() {
  const [openProductSalesModal, setOpenProductSalesModal] = useState(false);
  const [openCashSummaryModal, setOpenCashSummaryModal] = useState(false);
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

  const handleOpenProductSales = () => setOpenProductSalesModal(true);
  const handleCloseProductSales = () => {
    setOpenProductSalesModal(false);
    setProductSuggestions([]);
    setLoadingSuggestions(false);
  };
  const handleOpenCashSummary = () => setOpenCashSummaryModal(true);
  const handleCloseCashSummary = () => setOpenCashSummaryModal(false);
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
                      onClick={downloadDailySalesPdf}
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
                  ) : (
                    <p className="font-semibold text-brand-forest">{report}</p>
                  )}
                </li>
              ))}
            </ul>
          </DataPanel>
        ))}
      </div>

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
    </div>
  );
}
