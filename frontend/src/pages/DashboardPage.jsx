import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useApi } from '../hooks/useApi';
import { apiGet } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';

export function DashboardPage() {
  const { data: clientsSummary } = useApi(() => apiGet('/clients/summary'), []);
  const { data: membershipsSummary } = useApi(() => apiGet('/memberships/summary'), []);
  const { data: salesSummary } = useApi(() => apiGet('/sales/summary'), []);
  const { data: memberships } = useApi(() => apiGet('/memberships?limit=5'), []);

  return (
    <div>
      <PageHeader
        eyebrow="Operacion diaria"
        title="Dashboard del gimnasio"
        description="Vista general para recepcion y caja. Aqui podemos ver clientes, membresias activas y el pulso de las ventas del dia."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Clientes"
          value={clientsSummary?.data?.total_clients ?? '--'}
          hint={`${clientsSummary?.data?.active_clients ?? 0} activos en el sistema`}
        />
        <MetricCard
          label="Membresias activas"
          value={membershipsSummary?.data?.active_memberships ?? '--'}
          hint={`${membershipsSummary?.data?.expiring_in_7_days ?? 0} vencen pronto`}
          accent="clay"
        />
        <MetricCard
          label="Ventas del dia"
          value={salesSummary?.data?.sales_today ?? '--'}
          hint={formatCurrency(salesSummary?.data?.revenue_today ?? 0)}
          accent="cream"
        />
        <MetricCard
          label="Ingresos acumulados"
          value={formatCurrency(salesSummary?.data?.total_revenue ?? 0)}
          hint="Solo ventas completadas"
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <DataPanel
          title="Membresias recientes"
          subtitle="Seguimiento de clientes activos, pendientes o proximos a vencer."
        >
          {memberships?.data?.length ? (
            <div className="space-y-3">
              {memberships.data.map((membership) => (
                <div
                  key={membership.id}
                  className="flex flex-col gap-3 rounded-2xl border border-brand-sand/70 px-4 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-brand-forest">
                      {membership.client_first_name} {membership.client_last_name}
                    </p>
                    <p className="mt-1 text-sm text-brand-forest/70">
                      {membership.plan_name} · vence {formatDate(membership.end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-brand-clay">
                      {formatCurrency(membership.balance_due)}
                    </p>
                    <StatusBadge value={membership.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Todavia no hay membresias"
              description="Cuando empecemos a vender planes, aqui apareceran las ultimas altas."
            />
          )}
        </DataPanel>

        <DataPanel
          title="Panel rapido"
          subtitle="Atajos operativos para la primera etapa del sistema."
        >
          <div className="grid gap-3">
            <div className="rounded-2xl bg-brand-cream p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-moss">Recepcion</p>
              <p className="mt-2 text-sm text-brand-forest/80">
                Verificar membresias activas antes del check-in de los clientes.
              </p>
            </div>
            <div className="rounded-2xl bg-brand-cream p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-moss">POS</p>
              <p className="mt-2 text-sm text-brand-forest/80">
                Registrar ventas y mantener el stock actualizado automaticamente.
              </p>
            </div>
            <div className="rounded-2xl bg-brand-cream p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-moss">Caja</p>
              <p className="mt-2 text-sm text-brand-forest/80">
                El siguiente paso sera agregar apertura y cierre de caja con arqueo.
              </p>
            </div>
          </div>
        </DataPanel>
      </section>
    </div>
  );
}
