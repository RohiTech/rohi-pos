import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useApi } from '../hooks/useApi';
import { apiGet } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';

export function PosPage() {
  const { data: productsData, loading: productsLoading } = useApi(() => apiGet('/products'), []);
  const { data: salesData, loading: salesLoading } = useApi(() => apiGet('/sales'), []);
  const { data: salesSummary } = useApi(() => apiGet('/sales/summary'), []);

  return (
    <div>
      <PageHeader
        eyebrow="Punto de venta"
        title="Productos, inventario y ventas"
        description="Vista inicial del modulo POS. Muestra catalogo, stock y ventas recientes del gimnasio."
      />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <DataPanel
          title="Catalogo de productos"
          subtitle="Productos listos para venta rapida desde mostrador."
        >
          {productsLoading ? <p className="text-sm text-brand-forest/70">Cargando productos...</p> : null}

          {productsData?.data?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {productsData.data.map((product) => (
                <article key={product.id} className="rounded-2xl border border-brand-sand/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">{product.sku}</p>
                      <h3 className="mt-2 text-lg font-semibold text-brand-forest">{product.name}</h3>
                      <p className="mt-1 text-sm text-brand-forest/70">{product.category_name || 'Sin categoria'}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                        Number(product.stock_quantity) <= Number(product.minimum_stock)
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      stock {Number(product.stock_quantity)}
                    </span>
                  </div>
                  <p className="mt-4 text-xl font-bold text-brand-clay">
                    {formatCurrency(product.sale_price)}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sin productos"
              description="Agrega productos para comenzar a vender suplementos, bebidas o accesorios."
            />
          )}
        </DataPanel>

        <DataPanel title="Ventas recientes" subtitle="Resumen rapido del POS conectado al backend.">
          <div className="mb-4 rounded-2xl bg-brand-cream p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ingresos POS</p>
            <p className="mt-2 text-3xl font-bold text-brand-forest">
              {formatCurrency(salesSummary?.data?.total_revenue ?? 0)}
            </p>
            <p className="mt-2 text-sm text-brand-forest/70">
              {salesSummary?.data?.sales_today ?? 0} ventas registradas hoy
            </p>
          </div>

          {salesLoading ? <p className="text-sm text-brand-forest/70">Cargando ventas...</p> : null}

          {salesData?.data?.length ? (
            <div className="space-y-3">
              {salesData.data.map((sale) => (
                <div key={sale.id} className="rounded-2xl border border-brand-sand/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-brand-forest">{sale.sale_number}</p>
                      <p className="mt-1 text-sm text-brand-forest/70">
                        {sale.client_first_name
                          ? `${sale.client_first_name} ${sale.client_last_name}`
                          : 'Venta sin cliente asociado'}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-brand-clay">{formatCurrency(sale.total)}</p>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-brand-moss">
                    {formatDate(sale.sold_at)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sin ventas"
              description="Cuando registremos ventas desde el POS, apareceran aqui."
            />
          )}
        </DataPanel>
      </section>
    </div>
  );
}
