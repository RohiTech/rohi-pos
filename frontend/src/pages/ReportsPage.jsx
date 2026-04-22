import { useEffect, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { PageHeader } from '../components/PageHeader';
import SimpleModal from '../components/SimpleModal';
import { apiGet, authToken, buildQueryString } from '../lib/api';

const reportModules = [
  {
    title: 'Ventas',
    description: 'Reportes para caja, ingresos y rendimiento comercial.',
    items: [
      'Ventas diarias',
      'Ventas por producto',
      'Ventas por horario',
      'Resumen de caja',
      'Ventas por vendedor'
    ]
  },
  {
    title: 'Clientes',
    description: 'Informes sobre cartera, crecimiento y retención.',
    items: [
      'Clientes activos',
      'Clientes nuevos',
      'Clientes inactivos',
      'Clientes que no han venido en X días',
      'Membresías por cliente',
      'Top clientes'
    ]
  },
  {
    title: 'Membresías',
    description: 'Visión sobre vigencias, renovaciones y saldo.',
    items: [
      'Membresías vigentes',
      'Membresías por plan',
      'Renovaciones próximas',
      'Membresías por vencer (3-5 días)',
      'Ingresos recurrentes',
      'Membresías vencidas',
      'Tasa de renovación',
      'Ingresos proyectados'
    ]
  },
  {
    title: 'Inventario',
    description: 'Reportes sobre existencias, movimientos y control de productos.',
    items: [
      'Inventario actual',
      'Productos bajos en stock',
      'Movimientos de inventario',
      'Kardex de producto',
      'Productos más vendidos'
    ]
  },
  {
    title: 'Financieros',
    description: 'Reportes enfocados en flujo de caja e ingresos por método de pago.',
    items: ['Flujo de efectivo', 'Ingresos por método de pago']
  },
  {
    title: 'Asistencias',
    description: 'Análisis de check-ins por día y por cliente.',
    items: [
      'Asistencias diarias',
      'Asistencias por cliente',
      'Detalle de marcaciones por cliente',
      'Asistencia vs ingresos',
      'Ocupación por hora',
      'Clientes activos reales',
      'Rutina pagada sin asistencia'
    ]
  }
];

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFirstDayOfCurrentMonthDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function getCurrentMonthString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function ReportsPage() {
  const todayDate = getTodayDateString();
  const firstDayOfCurrentMonth = getFirstDayOfCurrentMonthDateString();

  const [openDailySalesModal, setOpenDailySalesModal] = useState(false);
  const [openProductSalesModal, setOpenProductSalesModal] = useState(false);
  const [openCashSummaryModal, setOpenCashSummaryModal] = useState(false);
  const [openSellerSalesModal, setOpenSellerSalesModal] = useState(false);
  const [openActiveClientsModal, setOpenActiveClientsModal] = useState(false);
  const [openNewClientsModal, setOpenNewClientsModal] = useState(false);
  const [openInactiveClientsModal, setOpenInactiveClientsModal] = useState(false);
  const [openNoVisitDaysModal, setOpenNoVisitDaysModal] = useState(false);
  const [openMembershipsByClientModal, setOpenMembershipsByClientModal] = useState(false);
  const [openActiveMembershipsModal, setOpenActiveMembershipsModal] = useState(false);
  const [openMembershipsByPlanModal, setOpenMembershipsByPlanModal] = useState(false);
  const [openUpcomingRenewalsModal, setOpenUpcomingRenewalsModal] = useState(false);
  const [openMembershipsExpiringWindowModal, setOpenMembershipsExpiringWindowModal] = useState(false);
  const [openRecurringIncomeModal, setOpenRecurringIncomeModal] = useState(false);
  const [openExpiredMembershipsModal, setOpenExpiredMembershipsModal] = useState(false);
  const [openRenewalRateModal, setOpenRenewalRateModal] = useState(false);
  const [openProjectedIncomeModal, setOpenProjectedIncomeModal] = useState(false);
  const [openInventoryCurrentModal, setOpenInventoryCurrentModal] = useState(false);
  const [openLowStockModal, setOpenLowStockModal] = useState(false);
  const [openInventoryMovementsModal, setOpenInventoryMovementsModal] = useState(false);
  const [openProductKardexModal, setOpenProductKardexModal] = useState(false);
  const [openAttendanceDailyModal, setOpenAttendanceDailyModal] = useState(false);
  const [openAttendanceByClientModal, setOpenAttendanceByClientModal] = useState(false);
  const [openAttendanceClientDetailModal, setOpenAttendanceClientDetailModal] = useState(false);
  const [openDailyPassWithoutAttendanceModal, setOpenDailyPassWithoutAttendanceModal] = useState(false);
  const [openAttendanceVsIncomeModal, setOpenAttendanceVsIncomeModal] = useState(false);
  const [openHourlyOccupancyModal, setOpenHourlyOccupancyModal] = useState(false);
  const [openRealActiveClientsModal, setOpenRealActiveClientsModal] = useState(false);
  const [openCashFlowModal, setOpenCashFlowModal] = useState(false);
  const [openIncomeByMethodModal, setOpenIncomeByMethodModal] = useState(false);
  const [openTopClientsModal, setOpenTopClientsModal] = useState(false);
  const [openTopProductsModal, setOpenTopProductsModal] = useState(false);
  const [openSalesByHourModal, setOpenSalesByHourModal] = useState(false);
  const [dailyParams, setDailyParams] = useState({
    fechaInicio: todayDate,
    fechaFin: todayDate,
    cashierUserId: '',
    saleStatus: '',
    cashSessionId: '',
    sourceType: 'all'
  });
  const [sellerParams, setSellerParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    sellerUserId: '',
    saleStatus: '',
    cashSessionId: ''
  });
  const [cashiers, setCashiers] = useState([]);
  const [params, setParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    categoryId: '',
    productSearch: '',
    productId: ''
  });
  const [categories, setCategories] = useState([]);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [cashParams, setCashParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    sessionId: '',
    sessionStatus: ''
  });
  const [cashSessions, setCashSessions] = useState([]);
  const [activeClientsParams, setActiveClientsParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    search: '',
    onlyWithActiveMembership: false
  });
  const [newClientsParams, setNewClientsParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    search: '',
    activeStatus: '',
    withMembership: false
  });
  const [inactiveClientsParams, setInactiveClientsParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    search: '',
    withMembership: false
  });
  const [noVisitDaysParams, setNoVisitDaysParams] = useState({
    asOfDate: todayDate,
    inactivityDays: '30',
    search: '',
    onlyActiveClients: true
  });
  const [membershipsByClientParams, setMembershipsByClientParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    clientSearch: '',
    status: '',
    planId: '',
    onlyActiveClients: false
  });
  const [activeMembershipsParams, setActiveMembershipsParams] = useState({
    asOfDate: getTodayDateString(),
    planId: '',
    search: '',
    withBalanceOnly: false,
    includePending: false
  });
  const [membershipsByPlanParams, setMembershipsByPlanParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    status: '',
    planId: ''
  });
  const [upcomingRenewalsParams, setUpcomingRenewalsParams] = useState({
    asOfDate: getTodayDateString(),
    daysAhead: '7',
    planId: '',
    search: '',
    onlyActiveClients: true
  });
  const [membershipsExpiringWindowParams, setMembershipsExpiringWindowParams] = useState({
    asOfDate: todayDate,
    minDays: '3',
    maxDays: '5',
    planId: '',
    search: '',
    onlyActiveClients: true
  });
  const [recurringIncomeParams, setRecurringIncomeParams] = useState({
    month: getCurrentMonthString(),
    status: '',
    planId: '',
    onlyPaid: false
  });
  const [membershipKpiParams, setMembershipKpiParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate
  });
  const [projectedIncomeParams, setProjectedIncomeParams] = useState({
    asOfDate: todayDate,
    monthsAhead: '3'
  });
  const [inventoryCurrentParams, setInventoryCurrentParams] = useState({
    categoryId: '',
    search: '',
    includeInactive: false,
    includeZeroStock: false
  });
  const [lowStockParams, setLowStockParams] = useState({
    categoryId: '',
    search: '',
    includeInactive: false,
    includeZeroMinimum: false
  });
  const [inventoryMovementsParams, setInventoryMovementsParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    movementType: '',
    categoryId: '',
    productId: '',
    search: ''
  });
  const [productKardexParams, setProductKardexParams] = useState({
    productId: '',
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate
  });
  const [kardexProductSearch, setKardexProductSearch] = useState('');
  const [kardexProductSuggestions, setKardexProductSuggestions] = useState([]);
  const [loadingKardexProductSuggestions, setLoadingKardexProductSuggestions] = useState(false);
  const [attendanceDailyParams, setAttendanceDailyParams] = useState({
    fechaInicio: todayDate,
    fechaFin: todayDate
  });
  const [attendanceByClientParams, setAttendanceByClientParams] = useState({
    fechaInicio: todayDate,
    fechaFin: todayDate,
    search: '',
    status: ''
  });
  const [attendanceClientDetailParams, setAttendanceClientDetailParams] = useState({
    fechaInicio: todayDate,
    fechaFin: todayDate,
    search: '',
    status: '',
    accessType: ''
  });
  const [operationalStatsParams, setOperationalStatsParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate
  });
  const [financialParams, setFinancialParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate
  });
  const [topClientsParams, setTopClientsParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    limit: '10'
  });
  const [topProductsParams, setTopProductsParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate,
    limit: '10'
  });
  const [salesByHourParams, setSalesByHourParams] = useState({
    fechaInicio: firstDayOfCurrentMonth,
    fechaFin: todayDate
  });
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [inventoryProducts, setInventoryProducts] = useState([]);

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

    if (!(
      openMembershipsByClientModal
      || openActiveMembershipsModal
      || openMembershipsByPlanModal
      || openUpcomingRenewalsModal
      || openMembershipsExpiringWindowModal
      || openRecurringIncomeModal
    )) {
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
  }, [
    openMembershipsByClientModal,
    openActiveMembershipsModal,
    openMembershipsByPlanModal,
    openUpcomingRenewalsModal,
    openMembershipsExpiringWindowModal,
    openRecurringIncomeModal
  ]);

  useEffect(() => {
    let isMounted = true;

    if (!openInventoryMovementsModal) {
      return () => {
        isMounted = false;
      };
    }

    apiGet('/products?active=true&limit=100')
      .then((response) => {
        if (isMounted) {
          setInventoryProducts(response.data || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setInventoryProducts([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [openInventoryMovementsModal]);

  useEffect(() => {
    let isMounted = true;

    if (!openProductKardexModal) {
      return () => {
        isMounted = false;
      };
    }

    const term = kardexProductSearch.trim();
    if (term.length < 2) {
      setKardexProductSuggestions([]);
      setLoadingKardexProductSuggestions(false);
      return () => {
        isMounted = false;
      };
    }

    setLoadingKardexProductSuggestions(true);
    apiGet(
      `/products${buildQueryString({
        search: term,
        active: true,
        limit: 8
      })}`
    )
      .then((response) => {
        if (isMounted) {
          setKardexProductSuggestions(response.data || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setKardexProductSuggestions([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingKardexProductSuggestions(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [openProductKardexModal, kardexProductSearch]);

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
  const handleOpenNoVisitDays = () => setOpenNoVisitDaysModal(true);
  const handleCloseNoVisitDays = () => setOpenNoVisitDaysModal(false);
  const handleOpenMembershipsByClient = () => setOpenMembershipsByClientModal(true);
  const handleCloseMembershipsByClient = () => setOpenMembershipsByClientModal(false);
  const handleOpenActiveMemberships = () => setOpenActiveMembershipsModal(true);
  const handleCloseActiveMemberships = () => setOpenActiveMembershipsModal(false);
  const handleOpenMembershipsByPlan = () => setOpenMembershipsByPlanModal(true);
  const handleCloseMembershipsByPlan = () => setOpenMembershipsByPlanModal(false);
  const handleOpenUpcomingRenewals = () => setOpenUpcomingRenewalsModal(true);
  const handleCloseUpcomingRenewals = () => setOpenUpcomingRenewalsModal(false);
  const handleOpenMembershipsExpiringWindow = () => setOpenMembershipsExpiringWindowModal(true);
  const handleCloseMembershipsExpiringWindow = () => setOpenMembershipsExpiringWindowModal(false);
  const handleOpenRecurringIncome = () => setOpenRecurringIncomeModal(true);
  const handleCloseRecurringIncome = () => setOpenRecurringIncomeModal(false);
  const handleOpenExpiredMemberships = () => setOpenExpiredMembershipsModal(true);
  const handleCloseExpiredMemberships = () => setOpenExpiredMembershipsModal(false);
  const handleOpenRenewalRate = () => setOpenRenewalRateModal(true);
  const handleCloseRenewalRate = () => setOpenRenewalRateModal(false);
  const handleOpenProjectedIncome = () => setOpenProjectedIncomeModal(true);
  const handleCloseProjectedIncome = () => setOpenProjectedIncomeModal(false);
  const handleOpenInventoryCurrent = () => setOpenInventoryCurrentModal(true);
  const handleCloseInventoryCurrent = () => setOpenInventoryCurrentModal(false);
  const handleOpenLowStock = () => setOpenLowStockModal(true);
  const handleCloseLowStock = () => setOpenLowStockModal(false);
  const handleOpenInventoryMovements = () => setOpenInventoryMovementsModal(true);
  const handleCloseInventoryMovements = () => setOpenInventoryMovementsModal(false);
  const handleOpenProductKardex = () => setOpenProductKardexModal(true);
  const handleCloseProductKardex = () => {
    setOpenProductKardexModal(false);
    setKardexProductSuggestions([]);
    setLoadingKardexProductSuggestions(false);
  };
  const handleOpenAttendanceDaily = () => setOpenAttendanceDailyModal(true);
  const handleCloseAttendanceDaily = () => setOpenAttendanceDailyModal(false);
  const handleOpenAttendanceByClient = () => setOpenAttendanceByClientModal(true);
  const handleCloseAttendanceByClient = () => setOpenAttendanceByClientModal(false);
  const handleOpenAttendanceClientDetail = () => setOpenAttendanceClientDetailModal(true);
  const handleCloseAttendanceClientDetail = () => setOpenAttendanceClientDetailModal(false);
  const handleOpenDailyPassWithoutAttendance = () => setOpenDailyPassWithoutAttendanceModal(true);
  const handleCloseDailyPassWithoutAttendance = () => setOpenDailyPassWithoutAttendanceModal(false);
  const handleOpenAttendanceVsIncome = () => setOpenAttendanceVsIncomeModal(true);
  const handleCloseAttendanceVsIncome = () => setOpenAttendanceVsIncomeModal(false);
  const handleOpenHourlyOccupancy = () => setOpenHourlyOccupancyModal(true);
  const handleCloseHourlyOccupancy = () => setOpenHourlyOccupancyModal(false);
  const handleOpenRealActiveClients = () => setOpenRealActiveClientsModal(true);
  const handleCloseRealActiveClients = () => setOpenRealActiveClientsModal(false);
  const handleOpenCashFlow = () => setOpenCashFlowModal(true);
  const handleCloseCashFlow = () => setOpenCashFlowModal(false);
  const handleOpenIncomeByMethod = () => setOpenIncomeByMethodModal(true);
  const handleCloseIncomeByMethod = () => setOpenIncomeByMethodModal(false);
  const handleOpenTopClients = () => setOpenTopClientsModal(true);
  const handleCloseTopClients = () => setOpenTopClientsModal(false);
  const handleOpenTopProducts = () => setOpenTopProductsModal(true);
  const handleCloseTopProducts = () => setOpenTopProductsModal(false);
  const handleOpenSalesByHour = () => setOpenSalesByHourModal(true);
  const handleCloseSalesByHour = () => setOpenSalesByHourModal(false);
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

  const handleNoVisitDaysParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNoVisitDaysParams((prev) => ({
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

  const handleActiveMembershipsParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setActiveMembershipsParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleMembershipsByPlanParamsChange = (e) => {
    const { name, value } = e.target;
    setMembershipsByPlanParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpcomingRenewalsParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUpcomingRenewalsParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleMembershipsExpiringWindowParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setMembershipsExpiringWindowParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleRecurringIncomeParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setRecurringIncomeParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleMembershipKpiParamsChange = (e) => {
    const { name, value } = e.target;
    setMembershipKpiParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleProjectedIncomeParamsChange = (e) => {
    const { name, value } = e.target;
    setProjectedIncomeParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleInventoryCurrentParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setInventoryCurrentParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleLowStockParamsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setLowStockParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleInventoryMovementsParamsChange = (e) => {
    const { name, value } = e.target;
    setInventoryMovementsParams((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleProductKardexParamsChange = (e) => {
    const { name, value } = e.target;
    setProductKardexParams((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleKardexProductSearchChange = (e) => {
    const value = e.target.value;
    setKardexProductSearch(value);
    setProductKardexParams((prev) => ({ ...prev, productId: '' }));
  };

  const handleSelectKardexProduct = (product) => {
    setProductKardexParams((prev) => ({
      ...prev,
      productId: String(product.id)
    }));
    setKardexProductSearch(product.name);
    setKardexProductSuggestions([]);
  };

  const handleAttendanceDailyParamsChange = (e) => {
    const { name, value } = e.target;
    setAttendanceDailyParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleAttendanceByClientParamsChange = (e) => {
    const { name, value } = e.target;
    setAttendanceByClientParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleAttendanceClientDetailParamsChange = (e) => {
    const { name, value } = e.target;
    setAttendanceClientDetailParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleOperationalStatsParamsChange = (e) => {
    const { name, value } = e.target;
    setOperationalStatsParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleFinancialParamsChange = (e) => {
    const { name, value } = e.target;
    setFinancialParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleTopClientsParamsChange = (e) => {
    const { name, value } = e.target;
    setTopClientsParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleTopProductsParamsChange = (e) => {
    const { name, value } = e.target;
    setTopProductsParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleSalesByHourParamsChange = (e) => {
    const { name, value } = e.target;
    setSalesByHourParams((prev) => ({ ...prev, [name]: value }));
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
      cash_register_session_id: dailyParams.cashSessionId,
      source_type: dailyParams.sourceType
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

  const handleNoVisitDaysReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      as_of_date: noVisitDaysParams.asOfDate,
      inactivity_days: noVisitDaysParams.inactivityDays,
      search: noVisitDaysParams.search.trim(),
      only_active_clients: noVisitDaysParams.onlyActiveClients
    });

    fetch(`http://localhost:3001/api/reports/clients-no-visit-days/pdf${query}`, {
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
        a.download = 'clientes_sin_visita_x_dias.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenNoVisitDaysModal(false);
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

  const handleActiveMembershipsReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      as_of_date: activeMembershipsParams.asOfDate,
      plan_id: activeMembershipsParams.planId,
      search: activeMembershipsParams.search.trim(),
      with_balance_only: activeMembershipsParams.withBalanceOnly,
      include_pending: activeMembershipsParams.includePending
    });

    fetch(`http://localhost:3001/api/reports/active-memberships/pdf${query}`, {
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
        a.download = 'membresias_vigentes.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenActiveMembershipsModal(false);
  };

  const handleMembershipsByPlanReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: membershipsByPlanParams.fechaInicio,
      fechaFin: membershipsByPlanParams.fechaFin,
      status: membershipsByPlanParams.status,
      plan_id: membershipsByPlanParams.planId
    });

    fetch(`http://localhost:3001/api/reports/memberships-by-plan/pdf${query}`, {
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
        a.download = 'membresias_por_plan.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenMembershipsByPlanModal(false);
  };

  const handleUpcomingRenewalsReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      as_of_date: upcomingRenewalsParams.asOfDate,
      days_ahead: upcomingRenewalsParams.daysAhead,
      plan_id: upcomingRenewalsParams.planId,
      search: upcomingRenewalsParams.search.trim(),
      only_active_clients: upcomingRenewalsParams.onlyActiveClients
    });

    fetch(`http://localhost:3001/api/reports/upcoming-renewals/pdf${query}`, {
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
        a.download = 'renovaciones_proximas.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenUpcomingRenewalsModal(false);
  };

  const handleMembershipsExpiringWindowReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      as_of_date: membershipsExpiringWindowParams.asOfDate,
      min_days: membershipsExpiringWindowParams.minDays,
      max_days: membershipsExpiringWindowParams.maxDays,
      plan_id: membershipsExpiringWindowParams.planId,
      search: membershipsExpiringWindowParams.search.trim(),
      only_active_clients: membershipsExpiringWindowParams.onlyActiveClients
    });

    fetch(`http://localhost:3001/api/reports/memberships-expiring-window/pdf${query}`, {
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
        a.download = 'membresias_por_vencer_3_5_dias.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenMembershipsExpiringWindowModal(false);
  };

  const handleRecurringIncomeReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      month: recurringIncomeParams.month,
      status: recurringIncomeParams.status,
      plan_id: recurringIncomeParams.planId,
      only_paid: recurringIncomeParams.onlyPaid
    });

    fetch(`http://localhost:3001/api/reports/recurring-income/pdf${query}`, {
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
        a.download = 'ingresos_recurrentes.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenRecurringIncomeModal(false);
  };

  const handleExpiredMembershipsReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: membershipKpiParams.fechaInicio,
      fechaFin: membershipKpiParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/expired-memberships/pdf${query}`, {
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
        a.download = 'membresias_vencidas.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenExpiredMembershipsModal(false);
  };

  const handleRenewalRateReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: membershipKpiParams.fechaInicio,
      fechaFin: membershipKpiParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/renewal-rate/pdf${query}`, {
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
        a.download = 'tasa_renovacion.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenRenewalRateModal(false);
  };

  const handleProjectedIncomeReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      as_of_date: projectedIncomeParams.asOfDate,
      months_ahead: projectedIncomeParams.monthsAhead
    });

    fetch(`http://localhost:3001/api/reports/projected-income/pdf${query}`, {
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
        a.download = 'ingresos_proyectados.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenProjectedIncomeModal(false);
  };

  const handleInventoryCurrentReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      category_id: inventoryCurrentParams.categoryId,
      search: inventoryCurrentParams.search.trim(),
      include_inactive: inventoryCurrentParams.includeInactive,
      include_zero_stock: inventoryCurrentParams.includeZeroStock
    });

    fetch(`http://localhost:3001/api/reports/inventory-current/pdf${query}`, {
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
        a.download = 'inventario_actual.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenInventoryCurrentModal(false);
  };

  const handleLowStockReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      category_id: lowStockParams.categoryId,
      search: lowStockParams.search.trim(),
      include_inactive: lowStockParams.includeInactive,
      include_zero_minimum: lowStockParams.includeZeroMinimum
    });

    fetch(`http://localhost:3001/api/reports/low-stock-products/pdf${query}`, {
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
        a.download = 'productos_bajos_stock.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenLowStockModal(false);
  };

  const handleInventoryMovementsReport = async (e) => {
    e.preventDefault();
    const query = buildQueryString({
      fechaInicio: inventoryMovementsParams.fechaInicio,
      fechaFin: inventoryMovementsParams.fechaFin,
      movement_type: inventoryMovementsParams.movementType,
      category_id: inventoryMovementsParams.categoryId,
      product_id: inventoryMovementsParams.productId,
      search: inventoryMovementsParams.search.trim()
    });

    fetch(`http://localhost:3001/api/reports/inventory-movements/pdf${query}`, {
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
        a.download = 'movimientos_inventario.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenInventoryMovementsModal(false);
  };

  const handleProductKardexReport = async (e) => {
    e.preventDefault();

    if (!productKardexParams.productId) {
      alert('Seleccione un producto de la lista de búsqueda.');
      return;
    }

    const query = buildQueryString({
      product_id: productKardexParams.productId,
      fechaInicio: productKardexParams.fechaInicio,
      fechaFin: productKardexParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/product-kardex/pdf${query}`, {
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
        a.download = `kardex_producto_${productKardexParams.productId || '0'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenProductKardexModal(false);
  };

  const handleAttendanceDailyReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: attendanceDailyParams.fechaInicio,
      fechaFin: attendanceDailyParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/attendance-daily/pdf${reportQuery}`, {
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
        a.download = 'asistencias_diarias.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenAttendanceDailyModal(false);
  };

  const handleAttendanceByClientReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: attendanceByClientParams.fechaInicio,
      fechaFin: attendanceByClientParams.fechaFin,
      search: attendanceByClientParams.search.trim(),
      status: attendanceByClientParams.status
    });

    fetch(`http://localhost:3001/api/reports/attendance-by-client/pdf${reportQuery}`, {
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
        a.download = 'asistencias_por_cliente.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenAttendanceByClientModal(false);
  };

  const handleAttendanceClientDetailReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: attendanceClientDetailParams.fechaInicio,
      fechaFin: attendanceClientDetailParams.fechaFin,
      search: attendanceClientDetailParams.search.trim(),
      status: attendanceClientDetailParams.status,
      access_type: attendanceClientDetailParams.accessType
    });

    fetch(`http://localhost:3001/api/reports/attendance-client-detail/pdf${reportQuery}`, {
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
        a.download = 'detalle_marcaciones_clientes.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenAttendanceClientDetailModal(false);
  };

  const handleDailyPassWithoutAttendanceReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: attendanceDailyParams.fechaInicio,
      fechaFin: attendanceDailyParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/daily-pass-without-attendance/pdf${reportQuery}`, {
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
        a.download = 'rutina_pagada_sin_asistencia.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenDailyPassWithoutAttendanceModal(false);
  };

  const handleAttendanceVsIncomeReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: operationalStatsParams.fechaInicio,
      fechaFin: operationalStatsParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/attendance-vs-income/pdf${reportQuery}`, {
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
        a.download = 'asistencia_vs_ingresos.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenAttendanceVsIncomeModal(false);
  };

  const handleHourlyOccupancyReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: operationalStatsParams.fechaInicio,
      fechaFin: operationalStatsParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/hourly-occupancy/pdf${reportQuery}`, {
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
        a.download = 'ocupacion_por_hora.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenHourlyOccupancyModal(false);
  };

  const handleRealActiveClientsReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: operationalStatsParams.fechaInicio,
      fechaFin: operationalStatsParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/real-active-clients/pdf${reportQuery}`, {
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
        a.download = 'clientes_activos_reales.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenRealActiveClientsModal(false);
  };

  const handleCashFlowReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: financialParams.fechaInicio,
      fechaFin: financialParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/cash-flow/pdf${reportQuery}`, {
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
        a.download = 'flujo_efectivo.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenCashFlowModal(false);
  };

  const handleIncomeByMethodReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: financialParams.fechaInicio,
      fechaFin: financialParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/income-by-payment-method/pdf${reportQuery}`, {
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
        a.download = 'ingresos_por_metodo_pago.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenIncomeByMethodModal(false);
  };

  const handleTopClientsReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: topClientsParams.fechaInicio,
      fechaFin: topClientsParams.fechaFin,
      limit: topClientsParams.limit
    });

    fetch(`http://localhost:3001/api/reports/top-clients/pdf${reportQuery}`, {
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
        a.download = 'top_clientes.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenTopClientsModal(false);
  };

  const handleTopProductsReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: topProductsParams.fechaInicio,
      fechaFin: topProductsParams.fechaFin,
      limit: topProductsParams.limit
    });

    fetch(`http://localhost:3001/api/reports/top-products/pdf${reportQuery}`, {
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
        a.download = 'productos_mas_vendidos.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenTopProductsModal(false);
  };

  const handleSalesByHourReport = async (e) => {
    e.preventDefault();
    const reportQuery = buildQueryString({
      fechaInicio: salesByHourParams.fechaInicio,
      fechaFin: salesByHourParams.fechaFin
    });

    fetch(`http://localhost:3001/api/reports/sales-by-hour/pdf${reportQuery}`, {
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
        a.download = 'ventas_por_horario.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => alert('No se pudo descargar el PDF. ¿Sesión expirada?'));

    setOpenSalesByHourModal(false);
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
                  ) : report === 'Top clientes' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenTopClients}
                    >
                      {report}
                    </button>
                  ) : report === 'Productos más vendidos' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenTopProducts}
                    >
                      {report}
                    </button>
                  ) : report === 'Ventas por horario' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenSalesByHour}
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
                  ) : report === 'Flujo de efectivo' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenCashFlow}
                    >
                      {report}
                    </button>
                  ) : report === 'Ingresos por método de pago' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenIncomeByMethod}
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
                  ) : report === 'Clientes que no han venido en X días' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenNoVisitDays}
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
                  ) : report === 'Membresías vigentes' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenActiveMemberships}
                    >
                      {report}
                    </button>
                  ) : report === 'Membresías por plan' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenMembershipsByPlan}
                    >
                      {report}
                    </button>
                  ) : report === 'Renovaciones próximas' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenUpcomingRenewals}
                    >
                      {report}
                    </button>
                  ) : report === 'Membresías por vencer (3-5 días)' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenMembershipsExpiringWindow}
                    >
                      {report}
                    </button>
                  ) : report === 'Ingresos recurrentes' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenRecurringIncome}
                    >
                      {report}
                    </button>
                  ) : report === 'Membresías vencidas' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenExpiredMemberships}
                    >
                      {report}
                    </button>
                  ) : report === 'Tasa de renovación' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenRenewalRate}
                    >
                      {report}
                    </button>
                  ) : report === 'Ingresos proyectados' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenProjectedIncome}
                    >
                      {report}
                    </button>
                  ) : report === 'Inventario actual' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenInventoryCurrent}
                    >
                      {report}
                    </button>
                  ) : report === 'Productos bajos en stock' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenLowStock}
                    >
                      {report}
                    </button>
                  ) : report === 'Movimientos de inventario' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenInventoryMovements}
                    >
                      {report}
                    </button>
                  ) : report === 'Kardex de producto' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenProductKardex}
                    >
                      {report}
                    </button>
                  ) : report === 'Asistencias diarias' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenAttendanceDaily}
                    >
                      {report}
                    </button>
                  ) : report === 'Asistencias por cliente' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenAttendanceByClient}
                    >
                      {report}
                    </button>
                  ) : report === 'Detalle de marcaciones por cliente' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenAttendanceClientDetail}
                    >
                      {report}
                    </button>
                  ) : report === 'Rutina pagada sin asistencia' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenDailyPassWithoutAttendance}
                    >
                      {report}
                    </button>
                  ) : report === 'Asistencia vs ingresos' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenAttendanceVsIncome}
                    >
                      {report}
                    </button>
                  ) : report === 'Ocupación por hora' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenHourlyOccupancy}
                    >
                      {report}
                    </button>
                  ) : report === 'Clientes activos reales' ? (
                    <button
                      className="font-semibold text-brand-forest hover:underline"
                      onClick={handleOpenRealActiveClients}
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

      <SimpleModal open={openAttendanceDailyModal} onClose={handleCloseAttendanceDaily}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de asistencias diarias</h2>
        <form onSubmit={handleAttendanceDailyReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={attendanceDailyParams.fechaInicio}
              onChange={handleAttendanceDailyParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={attendanceDailyParams.fechaFin}
              onChange={handleAttendanceDailyParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseAttendanceDaily} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openAttendanceByClientModal} onClose={handleCloseAttendanceByClient}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de asistencias por cliente</h2>
        <form onSubmit={handleAttendanceByClientReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={attendanceByClientParams.fechaInicio}
              onChange={handleAttendanceByClientParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={attendanceByClientParams.fechaFin}
              onChange={handleAttendanceByClientParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={attendanceByClientParams.search}
              onChange={handleAttendanceByClientParamsChange}
              placeholder="Código, nombre o teléfono"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Estado (opcional)</span>
            <select
              name="status"
              value={attendanceByClientParams.status}
              onChange={handleAttendanceByClientParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos</option>
              <option value="allowed">Permitidos</option>
              <option value="denied">Denegados</option>
            </select>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseAttendanceByClient} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openAttendanceClientDetailModal} onClose={handleCloseAttendanceClientDetail}>
        <h2 className="text-lg font-bold mb-4">Parámetros del detalle de marcaciones por cliente</h2>
        <form onSubmit={handleAttendanceClientDetailReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={attendanceClientDetailParams.fechaInicio}
              onChange={handleAttendanceClientDetailParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={attendanceClientDetailParams.fechaFin}
              onChange={handleAttendanceClientDetailParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={attendanceClientDetailParams.search}
              onChange={handleAttendanceClientDetailParamsChange}
              placeholder="Código, nombre o teléfono"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Estado (opcional)</span>
            <select
              name="status"
              value={attendanceClientDetailParams.status}
              onChange={handleAttendanceClientDetailParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos</option>
              <option value="allowed">Permitidos</option>
              <option value="denied">Denegados</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Tipo de acceso (opcional)</span>
            <select
              name="accessType"
              value={attendanceClientDetailParams.accessType}
              onChange={handleAttendanceClientDetailParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos</option>
              <option value="membership">Membresía</option>
              <option value="daily_pass">Pase diario</option>
            </select>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseAttendanceClientDetail} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openDailyPassWithoutAttendanceModal} onClose={handleCloseDailyPassWithoutAttendance}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de rutina pagada sin asistencia</h2>
        <form onSubmit={handleDailyPassWithoutAttendanceReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={attendanceDailyParams.fechaInicio}
              onChange={handleAttendanceDailyParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={attendanceDailyParams.fechaFin}
              onChange={handleAttendanceDailyParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseDailyPassWithoutAttendance} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openCashFlowModal} onClose={handleCloseCashFlow}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de flujo de efectivo</h2>
        <form onSubmit={handleCashFlowReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={financialParams.fechaInicio}
              onChange={handleFinancialParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={financialParams.fechaFin}
              onChange={handleFinancialParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseCashFlow} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openAttendanceVsIncomeModal} onClose={handleCloseAttendanceVsIncome}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de asistencia vs ingresos</h2>
        <form onSubmit={handleAttendanceVsIncomeReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={operationalStatsParams.fechaInicio}
              onChange={handleOperationalStatsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={operationalStatsParams.fechaFin}
              onChange={handleOperationalStatsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseAttendanceVsIncome} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openHourlyOccupancyModal} onClose={handleCloseHourlyOccupancy}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de ocupación por hora</h2>
        <form onSubmit={handleHourlyOccupancyReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={operationalStatsParams.fechaInicio}
              onChange={handleOperationalStatsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={operationalStatsParams.fechaFin}
              onChange={handleOperationalStatsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseHourlyOccupancy} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openRealActiveClientsModal} onClose={handleCloseRealActiveClients}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de clientes activos reales</h2>
        <form onSubmit={handleRealActiveClientsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={operationalStatsParams.fechaInicio}
              onChange={handleOperationalStatsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={operationalStatsParams.fechaFin}
              onChange={handleOperationalStatsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseRealActiveClients} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openIncomeByMethodModal} onClose={handleCloseIncomeByMethod}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de ingresos por método de pago</h2>
        <form onSubmit={handleIncomeByMethodReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={financialParams.fechaInicio}
              onChange={handleFinancialParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={financialParams.fechaFin}
              onChange={handleFinancialParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseIncomeByMethod} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openTopClientsModal} onClose={handleCloseTopClients}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de top clientes</h2>
        <form onSubmit={handleTopClientsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={topClientsParams.fechaInicio}
              onChange={handleTopClientsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={topClientsParams.fechaFin}
              onChange={handleTopClientsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Cantidad de clientes (top)</span>
            <input
              type="number"
              name="limit"
              value={topClientsParams.limit}
              onChange={handleTopClientsParamsChange}
              min="1"
              max="100"
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseTopClients} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openTopProductsModal} onClose={handleCloseTopProducts}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de productos más vendidos</h2>
        <form onSubmit={handleTopProductsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={topProductsParams.fechaInicio}
              onChange={handleTopProductsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={topProductsParams.fechaFin}
              onChange={handleTopProductsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Cantidad de productos (top)</span>
            <input
              type="number"
              name="limit"
              value={topProductsParams.limit}
              onChange={handleTopProductsParamsChange}
              min="1"
              max="100"
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseTopProducts} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openSalesByHourModal} onClose={handleCloseSalesByHour}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de ventas por horario</h2>
        <form onSubmit={handleSalesByHourReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={salesByHourParams.fechaInicio}
              onChange={handleSalesByHourParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={salesByHourParams.fechaFin}
              onChange={handleSalesByHourParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseSalesByHour} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

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
            <span className="text-sm font-semibold">Tipo de ventas</span>
            <select
              name="sourceType"
              value={dailyParams.sourceType}
              onChange={handleDailyParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="all">Todas</option>
              <option value="pos">Solo POS</option>
              <option value="membership">Solo compras de membresias</option>
              <option value="daily_pass">Solo pago del dia rutina</option>
            </select>
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

      <SimpleModal open={openNoVisitDaysModal} onClose={handleCloseNoVisitDays}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de clientes que no han venido en X días</h2>
        <form onSubmit={handleNoVisitDaysReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha de corte</span>
            <input
              type="date"
              name="asOfDate"
              value={noVisitDaysParams.asOfDate}
              onChange={handleNoVisitDaysParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Días sin asistir (X)</span>
            <input
              type="number"
              min="1"
              max="365"
              name="inactivityDays"
              value={noVisitDaysParams.inactivityDays}
              onChange={handleNoVisitDaysParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={noVisitDaysParams.search}
              onChange={handleNoVisitDaysParamsChange}
              placeholder="Código, nombre, teléfono o correo"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="onlyActiveClients"
              checked={noVisitDaysParams.onlyActiveClients}
              onChange={handleNoVisitDaysParamsChange}
            />
            <span className="text-sm font-semibold">Solo clientes activos</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseNoVisitDays}
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

      <SimpleModal open={openActiveMembershipsModal} onClose={handleCloseActiveMemberships}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de membresías vigentes</h2>
        <form onSubmit={handleActiveMembershipsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha de corte</span>
            <input
              type="date"
              name="asOfDate"
              value={activeMembershipsParams.asOfDate}
              onChange={handleActiveMembershipsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Plan (opcional)</span>
            <select
              name="planId"
              value={activeMembershipsParams.planId}
              onChange={handleActiveMembershipsParamsChange}
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
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={activeMembershipsParams.search}
              onChange={handleActiveMembershipsParamsChange}
              placeholder="Código, nombre o número de membresía"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="withBalanceOnly"
              checked={activeMembershipsParams.withBalanceOnly}
              onChange={handleActiveMembershipsParamsChange}
            />
            <span className="text-sm font-semibold">Solo membresías con saldo pendiente</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includePending"
              checked={activeMembershipsParams.includePending}
              onChange={handleActiveMembershipsParamsChange}
            />
            <span className="text-sm font-semibold">Incluir membresías pendientes</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseActiveMemberships}
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

      <SimpleModal open={openMembershipsByPlanModal} onClose={handleCloseMembershipsByPlan}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de membresías por plan</h2>
        <form onSubmit={handleMembershipsByPlanReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={membershipsByPlanParams.fechaInicio}
              onChange={handleMembershipsByPlanParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={membershipsByPlanParams.fechaFin}
              onChange={handleMembershipsByPlanParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Estado (opcional)</span>
            <select
              name="status"
              value={membershipsByPlanParams.status}
              onChange={handleMembershipsByPlanParamsChange}
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
              value={membershipsByPlanParams.planId}
              onChange={handleMembershipsByPlanParamsChange}
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
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseMembershipsByPlan}
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

      <SimpleModal open={openUpcomingRenewalsModal} onClose={handleCloseUpcomingRenewals}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de renovaciones próximas</h2>
        <form onSubmit={handleUpcomingRenewalsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha de corte</span>
            <input
              type="date"
              name="asOfDate"
              value={upcomingRenewalsParams.asOfDate}
              onChange={handleUpcomingRenewalsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Días hacia adelante</span>
            <input
              type="number"
              min="1"
              max="90"
              name="daysAhead"
              value={upcomingRenewalsParams.daysAhead}
              onChange={handleUpcomingRenewalsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Plan (opcional)</span>
            <select
              name="planId"
              value={upcomingRenewalsParams.planId}
              onChange={handleUpcomingRenewalsParamsChange}
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
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={upcomingRenewalsParams.search}
              onChange={handleUpcomingRenewalsParamsChange}
              placeholder="Código, nombre o teléfono"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="onlyActiveClients"
              checked={upcomingRenewalsParams.onlyActiveClients}
              onChange={handleUpcomingRenewalsParamsChange}
            />
            <span className="text-sm font-semibold">Solo clientes activos</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseUpcomingRenewals}
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

      <SimpleModal open={openMembershipsExpiringWindowModal} onClose={handleCloseMembershipsExpiringWindow}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de membresías por vencer (3-5 días)</h2>
        <form onSubmit={handleMembershipsExpiringWindowReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha de corte</span>
            <input
              type="date"
              name="asOfDate"
              value={membershipsExpiringWindowParams.asOfDate}
              onChange={handleMembershipsExpiringWindowParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-sm font-semibold">Días mínimo</span>
              <input
                type="number"
                min="0"
                max="90"
                name="minDays"
                value={membershipsExpiringWindowParams.minDays}
                onChange={handleMembershipsExpiringWindowParamsChange}
                required
                className="border rounded px-2 py-1"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-semibold">Días máximo</span>
              <input
                type="number"
                min="0"
                max="90"
                name="maxDays"
                value={membershipsExpiringWindowParams.maxDays}
                onChange={handleMembershipsExpiringWindowParamsChange}
                required
                className="border rounded px-2 py-1"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Plan (opcional)</span>
            <select
              name="planId"
              value={membershipsExpiringWindowParams.planId}
              onChange={handleMembershipsExpiringWindowParamsChange}
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
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={membershipsExpiringWindowParams.search}
              onChange={handleMembershipsExpiringWindowParamsChange}
              placeholder="Código, nombre o teléfono"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="onlyActiveClients"
              checked={membershipsExpiringWindowParams.onlyActiveClients}
              onChange={handleMembershipsExpiringWindowParamsChange}
            />
            <span className="text-sm font-semibold">Solo clientes activos</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseMembershipsExpiringWindow}
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

      <SimpleModal open={openRecurringIncomeModal} onClose={handleCloseRecurringIncome}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de ingresos recurrentes</h2>
        <form onSubmit={handleRecurringIncomeReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Mes</span>
            <input
              type="month"
              name="month"
              value={recurringIncomeParams.month}
              onChange={handleRecurringIncomeParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Estado (opcional)</span>
            <select
              name="status"
              value={recurringIncomeParams.status}
              onChange={handleRecurringIncomeParamsChange}
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
              value={recurringIncomeParams.planId}
              onChange={handleRecurringIncomeParamsChange}
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
              name="onlyPaid"
              checked={recurringIncomeParams.onlyPaid}
              onChange={handleRecurringIncomeParamsChange}
            />
            <span className="text-sm font-semibold">Solo membresías con pago registrado</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseRecurringIncome}
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

      <SimpleModal open={openExpiredMembershipsModal} onClose={handleCloseExpiredMemberships}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de membresías vencidas</h2>
        <form onSubmit={handleExpiredMembershipsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={membershipKpiParams.fechaInicio}
              onChange={handleMembershipKpiParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={membershipKpiParams.fechaFin}
              onChange={handleMembershipKpiParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseExpiredMemberships} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openRenewalRateModal} onClose={handleCloseRenewalRate}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de tasa de renovación</h2>
        <form onSubmit={handleRenewalRateReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={membershipKpiParams.fechaInicio}
              onChange={handleMembershipKpiParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={membershipKpiParams.fechaFin}
              onChange={handleMembershipKpiParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseRenewalRate} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openProjectedIncomeModal} onClose={handleCloseProjectedIncome}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de ingresos proyectados</h2>
        <form onSubmit={handleProjectedIncomeReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha base</span>
            <input
              type="date"
              name="asOfDate"
              value={projectedIncomeParams.asOfDate}
              onChange={handleProjectedIncomeParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Meses a proyectar</span>
            <input
              type="number"
              name="monthsAhead"
              value={projectedIncomeParams.monthsAhead}
              onChange={handleProjectedIncomeParamsChange}
              min="1"
              max="12"
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={handleCloseProjectedIncome} className="px-3 py-1 rounded bg-gray-200">
              Cancelar
            </button>
            <button type="submit" className="px-3 py-1 rounded bg-emerald-600 text-white">
              Ver reporte
            </button>
          </div>
        </form>
      </SimpleModal>

      <SimpleModal open={openInventoryCurrentModal} onClose={handleCloseInventoryCurrent}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de inventario actual</h2>
        <form onSubmit={handleInventoryCurrentReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Categoría (opcional)</span>
            <select
              name="categoryId"
              value={inventoryCurrentParams.categoryId}
              onChange={handleInventoryCurrentParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={inventoryCurrentParams.search}
              onChange={handleInventoryCurrentParamsChange}
              placeholder="SKU, nombre o categoría"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includeInactive"
              checked={inventoryCurrentParams.includeInactive}
              onChange={handleInventoryCurrentParamsChange}
            />
            <span className="text-sm font-semibold">Incluir productos inactivos</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includeZeroStock"
              checked={inventoryCurrentParams.includeZeroStock}
              onChange={handleInventoryCurrentParamsChange}
            />
            <span className="text-sm font-semibold">Incluir productos con stock en cero</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseInventoryCurrent}
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

      <SimpleModal open={openLowStockModal} onClose={handleCloseLowStock}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de productos bajos en stock</h2>
        <form onSubmit={handleLowStockReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Categoría (opcional)</span>
            <select
              name="categoryId"
              value={lowStockParams.categoryId}
              onChange={handleLowStockParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={lowStockParams.search}
              onChange={handleLowStockParamsChange}
              placeholder="SKU, nombre o categoría"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includeInactive"
              checked={lowStockParams.includeInactive}
              onChange={handleLowStockParamsChange}
            />
            <span className="text-sm font-semibold">Incluir productos inactivos</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includeZeroMinimum"
              checked={lowStockParams.includeZeroMinimum}
              onChange={handleLowStockParamsChange}
            />
            <span className="text-sm font-semibold">Incluir mínimos en cero</span>
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseLowStock}
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

      <SimpleModal open={openInventoryMovementsModal} onClose={handleCloseInventoryMovements}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte de movimientos de inventario</h2>
        <form onSubmit={handleInventoryMovementsReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={inventoryMovementsParams.fechaInicio}
              onChange={handleInventoryMovementsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={inventoryMovementsParams.fechaFin}
              onChange={handleInventoryMovementsParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Tipo de movimiento (opcional)</span>
            <select
              name="movementType"
              value={inventoryMovementsParams.movementType}
              onChange={handleInventoryMovementsParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos</option>
              <option value="purchase">Compra</option>
              <option value="sale">Venta</option>
              <option value="adjustment_in">Ajuste entrada</option>
              <option value="adjustment_out">Ajuste salida</option>
              <option value="return">Devolución</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Categoría (opcional)</span>
            <select
              name="categoryId"
              value={inventoryMovementsParams.categoryId}
              onChange={handleInventoryMovementsParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Producto (opcional)</span>
            <select
              name="productId"
              value={inventoryMovementsParams.productId}
              onChange={handleInventoryMovementsParamsChange}
              className="border rounded px-2 py-1"
            >
              <option value="">Todos los productos</option>
              {inventoryProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Búsqueda (opcional)</span>
            <input
              type="text"
              name="search"
              value={inventoryMovementsParams.search}
              onChange={handleInventoryMovementsParamsChange}
              placeholder="Producto, usuario o notas"
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseInventoryMovements}
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

      <SimpleModal open={openProductKardexModal} onClose={handleCloseProductKardex}>
        <h2 className="text-lg font-bold mb-4">Parámetros del reporte kardex de producto</h2>
        <form onSubmit={handleProductKardexReport} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Producto (búsqueda)</span>
            <input
              type="text"
              value={kardexProductSearch}
              onChange={handleKardexProductSearchChange}
              placeholder="Escribe nombre o SKU del producto"
              className="border rounded px-2 py-1"
            />
          </label>
          {(loadingKardexProductSuggestions || kardexProductSuggestions.length > 0) && (
            <div className="rounded border border-brand-sand/70 bg-white max-h-40 overflow-auto">
              {loadingKardexProductSuggestions && (
                <p className="px-3 py-2 text-sm text-slate-500">Buscando productos...</p>
              )}
              {!loadingKardexProductSuggestions && kardexProductSuggestions.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-500">Sin coincidencias</p>
              )}
              {!loadingKardexProductSuggestions &&
                kardexProductSuggestions.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelectKardexProduct(product)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-brand-cream/60"
                  >
                    {product.name}
                    {product.sku ? ` (${product.sku})` : ''}
                  </button>
                ))}
            </div>
          )}
          {!!productKardexParams.productId && (
            <p className="text-xs text-slate-600">Producto seleccionado ID: {productKardexParams.productId}</p>
          )}
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha inicio</span>
            <input
              type="date"
              name="fechaInicio"
              value={productKardexParams.fechaInicio}
              onChange={handleProductKardexParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Fecha fin</span>
            <input
              type="date"
              name="fechaFin"
              value={productKardexParams.fechaFin}
              onChange={handleProductKardexParamsChange}
              required
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={handleCloseProductKardex}
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
