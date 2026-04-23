import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useApi } from '../hooks/useApi';
import { apiGet, apiPost, apiPostForm, apiPut, apiPutForm, authToken, buildQueryString } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';
import * as XLSX from 'xlsx';

function dataURLToBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

const PRODUCT_PAGE_SIZE = 6;
const MOVEMENT_PAGE_SIZE = 8;
const SALE_PAGE_SIZE = 5;
const CASH_MOVEMENT_PAGE_SIZE = 8;
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
  tax_name: 'Exento',
  tax_rate: '0',
  stock_quantity: '',
  minimum_stock: '',
  unit_label: 'unidad',
  barcode: '',
  image_file: null,
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

const initialCashCloseForm = {
  closing_amount: '',
  notes: ''
};

const initialCashMovementForm = {
  movement_type: 'income',
  description: '',
  amount: ''
};

const cashMovementTypeLabel = {
  income: 'Ingreso',
  expense: 'Egreso'
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
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
  const { settings } = useSettings();
  const [activeView, setActiveView] = useState('sales');
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [saleSearch, setSaleSearch] = useState('');
  const [saleDateFrom, setSaleDateFrom] = useState('');
  const [saleDateTo, setSaleDateTo] = useState('');
  const [posSearch, setPosSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [productPage, setProductPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [salePage, setSalePage] = useState(1);
  const [cashMovementPage, setCashMovementPage] = useState(1);
  const [posGridPage, setPosGridPage] = useState(1);
  const [productPagination, setProductPagination] = useState({
    page: 1,
    limit: PRODUCT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });
  const [movementPagination, setMovementPagination] = useState({
    page: 1,
    limit: MOVEMENT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });
  const [salePagination, setSalePagination] = useState({
    page: 1,
    limit: SALE_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });
  const [cashMovementPagination, setCashMovementPagination] = useState({
    page: 1,
    limit: CASH_MOVEMENT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });
  const [posPagination, setPosPagination] = useState({
    page: 1,
    limit: POS_GRID_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  });
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
  const [productImagePreview, setProductImagePreview] = useState('');
  const [editingProductId, setEditingProductId] = useState(null);
  const [removeProductImage, setRemoveProductImage] = useState(false);
  const [inventoryForm, setInventoryForm] = useState(initialInventoryForm);
  const [saleForm, setSaleForm] = useState(initialSaleForm);
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [cashCloseForm, setCashCloseForm] = useState(initialCashCloseForm);
  const [cashMovementForm, setCashMovementForm] = useState(initialCashMovementForm);
  const [cashMovementSearch, setCashMovementSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingInventory, setSavingInventory] = useState(false);
  const [savingSale, setSavingSale] = useState(false);
  const [reprintingReceipt, setReprintingReceipt] = useState(false);
  const [savingCashMovement, setSavingCashMovement] = useState(false);
  const [closingCashRegister, setClosingCashRegister] = useState(false);
  const [exportingCashClosePdf, setExportingCashClosePdf] = useState(false);
  const [exportingCashCloseExcel, setExportingCashCloseExcel] = useState(false);
  const [productExporting, setProductExporting] = useState(false);
  const [cashMovementExporting, setCashMovementExporting] = useState(false);
  const [movementExporting, setMovementExporting] = useState(false);
  const [movementPdfExporting, setMovementPdfExporting] = useState(false);

  const productOptionsQuery = useApi(() => apiGet('/products?limit=100'), [refreshKey]);
  const productCatalogQuery = useApi(
    () =>
      apiGet(
        `/products${buildQueryString({
          search: productSearch.trim(),
          page: productPage,
          limit: PRODUCT_PAGE_SIZE
        })}`
      ),
    [productSearch, productPage, refreshKey]
  );
  const categoriesQuery = useApi(() => apiGet('/product-categories'), [refreshKey]);
  const clientsQuery = useApi(() => apiGet('/clients?active=true&limit=100'), [refreshKey]);
  const salesQuery = useApi(
    () =>
      apiGet(
        `/sales${buildQueryString({
          search: saleSearch.trim(),
          sold_from: saleDateFrom,
          sold_to: saleDateTo,
          page: salePage,
          limit: SALE_PAGE_SIZE
        })}`
      ),
    [saleSearch, saleDateFrom, saleDateTo, salePage, refreshKey]
  );
  const cashCloseSummaryQuery = useApi(() => apiGet('/cash-register/current/summary'), [refreshKey]);
  const cashMovementsQuery = useApi(
    () =>
      apiGet(
        `/cash-movements${buildQueryString({
          search: cashMovementSearch.trim(),
          page: cashMovementPage,
          limit: CASH_MOVEMENT_PAGE_SIZE
        })}`
      ),
    [cashMovementSearch, cashMovementPage, refreshKey]
  );
  const cashMovementsSummaryQuery = useApi(() => apiGet('/cash-movements/summary'), [refreshKey]);
  const movementsQuery = useApi(
    () =>
      selectedProductId
        ? apiGet(
            `/products/${selectedProductId}/inventory-movements${buildQueryString({
              search: movementSearch.trim(),
              page: movementPage,
              limit: MOVEMENT_PAGE_SIZE
            })}`
          )
        : Promise.resolve({ data: [] }),
    [selectedProductId, movementSearch, movementPage, refreshKey]
  );
  const posProductsQuery = useApi(
    () =>
      apiGet(
        `/products${buildQueryString({
          active: true,
          category_id: activeCategoryId !== 'all' ? activeCategoryId : '',
          search: posSearch.trim(),
          page: posGridPage,
          limit: POS_GRID_PAGE_SIZE
        })}`
      ),
    [activeCategoryId, posSearch, posGridPage, refreshKey]
  );

  const products = productOptionsQuery.data?.data || [];
  const productResults = productCatalogQuery.data?.data || [];
  const categories = categoriesQuery.data?.data || [];
  const activeClients = (clientsQuery.data?.data || []).filter((client) => client.is_active);
  const sales = salesQuery.data?.data || [];
  const cashCloseSummary = cashCloseSummaryQuery.data?.data || {};
  const cashSession = cashCloseSummary.session || {};
  const cashCloseMetrics = cashCloseSummary.metrics || {};
  const receiptsIssued = cashCloseSummary.receipts_issued || [];
  const receiptsVoided = cashCloseSummary.receipts_voided || [];
  const cashMovements = cashMovementsQuery.data?.data || [];
  const cashMovementsSummary = cashMovementsSummaryQuery.data?.data || {};
  const movements = movementsQuery.data?.data || [];
  const posProducts = posProductsQuery.data?.data || [];

  useEffect(() => {
    if (productCatalogQuery.data?.pagination) {
      setProductPagination(productCatalogQuery.data.pagination);
    }
  }, [productCatalogQuery.data]);

  useEffect(() => {
    if (salesQuery.data?.pagination) {
      setSalePagination(salesQuery.data.pagination);
    }
  }, [salesQuery.data]);

  useEffect(() => {
    const expectedAmount = Number(cashCloseSummary?.metrics?.expected_closing_amount || 0);

    setCashCloseForm((current) => {
      if (current.closing_amount !== '') {
        return current;
      }

      return {
        ...current,
        closing_amount: String(expectedAmount)
      };
    });
  }, [cashCloseSummary]);

  useEffect(() => {
    if (cashMovementsQuery.data?.pagination) {
      setCashMovementPagination(cashMovementsQuery.data.pagination);
    }
  }, [cashMovementsQuery.data]);

  useEffect(() => {
    if (cashMovementPage > cashMovementPagination.totalPages) {
      setCashMovementPage(cashMovementPagination.totalPages);
    }
  }, [cashMovementPage, cashMovementPagination.totalPages]);

  useEffect(() => {
    if (movementsQuery.data?.pagination) {
      setMovementPagination(movementsQuery.data.pagination);
    } else if (!selectedProductId) {
      setMovementPagination({
        page: 1,
        limit: MOVEMENT_PAGE_SIZE,
        totalItems: 0,
        totalPages: 1
      });
    }
  }, [movementsQuery.data, selectedProductId]);

  useEffect(() => {
    if (posProductsQuery.data?.pagination) {
      setPosPagination(posProductsQuery.data.pagination);
    }
  }, [posProductsQuery.data]);

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
  }, [saleSearch, saleDateFrom, saleDateTo]);

  useEffect(() => {
    setCashMovementPage(1);
  }, [cashMovementSearch]);

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

  function handleProductImageChange(event) {
    const file = event.target.files?.[0] || null;

    setProductForm((current) => ({
      ...current,
      image_file: file
    }));
    setRemoveProductImage(false);

    if (!file) {
      setProductImagePreview('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProductImagePreview(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsDataURL(file);
  }

  function resetProductForm() {
    setEditingProductId(null);
    setRemoveProductImage(false);
    setProductForm(initialProductForm);
    setProductImagePreview('');
  }

  function startEditProduct(product) {
    setEditingProductId(product.id);
    setRemoveProductImage(false);
    setProductForm({
      category_id: product.category_id ? String(product.category_id) : '',
      sku: product.sku || '',
      name: product.name || '',
      description: product.description || '',
      sale_price: String(product.sale_price || ''),
      cost_price: String(product.cost_price || ''),
      tax_name: product.tax_name || 'Exento',
      tax_rate: String(Number(product.tax_rate || 0)),
      stock_quantity: String(product.stock_quantity || ''),
      minimum_stock: String(product.minimum_stock || ''),
      unit_label: product.unit_label || 'unidad',
      barcode: product.barcode || '',
      image_file: null,
      is_active: Boolean(product.is_active)
    });
    setProductImagePreview(product.image_data_url || '');
    setActiveView('products');
    clearMessages();
  }

  function clearProductImage() {
    setProductForm((current) => ({
      ...current,
      image_file: null
    }));
    setProductImagePreview('');
    setRemoveProductImage(true);
  }

  function handleInventoryChange(event) {
    const { name, value } = event.target;
    setInventoryForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleClientSearchChange(event) {
    const { value } = event.target;
    setClientSearch(value);

    if (saleForm.client_id) {
      setSaleForm((current) => ({
        ...current,
        client_id: ''
      }));
    }
  }

  function selectSaleClient(client) {
    setSaleForm((current) => ({
      ...current,
      client_id: String(client.id)
    }));
    setClientSearch(`${client.client_code} - ${client.first_name} ${client.last_name}`);
  }

  function handleSaleChange(event) {
    const { name, value } = event.target;
    setSaleForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleCashMovementChange(event) {
    const { name, value } = event.target;
    setCashMovementForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function loadReceiptToTicket(saleId) {
    clearMessages();
    setLoadingReceipt(true);

    try {
      const response = await apiGet(`/sales/${saleId}`);
      const sale = response.data;
      const productItems = (sale.items || []).filter(
        (item) => item.item_type === 'product' && item.product_id
      );

      if (!productItems.length) {
        throw new Error('El recibo no tiene lineas de producto editables');
      }

      setSaleForm({
        client_id: sale.client_id ? String(sale.client_id) : '',
        payment_method: sale.payments?.[0]?.payment_method || 'cash',
        discount: String(Number(sale.discount || 0)),
        tax: String(Number(sale.tax || 0)),
        notes: sale.notes || '',
        items: productItems.map((item) => ({
          product_id: String(item.product_id),
          quantity: String(Number(item.quantity || 0)),
          discount: String(Number(item.discount || 0))
        }))
      });

      if (sale.client_id) {
        setClientSearch(
          `${sale.client_code || ''} - ${sale.client_first_name || ''} ${sale.client_last_name || ''}`.trim()
        );
      } else {
        setClientSearch('');
      }

      setEditingReceiptId(sale.id);
      setSelectedLineIndex(0);
      setKeypadTarget('amount-tendered');
      setAmountTendered(String(Number(sale.total || 0)));
      setActiveView('sales');
      notifySuccess(`Recibo ${sale.sale_number} cargado para editar o anular.`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar el recibo');
    } finally {
      setLoadingReceipt(false);
    }
  }

  async function handleCancelReceipt() {
    if (!editingReceiptId) {
      return;
    }

    const shouldCancel = window.confirm('¿Deseas anular este recibo? Esta accion revertira inventario.');
    if (!shouldCancel) {
      return;
    }

    clearMessages();
    setSavingSale(true);

    try {
      await apiPost(`/sales/${editingReceiptId}/cancel`, {
        reason: saleForm.notes || null
      });

      clearTicket();
      triggerRefresh('Recibo anulado correctamente.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible anular el recibo');
    } finally {
      setSavingSale(false);
    }
  }

  function handleCashCloseChange(event) {
    const { name, value } = event.target;
    setCashCloseForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleExportCashClosePdf() {
    clearMessages();
    setExportingCashClosePdf(true);

    try {
      const response = await fetch('http://localhost:3001/api/cash-register/current/summary/pdf', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('No fue posible generar el PDF del cierre de caja');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cierre_caja_sesion_${cashSession.id || 'actual'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar el PDF de cierre');
    } finally {
      setExportingCashClosePdf(false);
    }
  }

  async function handleExportCashCloseExcel() {
    clearMessages();
    setExportingCashCloseExcel(true);

    try {
      const resumenRows = [
        {
          sesion_id: cashSession.id || '--',
          estado: cashSession.status || '--',
          apertura: cashSession.opened_at ? new Date(cashSession.opened_at).toLocaleString('es-NI') : '--',
          recibos_emitidos: cashCloseMetrics.total_receipts_issued || 0,
          recibos_anulados: cashCloseMetrics.total_receipts_voided || 0,
          ventas_pos: Number(cashCloseMetrics.pos_sales_amount || 0),
          ventas_membresia: Number(cashCloseMetrics.membership_sales_amount || 0),
          pagos_rutina_diaria: Number(cashCloseMetrics.daily_pass_sales_amount || 0),
          total_ventas_canales: Number(cashCloseMetrics.total_sales_all_channels || 0),
          efectivo_total_cobrado: Number(cashCloseMetrics.all_channels_income_by_payment_method?.cash || 0),
          ingreso_caja: Number(cashCloseMetrics.cash_income || 0),
          egreso_caja: Number(cashCloseMetrics.cash_expense || 0),
          esperado_cierre: Number(cashCloseMetrics.expected_closing_amount || 0),
          monto_cierre_digitado: Number(cashCloseForm.closing_amount || 0)
        }
      ];

      const issuedRows = receiptsIssued.map((receipt) => ({
        recibo: receipt.sale_number,
        fecha: new Date(receipt.sold_at).toLocaleString('es-NI'),
        cajero: receipt.cashier_username || '--',
        total: Number(receipt.total || 0)
      }));

      const voidedRows = receiptsVoided.map((receipt) => ({
        recibo: receipt.sale_number,
        fecha: new Date(receipt.sold_at).toLocaleString('es-NI'),
        cajero: receipt.cashier_username || '--',
        total: Number(receipt.total || 0)
      }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumenRows), 'ResumenCierre');
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(issuedRows.length ? issuedRows : [{ info: 'Sin recibos emitidos' }]),
        'RecibosEmitidos'
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(voidedRows.length ? voidedRows : [{ info: 'Sin recibos anulados' }]),
        'RecibosAnulados'
      );

      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('');

      XLSX.writeFile(workbook, `cierre_caja_sesion_${cashSession.id || 'actual'}_${stamp}.xlsx`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar Excel de cierre');
    } finally {
      setExportingCashCloseExcel(false);
    }
  }

  async function openSaleVoucherReport(sale, options = {}) {
    const { autoPrint = false } = options;
    const saleId = Number(sale?.id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      return;
    }

    const response = await fetch(`http://localhost:3001/api/sales/${saleId}/voucher/pdf`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    if (!response.ok) {
      throw new Error('No fue posible abrir el voucher de la venta');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const voucherWindow = window.open(url, '_blank', 'noopener,noreferrer');

    if (autoPrint && voucherWindow) {
      window.setTimeout(() => {
        try {
          voucherWindow.focus();
          voucherWindow.print();
        } catch {
          // If automatic print is blocked, the voucher remains open for manual print.
        }
      }, 900);
    }

    window.setTimeout(() => window.URL.revokeObjectURL(url), 15000);
  }

  async function handleReprintReceipt() {
    if (!editingReceiptId) {
      return;
    }

    clearMessages();
    setReprintingReceipt(true);

    try {
      await openSaleVoucherReport({ id: editingReceiptId }, { autoPrint: true });
      notifySuccess(`Voucher del recibo #${editingReceiptId} enviado para reimpresion.`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible reimprimir el recibo');
    } finally {
      setReprintingReceipt(false);
    }
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
    setEditingReceiptId(null);
    setClientSearch('');
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
      const formData = new FormData();
      formData.set('category_id', productForm.category_id);
      formData.set('sku', productForm.sku);
      formData.set('name', productForm.name);
      formData.set('description', productForm.description || '');
      formData.set('sale_price', String(Number(productForm.sale_price)));
      formData.set(
        'cost_price',
        String(productForm.cost_price === '' ? 0 : Number(productForm.cost_price))
      );
      formData.set('tax_name', String(productForm.tax_name || 'Exento'));
      formData.set('tax_rate', String(productForm.tax_rate === '' ? 0 : Number(productForm.tax_rate)));
      formData.set(
        'stock_quantity',
        String(productForm.stock_quantity === '' ? 0 : Number(productForm.stock_quantity))
      );
      formData.set(
        'minimum_stock',
        String(productForm.minimum_stock === '' ? 0 : Number(productForm.minimum_stock))
      );
      formData.set('unit_label', productForm.unit_label || 'unidad');
      formData.set('barcode', productForm.barcode || '');
      formData.set('is_active', String(productForm.is_active));

      if (productForm.image_file) {
        formData.set('image', productForm.image_file);
      }

      if (editingProductId) {
        if (removeProductImage) {
          formData.set('remove_image', 'true');
        }

        await apiPutForm(`/products/${editingProductId}`, formData);
      } else {
        await apiPostForm('/products', formData);
      }

      resetProductForm();
      triggerRefresh(
        editingProductId ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.'
      );
    } catch (requestError) {
      setError(
        requestError.message ||
          (editingProductId ? 'No fue posible actualizar el producto' : 'No fue posible crear el producto')
      );
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

  async function fetchAllProductsForExport() {
    const trimmedSearch = productSearch.trim();
    const firstQuery = buildQueryString({
      search: trimmedSearch,
      page: 1,
      limit: 100
    });

    const firstResponse = await apiGet(`/products${firstQuery}`);
    const allProducts = [...(firstResponse.data || [])];
    const totalPages = firstResponse.pagination?.totalPages || 1;

    for (let page = 2; page <= totalPages; page += 1) {
      const pageQuery = buildQueryString({
        search: trimmedSearch,
        page,
        limit: 100
      });
      const pageResponse = await apiGet(`/products${pageQuery}`);
      allProducts.push(...(pageResponse.data || []));
    }

    return allProducts;
  }

  async function handleExportProductsExcel() {
    clearMessages();
    setProductExporting(true);

    try {
      const exportProducts = await fetchAllProductsForExport();

      if (!exportProducts.length) {
        setError('No hay productos para exportar con el filtro actual');
        return;
      }

      const rows = exportProducts.map((product) => ({
        SKU: product.sku || '--',
        Nombre: product.name || '--',
        Categoria: product.category_name || 'Sin categoria',
        'Codigo de barras': product.barcode || '--',
        Venta: formatCurrency(product.sale_price),
        Costo: formatCurrency(product.cost_price),
        Stock: Number(product.stock_quantity || 0),
        'Stock minimo': Number(product.minimum_stock || 0),
        Unidad: product.unit_label || '--',
        Estado: product.is_active ? 'Activo' : 'Inactivo',
        Descripcion: product.description || '--'
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 14 },
        { wch: 26 },
        { wch: 18 },
        { wch: 18 },
        { wch: 14 },
        { wch: 14 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 40 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'CatalogoProductos');

      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('');

      XLSX.writeFile(workbook, `catalogo_productos_${stamp}.xlsx`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar productos');
    } finally {
      setProductExporting(false);
    }
  }

  async function handleExportProductsPdf() {
    clearMessages();
    setProductExporting(true);

    try {
      const exportProducts = await fetchAllProductsForExport();

      if (!exportProducts.length) {
        setError('No hay productos para exportar con el filtro actual');
        return;
      }

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4'
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 32;
      const columns = ['SKU', 'Nombre', 'Categoria', 'Codigo', 'Venta', 'Costo', 'Stock', 'Minimo', 'Unidad', 'Estado'];
      const usableWidth = pageWidth - margin * 2;
      const colWidth = usableWidth / columns.length;
      let y = margin;

      const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Catalogo de productos', margin, y);
        y += 24;
        doc.setFontSize(9);
        columns.forEach((column, index) => {
          doc.text(column, margin + index * colWidth + 2, y);
        });
        y += 8;
        doc.line(margin, y, pageWidth - margin, y);
        y += 14;
      };

      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      exportProducts.forEach((product) => {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
          drawHeader();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
        }

        const row = [
          product.sku || '--',
          product.name || '--',
          product.category_name || 'Sin categoria',
          product.barcode || '--',
          formatCurrency(product.sale_price),
          formatCurrency(product.cost_price),
          String(Number(product.stock_quantity || 0)),
          String(Number(product.minimum_stock || 0)),
          product.unit_label || '--',
          product.is_active ? 'Activo' : 'Inactivo'
        ];

        row.forEach((value, index) => {
          const text = doc.splitTextToSize(String(value), colWidth - 6)[0] || '--';
          doc.text(text, margin + index * colWidth + 2, y);
        });

        y += 18;
      });

      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('');

      doc.save(`catalogo_productos_${stamp}.pdf`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar productos en PDF');
    } finally {
      setProductExporting(false);
    }
  }

  async function fetchAllInventoryMovementsForExport() {
    if (!selectedProductId) {
      return [];
    }

    const trimmedSearch = movementSearch.trim();
    const firstQuery = buildQueryString({
      search: trimmedSearch,
      page: 1,
      limit: 100
    });

    const firstResponse = await apiGet(
      `/products/${selectedProductId}/inventory-movements${firstQuery}`
    );
    const allMovements = [...(firstResponse.data || [])];
    const totalPages = firstResponse.pagination?.totalPages || 1;

    for (let page = 2; page <= totalPages; page += 1) {
      const pageQuery = buildQueryString({
        search: trimmedSearch,
        page,
        limit: 100
      });
      const pageResponse = await apiGet(
        `/products/${selectedProductId}/inventory-movements${pageQuery}`
      );
      allMovements.push(...(pageResponse.data || []));
    }

    return allMovements;
  }

  async function handleExportMovementsExcel() {
    clearMessages();

    if (!selectedProductId) {
      setError('Selecciona un producto para exportar su historial');
      return;
    }

    setMovementExporting(true);

    try {
      const exportMovements = await fetchAllInventoryMovementsForExport();

      if (!exportMovements.length) {
        setError('No hay movimientos para exportar con el filtro actual');
        return;
      }

      const rows = exportMovements.map((movement) => ({
        SKU: selectedProduct?.sku || '--',
        Producto: selectedProduct?.name || '--',
        Fecha: formatDate(movement.moved_at),
        Tipo: movementLabels[movement.movement_type] || movement.movement_type,
        Cantidad: Number(movement.quantity || 0),
        Antes: Number(movement.previous_stock || 0),
        Despues: Number(movement.new_stock || 0),
        'Costo unitario': movement.unit_cost == null ? '--' : formatCurrency(movement.unit_cost),
        Referencia: movement.reference_type
          ? `${movement.reference_type}${movement.reference_id ? `#${movement.reference_id}` : ''}`
          : '--',
        Notas: movement.notes || '--'
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 14 },
        { wch: 24 },
        { wch: 16 },
        { wch: 16 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 14 },
        { wch: 22 },
        { wch: 44 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'HistorialInventario');

      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('');

      const productSlug = String(selectedProduct?.sku || 'producto').replace(/[^a-zA-Z0-9_-]/g, '_');
      XLSX.writeFile(workbook, `historial_inventario_${productSlug}_${stamp}.xlsx`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar historial de inventario');
    } finally {
      setMovementExporting(false);
    }
  }

  async function handleExportMovementsPdf() {
    clearMessages();

    if (!selectedProductId) {
      setError('Selecciona un producto para exportar su historial');
      return;
    }

    setMovementPdfExporting(true);

    try {
      const exportMovements = await fetchAllInventoryMovementsForExport();

      if (!exportMovements.length) {
        setError('No hay movimientos para exportar con el filtro actual');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const margin = 28;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = margin;

      const columns = [
        { key: 'fecha', label: 'Fecha', width: 80 },
        { key: 'tipo', label: 'Tipo', width: 80 },
        { key: 'cantidad', label: 'Cantidad', width: 68 },
        { key: 'antes', label: 'Antes', width: 62 },
        { key: 'despues', label: 'Despues', width: 72 },
        { key: 'costo', label: 'Costo unit.', width: 78 },
        { key: 'referencia', label: 'Referencia', width: 130 },
        { key: 'notas', label: 'Notas', width: 190 }
      ];

      const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Historial de inventario', margin, y);
        y += 16;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(
          `Producto: ${selectedProduct?.sku || '--'} - ${selectedProduct?.name || '--'} | Filtro: ${movementSearch.trim() || 'Ninguno'}`,
          margin,
          y
        );
        y += 14;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        let x = margin;
        columns.forEach((col) => {
          doc.text(col.label, x + 2, y);
          x += col.width;
        });

        y += 10;
        doc.setDrawColor(190, 190, 190);
        doc.line(margin, y, pageWidth - margin, y);
        y += 12;
      };

      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      exportMovements.forEach((movement) => {
        if (y > pageHeight - margin - 20) {
          doc.addPage();
          y = margin;
          drawHeader();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
        }

        const row = {
          fecha: formatDate(movement.moved_at),
          tipo: movementLabels[movement.movement_type] || movement.movement_type,
          cantidad: String(Number(movement.quantity || 0)),
          antes: String(Number(movement.previous_stock || 0)),
          despues: String(Number(movement.new_stock || 0)),
          costo: movement.unit_cost == null ? '--' : formatCurrency(movement.unit_cost),
          referencia: movement.reference_type
            ? `${movement.reference_type}${movement.reference_id ? `#${movement.reference_id}` : ''}`
            : '--',
          notas: movement.notes || '--'
        };

        let x = margin;
        columns.forEach((col) => {
          const text = doc.splitTextToSize(String(row[col.key] || '--'), col.width - 6)[0] || '--';
          doc.text(text, x + 2, y);
          x += col.width;
        });

        y += 14;
      });

      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('');

      const productSlug = String(selectedProduct?.sku || 'producto').replace(/[^a-zA-Z0-9_-]/g, '_');
      doc.save(`historial_inventario_${productSlug}_${stamp}.pdf`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar historial de inventario en PDF');
    } finally {
      setMovementPdfExporting(false);
    }
  }

  async function fetchAllCashMovementsForExport() {
    const trimmedSearch = cashMovementSearch.trim();
    const firstQuery = buildQueryString({
      search: trimmedSearch,
      page: 1,
      limit: 100
    });
    const firstResponse = await apiGet(`/cash-movements${firstQuery}`);
    const allMovements = [...(firstResponse.data || [])];
    const totalPages = firstResponse.pagination?.totalPages || 1;

    for (let page = 2; page <= totalPages; page += 1) {
      const pageQuery = buildQueryString({
        search: trimmedSearch,
        page,
        limit: 100
      });
      const pageResponse = await apiGet(`/cash-movements${pageQuery}`);
      allMovements.push(...(pageResponse.data || []));
    }

    return allMovements;
  }

  async function handleExportCashMovementsExcel() {
    clearMessages();
    setCashMovementExporting(true);

    try {
      const exportMovements = await fetchAllCashMovementsForExport();

      if (!exportMovements.length) {
        setError('No hay movimientos de caja para exportar con el filtro actual');
        return;
      }

      const rows = exportMovements.map((movement) => ({
        Tipo: cashMovementTypeLabel[movement.movement_type] || movement.movement_type,
        Descripcion: movement.description || 'Sin descripcion',
        Monto: formatCurrency(movement.amount),
        Usuario: movement.username || 'Sistema',
        Fecha: new Date(movement.created_at).toLocaleString('es-NI')
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 14 },
        { wch: 40 },
        { wch: 14 },
        { wch: 18 },
        { wch: 24 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'MovimientosCaja');
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('');

      XLSX.writeFile(workbook, `historial_movimientos_caja_${stamp}.xlsx`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar movimientos de caja');
    } finally {
      setCashMovementExporting(false);
    }
  }

  async function handleExportCashMovementsPdf() {
    clearMessages();
    setCashMovementExporting(true);

    try {
      const exportMovements = await fetchAllCashMovementsForExport();

      if (!exportMovements.length) {
        setError('No hay movimientos de caja para exportar con el filtro actual');
        return;
      }

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4'
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 32;
      const columns = ['Tipo', 'Descripcion', 'Monto', 'Usuario', 'Fecha'];
      const usableWidth = pageWidth - margin * 2;
      const colWidth = usableWidth / columns.length;
      let y = margin;

      const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Historial de movimientos de caja', margin, y);
        y += 24;
        doc.setFontSize(9);
        columns.forEach((column, index) => {
          doc.text(column, margin + index * colWidth + 2, y);
        });
        y += 8;
        doc.line(margin, y, pageWidth - margin, y);
        y += 14;
      };

      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      exportMovements.forEach((movement) => {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
          drawHeader();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
        }

        const row = [
          cashMovementTypeLabel[movement.movement_type] || movement.movement_type,
          movement.description || 'Sin descripcion',
          formatCurrency(movement.amount),
          movement.username || 'Sistema',
          new Date(movement.created_at).toLocaleString('es-NI')
        ];

        row.forEach((value, index) => {
          const text = doc.splitTextToSize(String(value), colWidth - 6)[0] || '--';
          doc.text(text, margin + index * colWidth + 2, y);
        });

        y += 18;
      });

      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('');

      doc.save(`historial_movimientos_caja_${stamp}.pdf`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible exportar movimientos de caja en PDF');
    } finally {
      setCashMovementExporting(false);
    }
  }

  async function handleCreateSale(event) {
    event.preventDefault();
    clearMessages();
    setSavingSale(true);

    try {
      const validItems = saleForm.items.filter((item) => item.product_id && Number(item.quantity) > 0);

      const payload = {
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
      };

      let savedSale = null;

      if (editingReceiptId) {
        await apiPut(`/sales/${editingReceiptId}/receipt`, payload);
      } else {
        const createResponse = await apiPost('/sales', payload);
        savedSale = createResponse.data || null;
      }

      if (!editingReceiptId) {
        try {
          await openSaleVoucherReport(savedSale);
        } catch {
          // The sale was completed; keep success message even if voucher preview fails.
        }
      }

      clearTicket();
      triggerRefresh(
        editingReceiptId ? 'Recibo actualizado correctamente.' : 'Venta registrada correctamente.'
      );
    } catch (requestError) {
      setError(
        requestError.message ||
          (editingReceiptId ? 'No fue posible actualizar el recibo' : 'No fue posible registrar la venta')
      );
    } finally {
      setSavingSale(false);
    }
  }

  async function handleCreateCashMovement(event) {
    event.preventDefault();
    clearMessages();
    setSavingCashMovement(true);

    try {
      await apiPost('/cash-movements', {
        user_id: user?.id,
        movement_type: cashMovementForm.movement_type,
        description: cashMovementForm.description || null,
        amount: Number(cashMovementForm.amount)
      });

      setCashMovementForm(initialCashMovementForm);
      setCashMovementPage(1);
      triggerRefresh('Movimiento de caja registrado correctamente.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible registrar el movimiento de caja');
    } finally {
      setSavingCashMovement(false);
    }
  }

  async function handleCloseCashRegister() {
    clearMessages();
    setClosingCashRegister(true);

    try {
      await apiPost('/cash-register/current/close', {
        closing_amount: Number(cashCloseForm.closing_amount || 0),
        notes: cashCloseForm.notes || null
      });

      setCashCloseForm(initialCashCloseForm);
      triggerRefresh('Caja cerrada correctamente. Se ha guardado el arqueo.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cerrar la caja');
    } finally {
      setClosingCashRegister(false);
    }
  }

  const selectedProduct = products.find((product) => String(product.id) === String(selectedProductId));

  const ticketItems = useMemo(
    () =>
      saleForm.items.map((item, index) => {
        const product = products.find((entry) => String(entry.id) === String(item.product_id));
        const quantity = Number(item.quantity || 0);
        const unitBasePrice = Number(product?.sale_price || 0);
        const taxRate = Number(product?.tax_rate || 0);
        const unitPrice = unitBasePrice * (1 + taxRate / 100);
        const discount = Number(item.discount || 0);
        const grossBaseTotal = unitBasePrice * quantity;
        const grossTaxTotal = grossBaseTotal * (taxRate / 100);
        const grossLineTotal = grossBaseTotal + grossTaxTotal;
        const appliedDiscount = Math.min(discount, grossLineTotal);
        const netRatio = grossLineTotal > 0 ? (grossLineTotal - appliedDiscount) / grossLineTotal : 0;
        const lineBaseTotal = grossBaseTotal * netRatio;
        const lineTaxTotal = grossTaxTotal * netRatio;
        const lineTotal = lineBaseTotal + lineTaxTotal;

        return {
          index,
          product,
          quantity,
          unitBasePrice,
          taxRate,
          unitPrice,
          discount,
          grossBaseTotal,
          lineBaseTotal,
          lineTaxTotal,
          lineTotal
        };
      }),
    [products, saleForm.items]
  );

  const ticketSubtotal = ticketItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const ticketBaseSubtotal = ticketItems.reduce((sum, item) => sum + item.lineBaseTotal, 0);
  const itemTaxAmount = ticketItems.reduce((sum, item) => sum + item.lineTaxTotal, 0);
  const globalDiscount = Number(saleForm.discount || 0);
  const manualTaxAmount = Number(saleForm.tax || 0);
  const taxAmount = itemTaxAmount + manualTaxAmount;
  const ticketTotal = Math.max(ticketBaseSubtotal - globalDiscount + taxAmount, 0);
  const tenderedAmount = Number(amountTendered || 0);
  const changeDue = Math.max(tenderedAmount - ticketTotal, 0);
  const balanceDue = Math.max(ticketTotal - tenderedAmount, 0);
  const productSalePrice = productForm.sale_price === '' ? 0 : Number(productForm.sale_price);
  const selectedProductTaxRate = productForm.tax_rate === '' ? 0 : Number(productForm.tax_rate);
  const productProfitMargin =
    productSalePrice -
    (productForm.cost_price === '' ? 0 : Number(productForm.cost_price));
  const productPriceWithTax = productSalePrice + productSalePrice * (selectedProductTaxRate / 100);
  const baseTaxOptions =
    Array.isArray(settings?.tax_options) && settings.tax_options.length > 0
      ? settings.tax_options
      : [
          { name: 'Exento', rate: 0 },
          { name: 'IVA', rate: 15 }
        ];
  const selectedTaxValue = `${productForm.tax_name || 'Exento'}|${String(
    Number(productForm.tax_rate || 0)
  )}`;
  const configuredTaxOptions =
    baseTaxOptions.some((option) => `${String(option?.name || '').trim()}|${Number(option?.rate || 0)}` === selectedTaxValue)
      ? baseTaxOptions
      : [
          ...baseTaxOptions,
          {
            name: productForm.tax_name || 'Exento',
            rate: Number(productForm.tax_rate || 0)
          }
        ];

  function handleProductTaxChange(event) {
    const selectedValue = String(event.target.value || 'Exento|0');
    const separatorIndex = selectedValue.lastIndexOf('|');

    if (separatorIndex < 0) {
      setProductForm((current) => ({
        ...current,
        tax_name: 'Exento',
        tax_rate: '0'
      }));
      return;
    }

    const taxName = selectedValue.slice(0, separatorIndex).trim() || 'Exento';
    const taxRate = Number(selectedValue.slice(separatorIndex + 1));

    setProductForm((current) => ({
      ...current,
      tax_name: taxName,
      tax_rate: Number.isFinite(taxRate) ? String(taxRate) : '0'
    }));
  }

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

  useEffect(() => {
    function handleKeydown(event) {
      const targetTag = event.target?.tagName;
      const isTypingInField =
        targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || event.target?.isContentEditable;

      if (activeView !== 'sales' || isTypingInField) {
        return;
      }

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        applyKeypad(event.key);
        return;
      }

      if (event.key === '.') {
        event.preventDefault();
        applyKeypad('.');
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        applyKeypad('backspace');
        return;
      }

      if (event.key === 'Delete') {
        event.preventDefault();
        applyKeypad('clear');
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        setAmountTendered(String(ticketTotal));
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [activeView, ticketTotal, keypadTarget, selectedLineIndex, saleForm.items]);

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
            activeView === 'stats' ? 'bg-brand-forest text-white' : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => setActiveView('stats')}
          type="button"
        >
          Editar ventas
        </button>
        <button
          className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${
            activeView === 'cash-movements'
              ? 'bg-brand-moss text-white'
              : 'border border-brand-sand text-brand-forest'
          }`}
          onClick={() => setActiveView('cash-movements')}
          type="button"
        >
          Movimientos de caja
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
                        <th className="pb-3">Imp.</th>
                        <th className="pb-3">Subtotal</th>
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
                          <td className="py-3">{formatCurrency(item.lineTaxTotal)}</td>
                          <td className="py-3">{formatCurrency(item.grossBaseTotal)}</td>
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
                  {posPagination.totalItems} articulos disponibles en esta vista
                </p>
              </div>

              {!posProductsQuery.loading && !posProducts.length ? (
                <EmptyState
                  title="Sin articulos"
                  description="No hay productos activos que coincidan con la categoria o el filtro de busqueda."
                />
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {posProducts.map((product, index) => {
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
                      {product.image_data_url ? (
                        <div className="relative h-28">
                          <img
                            alt={product.name}
                            className="h-full w-full cursor-pointer object-cover"
                            src={product.image_data_url}
                            onClick={(e) => {
                              e.stopPropagation();
                              const blob = dataURLToBlob(product.image_data_url);
                              const url = URL.createObjectURL(blob);
                              window.open(url);
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-brand-forest/85 via-brand-forest/45 to-transparent p-4 text-white">
                            <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                              {product.category_name || 'Mostrador'}
                            </p>
                            <p className="mt-3 text-lg font-semibold">{product.name}</p>
                          </div>
                        </div>
                      ) : (
                        <div className={`h-24 bg-gradient-to-br ${getCategoryTone(categoryIndex >= 0 ? categoryIndex : index)} p-4 text-white`}>
                          <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                            {product.category_name || 'Mostrador'}
                          </p>
                          <p className="mt-3 text-lg font-semibold">{product.name}</p>
                        </div>
                      )}
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
                          {formatCurrency(
                            Number(product.sale_price || 0) * (1 + Number(product.tax_rate || 0) / 100)
                          )}
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
                currentPage={posPagination.page}
                itemLabel="articulos"
                onPageChange={setPosGridPage}
                pageSize={posPagination.limit}
                totalItems={posPagination.totalItems}
                totalPages={posPagination.totalPages}
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
                  <span>{formatCurrency(ticketBaseSubtotal)}</span>
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
                {editingReceiptId ? (
                  <p className="rounded-2xl border border-brand-sand/70 bg-brand-cream/40 px-4 py-3 text-sm font-semibold text-brand-forest">
                    Editando recibo ID #{editingReceiptId}
                  </p>
                ) : null}
                <button
                  className="rounded-2xl bg-brand-moss px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                  disabled={savingSale || productOptionsQuery.loading || ticketTotal <= 0}
                  type="submit"
                >
                  {savingSale
                    ? 'Guardando...'
                    : editingReceiptId
                      ? 'Guardar cambios del recibo'
                      : 'Registrar venta'}
                </button>

                {editingReceiptId ? (
                  <div className="grid gap-2 md:grid-cols-3">
                    <button
                      className="rounded-2xl border border-brand-moss bg-brand-moss/10 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-brand-forest disabled:opacity-60"
                      disabled={savingSale || reprintingReceipt}
                      onClick={handleReprintReceipt}
                      type="button"
                    >
                      {reprintingReceipt ? 'Reimprimiendo...' : 'Reimprimir recibo'}
                    </button>
                    <button
                      className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-rose-700 disabled:opacity-60"
                      disabled={savingSale}
                      onClick={handleCancelReceipt}
                      type="button"
                    >
                      Anular recibo
                    </button>
                    <button
                      className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-brand-forest"
                      onClick={clearTicket}
                      type="button"
                    >
                      Salir de edicion
                    </button>
                  </div>
                ) : null}

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
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    placeholder="Buscar cliente por codigo, nombre o telefono"
                    type="text"
                    value={clientSearch}
                    onChange={handleClientSearchChange}
                  />
                  <div className="max-h-56 overflow-auto rounded-2xl border border-brand-sand bg-white shadow-sm">
                    {(activeClients
                      .filter((client) => {
                        const search = clientSearch.trim().toLowerCase();
                        if (!search) return true;
                        const clientName = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase();
                        const clientCode = String(client.client_code || '').toLowerCase();
                        const clientPhone = String(client.phone_number || '').toLowerCase();
                        return clientName.includes(search) || clientCode.includes(search) || clientPhone.includes(search);
                      })
                      .slice(0, 8)
                      .map((client) => (
                        <button
                          className="w-full border-b border-brand-sand/50 px-4 py-3 text-left text-sm text-brand-forest transition hover:bg-brand-cream/60"
                          key={client.id}
                          onClick={() => selectSaleClient(client)}
                          type="button"
                        >
                          <span className="font-semibold">{client.client_code} - {client.first_name} {client.last_name}</span>
                          {client.phone_number ? <span className="block text-xs text-brand-forest/70">{client.phone_number}</span> : null}
                        </button>
                      ))
                    )}
                    {!activeClients.length ? (
                      <p className="px-4 py-3 text-sm text-brand-forest/70">Cargando clientes...</p>
                    ) : null}
                  </div>
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
            subtitle="Vista previa de recibos y movimientos para registrar el arqueo final."
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-sand/70 bg-brand-cream/30 px-4 py-3 text-sm text-brand-forest/80">
              <p>
                Sesion actual: <span className="font-semibold">#{cashSession.id || '--'}</span> |
                Estado: <span className="font-semibold"> {cashSession.status === 'open' ? 'Abierta' : 'Cerrada'}</span>
              </p>
              <p>
                Apertura:{' '}
                <span className="font-semibold">
                  {cashSession.opened_at ? new Date(cashSession.opened_at).toLocaleString('es-NI') : '--'}
                </span>
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[1.75rem] border border-brand-sand/70 bg-white p-4 shadow-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ventas POS</p>
                <p className="mt-3 text-3xl font-bold text-brand-forest">
                  {formatCurrency(cashCloseMetrics.pos_sales_amount || 0)}
                </p>
                <p className="mt-1 text-xs text-brand-forest/70">{cashCloseMetrics.pos_sales_count || 0} recibos</p>
              </article>
              <article className="rounded-[1.75rem] border border-brand-sand/70 bg-white p-4 shadow-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ventas membresia</p>
                <p className="mt-3 text-3xl font-bold text-brand-forest">
                  {formatCurrency(cashCloseMetrics.membership_sales_amount || 0)}
                </p>
                <p className="mt-1 text-xs text-brand-forest/70">{cashCloseMetrics.membership_sales_count || 0} operaciones</p>
              </article>
              <article className="rounded-[1.75rem] border border-brand-sand/70 bg-white p-4 shadow-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Pagos rutina diaria</p>
                <p className="mt-3 text-3xl font-bold text-brand-clay">
                  {formatCurrency(cashCloseMetrics.daily_pass_sales_amount || 0)}
                </p>
                <p className="mt-1 text-xs text-brand-forest/70">{cashCloseMetrics.daily_pass_sales_count || 0} pagos</p>
              </article>
              <article className="rounded-[1.75rem] border border-brand-sand/70 bg-white p-4 shadow-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Recibos anulados</p>
                <p className="mt-3 text-3xl font-bold text-rose-600">
                  {cashCloseMetrics.total_receipts_voided || 0}
                </p>
              </article>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-brand-sand/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Total ventas (todos los canales)</p>
                <p className="mt-3 text-3xl font-bold text-brand-clay">
                  {formatCurrency(cashCloseMetrics.total_sales_all_channels || 0)}
                </p>
              </article>
              <article className="rounded-2xl border border-brand-sand/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Efectivo cobrado total</p>
                <p className="mt-3 text-3xl font-bold text-brand-forest">
                  {formatCurrency(cashCloseMetrics.all_channels_income_by_payment_method?.cash || 0)}
                </p>
              </article>
              <article className="rounded-2xl border border-brand-sand/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ingresos / egresos de caja</p>
                <p className="mt-2 text-base font-semibold text-brand-forest">
                  +{formatCurrency(cashCloseMetrics.cash_income || 0)} / -{formatCurrency(cashCloseMetrics.cash_expense || 0)}
                </p>
              </article>
              <article className="rounded-2xl border border-brand-sand/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Monto esperado al cierre</p>
                <p className="mt-3 text-3xl font-bold text-emerald-700">
                  {formatCurrency(cashCloseMetrics.expected_closing_amount || 0)}
                </p>
              </article>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <section className="rounded-2xl border border-brand-sand/70 p-4">
                <h3 className="text-lg font-semibold text-brand-forest">Registrar cierre</h3>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-brand-forest">Monto contado en caja</span>
                    <input
                      className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                      min="0"
                      name="closing_amount"
                      onChange={handleCashCloseChange}
                      step="0.01"
                      type="number"
                      value={cashCloseForm.closing_amount}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-brand-forest">Notas de cierre</span>
                    <textarea
                      className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                      name="notes"
                      onChange={handleCashCloseChange}
                      placeholder="Observaciones del arqueo"
                      value={cashCloseForm.notes}
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-brand-forest disabled:opacity-60"
                      disabled={exportingCashClosePdf}
                      onClick={handleExportCashClosePdf}
                      type="button"
                    >
                      {exportingCashClosePdf ? 'Exportando PDF...' : 'Exportar PDF'}
                    </button>
                    <button
                      className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-brand-forest disabled:opacity-60"
                      disabled={exportingCashCloseExcel}
                      onClick={handleExportCashCloseExcel}
                      type="button"
                    >
                      {exportingCashCloseExcel ? 'Exportando Excel...' : 'Exportar Excel'}
                    </button>
                  </div>
                  <button
                    className="rounded-2xl bg-brand-clay px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                    disabled={closingCashRegister || cashSession.status !== 'open'}
                    onClick={handleCloseCashRegister}
                    type="button"
                  >
                    {closingCashRegister ? 'Cerrando caja...' : 'Cerrar Caja'}
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-brand-sand/70 p-4">
                <h3 className="text-lg font-semibold text-brand-forest">Vista previa de recibos</h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <article className="rounded-2xl border border-brand-sand/60 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Recibos emitidos</p>
                    <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                      {receiptsIssued.length ? (
                        receiptsIssued.slice(0, 20).map((receipt) => (
                          <div key={receipt.id} className="rounded-xl border border-brand-sand/50 px-3 py-2">
                            <p className="text-sm font-semibold text-brand-forest">{receipt.sale_number}</p>
                            <p className="text-xs text-brand-forest/70">
                              {new Date(receipt.sold_at).toLocaleString('es-NI')} | {formatCurrency(receipt.total)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-brand-forest/70">Sin recibos emitidos en esta sesion.</p>
                      )}
                    </div>
                  </article>

                  <article className="rounded-2xl border border-brand-sand/60 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Recibos anulados</p>
                    <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                      {receiptsVoided.length ? (
                        receiptsVoided.slice(0, 20).map((receipt) => (
                          <div key={receipt.id} className="rounded-xl border border-brand-sand/50 px-3 py-2">
                            <p className="text-sm font-semibold text-brand-forest">{receipt.sale_number}</p>
                            <p className="text-xs text-brand-forest/70">
                              {new Date(receipt.sold_at).toLocaleString('es-NI')} | {formatCurrency(receipt.total)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-brand-forest/70">Sin recibos anulados en esta sesion.</p>
                      )}
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </DataPanel>
        </div>
      ) : null}

      {activeView === 'cash-movements' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <DataPanel
            title="Registro de movimientos de caja"
            subtitle="Registra ingresos y egresos de efectivo del turno actual."
          >
            <form className="grid gap-4" onSubmit={handleCreateCashMovement}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Tipo de movimiento</span>
                <select
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  name="movement_type"
                  onChange={handleCashMovementChange}
                  value={cashMovementForm.movement_type}
                >
                  <option value="income">Ingreso de efectivo</option>
                  <option value="expense">Egreso de efectivo</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Descripcion</span>
                <textarea
                  className="min-h-24 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  name="description"
                  onChange={handleCashMovementChange}
                  placeholder="Ejemplo: Compra de insumos, cambio de caja, pago proveedor"
                  value={cashMovementForm.description}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Monto</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  min="0.01"
                  name="amount"
                  onChange={handleCashMovementChange}
                  required
                  step="0.01"
                  type="number"
                  value={cashMovementForm.amount}
                />
              </label>

              <button
                className="rounded-2xl bg-brand-moss px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                disabled={savingCashMovement}
                type="submit"
              >
                {savingCashMovement ? 'Guardando...' : 'Registrar movimiento'}
              </button>
            </form>
          </DataPanel>

          <DataPanel
            title="Historial de movimientos"
            subtitle="Control de ingresos y egresos manuales registrados en caja."
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                className="min-w-[260px] flex-1 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setCashMovementSearch(event.target.value)}
                placeholder="Buscar por descripcion"
                value={cashMovementSearch}
              />
              <button
                className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold text-brand-forest disabled:opacity-60"
                disabled={cashMovementExporting || cashMovementsQuery.loading}
                onClick={handleExportCashMovementsExcel}
                type="button"
              >
                {cashMovementExporting ? 'Exportando...' : 'Exportar Excel'}
              </button>
              <button
                className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold text-brand-forest disabled:opacity-60"
                disabled={cashMovementExporting || cashMovementsQuery.loading}
                onClick={handleExportCashMovementsPdf}
                type="button"
              >
                {cashMovementExporting ? 'Exportando...' : 'Exportar PDF'}
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                Ingresos: {formatCurrency(cashMovementsSummary.total_income || 0)}
              </span>
              <span className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                Egresos: {formatCurrency(cashMovementsSummary.total_expense || 0)}
              </span>
              <span className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-3 py-2 text-sm font-semibold text-brand-forest">
                Balance: {formatCurrency(cashMovementsSummary.net_balance || 0)}
              </span>
            </div>

            {cashMovementsQuery.loading ? (
              <p className="text-sm text-brand-forest/70">Cargando movimientos de caja...</p>
            ) : null}
            {!cashMovementsQuery.loading && !cashMovements.length ? (
              <EmptyState
                title="Sin movimientos"
                description="No hay ingresos o egresos registrados con este filtro."
              />
            ) : null}

            {cashMovements.length ? (
              <div className="space-y-3">
                {cashMovements.map((movement) => (
                  <article key={movement.id} className="rounded-2xl border border-brand-sand/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">
                          {cashMovementTypeLabel[movement.movement_type] || movement.movement_type}
                        </p>
                        <h3 className="mt-1 font-semibold text-brand-forest">
                          {movement.description || 'Sin descripcion'}
                        </h3>
                        <p className="mt-1 text-sm text-brand-forest/70">
                          Registrado por: {movement.username || 'Sistema'} |{' '}
                          {new Date(movement.created_at).toLocaleString('es-NI')}
                        </p>
                      </div>
                      <span
                        className={`text-xl font-bold ${
                          movement.movement_type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {movement.movement_type === 'income' ? '+' : '-'}
                        {formatCurrency(movement.amount)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <Pagination
              currentPage={cashMovementPagination.page}
              itemLabel="movimientos"
              onPageChange={setCashMovementPage}
              pageSize={cashMovementPagination.limit}
              totalItems={cashMovementPagination.totalItems}
              totalPages={cashMovementPagination.totalPages}
            />
          </DataPanel>
        </div>
      ) : null}

      {activeView === 'stats' ? (
        <div className="grid gap-6">
          <DataPanel title="Editar ventas" subtitle="Busca, filtra por fechas y abre recibos para edicion o anulacion.">
            <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_13rem_auto] md:items-end">
              <input
                className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setSaleSearch(event.target.value)}
                placeholder="Buscar por numero, cliente, cajero o estado"
                value={saleSearch}
              />
              <label className="grid gap-1 text-sm font-semibold text-brand-forest">
                Desde
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3 font-normal"
                  onChange={(event) => setSaleDateFrom(event.target.value)}
                  type="date"
                  value={saleDateFrom}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-brand-forest">
                Hasta
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3 font-normal"
                  onChange={(event) => setSaleDateTo(event.target.value)}
                  type="date"
                  value={saleDateTo}
                />
              </label>
              <button
                className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-brand-forest"
                onClick={() => {
                  setSaleDateFrom('');
                  setSaleDateTo('');
                }}
                type="button"
              >
                Limpiar fechas
              </button>
            </div>

            {salesQuery.loading ? <p className="text-sm text-brand-forest/70">Cargando ventas...</p> : null}
            {loadingReceipt ? <p className="text-sm text-brand-forest/70">Cargando recibo seleccionado...</p> : null}
            {!salesQuery.loading && !sales.length ? (
              <EmptyState title="Sin ventas" description="No hay ventas que coincidan con la busqueda actual." />
            ) : null}

            {sales.length ? (
              <div className="space-y-3">
                {sales.map((sale) => (
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
                      <div className="grid gap-2 justify-items-end">
                        <span className="text-xl font-bold text-brand-clay">{formatCurrency(sale.total)}</span>
                        <button
                          className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest"
                          onClick={() => loadReceiptToTicket(sale.id)}
                          type="button"
                        >
                          Editar recibo
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <Pagination
              currentPage={salePagination.page}
              itemLabel="ventas"
              onPageChange={setSalePage}
              pageSize={salePagination.limit}
              totalItems={salePagination.totalItems}
              totalPages={salePagination.totalPages}
            />
          </DataPanel>
        </div>
      ) : null}

      {activeView === 'products' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <DataPanel
            title={editingProductId ? 'Editar producto' : 'Nuevo producto'}
            subtitle="Registra articulos para el mostrador y el POS."
          >
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
                <span className="text-sm font-semibold text-brand-forest">Imagen del producto</span>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  onChange={handleProductImageChange}
                  type="file"
                />
              </label>

              {productImagePreview ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-[1.5rem] border border-brand-sand/70 bg-brand-cream/30">
                    <img
                      alt="Vista previa del producto"
                      className="h-40 w-full object-cover"
                      src={productImagePreview}
                    />
                  </div>
                  <button
                    className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-rose-600"
                    onClick={clearProductImage}
                    type="button"
                  >
                    Quitar imagen
                  </button>
                </div>
              ) : null}

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
                  <span className="text-sm font-semibold text-brand-forest">Precio base</span>
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

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Margen de Ganancia</span>
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    readOnly
                    type="text"
                    value={formatCurrency(productProfitMargin)}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Precio de venta</span>
                  <input
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    readOnly
                    type="text"
                    value={formatCurrency(productPriceWithTax)}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-1">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Impuesto</span>
                  <select
                    className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                    onChange={handleProductTaxChange}
                    value={selectedTaxValue}
                  >
                    {configuredTaxOptions.map((taxOption, index) => {
                      const optionName = String(taxOption?.name || '').trim();
                      const optionRate = Number(taxOption?.rate || 0);
                      const optionValue = `${optionName}|${optionRate}`;

                      return (
                        <option key={`${optionValue}-${index}`} value={optionValue}>
                          {optionName} {optionRate}%
                        </option>
                      );
                    })}
                  </select>
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

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                  disabled={savingProduct || categoriesQuery.loading}
                  type="submit"
                >
                  {savingProduct
                    ? 'Guardando...'
                    : editingProductId
                      ? 'Actualizar producto'
                      : 'Crear producto'}
                </button>
                <button
                  className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-forest"
                  onClick={resetProductForm}
                  type="button"
                >
                  Limpiar
                </button>
              </div>
            </form>
          </DataPanel>

          <DataPanel title="Catalogo de productos" subtitle="Consulta rapida del inventario disponible para venta.">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                className="min-w-72 flex-1 rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Buscar por SKU, nombre, categoria o codigo de barras"
                value={productSearch}
              />
              <button
                className="rounded-2xl border border-brand-sand px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
                disabled={productExporting || productCatalogQuery.loading}
                onClick={handleExportProductsExcel}
                type="button"
              >
                {productExporting ? 'Exportando...' : 'Exportar Excel'}
              </button>
              <button
                className="rounded-2xl border border-brand-sand px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
                disabled={productExporting || productCatalogQuery.loading}
                onClick={handleExportProductsPdf}
                type="button"
              >
                {productExporting ? 'Exportando...' : 'Exportar PDF'}
              </button>
            </div>

            {productCatalogQuery.loading ? <p className="text-sm text-brand-forest/70">Cargando productos...</p> : null}
            {!productCatalogQuery.loading && !productResults.length ? (
              <EmptyState
                title="Sin productos"
                description="Todavia no hay productos que coincidan con la busqueda."
              />
            ) : null}

            {productResults.length ? (
              <div className="space-y-3">
                {productResults.map((product) => (
                  <article key={product.id} className="rounded-2xl border border-brand-sand/70 p-4">
                    {product.image_data_url ? (
                      <img
                        alt={product.name}
                        className="mb-4 h-44 w-full cursor-pointer rounded-[1.5rem] object-cover"
                        src={product.image_data_url}
                        onClick={() => {
                          const blob = dataURLToBlob(product.image_data_url);
                          const url = URL.createObjectURL(blob);
                          window.open(url);
                        }}
                      />
                    ) : null}
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
                          {formatCurrency(
                            Number(product.sale_price || 0) * (1 + Number(product.tax_rate || 0) / 100)
                          )}
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
                    <div className="mt-4 flex justify-end">
                      <button
                        className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest"
                        onClick={() => startEditProduct(product)}
                        type="button"
                      >
                        Editar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <Pagination
              currentPage={productPagination.page}
              itemLabel="productos"
              onPageChange={setProductPage}
              pageSize={productPagination.limit}
              totalItems={productPagination.totalItems}
              totalPages={productPagination.totalPages}
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
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
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
                  className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3 md:flex-1"
                  onChange={(event) => setMovementSearch(event.target.value)}
                  placeholder="Buscar por tipo, referencia o nota"
                  value={movementSearch}
                />
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <button
                  className="rounded-2xl border border-brand-sand px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
                  disabled={movementPdfExporting || movementsQuery.loading || !selectedProductId}
                  onClick={handleExportMovementsPdf}
                  type="button"
                >
                  {movementPdfExporting ? 'Exportando PDF...' : 'Exportar PDF'}
                </button>
                <button
                  className="rounded-2xl border border-brand-sand px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
                  disabled={movementExporting || movementsQuery.loading || !selectedProductId}
                  onClick={handleExportMovementsExcel}
                  type="button"
                >
                  {movementExporting ? 'Exportando...' : 'Exportar Excel'}
                </button>
              </div>
            </div>

            {movementsQuery.loading ? (
              <p className="text-sm text-brand-forest/70">Cargando movimientos...</p>
            ) : null}
            {!movementsQuery.loading && !selectedProductId ? (
              <EmptyState title="Sin producto seleccionado" description="Elige un producto para revisar el historial." />
            ) : null}
            {!movementsQuery.loading && selectedProductId && !movements.length ? (
              <EmptyState title="Sin movimientos" description="No hay movimientos que coincidan con la busqueda actual." />
            ) : null}

            {movements.length ? (
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
                    {movements.map((movement) => (
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
              currentPage={movementPagination.page}
              itemLabel="movimientos"
              onPageChange={setMovementPage}
              pageSize={movementPagination.limit}
              totalItems={movementPagination.totalItems}
              totalPages={movementPagination.totalPages}
            />
          </DataPanel>
        </div>
      ) : null}
    </div>
  );
}
