import { DataPanel } from '../components/DataPanel';
import { PageHeader } from '../components/PageHeader';
import { authToken } from '../lib/api';

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
    title: 'Seguridad',
    description: 'Control de accesos, roles y cambios en el sistema.',
    items: ['Usuarios activos', 'Roles asignados', 'Accesos recientes', 'Cambios de permisos']
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
                  ) : (
                    <p className="font-semibold text-brand-forest">{report}</p>
                  )}
                </li>
              ))}
            </ul>
          </DataPanel>
        ))}
      </div>
    </div>
  );
}
