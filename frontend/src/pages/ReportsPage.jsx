import { useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { PageHeader } from '../components/PageHeader';
import SimpleModal from '../components/SimpleModal';
import { authToken, buildQueryString } from '../lib/api';

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
  const [params, setParams] = useState({ fechaInicio: '', fechaFin: '' });

  const handleOpenProductSales = () => setOpenProductSalesModal(true);
  const handleCloseProductSales = () => setOpenProductSalesModal(false);
  const handleParamsChange = (e) => {
    const { name, value } = e.target;
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleProductSalesReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: params.fechaInicio,
      fechaFin: params.fechaFin
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
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseProductSales} className="px-3 py-1 rounded bg-gray-200">Cancelar</button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">Ver reporte</button>
          </div>
        </form>
      </SimpleModal>
    </div>
  );
}
