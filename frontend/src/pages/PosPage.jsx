import { useEffect, useMemo, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { apiGet, apiPost } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';

const PRODUCT_PAGE_SIZE = 6;
const MOVEMENT_PAGE_SIZE = 8;
const SALE_PAGE_SIZE = 5;
const POS_GRID_PAGE_SIZE = 10;
const posCategoryStorageKey = 'rohipos_pos_categories_collapsed';

const keypadButtons = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '.'];

const movementLabels = {
  purchase: 'Compra',
  adjustment_in: 'Ajuste entrada',
  adjustment_out: 'Ajuste salida',
  return: 'Devolucion',
  waste: 'Merma',
  sale: 'Venta'
};

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

function getTicketLineTotal(product, item) {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(product?.sale_price || 0);
  const discount = Number(item.discount || 0);
  return Math.max(unitPrice * quantity - discount, 0);
}

function getNumericInputValue(currentValue, key) {
  const current = String(currentValue || '');

  if (key === 'backspace') {
    return current.slice(0, -1);
  }

  if (key === 'clear') {
    return '';
  }

  if (key === '.' && current.includes('.')) {
    return current;
  }

  if (current === '0' && key !== '.') {
    return key;
  }

  if (!current && key === '.') {
    return '0.';
  }

  return `${current}${key}`;
}

function getCategoryTone(index) {
  const tones = [
    'from-brand-clay/80 to-brand-clay',
    'from-brand-moss/80 to-brand-moss',
    'from-brand-forest/80 to-brand-forest',
    'from-amber-500/80 to-amber-600'
  ];

  return tones[index % tones.length];
}

export function PosPage() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('sales');
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [saleSearch, setSaleSearch] = useState('');
  const [posSearch, setPosSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [productPage, setProductPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [salePage, setSalePage] = useState(1);
  const [posGridPage, setPosGridPage] = useState(1);
  const [selectedLineIndex, setSelectedLineIndex] = useState(0);
  const [keypadTarget, setKeypadTarget] = useState('amount-tendered');
  const [amountTendered, setAmountTendered] = useState('');
  const [isCategoryBarCollapsed, setIsCategoryBarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const storedValue = window.localStorage.getItem(posCategoryStorageKey);
    return storedValue === null ? true : storedValue === 'true';
  });
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

  const products = productsQuery.data?.data || [];
  const categories = categoriesQuery.data?.data || [];
  const activeClients = (clientsQuery.data?.data || []).filter((client) => client.is_active);
  const sales = salesQuery.data?.data || [];
  const salesSummary = salesSummaryQuery.data?.data || {};
  const movements = movementsQuery.data?.data || [];

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

  useEffect(() => {
    setPosGridPage(1);
  }, [posSearch, activeCategoryId]);

  useEffect(() => {
    if (selectedLineIndex > saleForm.items.length - 1) {
      setSelectedLineIndex(Math.max(saleForm.items.length - 1, 0));
    }
  }, [saleForm.items.length, selectedLineIndex]);

  useEffect(() => {
    window.localStorage.setItem(posCategoryStorageKey, String(isCategoryBarCollapsed));
  }, [isCategoryBarCollapsed]);

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
    setSelectedLineIndex(saleForm.items.length);
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

  function clearTicket() {
    setSaleForm(initialSaleForm);
    setSelectedLineIndex(0);
    setKeypadTarget('amount-tendered');
    setAmountTendered('');
    setPosSearch('');
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
      const validItems = saleForm.items.filter((item) => item.product_id && Number(item.quantity) > 0);

      await apiPost('/sales', {
        client_id: saleForm.client_id ? Number(saleForm.client_id) : null,
        cashier_user_id: user.id,
        payment_method: saleForm.payment_method,
        discount: saleForm.discount === '' ? 0 : Number(saleForm.discount),
        tax: saleForm.tax === '' ? 0 : Number(saleForm.tax),
        notes: saleForm.notes || null,
        items: validItems.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          discount: item.discount === '' ? 0 : Number(item.discount)
        }))
      });

      clearTicket();
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
  }, [productSearch, products]);

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
  }, [movementSearch, movements]);

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
  }, [saleSearch, sales]);

  const selectedProduct = products.find((product) => String(product.id) === String(selectedProductId));

  const posProducts = useMemo(() => {
    const term = normalizeText(posSearch);

    return products
      .filter((product) => product.is_active)
      .filter((product) => activeCategoryId === 'all' || String(product.category_id) === activeCategoryId)
      .filter((product) => {
        if (!term) {
          return true;
        }

        return [product.name, product.sku, product.barcode, product.category_name]
          .filter(Boolean)
          .some((value) => normalizeText(value).includes(term));
      });
  }, [activeCategoryId, posSearch, products]);

  const paginatedPosProducts = posProducts.slice(
    (posGridPage - 1) * POS_GRID_PAGE_SIZE,
    posGridPage * POS_GRID_PAGE_SIZE
  );

  const ticketItems = useMemo(
    () =>
      saleForm.items.map((item, index) => {
        const product = products.find((entry) => String(entry.id) === String(item.product_id));
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(product?.sale_price || 0);
        const discount = Number(item.discount || 0);
        const lineTotal = getTicketLineTotal(product, item);

        return {
          index,
          product,
          quantity,
          unitPrice,
          discount,
          lineTotal
        };
      }),
    [products, saleForm.items]
  );

  const ticketSubtotal = ticketItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const globalDiscount = Number(saleForm.discount || 0);
  const taxAmount = Number(saleForm.tax || 0);
  const ticketTotal = Math.max(ticketSubtotal - globalDiscount + taxAmount, 0);
  const tenderedAmount = Number(amountTendered || 0);
  const changeDue = Math.max(tenderedAmount - ticketTotal, 0);
  const balanceDue = Math.max(ticketTotal - tenderedAmount, 0);

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
  const totalMovementPages = Math.max(1, Math.ceil(filteredMovements.length / MOVEMENT_PAGE_SIZE));
  const totalSalePages = Math.max(1, Math.ceil(filteredSales.length / SALE_PAGE_SIZE));
  const totalPosGridPages = Math.max(1, Math.ceil(posProducts.length / POS_GRID_PAGE_SIZE));

  const paginatedProducts = filteredProducts.slice(
    (productPage - 1) * PRODUCT_PAGE_SIZE,
    productPage * PRODUCT_PAGE_SIZE
  );
  const paginatedMovements = filteredMovements.slice(
    (movementPage - 1) * MOVEMENT_PAGE_SIZE,
    movementPage * MOVEMENT_PAGE_SIZE
  );
  const paginatedSales = filteredSales.slice((salePage - 1) * SALE_PAGE_SIZE, salePage * SALE_PAGE_SIZE);

  function addProductToTicket(product) {
    clearMessages();

    if (!product?.is_active) {
      setError('El producto seleccionado esta inactivo.');
      return;
    }

    if (Number(product.stock_quantity) <= 0) {
      setError(`No hay stock disponible para ${product.name}.`);
      return;
    }

    const existingIndex = saleForm.items.findIndex((item) => String(item.product_id) === String(product.id));

    setSaleForm((current) => {
      if (existingIndex >= 0) {
        return {
          ...current,
          items: current.items.map((item, index) =>
            index === existingIndex
              ? { ...item, quantity: String(Number(item.quantity || 0) + 1) }
              : item
          )
        };
      }

      const hasPlaceholder =
        current.items.length === 1 &&
        !current.items[0].product_id &&
        Number(current.items[0].quantity || 0) === 1 &&
        !current.items[0].discount;

      if (hasPlaceholder) {
        return {
          ...current,
          items: [{ product_id: String(product.id), quantity: '1', discount: '' }]
        };
      }

      return {
        ...current,
        items: [...current.items, { product_id: String(product.id), quantity: '1', discount: '' }]
      };
    });

    setSelectedLineIndex(existingIndex >= 0 ? existingIndex : saleForm.items[0]?.product_id ? saleForm.items.length : 0);
    setKeypadTarget('line-quantity');
  }

  function handlePosSearchSubmit(event) {
    event.preventDefault();
    clearMessages();

    const term = normalizeText(posSearch);
    if (!term) {
      return;
    }

    const exactMatch = products.find(
      (product) =>
        product.is_active &&
        [product.barcode, product.sku].filter(Boolean).some((value) => normalizeText(value) === term)
    );

    if (exactMatch) {
      addProductToTicket(exactMatch);
      setPosSearch('');
      return;
    }

    if (posProducts.length === 1) {
      addProductToTicket(posProducts[0]);
      setPosSearch('');
      return;
    }

    setSuccess('Filtro aplicado. Selecciona el articulo desde la grilla.');
  }

  function adjustSelectedLineQuantity(delta) {
    const targetItem = saleForm.items[selectedLineIndex];
    if (!targetItem?.product_id) {
      return;
    }

    const nextQuantity = Math.max(Number(targetItem.quantity || 0) + delta, 1);
    handleSaleItemChange(selectedLineIndex, 'quantity', String(nextQuantity));
  }

  function applyKeypad(key) {
    if (keypadTarget === 'amount-tendered') {
      setAmountTendered((current) => getNumericInputValue(current, key));
      return;
    }

    if (keypadTarget === 'sale-discount') {
      setSaleForm((current) => ({
        ...current,
        discount: getNumericInputValue(current.discount, key)
      }));
      return;
    }

    if (keypadTarget === 'sale-tax') {
      setSaleForm((current) => ({
        ...current,
        tax: getNumericInputValue(current.tax, key)
      }));
      return;
    }

    const targetItem = saleForm.items[selectedLineIndex];
    if (!targetItem) {
      return;
    }

    if (keypadTarget === 'line-quantity') {
      handleSaleItemChange(
        selectedLineIndex,
        'quantity',
        getNumericInputValue(targetItem.quantity, key) || '0'
      );
    }

    if (keypadTarget === 'line-discount') {
      handleSaleItemChange(
        selectedLineIndex,
        'discount',
        getNumericInputValue(targetItem.discount, key)
      );
    }
  }

  const selectedTicketItem = ticketItems[selectedLineIndex];

  return (
    <div>
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-emerald-700">{success}</p> : null}

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${
            activeView === 'sales' ? 'bg-brand-moss text-white' : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => setActiveView('sales')}
          type="button"
        >
          Ventas
        </button>
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
            activeView === 'cash-close' ? 'bg-brand-clay text-white' : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => setActiveView('cash-close')}
          type="button"
        >
          Cierre de caja
        </button>
        <button
          className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${
            activeView === 'stats' ? 'bg-brand-forest text-white' : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => setActiveView('stats')}
          type="button"
        >
          Informacion estadistica
        </button>
      </div>

      {activeView === 'sales' ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_24rem]">
          <div className="grid content-start gap-6">
            <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
              <section className="self-start rounded-[1.75rem] border border-brand-sand/70 bg-white p-5 shadow-panel">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ticket de venta</p>
                    <h3 className="mt-1 text-xl font-semibold text-brand-forest">Caja principal</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-forest"
                      onClick={() => setKeypadTarget('line-discount')}
                      type="button"
                    >
                      Descuento linea
                    </button>
                    <button
                      className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-forest"
                      onClick={() => removeSaleItem(selectedLineIndex)}
                      type="button"
                    >
                      Quitar linea
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-brand-forest/70">
                      <tr>
                        <th className="pb-3">Articulo</th>
                        <th className="pb-3">Precio</th>
                        <th className="pb-3">Cant.</th>
                        <th className="pb-3">Desc.</th>
                        <th className="pb-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketItems.map((item) => (
                        <tr
                          key={`${item.index}-${item.product?.id || 'pending'}`}
                          className={`cursor-pointer border-t border-brand-sand/60 transition ${
                            selectedLineIndex === item.index ? 'bg-brand-cream/70' : 'hover:bg-brand-cream/40'
                          }`}
                          onClick={() => {
                            setSelectedLineIndex(item.index);
                            setKeypadTarget('line-quantity');
                          }}
                        >
                          <td className="py-3">
                            <p className="font-semibold text-brand-forest">
                              {item.product?.name || 'Producto pendiente'}
                            </p>
                            <p className="text-xs uppercase tracking-[0.14em] text-brand-moss">
                              {item.product?.sku || 'Selecciona un articulo'}
                            </p>
                          </td>
                          <td className="py-3">{formatCurrency(item.unitPrice)}</td>
                          <td className="py-3">{item.quantity || 0}</td>
                          <td className="py-3">{formatCurrency(item.discount)}</td>
                          <td className="py-3 text-right font-semibold text-brand-clay">
                            {formatCurrency(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-3 rounded-[1.5rem] bg-brand-forest px-4 py-4 text-white md:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/70">Linea actual</p>
                    <p className="mt-2 font-semibold">
                      {selectedTicketItem?.product?.name || 'Sin seleccion'}
                    </p>
                  </div>
                  <button
                    className="rounded-2xl bg-white/10 px-4 py-3 text-left"
                    onClick={() => {
                      setKeypadTarget('line-quantity');
                      adjustSelectedLineQuantity(-1);
                    }}
                    type="button"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-white/70">Cantidad</p>
                    <p className="mt-2 text-lg font-semibold">- 1 unidad</p>
                  </button>
                  <button
                    className="rounded-2xl bg-white/10 px-4 py-3 text-left"
                    onClick={() => {
                      setKeypadTarget('line-quantity');
                      adjustSelectedLineQuantity(1);
                    }}
                    type="button"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-white/70">Cantidad</p>
                    <p className="mt-2 text-lg font-semibold">+ 1 unidad</p>
                  </button>
                  <button
                    className="rounded-2xl bg-brand-clay px-4 py-3 text-left"
                    onClick={clearTicket}
                    type="button"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-white/70">Operacion</p>
                    <p className="mt-2 text-lg font-semibold">Vaciar ticket</p>
                  </button>
                </div>
              </section>

              <section className="self-start rounded-[1.75rem] border border-brand-sand/70 bg-white p-5 shadow-panel">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Calculadora</p>
                  <h3 className="mt-1 text-xl font-semibold text-brand-forest">Teclado numerico</h3>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {keypadButtons.map((key) => (
                      <button
                        key={key}
                        className="rounded-2xl border border-brand-sand bg-brand-cream/30 px-4 py-4 text-xl font-semibold text-brand-forest transition hover:bg-brand-cream"
                        onClick={() => applyKeypad(key)}
                        type="button"
                      >
                        {key}
                      </button>
                    ))}
                    <button
                      className="rounded-2xl border border-brand-sand bg-white px-4 py-4 text-sm font-semibold uppercase tracking-[0.16em] text-brand-forest"
                      onClick={() => applyKeypad('backspace')}
                      type="button"
                    >
                      Borrar
                    </button>
                    <button
                      className="rounded-2xl border border-brand-sand bg-white px-4 py-4 text-sm font-semibold uppercase tracking-[0.16em] text-brand-forest"
                      onClick={() => applyKeypad('clear')}
                      type="button"
                    >
                      Limpiar
                    </button>
                    <button
                      className="rounded-2xl bg-brand-clay px-4 py-4 text-sm font-semibold uppercase tracking-[0.16em] text-white"
                      onClick={() => setAmountTendered(String(ticketTotal))}
                      type="button"
                    >
                      Exacto
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <section className="self-start rounded-[1.75rem] border border-brand-sand/70 bg-white p-4 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Categorias</p>
                  <h3 className="mt-1 text-lg font-semibold text-brand-forest">
                    Filtro entre ticket y mosaico
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-brand-forest/70">
                    {activeCategoryId === 'all'
                      ? 'Vista: todas las categorias'
                      : `Vista: ${
                          categories.find((category) => String(category.id) === activeCategoryId)?.name || 'Categoria'
                        }`}
                  </p>
                  <form className="flex flex-1 flex-wrap justify-end gap-3 lg:max-w-2xl" onSubmit={handlePosSearchSubmit}>
                    <input
                      className="min-w-[18rem] flex-1 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                      onChange={(event) => setPosSearch(event.target.value)}
                      placeholder="Escanear codigo, SKU o escribir nombre"
                      value={posSearch}
                    />
                    <button
                      className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
                      type="submit"
                    >
                      Buscar o agregar
                    </button>
                  </form>
                  <button
                    className="rounded-2xl border border-brand-sand px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-forest"
                    onClick={() => setIsCategoryBarCollapsed((current) => !current)}
                    type="button"
                  >
                    {isCategoryBarCollapsed ? 'Expandir categorias' : 'Acoplar categorias'}
                  </button>
                </div>
              </div>

              {!isCategoryBarCollapsed ? (
                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  <button
                    className={`shrink-0 rounded-2xl border px-4 py-3 text-left ${
                      activeCategoryId === 'all'
                        ? 'border-brand-forest bg-brand-forest text-white'
                        : 'border-brand-sand bg-brand-cream/40 text-brand-forest'
                    }`}
                    onClick={() => setActiveCategoryId('all')}
                    type="button"
                  >
                    Todas las categorias
                  </button>
                  {categories.map((category, index) => (
                    <button
                      key={category.id}
                      className={`shrink-0 rounded-2xl border px-4 py-3 text-left ${
                        activeCategoryId === String(category.id)
                          ? `border-transparent bg-gradient-to-r text-white ${getCategoryTone(index)}`
                          : 'border-brand-sand bg-brand-cream/40 text-brand-forest'
                      }`}
                      onClick={() => setActiveCategoryId(String(category.id))}
                      type="button"
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="self-start rounded-[1.75rem] border border-brand-sand/70 bg-white p-5 shadow-panel">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Mosaico de venta</p>
                  <h3 className="mt-1 text-xl font-semibold text-brand-forest">Productos para caja</h3>
                </div>
                <p className="text-sm text-brand-forest/70">
                  {posProducts.length} articulos disponibles en esta vista
                </p>
              </div>

              {!productsQuery.loading && !paginatedPosProducts.length ? (
                <EmptyState
                  title="Sin articulos"
                  description="No hay productos activos que coincidan con la categoria o el filtro de busqueda."
                />
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {paginatedPosProducts.map((product, index) => {
                  const categoryIndex = categories.findIndex(
                    (category) => String(category.id) === String(product.category_id)
                  );

                  return (
                    <button
                      key={product.id}
                      className="overflow-hidden rounded-[1.5rem] border border-brand-sand/70 bg-brand-cream/40 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-panel"
                      onClick={() => addProductToTicket(product)}
                      type="button"
                    >
                      <div className={`h-24 bg-gradient-to-br ${getCategoryTone(categoryIndex >= 0 ? categoryIndex : index)} p-4 text-white`}>
                        <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                          {product.category_name || 'Mostrador'}
                        </p>
                        <p className="mt-3 text-lg font-semibold">{product.name}</p>
                      </div>
                      <div className="grid gap-3 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs uppercase tracking-[0.14em] text-brand-moss">
                            {product.sku}
                          </span>
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              Number(product.stock_quantity) <= Number(product.minimum_stock)
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            stock {product.stock_quantity}
                          </span>
                        </div>
                        <p className="text-2xl font-bold text-brand-clay">
                          {formatCurrency(product.sale_price)}
                        </p>
                        <p className="text-sm text-brand-forest/70">
                          {product.barcode || 'Sin codigo de barras'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Pagination
                currentPage={posGridPage}
                itemLabel="articulos"
                onPageChange={setPosGridPage}
                pageSize={POS_GRID_PAGE_SIZE}
                totalItems={posProducts.length}
                totalPages={totalPosGridPages}
              />
            </section>
          </div>

          <aside className="grid content-start gap-6 self-start">
            <section className="self-start rounded-[1.75rem] border border-brand-sand/70 bg-brand-forest p-5 text-white shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/70">Cobro</p>
                  <h3 className="mt-1 text-2xl font-semibold">Total a pagar</h3>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                  {saleForm.payment_method}
                </span>
              </div>

              <p className="mt-5 text-5xl font-bold">{formatCurrency(ticketTotal)}</p>

              <div className="mt-5 grid gap-3">
                <div className="flex items-center justify-between text-sm text-white/80">
                  <span>Subtotal lineas</span>
                  <span>{formatCurrency(ticketSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-white/80">
                  <button
                    className="font-semibold"
                    onClick={() => setKeypadTarget('sale-discount')}
                    type="button"
                  >
                    Descuento global
                  </button>
                  <span>{formatCurrency(globalDiscount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-white/80">
                  <button className="font-semibold" onClick={() => setKeypadTarget('sale-tax')} type="button">
                    Impuesto
                  </button>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-white/15 pt-3 text-sm font-semibold">
                  <span>Recibido</span>
                  <button onClick={() => setKeypadTarget('amount-tendered')} type="button">
                    {formatCurrency(tenderedAmount)}
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Cambio</span>
                  <span className="font-semibold text-emerald-300">{formatCurrency(changeDue)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Saldo pendiente</span>
                  <span className="font-semibold text-amber-200">{formatCurrency(balanceDue)}</span>
                </div>
              </div>
            </section>

            <DataPanel title="Datos de venta" subtitle="Cliente, forma de pago y observaciones del ticket.">
              <form className="grid gap-4" onSubmit={handleCreateSale}>
                <button
                  className="rounded-2xl bg-brand-moss px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                  disabled={savingSale || productsQuery.loading || ticketTotal <= 0}
                  type="submit"
                >
                  {savingSale ? 'Guardando...' : 'Registrar venta'}
                </button>

                <div className="grid gap-3 md:grid-cols-3">
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] ${
                      keypadTarget === 'line-quantity'
                        ? 'border-brand-forest bg-brand-forest text-white'
                        : 'border-brand-sand text-brand-forest'
                    }`}
                    onClick={() => setKeypadTarget('line-quantity')}
                    type="button"
                  >
                    Cantidad linea
                  </button>
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] ${
                      keypadTarget === 'line-discount'
                        ? 'border-brand-clay bg-brand-clay text-white'
                        : 'border-brand-sand text-brand-forest'
                    }`}
                    onClick={() => setKeypadTarget('line-discount')}
                    type="button"
                  >
                    Desc. linea
                  </button>
                  <button
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] ${
                      keypadTarget === 'amount-tendered'
                        ? 'border-brand-moss bg-brand-moss text-white'
                        : 'border-brand-sand text-brand-forest'
                    }`}
                    onClick={() => setKeypadTarget('amount-tendered')}
                    type="button"
                  >
                    Pago recibido
                  </button>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Cliente opcional</span>
                  <select
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    name="client_id"
                    onChange={handleSaleChange}
                    value={saleForm.client_id}
                  >
                    <option value="">Venta sin cliente asignado</option>
                    {activeClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.client_code} - {client.first_name} {client.last_name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-brand-forest">Metodo de pago</span>
                    <select
                      className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                      name="payment_method"
                      onChange={handleSaleChange}
                      value={saleForm.payment_method}
                    >
                      <option value="cash">Efectivo</option>
                      <option value="card">Tarjeta</option>
                      <option value="transfer">Transferencia</option>
                      <option value="mixed">Mixto</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-brand-forest">Cajero</span>
                    <input
                      className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                      disabled
                      value={user?.username || ''}
                    />
                  </label>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Notas</span>
                  <textarea
                    className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    name="notes"
                    onChange={handleSaleChange}
                    value={saleForm.notes}
                  />
                </label>
              </form>
            </DataPanel>
          </aside>
        </div>
      ) : null}

      {activeView === 'cash-close' ? (
        <div className="grid gap-6">
          <DataPanel
            title="Cierre de caja"
            subtitle="Resumen operativo del turno y del ticket actual para arqueo rapido."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[1.75rem] border border-brand-sand/70 bg-white p-4 shadow-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ventas de hoy</p>
                <p className="mt-3 text-3xl font-bold text-brand-forest">{salesSummary.sales_today || 0}</p>
              </article>
              <article className="rounded-[1.75rem] border border-brand-sand/70 bg-white p-4 shadow-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ingresos hoy</p>
                <p className="mt-3 text-3xl font-bold text-brand-clay">
                  {formatCurrency(salesSummary.revenue_today || 0)}
                </p>
              </article>
              <article className="rounded-[1.75rem] border border-brand-sand/70 bg-white p-4 shadow-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Articulos ticket</p>
                <p className="mt-3 text-3xl font-bold text-brand-forest">
                  {ticketItems.filter((item) => item.product).length}
                </p>
              </article>
              <article className="rounded-[1.75rem] border border-brand-sand/70 bg-white p-4 shadow-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Total actual</p>
                <p className="mt-3 text-3xl font-bold text-brand-clay">{formatCurrency(ticketTotal)}</p>
              </article>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <article className="rounded-2xl border border-brand-sand/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ventas acumuladas</p>
                <p className="mt-3 text-3xl font-bold text-brand-forest">{salesSummary.total_sales || 0}</p>
              </article>
              <article className="rounded-2xl border border-brand-sand/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ingresos acumulados</p>
                <p className="mt-3 text-3xl font-bold text-brand-clay">
                  {formatCurrency(salesSummary.total_revenue || 0)}
                </p>
              </article>
              <article className="rounded-2xl border border-brand-sand/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Cambio estimado</p>
                <p className="mt-3 text-3xl font-bold text-emerald-600">{formatCurrency(changeDue)}</p>
              </article>
            </div>
          </DataPanel>
        </div>
      ) : null}

      {activeView === 'stats' ? (
        <div className="grid gap-6">
          <DataPanel title="Ventas recientes" subtitle="Control rapido de caja y seguimiento del turno.">
            <div className="mb-4">
              <input
                className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setSaleSearch(event.target.value)}
                placeholder="Buscar por numero, cliente, cajero o estado"
                value={saleSearch}
              />
            </div>

            {salesQuery.loading ? <p className="text-sm text-brand-forest/70">Cargando ventas...</p> : null}
            {!salesQuery.loading && !filteredSales.length ? (
              <EmptyState title="Sin ventas" description="No hay ventas que coincidan con la busqueda actual." />
            ) : null}

            {filteredSales.length ? (
              <div className="space-y-3">
                {paginatedSales.map((sale) => (
                  <article key={sale.id} className="rounded-2xl border border-brand-sand/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">{sale.sale_number}</p>
                        <h3 className="mt-1 font-semibold text-brand-forest">
                          {sale.client_first_name
                            ? `${sale.client_first_name} ${sale.client_last_name}`
                            : 'Venta mostrador'}
                        </h3>
                        <p className="mt-1 text-sm text-brand-forest/70">
                          Cajero: {sale.cashier_username} | {formatDate(sale.sold_at)}
                        </p>
                      </div>
                      <span className="text-xl font-bold text-brand-clay">{formatCurrency(sale.total)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <Pagination
              currentPage={salePage}
              itemLabel="ventas"
              onPageChange={setSalePage}
              pageSize={SALE_PAGE_SIZE}
              totalItems={filteredSales.length}
              totalPages={totalSalePages}
            />
          </DataPanel>
        </div>
      ) : null}

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
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    name="sku"
                    onChange={handleProductChange}
                    required
                    value={productForm.sku}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Codigo de barras</span>
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    name="barcode"
                    onChange={handleProductChange}
                    value={productForm.barcode}
                  />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Nombre</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  name="name"
                  onChange={handleProductChange}
                  required
                  value={productForm.name}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Descripcion</span>
                <textarea
                  className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  name="description"
                  onChange={handleProductChange}
                  value={productForm.description}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Precio de venta</span>
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    min="0"
                    name="sale_price"
                    onChange={handleProductChange}
                    required
                    step="0.01"
                    type="number"
                    value={productForm.sale_price}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Costo</span>
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    min="0"
                    name="cost_price"
                    onChange={handleProductChange}
                    step="0.01"
                    type="number"
                    value={productForm.cost_price}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Stock inicial</span>
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    min="0"
                    name="stock_quantity"
                    onChange={handleProductChange}
                    type="number"
                    value={productForm.stock_quantity}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Stock minimo</span>
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    min="0"
                    name="minimum_stock"
                    onChange={handleProductChange}
                    type="number"
                    value={productForm.minimum_stock}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Unidad</span>
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    name="unit_label"
                    onChange={handleProductChange}
                    value={productForm.unit_label}
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 text-sm font-semibold text-brand-forest">
                <input
                  checked={productForm.is_active}
                  name="is_active"
                  onChange={handleProductChange}
                  type="checkbox"
                />
                Producto activo
              </label>

              <button
                className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                disabled={savingProduct || categoriesQuery.loading}
                type="submit"
              >
                {savingProduct ? 'Guardando...' : 'Crear producto'}
              </button>
            </form>
          </DataPanel>

          <DataPanel title="Catalogo de productos" subtitle="Consulta rapida del inventario disponible para venta.">
            <div className="mb-4">
              <input
                className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Buscar por SKU, nombre, categoria o codigo de barras"
                value={productSearch}
              />
            </div>

            {productsQuery.loading ? <p className="text-sm text-brand-forest/70">Cargando productos...</p> : null}
            {!productsQuery.loading && !filteredProducts.length ? (
              <EmptyState
                title="Sin productos"
                description="Todavia no hay productos que coincidan con la busqueda."
              />
            ) : null}

            {filteredProducts.length ? (
              <div className="space-y-3">
                {paginatedProducts.map((product) => (
                  <article key={product.id} className="rounded-2xl border border-brand-sand/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">{product.sku}</p>
                        <h3 className="mt-1 font-semibold text-brand-forest">{product.name}</h3>
                        <p className="mt-1 text-sm text-brand-forest/70">
                          {product.category_name || 'Sin categoria'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                          Number(product.stock_quantity) <= Number(product.minimum_stock)
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        stock {product.stock_quantity}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-brand-forest/80 md:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Venta</p>
                        <p className="mt-1 font-semibold text-brand-clay">
                          {formatCurrency(product.sale_price)}
                        </p>
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

            <Pagination
              currentPage={productPage}
              itemLabel="productos"
              onPageChange={setProductPage}
              pageSize={PRODUCT_PAGE_SIZE}
              totalItems={filteredProducts.length}
              totalPages={totalProductPages}
            />
          </DataPanel>
        </div>
      ) : null}

      {activeView === 'inventory' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <DataPanel title="Ajuste de inventario" subtitle="Entradas, salidas y correcciones de stock.">
            <form className="grid gap-4" onSubmit={handleInventoryAdjustment}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Producto</span>
                <select
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  name="product_id"
                  onChange={(event) => {
                    handleInventoryChange(event);
                    setSelectedProductId(event.target.value);
                  }}
                  required
                  value={inventoryForm.product_id}
                >
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
                  <select
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    name="movement_type"
                    onChange={handleInventoryChange}
                    value={inventoryForm.movement_type}
                  >
                    <option value="purchase">Compra</option>
                    <option value="adjustment_in">Ajuste de entrada</option>
                    <option value="adjustment_out">Ajuste de salida</option>
                    <option value="return">Devolucion</option>
                    <option value="waste">Merma</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Cantidad</span>
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    min="1"
                    name="quantity"
                    onChange={handleInventoryChange}
                    required
                    type="number"
                    value={inventoryForm.quantity}
                  />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Costo unitario opcional</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  min="0"
                  name="unit_cost"
                  onChange={handleInventoryChange}
                  step="0.01"
                  type="number"
                  value={inventoryForm.unit_cost}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Notas</span>
                <textarea
                  className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  name="notes"
                  onChange={handleInventoryChange}
                  value={inventoryForm.notes}
                />
              </label>

              <button
                className="rounded-2xl bg-brand-clay px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                disabled={savingInventory || !inventoryForm.product_id}
                type="submit"
              >
                {savingInventory ? 'Guardando...' : 'Registrar movimiento'}
              </button>
            </form>
          </DataPanel>

          <DataPanel
            title="Historial de inventario"
            subtitle={
              selectedProduct
                ? `Movimientos recientes de ${selectedProduct.name}.`
                : 'Selecciona un producto para revisar sus movimientos.'
            }
          >
            <div className="mb-4 flex flex-col gap-3 md:flex-row">
              <select
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3 md:w-80"
                onChange={(event) => {
                  setSelectedProductId(event.target.value);
                  setInventoryForm((current) => ({ ...current, product_id: event.target.value }));
                }}
                value={selectedProductId}
              >
                <option value="">Selecciona un producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} - {product.name}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setMovementSearch(event.target.value)}
                placeholder="Buscar por tipo, referencia o nota"
                value={movementSearch}
              />
            </div>

            {movementsQuery.loading ? (
              <p className="text-sm text-brand-forest/70">Cargando movimientos...</p>
            ) : null}
            {!movementsQuery.loading && !selectedProductId ? (
              <EmptyState title="Sin producto seleccionado" description="Elige un producto para revisar el historial." />
            ) : null}
            {!movementsQuery.loading && selectedProductId && !filteredMovements.length ? (
              <EmptyState title="Sin movimientos" description="No hay movimientos que coincidan con la busqueda actual." />
            ) : null}

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
                        <td className="py-3">{movementLabels[movement.movement_type] || movement.movement_type}</td>
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

            <Pagination
              currentPage={movementPage}
              itemLabel="movimientos"
              onPageChange={setMovementPage}
              pageSize={MOVEMENT_PAGE_SIZE}
              totalItems={filteredMovements.length}
              totalPages={totalMovementPages}
            />
          </DataPanel>
        </div>
      ) : null}
    </div>
  );
}
