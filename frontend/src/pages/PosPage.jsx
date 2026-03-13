import { useEffect, useMemo, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { apiGet, apiPost } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';

const PRODUCT_PAGE_SIZE = 6;
const MOVEMENT_PAGE_SIZE = 8;
const SALE_PAGE_SIZE = 5;

const initialProductForm = {
  category_id: '',
  sku: '',
  name: '',
  description: '',
  sale_price: '',
  cost_price: '',
  stock_quantity: '',
  minimum_stock: '',
  unit_label: 'unidad',
  barcode: '',
  is_active: true
};

const initialInventoryForm = {
  product_id: '',
  movement_type: 'purchase',
  quantity: '',
  unit_cost: '',
  notes: ''
};

const initialSaleForm = {
  client_id: '',
  payment_method: 'cash',
  discount: '',
  tax: '',
  notes: '',
  items: [{ product_id: '', quantity: '1', discount: '' }]
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

export function PosPage() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('products');
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [saleSearch, setSaleSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [salePage, setSalePage] = useState(1);
  const [productForm, setProductForm] = useState(initialProductForm);
  const [inventoryForm, setInventoryForm] = useState(initialInventoryForm);
  const [saleForm, setSaleForm] = useState(initialSaleForm);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingInventory, setSavingInventory] = useState(false);
  const [savingSale, setSavingSale] = useState(false);

  const productsQuery = useApi(() => apiGet('/products'), [refreshKey]);
  const categoriesQuery = useApi(() => apiGet('/product-categories'), [refreshKey]);
  const clientsQuery = useApi(() => apiGet('/clients'), [refreshKey]);
  const salesQuery = useApi(() => apiGet('/sales'), [refreshKey]);
  const salesSummaryQuery = useApi(() => apiGet('/sales/summary'), [refreshKey]);
  const movementsQuery = useApi(
    () =>
      selectedProductId
        ? apiGet(`/products/${selectedProductId}/inventory-movements`)
        : Promise.resolve({ data: [] }),
    [selectedProductId, refreshKey]
  );

  const products = productsQuery.data || [];
  const categories = categoriesQuery.data || [];
  const activeClients = (clientsQuery.data || []).filter((client) => client.is_active);
  const sales = salesQuery.data || [];
  const salesSummary = salesSummaryQuery.data || {};
  const movements = movementsQuery.data || [];

  useEffect(() => {
    if (!selectedProductId && products.length > 0) {
      const firstActiveProduct = products.find((product) => product.is_active) || products[0];
      setSelectedProductId(String(firstActiveProduct.id));
      setInventoryForm((current) => ({
        ...current,
        product_id: String(firstActiveProduct.id)
      }));
    }
  }, [products, selectedProductId]);

  useEffect(() => {
    setProductPage(1);
  }, [productSearch]);

  useEffect(() => {
    setMovementPage(1);
  }, [movementSearch, selectedProductId]);

  useEffect(() => {
    setSalePage(1);
  }, [saleSearch]);

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function notifySuccess(message) {
    setError('');
    setSuccess(message);
  }

  function triggerRefresh(message) {
    setRefreshKey((current) => current + 1);
    notifySuccess(message);
  }

  function handleProductChange(event) {
    const { name, value, type, checked } = event.target;
    setProductForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  }

  function handleInventoryChange(event) {
    const { name, value } = event.target;
    setInventoryForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleSaleChange(event) {
    const { name, value } = event.target;
    setSaleForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleSaleItemChange(index, field, value) {
    setSaleForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    }));
  }

  function addSaleItem() {
    setSaleForm((current) => ({
      ...current,
      items: [...current.items, { product_id: '', quantity: '1', discount: '' }]
    }));
  }

  function removeSaleItem(index) {
    setSaleForm((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? current.items
          : current.items.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function handleCreateProduct(event) {
    event.preventDefault();
    clearMessages();
    setSavingProduct(true);

    try {
      await apiPost('/products', {
        category_id: Number(productForm.category_id),
        sku: productForm.sku,
        name: productForm.name,
        description: productForm.description || null,
        sale_price: Number(productForm.sale_price),
        cost_price: productForm.cost_price === '' ? 0 : Number(productForm.cost_price),
        stock_quantity: productForm.stock_quantity === '' ? 0 : Number(productForm.stock_quantity),
        minimum_stock: productForm.minimum_stock === '' ? 0 : Number(productForm.minimum_stock),
        unit_label: productForm.unit_label || 'unidad',
        barcode: productForm.barcode || null,
        is_active: productForm.is_active
      });

      setProductForm(initialProductForm);
      triggerRefresh('Producto creado correctamente.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible crear el producto');
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleInventoryAdjustment(event) {
    event.preventDefault();
    clearMessages();
    setSavingInventory(true);

    try {
      await apiPost('/products/inventory-adjustments', {
        product_id: Number(inventoryForm.product_id),
        user_id: user.id,
        movement_type: inventoryForm.movement_type,
        quantity: Number(inventoryForm.quantity),
        unit_cost: inventoryForm.unit_cost === '' ? null : Number(inventoryForm.unit_cost),
        notes: inventoryForm.notes || null
      });

      setInventoryForm((current) => ({
        ...initialInventoryForm,
        product_id: current.product_id || selectedProductId || ''
      }));
      triggerRefresh('Movimiento de inventario registrado.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible registrar el movimiento');
    } finally {
      setSavingInventory(false);
    }
  }

  async function handleCreateSale(event) {
    event.preventDefault();
    clearMessages();
    setSavingSale(true);

    try {
      await apiPost('/sales', {
        client_id: saleForm.client_id ? Number(saleForm.client_id) : null,
        cashier_user_id: user.id,
        payment_method: saleForm.payment_method,
        discount: saleForm.discount === '' ? 0 : Number(saleForm.discount),
        tax: saleForm.tax === '' ? 0 : Number(saleForm.tax),
        notes: saleForm.notes || null,
        items: saleForm.items.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          discount: item.discount === '' ? 0 : Number(item.discount)
        }))
      });

      setSaleForm(initialSaleForm);
      triggerRefresh('Venta registrada correctamente.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible registrar la venta');
    } finally {
      setSavingSale(false);
    }
  }

  const filteredProducts = useMemo(() => {
    const term = normalizeText(productSearch);

    return products.filter((product) => {
      if (!term) {
        return true;
      }

      return [product.sku, product.name, product.category_name, product.barcode]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(term));
    });
  }, [products, productSearch]);

  const filteredMovements = useMemo(() => {
    const term = normalizeText(movementSearch);

    return movements.filter((movement) => {
      if (!term) {
        return true;
      }

      return [movement.movement_type, movement.reference_type, movement.notes, movement.quantity]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(term));
    });
  }, [movements, movementSearch]);

  const filteredSales = useMemo(() => {
    const term = normalizeText(saleSearch);

    return sales.filter((sale) => {
      if (!term) {
        return true;
      }

      return [
        sale.sale_number,
        sale.client_code,
        sale.client_first_name,
        sale.client_last_name,
        sale.cashier_username,
        sale.status
      ]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(term));
    });
  }, [sales, saleSearch]);

  const selectedProduct = products.find((product) => String(product.id) === String(selectedProductId));

  const salePreview = useMemo(() => {
    const items = saleForm.items
      .map((item) => {
        const product = products.find((entry) => String(entry.id) === String(item.product_id));
        const quantity = Number(item.quantity || 0);
        const discount = Number(item.discount || 0);
        const unitPrice = Number(product?.sale_price || 0);
        const lineTotal = unitPrice * quantity - discount;

        return {
          label: product?.name || 'Producto pendiente',
          quantity,
          lineTotal: lineTotal > 0 ? lineTotal : 0
        };
      })
      .filter((item) => item.quantity > 0);

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const discount = Number(saleForm.discount || 0);
    const tax = Number(saleForm.tax || 0);
    const total = Math.max(subtotal - discount + tax, 0);

    return { items, total };
  }, [products, saleForm.discount, saleForm.items, saleForm.tax]);

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
  const totalMovementPages = Math.max(1, Math.ceil(filteredMovements.length / MOVEMENT_PAGE_SIZE));
  const totalSalePages = Math.max(1, Math.ceil(filteredSales.length / SALE_PAGE_SIZE));

  const paginatedProducts = filteredProducts.slice(
    (productPage - 1) * PRODUCT_PAGE_SIZE,
    productPage * PRODUCT_PAGE_SIZE
  );
  const paginatedMovements = filteredMovements.slice(
    (movementPage - 1) * MOVEMENT_PAGE_SIZE,
    movementPage * MOVEMENT_PAGE_SIZE
  );
  const paginatedSales = filteredSales.slice((salePage - 1) * SALE_PAGE_SIZE, salePage * SALE_PAGE_SIZE);

  return (
    <div>
      <PageHeader
        eyebrow="Punto de venta"
        title="Productos, inventario y ventas"
        description="Cada flujo del POS trabaja en una ventana separada para operar mas rapido."
      />

      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-emerald-700">{success}</p> : null}

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${
            activeView === 'products' ? 'bg-brand-forest text-white' : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => setActiveView('products')}
          type="button"
        >
          Productos
        </button>
        <button
          className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${
            activeView === 'inventory' ? 'bg-brand-clay text-white' : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => setActiveView('inventory')}
          type="button"
        >
          Inventario
        </button>
        <button
          className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${
            activeView === 'sales' ? 'bg-brand-moss text-white' : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => setActiveView('sales')}
          type="button"
        >
          Ventas
        </button>
      </div>

      {activeView === 'products' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <DataPanel title="Nuevo producto" subtitle="Registra articulos para el mostrador y el POS.">
            <form className="grid gap-4" onSubmit={handleCreateProduct}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Categoria</span>
                <select
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  name="category_id"
                  onChange={handleProductChange}
                  required
                  value={productForm.category_id}
                >
                  <option value="">Selecciona una categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">SKU</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="sku" onChange={handleProductChange} required value={productForm.sku} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Codigo de barras</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="barcode" onChange={handleProductChange} value={productForm.barcode} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Nombre</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="name" onChange={handleProductChange} required value={productForm.name} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Descripcion</span>
                <textarea className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="description" onChange={handleProductChange} value={productForm.description} />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Precio de venta</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="sale_price" onChange={handleProductChange} required step="0.01" type="number" value={productForm.sale_price} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Costo</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="cost_price" onChange={handleProductChange} step="0.01" type="number" value={productForm.cost_price} />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Stock inicial</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="stock_quantity" onChange={handleProductChange} type="number" value={productForm.stock_quantity} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Stock minimo</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="minimum_stock" onChange={handleProductChange} type="number" value={productForm.minimum_stock} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Unidad</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="unit_label" onChange={handleProductChange} value={productForm.unit_label} />
                </label>
              </div>

              <label className="flex items-center gap-3 text-sm font-semibold text-brand-forest">
                <input checked={productForm.is_active} name="is_active" onChange={handleProductChange} type="checkbox" />
                Producto activo
              </label>

              <button className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60" disabled={savingProduct || categoriesQuery.loading} type="submit">
                {savingProduct ? 'Guardando...' : 'Crear producto'}
              </button>
            </form>
          </DataPanel>

          <DataPanel title="Catalogo de productos" subtitle="Consulta rapida del inventario disponible para venta.">
            <div className="mb-4">
              <input className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar por SKU, nombre, categoria o codigo de barras" value={productSearch} />
            </div>

            {productsQuery.loading ? <p className="text-sm text-brand-forest/70">Cargando productos...</p> : null}
            {!productsQuery.loading && !filteredProducts.length ? <EmptyState title="Sin productos" description="Todavia no hay productos que coincidan con la busqueda." /> : null}

            {filteredProducts.length ? (
              <div className="space-y-3">
                {paginatedProducts.map((product) => (
                  <article key={product.id} className="rounded-2xl border border-brand-sand/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">{product.sku}</p>
                        <h3 className="mt-1 font-semibold text-brand-forest">{product.name}</h3>
                        <p className="mt-1 text-sm text-brand-forest/70">{product.category_name || 'Sin categoria'}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${Number(product.stock_quantity) <= Number(product.minimum_stock) ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        stock {product.stock_quantity}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-brand-forest/80 md:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Venta</p>
                        <p className="mt-1 font-semibold text-brand-clay">{formatCurrency(product.sale_price)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Costo</p>
                        <p className="mt-1">{formatCurrency(product.cost_price)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Estado</p>
                        <p className="mt-1">{product.is_active ? 'Activo' : 'Inactivo'}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <Pagination currentPage={productPage} itemLabel="productos" onPageChange={setProductPage} pageSize={PRODUCT_PAGE_SIZE} totalItems={filteredProducts.length} totalPages={totalProductPages} />
          </DataPanel>
        </div>
      ) : null}

      {activeView === 'inventory' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <DataPanel title="Ajuste de inventario" subtitle="Entradas, salidas y correcciones de stock.">
            <form className="grid gap-4" onSubmit={handleInventoryAdjustment}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Producto</span>
                <select className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="product_id" onChange={(event) => { handleInventoryChange(event); setSelectedProductId(event.target.value); }} required value={inventoryForm.product_id}>
                  <option value="">Selecciona un producto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.sku} - {product.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Tipo de movimiento</span>
                  <select className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="movement_type" onChange={handleInventoryChange} value={inventoryForm.movement_type}>
                    <option value="purchase">Compra</option>
                    <option value="adjustment_in">Ajuste de entrada</option>
                    <option value="adjustment_out">Ajuste de salida</option>
                    <option value="return">Devolucion</option>
                    <option value="waste">Merma</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Cantidad</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="1" name="quantity" onChange={handleInventoryChange} required type="number" value={inventoryForm.quantity} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Costo unitario opcional</span>
                <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="unit_cost" onChange={handleInventoryChange} step="0.01" type="number" value={inventoryForm.unit_cost} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Notas</span>
                <textarea className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="notes" onChange={handleInventoryChange} value={inventoryForm.notes} />
              </label>

              <button className="rounded-2xl bg-brand-clay px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60" disabled={savingInventory || !inventoryForm.product_id} type="submit">
                {savingInventory ? 'Guardando...' : 'Registrar movimiento'}
              </button>
            </form>
          </DataPanel>

          <DataPanel title="Historial de inventario" subtitle={selectedProduct ? `Movimientos recientes de ${selectedProduct.name}.` : 'Selecciona un producto para revisar sus movimientos.'}>
            <div className="mb-4 flex flex-col gap-3 md:flex-row">
              <select className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3 md:w-80" onChange={(event) => { setSelectedProductId(event.target.value); setInventoryForm((current) => ({ ...current, product_id: event.target.value })); }} value={selectedProductId}>
                <option value="">Selecciona un producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} - {product.name}
                  </option>
                ))}
              </select>
              <input className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" onChange={(event) => setMovementSearch(event.target.value)} placeholder="Buscar por tipo, referencia o nota" value={movementSearch} />
            </div>

            {movementsQuery.loading ? <p className="text-sm text-brand-forest/70">Cargando movimientos...</p> : null}
            {!movementsQuery.loading && !selectedProductId ? <EmptyState title="Sin producto seleccionado" description="Elige un producto para revisar el historial." /> : null}
            {!movementsQuery.loading && selectedProductId && !filteredMovements.length ? <EmptyState title="Sin movimientos" description="No hay movimientos que coincidan con la busqueda actual." /> : null}

            {filteredMovements.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-brand-forest/70">
                    <tr>
                      <th className="pb-3">Fecha</th>
                      <th className="pb-3">Tipo</th>
                      <th className="pb-3">Cantidad</th>
                      <th className="pb-3">Antes</th>
                      <th className="pb-3">Despues</th>
                      <th className="pb-3">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMovements.map((movement) => (
                      <tr key={movement.id} className="border-t border-brand-sand/60">
                        <td className="py-3">{formatDate(movement.moved_at)}</td>
                        <td className="py-3">{movement.movement_type}</td>
                        <td className="py-3 font-semibold text-brand-forest">{movement.quantity}</td>
                        <td className="py-3">{movement.previous_stock}</td>
                        <td className="py-3">{movement.new_stock}</td>
                        <td className="py-3">{movement.notes || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <Pagination currentPage={movementPage} itemLabel="movimientos" onPageChange={setMovementPage} pageSize={MOVEMENT_PAGE_SIZE} totalItems={filteredMovements.length} totalPages={totalMovementPages} />
          </DataPanel>
        </div>
      ) : null}
      {activeView === 'sales' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <DataPanel title="Nueva venta" subtitle="Registra ventas rapidas desde mostrador o recepcion.">
            <form className="grid gap-4" onSubmit={handleCreateSale}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Cliente opcional</span>
                <select className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="client_id" onChange={handleSaleChange} value={saleForm.client_id}>
                  <option value="">Venta sin cliente asignado</option>
                  {activeClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.client_code} - {client.first_name} {client.last_name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Metodo de pago</span>
                  <select className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="payment_method" onChange={handleSaleChange} value={saleForm.payment_method}>
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="transfer">Transferencia</option>
                    <option value="mixed">Mixto</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Cajero</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" disabled value={user?.username || ''} />
                </label>
              </div>

              <div className="grid gap-3">
                {saleForm.items.map((item, index) => (
                  <div key={`${index}-${item.product_id}`} className="rounded-2xl border border-brand-sand/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-moss">Item {index + 1}</p>
                      {saleForm.items.length > 1 ? (
                        <button className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-600" onClick={() => removeSaleItem(index)} type="button">
                          Quitar
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-4">
                      <label className="grid gap-2">
                        <span className="text-sm font-semibold text-brand-forest">Producto</span>
                        <select className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" onChange={(event) => handleSaleItemChange(index, 'product_id', event.target.value)} required value={item.product_id}>
                          <option value="">Selecciona un producto</option>
                          {products.filter((product) => product.is_active).map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.sku} - {product.name} ({formatCurrency(product.sale_price)})
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2">
                          <span className="text-sm font-semibold text-brand-forest">Cantidad</span>
                          <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="1" onChange={(event) => handleSaleItemChange(index, 'quantity', event.target.value)} required type="number" value={item.quantity} />
                        </label>
                        <label className="grid gap-2">
                          <span className="text-sm font-semibold text-brand-forest">Descuento del item</span>
                          <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" onChange={(event) => handleSaleItemChange(index, 'discount', event.target.value)} step="0.01" type="number" value={item.discount} />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-forest" onClick={addSaleItem} type="button">
                Agregar item
              </button>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Descuento global</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="discount" onChange={handleSaleChange} step="0.01" type="number" value={saleForm.discount} />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Impuesto</span>
                  <input className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" min="0" name="tax" onChange={handleSaleChange} step="0.01" type="number" value={saleForm.tax} />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Notas</span>
                <textarea className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" name="notes" onChange={handleSaleChange} value={saleForm.notes} />
              </label>

              <div className="rounded-2xl bg-brand-cream/60 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Resumen de venta</p>
                <div className="mt-3 space-y-2 text-sm text-brand-forest/80">
                  {salePreview.items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex justify-between gap-3">
                      <span>{item.quantity} x {item.label}</span>
                      <span>{formatCurrency(item.lineTotal)}</span>
                    </div>
                  ))}
                  {!salePreview.items.length ? <p>No hay items cargados todavia.</p> : null}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-brand-sand/70 pt-4">
                  <span className="font-semibold text-brand-forest">Total</span>
                  <span className="text-xl font-bold text-brand-clay">{formatCurrency(salePreview.total)}</span>
                </div>
              </div>

              <button className="rounded-2xl bg-brand-moss px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60" disabled={savingSale || productsQuery.loading} type="submit">
                {savingSale ? 'Guardando...' : 'Registrar venta'}
              </button>
            </form>
          </DataPanel>

          <div className="grid gap-6">
            <DataPanel title="Resumen de ventas" subtitle="Indicadores rapidos del punto de venta.">
              <div className="grid gap-3 md:grid-cols-2">
                <article className="rounded-2xl border border-brand-sand/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ventas totales</p>
                  <p className="mt-3 text-3xl font-bold text-brand-forest">{salesSummary.total_sales || 0}</p>
                </article>
                <article className="rounded-2xl border border-brand-sand/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ingresos totales</p>
                  <p className="mt-3 text-3xl font-bold text-brand-clay">{formatCurrency(salesSummary.total_revenue || 0)}</p>
                </article>
                <article className="rounded-2xl border border-brand-sand/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ventas de hoy</p>
                  <p className="mt-3 text-3xl font-bold text-brand-forest">{salesSummary.sales_today || 0}</p>
                </article>
                <article className="rounded-2xl border border-brand-sand/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ingresos de hoy</p>
                  <p className="mt-3 text-3xl font-bold text-brand-clay">{formatCurrency(salesSummary.revenue_today || 0)}</p>
                </article>
              </div>
            </DataPanel>

            <DataPanel title="Ventas recientes" subtitle="Listado rapido para control de caja.">
              <div className="mb-4">
                <input className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3" onChange={(event) => setSaleSearch(event.target.value)} placeholder="Buscar por numero, cliente, cajero o estado" value={saleSearch} />
              </div>

              {salesQuery.loading ? <p className="text-sm text-brand-forest/70">Cargando ventas...</p> : null}
              {!salesQuery.loading && !filteredSales.length ? <EmptyState title="Sin ventas" description="No hay ventas que coincidan con la busqueda actual." /> : null}

              {filteredSales.length ? (
                <div className="space-y-3">
                  {paginatedSales.map((sale) => (
                    <article key={sale.id} className="rounded-2xl border border-brand-sand/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">{sale.sale_number}</p>
                          <h3 className="mt-1 font-semibold text-brand-forest">{sale.client_first_name ? `${sale.client_first_name} ${sale.client_last_name}` : 'Venta mostrador'}</h3>
                          <p className="mt-1 text-sm text-brand-forest/70">
                            Cajero: {sale.cashier_username} · {formatDate(sale.sold_at)}
                          </p>
                        </div>
                        <span className="text-xl font-bold text-brand-clay">{formatCurrency(sale.total)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              <Pagination currentPage={salePage} itemLabel="ventas" onPageChange={setSalePage} pageSize={SALE_PAGE_SIZE} totalItems={filteredSales.length} totalPages={totalSalePages} />
            </DataPanel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
