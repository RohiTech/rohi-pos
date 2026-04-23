import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { DataPanel } from '../components/DataPanel';
import { EmptyState } from '../components/EmptyState';
import { MetricCard } from '../components/MetricCard';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { useSettings } from '../context/SettingsContext';
import { apiGet } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/format';

const CHART_WIDTH = 760;
const CHART_HEIGHT = 280;
const CHART_PADDING = { top: 18, right: 18, bottom: 44, left: 48 };
const HEATMAP_WIDTH = 760;
const HEATMAP_HEIGHT = 210;
const HEATMAP_PADDING = { top: 28, right: 16, bottom: 34, left: 68 };
const MEMBERSHIP_BLOCK_PAGE_SIZE = 5;

function getExportStamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('');
}

function formatDailyLabel(value) {
  return new Intl.DateTimeFormat('es-NI', {
    day: 'numeric',
    month: 'short'
  }).format(new Date(value));
}

function formatHourLabel(hourValue) {
  const normalizedDate = new Date(Date.UTC(2024, 0, 1, Number(hourValue || 0), 0, 0));

  return new Intl.DateTimeFormat('es-NI', {
    hour: 'numeric',
    hour12: true,
    timeZone: 'UTC'
  }).format(normalizedDate);
}

function formatAverageDailyAttendance(value) {
  const numericValue = Number(value || 0);

  if (!numericValue) {
    return '0';
  }

  return new Intl.NumberFormat('es-NI', {
    minimumFractionDigits: numericValue % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1
  }).format(numericValue);
}

function formatOneDecimal(value) {
  const numericValue = Number(value || 0);

  return new Intl.NumberFormat('es-NI', {
    minimumFractionDigits: numericValue % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1
  }).format(numericValue);
}

function normalizePhoneForWhatsApp(phone) {
  const digitsOnly = String(phone || '').replace(/\D/g, '');

  return digitsOnly.length >= 8 ? digitsOnly : '';
}

function buildRenewMembershipUrl(membership) {
  const params = new URLSearchParams({
    renew_client_id: String(membership.client_id || ''),
    renew_client_code: String(membership.client_code || ''),
    renew_client_name: `${membership.client_first_name || ''} ${membership.client_last_name || ''}`.trim()
  });

  return `/memberships?${params.toString()}`;
}

function getMembershipSegment(membership, expiryAlertDays) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = membership.end_date ? new Date(`${String(membership.end_date).slice(0, 10)}T00:00:00`) : null;
  const startDate = membership.start_date ? new Date(`${String(membership.start_date).slice(0, 10)}T00:00:00`) : null;
  const daysUntilEnd = endDate
    ? Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  if (membership.status === 'cancelled') {
    return 'other';
  }

  if (membership.status === 'expired' || (endDate && endDate < today)) {
    return 'expired';
  }

  const normalizedExpiryAlertDays = Number.isFinite(expiryAlertDays)
    ? Math.max(0, Number(expiryAlertDays))
    : 7;

  if (
    membership.status !== 'cancelled' &&
    daysUntilEnd !== null &&
    daysUntilEnd >= 0 &&
    daysUntilEnd <= normalizedExpiryAlertDays
  ) {
    return 'expiring';
  }

  const isActiveWindow = startDate && endDate && startDate <= today && endDate >= today;
  if (membership.status === 'active' || isActiveWindow) {
    return 'active';
  }

  return 'other';
}

function getMembershipExportRows(memberships = []) {
  return memberships.map((membership) => ({
    Cliente: `${membership.client_first_name || ''} ${membership.client_last_name || ''}`.trim() || '--',
    Codigo: membership.client_code || '--',
    Plan: membership.plan_name || '--',
    Vence: formatDate(membership.end_date),
    Estado: membership.status || '--',
    Saldo: formatCurrency(membership.balance_due || 0),
    Telefono: membership.client_phone || '--'
  }));
}

function exportMembershipsToExcel(memberships, sheetName, fileName) {
  const rows = getMembershipExportRows(memberships);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}_${getExportStamp()}.xlsx`);
}

function exportMembershipsToPdf(memberships, title, fileName) {
  const rows = getMembershipExportRows(memberships);
  const columns = ['Cliente', 'Codigo', 'Plan', 'Vence', 'Estado', 'Saldo', 'Telefono'];
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;
  const rowHeight = 18;
  const usableWidth = pageWidth - margin * 2;
  const colWidth = usableWidth / columns.length;
  let y = margin;

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, margin, y);
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

  rows.forEach((row) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    columns.forEach((column, index) => {
      const text = doc.splitTextToSize(String(row[column] ?? '--'), colWidth - 6)[0] || '--';
      doc.text(text, margin + index * colWidth + 2, y);
    });

    y += rowHeight;
  });

  doc.save(`${fileName}_${getExportStamp()}.pdf`);
}

function buildMembershipWhatsAppUrl(membership, segment) {
  const phone = normalizePhoneForWhatsApp(membership.client_phone);

  if (!phone) {
    return '';
  }

  const segmentMessages = {
    expired: 'tu membresia ya vencio y queremos ayudarte a renovarla hoy',
    expiring: 'tu membresia esta por vencer en pocos dias y podemos renovarla rapido',
    active: 'queriamos recordarte que ya puedes dejar lista tu renovacion para no perder continuidad'
  };

  const text = `Hola ${membership.client_first_name || ''}, ${segmentMessages[segment] || 'queremos compartirte una actualizacion de tu membresia'} en el gimnasio.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function sumSeries(series = []) {
  return series.reduce((total, item) => total + Number(item.total_checkins || item.value || 0), 0);
}

function formatDelta(currentValue, comparisonValue, suffix = '') {
  const current = Number(currentValue || 0);
  const comparison = Number(comparisonValue || 0);
  const difference = current - comparison;

  if (comparison === 0) {
    if (current === 0) {
      return `Sin movimiento${suffix}`;
    }

    return `+${current}${suffix} desde base cero`;
  }

  if (difference === 0) {
    return `Igual${suffix}`;
  }

  return `${difference > 0 ? '+' : ''}${difference}${suffix}`;
}

function findPeakEntry(series = []) {
  return series.reduce((peak, item) => {
    const currentValue = Number(item.total_checkins || item.value || 0);
    const peakValue = Number(peak?.total_checkins || peak?.value || -1);

    if (!peak || currentValue > peakValue) {
      return item;
    }

    return peak;
  }, null);
}

function getHourlyComparisonSummary(todaySeries = [], yesterdaySeries = [], historicalSeries = []) {
  const historicalMap = new Map(
    historicalSeries.map((item) => [Number(item.hour_of_day), Number(item.total_checkins || 0)])
  );
  const currentHour = new Date().getHours();
  const lowTrafficHours = todaySeries
    .filter((item) => Number(item.hour_of_day) <= currentHour)
    .map((item) => ({
      hour_of_day: Number(item.hour_of_day),
      total_checkins: Number(item.total_checkins || 0),
      historical_average: historicalMap.get(Number(item.hour_of_day)) || 0
    }))
    .sort((left, right) => {
      if (left.total_checkins !== right.total_checkins) {
        return left.total_checkins - right.total_checkins;
      }

      if (left.historical_average !== right.historical_average) {
        return right.historical_average - left.historical_average;
      }

      return left.hour_of_day - right.hour_of_day;
    })
    .slice(0, 3);

  const todayPeak = findPeakEntry(todaySeries);
  const yesterdayPeak = findPeakEntry(yesterdaySeries);

  return {
    lowTrafficHours,
    todayPeak,
    yesterdayPeak
  };
}

function getHeatmapOpacity(value, maxValue) {
  if (!maxValue) {
    return 0.12;
  }

  return 0.12 + (Number(value || 0) / maxValue) * 0.88;
}

function ComparisonBarChart({ currentData = [], comparisonData = [], emptyLabel = 'Sin datos' }) {
  if (!currentData.length || !comparisonData.length) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-[1.5rem] border border-dashed border-brand-sand/70 bg-brand-cream/25 text-sm text-brand-forest/60">
        {emptyLabel}
      </div>
    );
  }

  const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const maxValue = Math.max(
    ...currentData.map((item) => Number(item.value || 0)),
    ...comparisonData.map((item) => Number(item.value || 0)),
    1
  );
  const groupWidth = innerWidth / currentData.length;
  const barWidth = Math.max(6, Math.min(18, (groupWidth - 8) / 2));
  const labelStep = currentData.length > 20 ? 4 : currentData.length > 10 ? 2 : 1;
  const yTicks = Array.from({ length: 5 }, (_item, index) => {
    const ratio = index / 4;
    return {
      y: CHART_PADDING.top + innerHeight * ratio,
      value: Math.round(maxValue * (1 - ratio))
    };
  });

  return (
    <div className="rounded-[1.5rem] border border-brand-sand/70 bg-brand-cream/20 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand-forest/65">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-clay" />
          Periodo actual
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-sand" />
          Periodo anterior
        </span>
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-[280px] w-full" role="img">
        {yTicks.map((tick) => (
          <g key={`tick-${tick.y}`}>
            <line
              x1={CHART_PADDING.left}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y1={tick.y}
              y2={tick.y}
              stroke="rgba(109, 139, 90, 0.14)"
              strokeWidth="1"
            />
            <text
              x={CHART_PADDING.left - 10}
              y={tick.y + 4}
              fill="rgba(47, 60, 43, 0.72)"
              fontSize="11"
              textAnchor="end"
            >
              {tick.value}
            </text>
          </g>
        ))}

        {currentData.map((item, index) => {
          const comparison = comparisonData[index] || { value: 0, fullLabel: item.fullLabel };
          const xBase = CHART_PADDING.left + groupWidth * index + groupWidth / 2;
          const currentValue = Number(item.value || 0);
          const comparisonValue = Number(comparison.value || 0);
          const currentHeight = (currentValue / maxValue) * innerHeight;
          const comparisonHeight = (comparisonValue / maxValue) * innerHeight;

          return (
            <g key={item.fullLabel}>
              <rect
                x={xBase - barWidth - 2}
                y={CHART_PADDING.top + innerHeight - comparisonHeight}
                width={barWidth}
                height={Math.max(comparisonHeight, 2)}
                rx="8"
                fill="#dcc9a4"
              >
                <title>{`${comparison.fullLabel}: ${comparisonValue} check-ins`}</title>
              </rect>
              <rect
                x={xBase + 2}
                y={CHART_PADDING.top + innerHeight - currentHeight}
                width={barWidth}
                height={Math.max(currentHeight, 2)}
                rx="8"
                fill="#c96b49"
              >
                <title>{`${item.fullLabel}: ${currentValue} check-ins`}</title>
              </rect>
              {index % labelStep === 0 || index === currentData.length - 1 ? (
                <text
                  x={xBase}
                  y={CHART_HEIGHT - 12}
                  fill="rgba(47, 60, 43, 0.72)"
                  fontSize="11"
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HourlyHeatmap({ rows = [], emptyLabel = 'Sin datos' }) {
  const maxValue = Math.max(
    ...rows.flatMap((row) => row.values.map((item) => Number(item.value || 0))),
    0
  );

  if (!rows.length || !maxValue) {
    return (
      <div className="flex h-[210px] items-center justify-center rounded-[1.5rem] border border-dashed border-brand-sand/70 bg-brand-cream/25 text-sm text-brand-forest/60">
        {emptyLabel}
      </div>
    );
  }

  const innerWidth = HEATMAP_WIDTH - HEATMAP_PADDING.left - HEATMAP_PADDING.right;
  const cellWidth = innerWidth / 24;
  const rowHeight = 38;

  return (
    <div className="rounded-[1.5rem] border border-brand-sand/70 bg-brand-cream/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-brand-forest/65">
        <span>Pasa el cursor sobre cada bloque para ver el detalle por hora.</span>
        <span className="font-semibold uppercase tracking-[0.18em]">Bajo → Alto</span>
      </div>

      <svg viewBox={`0 0 ${HEATMAP_WIDTH} ${HEATMAP_HEIGHT}`} className="h-[210px] w-full" role="img">
        {Array.from({ length: 24 }, (_item, index) => (
          <text
            key={`hour-${index}`}
            x={HEATMAP_PADDING.left + cellWidth * index + cellWidth / 2}
            y={16}
            fill="rgba(47, 60, 43, 0.72)"
            fontSize="10"
            textAnchor="middle"
          >
            {index % 2 === 0 ? formatHourLabel(index).replace(':00', '') : ''}
          </text>
        ))}

        {rows.map((row, rowIndex) => (
          <g key={row.label}>
            <text
              x={HEATMAP_PADDING.left - 12}
              y={HEATMAP_PADDING.top + rowHeight * rowIndex + 24}
              fill="rgba(47, 60, 43, 0.82)"
              fontSize="12"
              fontWeight="700"
              textAnchor="end"
            >
              {row.label}
            </text>
            {row.values.map((item, index) => (
              <rect
                key={`${row.label}-${item.label}`}
                x={HEATMAP_PADDING.left + cellWidth * index + 2}
                y={HEATMAP_PADDING.top + rowHeight * rowIndex}
                width={cellWidth - 4}
                height={28}
                rx="8"
                fill={row.color}
                opacity={getHeatmapOpacity(item.value, maxValue)}
                stroke={item.highlight ? '#2f3c2b' : 'transparent'}
                strokeWidth={item.highlight ? 2 : 0}
              >
                <title>{item.tooltip}</title>
              </rect>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function DashboardPage() {
  const { settings } = useSettings();
  const [membershipsSummary, setMembershipsSummary] = useState(null);
  const [memberships, setMemberships] = useState(null);
  const [photoViewerSrc, setPhotoViewerSrc] = useState('');
  const [photoViewerAlt, setPhotoViewerAlt] = useState('Foto de cliente');
  const [salesSummary, setSalesSummary] = useState(null);
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [attendanceDays, setAttendanceDays] = useState(7);
  const [membershipSearch, setMembershipSearch] = useState({
    expired: '',
    expiring: '',
    active: ''
  });
  const [membershipPages, setMembershipPages] = useState({
    expired: 1,
    expiring: 1,
    active: 1
  });
  const [attendanceTrends, setAttendanceTrends] = useState({
    daily: [],
    daily_previous: [],
    hourly_today: [],
    hourly_yesterday: [],
    hourly_historical_average: []
  });

  useEffect(() => {
    let isMounted = true;

    async function loadMembershipInsights() {
      try {
        const [summaryResponse, membershipsResponse] = await Promise.all([
          apiGet('/memberships/summary'),
          apiGet('/memberships?limit=30')
        ]);

        if (isMounted) {
          setMembershipsSummary(summaryResponse || null);
          setMemberships(membershipsResponse || null);
        }
      } catch (_error) {
        if (isMounted) {
          setMembershipsSummary(null);
          setMemberships(null);
        }
      }
    }

    function handleFocusRefresh() {
      loadMembershipInsights();
    }

    loadMembershipInsights();
    const intervalId = window.setInterval(loadMembershipInsights, 30000);
    window.addEventListener('focus', handleFocusRefresh);
    document.addEventListener('visibilitychange', handleFocusRefresh);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocusRefresh);
      document.removeEventListener('visibilitychange', handleFocusRefresh);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSalesSummary() {
      try {
        const response = await apiGet('/sales/summary');

        if (isMounted) {
          setSalesSummary(response || null);
        }
      } catch (_error) {
        if (isMounted) {
          setSalesSummary(null);
        }
      }
    }

    loadSalesSummary();
    const intervalId = window.setInterval(loadSalesSummary, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadAttendanceSummary() {
      try {
        const response = await apiGet('/attendance/summary');

        if (isMounted) {
          setAttendanceSummary(response.data || null);
        }
      } catch (_error) {
        if (isMounted) {
          setAttendanceSummary(null);
        }
      }
    }

    loadAttendanceSummary();
    const intervalId = window.setInterval(loadAttendanceSummary, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadAttendanceTrends() {
      try {
        const response = await apiGet(`/attendance/trends?days=${attendanceDays}`);

        if (isMounted) {
          setAttendanceTrends(
            response.data || {
              daily: [],
              daily_previous: [],
              hourly_today: [],
              hourly_yesterday: [],
              hourly_historical_average: []
            }
          );
        }
      } catch (_error) {
        if (isMounted) {
          setAttendanceTrends({
            daily: [],
            daily_previous: [],
            hourly_today: [],
            hourly_yesterday: [],
            hourly_historical_average: []
          });
        }
      }
    }

    loadAttendanceTrends();
    const intervalId = window.setInterval(loadAttendanceTrends, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [attendanceDays]);

  const dailyChartData = (attendanceTrends.daily || []).map((item) => ({
    label: formatDailyLabel(item.calendar_day),
    fullLabel: formatDate(item.calendar_day),
    value: Number(item.total_checkins || 0)
  }));
  const previousDailyChartData = (attendanceTrends.daily_previous || []).map((item) => ({
    label: formatDailyLabel(item.calendar_day),
    fullLabel: formatDate(item.calendar_day),
    value: Number(item.total_checkins || 0)
  }));
  const todayHourlySeries = (attendanceTrends.hourly_today || []).map((item) => ({
    ...item,
    hour_of_day: Number(item.hour_of_day),
    total_checkins: Number(item.total_checkins || 0)
  }));
  const yesterdayHourlySeries = (attendanceTrends.hourly_yesterday || []).map((item) => ({
    ...item,
    hour_of_day: Number(item.hour_of_day),
    total_checkins: Number(item.total_checkins || 0)
  }));
  const historicalHourlySeries = (attendanceTrends.hourly_historical_average || []).map((item) => ({
    ...item,
    hour_of_day: Number(item.hour_of_day),
    total_checkins: Number(item.total_checkins || 0)
  }));

  const todayAttendanceTotal = sumSeries(todayHourlySeries);
  const yesterdayAttendanceTotal = sumSeries(yesterdayHourlySeries);
  const currentPeriodTotal = sumSeries(dailyChartData);
  const previousPeriodTotal = sumSeries(previousDailyChartData);
  const hourlySummary = getHourlyComparisonSummary(
    todayHourlySeries,
    yesterdayHourlySeries,
    historicalHourlySeries
  );
  const todayPeakHour =
    attendanceSummary?.today_peak_hour ?? hourlySummary.todayPeak?.hour_of_day ?? null;
  const todayPeakCheckins = Number(
    attendanceSummary?.today_peak_checkins ?? hourlySummary.todayPeak?.total_checkins ?? 0
  );
  const historicalPeakHour = attendanceSummary?.historical_peak_hour ?? null;
  const historicalPeakAverage = Number(attendanceSummary?.historical_peak_average_checkins ?? 0);

  const heatmapRows = [
    {
      label: 'Hoy',
      color: '#c96b49',
      values: todayHourlySeries.map((item) => ({
        label: formatHourLabel(item.hour_of_day),
        value: item.total_checkins,
        highlight: Number(item.hour_of_day) === Number(todayPeakHour) && todayPeakCheckins > 0,
        tooltip: `Hoy, ${formatHourLabel(item.hour_of_day)}: ${item.total_checkins} check-ins`
      }))
    },
    {
      label: 'Ayer',
      color: '#dcc9a4',
      values: yesterdayHourlySeries.map((item) => ({
        label: formatHourLabel(item.hour_of_day),
        value: item.total_checkins,
        tooltip: `Ayer, ${formatHourLabel(item.hour_of_day)}: ${item.total_checkins} check-ins`
      }))
    },
    {
      label: 'Prom.',
      color: '#6d8b5a',
      values: historicalHourlySeries.map((item) => ({
        label: formatHourLabel(item.hour_of_day),
        value: Number(item.total_checkins || 0),
        highlight: Number(item.hour_of_day) === Number(historicalPeakHour) && historicalPeakAverage > 0,
        tooltip: `Promedio historico, ${formatHourLabel(item.hour_of_day)}: ${formatOneDecimal(item.total_checkins)} check-ins`
      }))
    }
  ];

  const recentMemberships = memberships?.data || [];
  const parsedExpiryAlertDays = Number(
    membershipsSummary?.data?.membership_expiry_alert_days ?? settings?.membership_expiry_alert_days
  );
  const expiryAlertDays = Number.isFinite(parsedExpiryAlertDays)
    ? Math.max(0, parsedExpiryAlertDays)
    : 7;
  const segmentedMemberships = {
    expired: recentMemberships.filter((membership) => getMembershipSegment(membership, expiryAlertDays) === 'expired'),
    expiring: recentMemberships.filter((membership) => getMembershipSegment(membership, expiryAlertDays) === 'expiring'),
    active: recentMemberships.filter((membership) => getMembershipSegment(membership, expiryAlertDays) === 'active')
  };
  const expiringMembershipCount = segmentedMemberships.expiring.length;

  const membershipBlocks = [
    {
      key: 'expired',
      title: 'Vencidas',
      marker: 'bg-rose-500',
      data: segmentedMemberships.expired
    },
    {
      key: 'expiring',
      title: `Por vencer (${expiryAlertDays} dias)`,
      marker: 'bg-amber-500',
      data: segmentedMemberships.expiring
    },
    {
      key: 'active',
      title: 'Activas',
      marker: 'bg-emerald-500',
      data: segmentedMemberships.active
    }
  ].map((block) => {
    const searchValue = String(membershipSearch[block.key] || '').trim().toLowerCase();
    const filteredData = block.data.filter((membership) => {
      if (!searchValue) {
        return true;
      }

      const fullName = `${membership.client_first_name || ''} ${membership.client_last_name || ''}`.trim().toLowerCase();
      const code = String(membership.client_code || '').toLowerCase();
      const plan = String(membership.plan_name || '').toLowerCase();
      const phone = String(membership.client_phone || '').toLowerCase();
      const status = String(membership.status || '').toLowerCase();

      return (
        fullName.includes(searchValue) ||
        code.includes(searchValue) ||
        plan.includes(searchValue) ||
        phone.includes(searchValue) ||
        status.includes(searchValue)
      );
    });
    const currentPage = membershipPages[block.key] || 1;
    const totalItems = filteredData.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / MEMBERSHIP_BLOCK_PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const paginatedData = filteredData.slice(
      (safePage - 1) * MEMBERSHIP_BLOCK_PAGE_SIZE,
      safePage * MEMBERSHIP_BLOCK_PAGE_SIZE
    );

    return {
      ...block,
      filteredData,
      paginatedData,
      pagination: {
        page: safePage,
        totalItems,
        totalPages,
        limit: MEMBERSHIP_BLOCK_PAGE_SIZE
      }
    };
  });

  function openPhotoViewer(src, alt = 'Foto de cliente') {
    if (!src) {
      return;
    }

    setPhotoViewerSrc(src);
    setPhotoViewerAlt(alt);
  }

  function closePhotoViewer() {
    setPhotoViewerSrc('');
    setPhotoViewerAlt('Foto de cliente');
  }

  return (
    <div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Asistencias hoy"
          value={attendanceSummary?.allowed_today ?? '--'}
          hint={`${yesterdayAttendanceTotal} ayer · ${attendanceSummary?.denied_today ?? 0} rechazados`}
          accent="clay"
        />
        <MetricCard
          label="Ventas del dia"
          value={formatCurrency(salesSummary?.data?.ventas_del_dia ?? salesSummary?.data?.total_income_today ?? 0)}
          hint={`POS ${formatCurrency(salesSummary?.data?.pos_sales_today ?? 0)} · Membresias ${formatCurrency(salesSummary?.data?.memberships_sales_today ?? 0)} · Rutina ${formatCurrency(salesSummary?.data?.daily_pass_sales_today ?? 0)}`}
          accent="cream"
        />
        <MetricCard
          label="Ingresos del dia"
          value={formatCurrency(salesSummary?.data?.ingresos_del_dia ?? salesSummary?.data?.revenue_today ?? 0)}
          hint={`POS ${formatCurrency(salesSummary?.data?.pos_revenue_today ?? salesSummary?.data?.revenue_today ?? 0)} · Membresias ${formatCurrency(salesSummary?.data?.memberships_revenue_today ?? 0)} · Rutina ${formatCurrency(salesSummary?.data?.daily_pass_revenue_today ?? 0)}`}
        />
        <MetricCard
          label="Impuestos"
          value={formatCurrency(salesSummary?.data?.impuestos_del_dia ?? 0)}
          hint={`POS ${formatCurrency(salesSummary?.data?.pos_tax_today ?? 0)} · Membresias ${formatCurrency(salesSummary?.data?.memberships_tax_today ?? 0)} · Rutina ${formatCurrency(salesSummary?.data?.daily_pass_tax_today ?? 0)}`}
          accent="cream"
        />
        <MetricCard
          label="Clientes en el gym"
          value={attendanceSummary?.current_inside_estimate ?? '--'}
          hint={`Estimado en tiempo real segun ultimos ${attendanceSummary?.current_inside_window_minutes ?? 120} min`}
        />
        <MetricCard
          label="Membresias por vencer"
          value={expiringMembershipCount}
          hint={`Proximos ${expiryAlertDays} dias`}
          accent="clay"
        />
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Hora pico hoy"
          value={todayPeakHour !== null ? formatHourLabel(todayPeakHour) : '--'}
          hint={`Hoy ${todayPeakCheckins} ingresos · promedio ${historicalPeakHour !== null ? formatHourLabel(historicalPeakHour) : '--'}`}
        />
        <MetricCard
          label="Promedio diario (7 dias)"
          value={attendanceSummary ? formatAverageDailyAttendance(attendanceSummary.average_daily_last_7_days) : '--'}
          hint="Check-ins permitidos de la ultima semana"
          accent="cream"
        />
        <MetricCard
          label="Membresias activas"
          value={membershipsSummary?.data?.active_memberships ?? '--'}
          hint={`${membershipsSummary?.data?.pending_memberships ?? 0} pendientes`}
          accent="clay"
        />
      </section>

      <section className="mt-6">
        <DataPanel
          title="Insights de trafico y asistencia"
          subtitle="Compara contra ayer y contra el comportamiento historico. Los bloques muestran tooltip al pasar el cursor."
        >
          <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
            <div className="space-y-6">
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-brand-forest">Asistencia diaria con comparacion</p>
                    <p className="text-sm text-brand-forest/65">
                      Ultimos {attendanceDays} dias vs los {attendanceDays} anteriores.
                    </p>
                  </div>
                  <div className="inline-flex rounded-2xl border border-brand-sand bg-white p-1">
                    {[7, 30].map((daysOption) => (
                      <button
                        key={daysOption}
                        className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                          attendanceDays === daysOption
                            ? 'bg-brand-moss text-white'
                            : 'text-brand-forest/70'
                        }`}
                        onClick={() => setAttendanceDays(daysOption)}
                        type="button"
                      >
                        {daysOption} dias
                      </button>
                    ))}
                  </div>
                </div>
                <ComparisonBarChart
                  currentData={dailyChartData}
                  comparisonData={previousDailyChartData}
                  emptyLabel="Sin check-ins suficientes para comparar el periodo"
                />
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-brand-forest/72">
                  <span className="rounded-2xl bg-brand-cream px-3 py-2">
                    Periodo actual: {currentPeriodTotal} check-ins
                  </span>
                  <span className="rounded-2xl bg-brand-cream px-3 py-2">
                    Periodo anterior: {previousPeriodTotal} check-ins
                  </span>
                  <span className="rounded-2xl bg-brand-cream px-3 py-2">
                    Variacion: {formatDelta(currentPeriodTotal, previousPeriodTotal, ' check-ins')}
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-4">
                  <p className="text-base font-semibold text-brand-forest">Horas con mas trafico hoy</p>
                  <p className="text-sm text-brand-forest/65">
                    Heatmap por hora: hoy vs ayer vs promedio de las ultimas 4 semanas.
                  </p>
                </div>
                <HourlyHeatmap rows={heatmapRows} emptyLabel="Todavia no hay check-ins suficientes para mapear el trafico" />
              </div>
            </div>

            <div className="grid gap-4 content-start">
              <div className="rounded-[1.5rem] border border-brand-sand/70 bg-brand-cream/35 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Hora pico hoy vs promedio</p>
                <p className="mt-3 text-lg font-semibold text-brand-forest">
                  Hoy: {todayPeakHour !== null ? formatHourLabel(todayPeakHour) : '--'} ({todayPeakCheckins})
                </p>
                <p className="mt-2 text-sm text-brand-forest/75">
                  Promedio historico: {historicalPeakHour !== null ? formatHourLabel(historicalPeakHour) : '--'} ({formatOneDecimal(historicalPeakAverage)})
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-brand-sand/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Ritmo frente a ayer</p>
                <p className="mt-3 text-lg font-semibold text-brand-forest">
                  {todayAttendanceTotal} hoy vs {yesterdayAttendanceTotal} ayer
                </p>
                <p className="mt-2 text-sm text-brand-forest/75">
                  Diferencia: {formatDelta(todayAttendanceTotal, yesterdayAttendanceTotal, ' check-ins')}
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-brand-sand/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Horas muertas para promociones</p>
                {hourlySummary.lowTrafficHours.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hourlySummary.lowTrafficHours.map((item) => (
                      <span
                        key={`dead-hour-${item.hour_of_day}`}
                        className="rounded-full bg-brand-cream px-3 py-2 text-sm font-semibold text-brand-forest"
                        title={`Hoy ${item.total_checkins} check-ins · promedio ${formatOneDecimal(item.historical_average)}`}
                      >
                        {formatHourLabel(item.hour_of_day)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-brand-forest/75">
                    No hay suficientes horas flojas hoy para sugerir una promocion inmediata.
                  </p>
                )}
                <p className="mt-3 text-sm text-brand-forest/70">
                  Prioriza mensajes, promos relampago o tareas internas en estas franjas.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-brand-sand/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Lectura rapida</p>
                <p className="mt-3 text-sm text-brand-forest/75">
                  El patron diario va {formatDelta(currentPeriodTotal, previousPeriodTotal, ' check-ins')} contra el bloque anterior de {attendanceDays} dias.
                </p>
                <p className="mt-2 text-sm text-brand-forest/75">
                  Si la hora pico de hoy cae antes del promedio historico, conviene anticipar personal y limpieza.
                </p>
              </div>
            </div>
          </div>
        </DataPanel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <DataPanel
          title="Membresias recientes con accion"
          subtitle="Segmentadas para priorizar vencidas, por vencer y activas, con contacto rapido y renovacion."
        >
          {recentMemberships.length ? (
            <div className="space-y-5">
              {membershipBlocks.map((block) => (
                <div key={block.key} className="rounded-2xl border border-brand-sand/70 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${block.marker}`} />
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-forest">{block.title}</p>
                      <span className="rounded-full bg-brand-cream px-2 py-1 text-xs font-semibold text-brand-forest/75">
                        {block.filteredData.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
                        disabled={!block.filteredData.length}
                        onClick={() =>
                          exportMembershipsToExcel(
                            block.filteredData,
                            block.title,
                            `dashboard_membresias_${block.key}`
                          )
                        }
                        type="button"
                      >
                        Exportar Excel
                      </button>
                      <button
                        className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest disabled:opacity-60"
                        disabled={!block.filteredData.length}
                        onClick={() =>
                          exportMembershipsToPdf(
                            block.filteredData,
                            `Membresias ${block.title}`,
                            `dashboard_membresias_${block.key}`
                          )
                        }
                        type="button"
                      >
                        Exportar PDF
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <input
                      className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3 text-sm"
                      onChange={(event) => {
                        const value = event.target.value;
                        setMembershipSearch((current) => ({
                          ...current,
                          [block.key]: value
                        }));
                        setMembershipPages((current) => ({
                          ...current,
                          [block.key]: 1
                        }));
                      }}
                      placeholder="Buscar por cliente, codigo, plan, telefono o estado"
                      value={membershipSearch[block.key] || ''}
                    />
                  </div>

                  {block.filteredData.length ? (
                    <div className="space-y-3">
                      {block.paginatedData.map((membership) => {
                        const whatsappUrl = buildMembershipWhatsAppUrl(membership, block.key);

                        return (
                          <div
                            key={membership.id}
                            className="flex flex-col gap-3 rounded-2xl border border-brand-sand/60 px-4 py-4 md:flex-row md:items-center md:justify-between"
                          >
                            <div className="flex items-start gap-3">
                              {membership.client_photo_url ? (
                                <img
                                  alt={`${membership.client_first_name || ''} ${membership.client_last_name || ''}`.trim() || 'Cliente'}
                                  className="h-12 w-12 cursor-zoom-in rounded-full border border-brand-sand/70 object-cover"
                                  onClick={() =>
                                    openPhotoViewer(
                                      membership.client_photo_url,
                                      `${membership.client_first_name || ''} ${membership.client_last_name || ''}`.trim() || 'Foto de cliente'
                                    )
                                  }
                                  src={membership.client_photo_url}
                                />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-sand/70 bg-brand-cream/70 text-sm font-semibold uppercase text-brand-forest">
                                  {`${membership.client_first_name?.[0] || ''}${membership.client_last_name?.[0] || ''}` || '--'}
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-semibold text-brand-forest">
                                  {membership.client_first_name} {membership.client_last_name}
                                </p>
                                <p className="mt-1 text-sm text-brand-forest/70">
                                  {membership.plan_name} · vence {formatDate(membership.end_date)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                              <p className="text-sm font-semibold text-brand-clay">
                                {formatCurrency(membership.balance_due)}
                              </p>
                              <StatusBadge value={membership.status} />
                              {whatsappUrl ? (
                                <a
                                  className="rounded-xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest"
                                  href={whatsappUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Enviar WhatsApp
                                </a>
                              ) : (
                                <span className="rounded-xl border border-brand-sand/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest/50">
                                  Sin telefono
                                </span>
                              )}
                              <a
                                className="rounded-xl bg-brand-cream px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-clay"
                                href={buildRenewMembershipUrl(membership)}
                              >
                                Renovar
                              </a>
                            </div>
                          </div>
                        );
                      })}
                      <Pagination
                        currentPage={block.pagination.page}
                        itemLabel="membresias"
                        onPageChange={(page) =>
                          setMembershipPages((current) => ({
                            ...current,
                            [block.key]: page
                          }))
                        }
                        pageSize={block.pagination.limit}
                        totalItems={block.pagination.totalItems}
                        totalPages={block.pagination.totalPages}
                      />
                    </div>
                  ) : (
                    <p className="rounded-xl bg-brand-cream/60 px-3 py-3 text-sm text-brand-forest/70">
                      No hay membresias en este bloque.
                    </p>
                  )}
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
                Verificar membresias activas antes del check-in y revisar vencimientos del dia.
              </p>
            </div>
            <div className="rounded-2xl bg-brand-cream p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-moss">Promociones</p>
              <p className="mt-2 text-sm text-brand-forest/80">
                Usa las horas muertas detectadas para activar promos o llamadas de renovacion.
              </p>
            </div>
            <div className="rounded-2xl bg-brand-cream p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-moss">Caja</p>
              <p className="mt-2 text-sm text-brand-forest/80">
                Cruza ingresos de hoy con trafico real para detectar horas de mayor conversion.
              </p>
            </div>
          </div>
        </DataPanel>
      </section>

      {photoViewerSrc ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={closePhotoViewer}
          role="presentation"
        >
          <div className="relative max-h-[90vh] w-full max-w-5xl" onClick={(event) => event.stopPropagation()} role="presentation">
            <button
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold uppercase tracking-[0.12em] text-white"
              onClick={closePhotoViewer}
              type="button"
            >
              Cerrar
            </button>
            <img
              alt={photoViewerAlt}
              className="max-h-[90vh] w-full rounded-2xl object-contain"
              src={photoViewerSrc}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
