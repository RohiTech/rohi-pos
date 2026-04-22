
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Router } from 'express';
import { query } from '../config/db.js';
import { buildCashSessionSummary } from './cash-register.routes.js';

const reportsRouter = Router();
const DEFAULT_TIME_ZONE = 'America/Managua';

function isValidTimeZone(value) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch (_error) {
    return false;
  }
}

async function getSystemTimeZone() {
  const result = await query(
    `SELECT setting_value
     FROM system_settings
     WHERE setting_key = 'time_zone'
     LIMIT 1`
  );

  const requestedTimeZone = String(result.rows[0]?.setting_value || '').trim();
  return isValidTimeZone(requestedTimeZone) ? requestedTimeZone : DEFAULT_TIME_ZONE;
}

function getCurrentDateInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function getImageBufferFromDataUrl(dataUrl) {
  const value = String(dataUrl || '').trim();
  const match = value.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);

  if (!match) {
    return null;
  }

  try {
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], 'base64')
    };
  } catch (_error) {
    return null;
  }
}

function inferMembershipStatus(startDate, endDate, persistedStatus) {
  if (!startDate || !endDate) {
    return persistedStatus || 'sin membresia';
  }

  if (persistedStatus === 'cancelled') {
    return 'cancelada';
  }

  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (today < start) {
    return 'pendiente';
  }

  if (today > end) {
    return 'expirada';
  }

  return 'activa';
}

function normalizeMembershipStatusLabel(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active') {
    return 'activa';
  }
  if (value === 'pending') {
    return 'pendiente';
  }
  if (value === 'expired') {
    return 'expirada';
  }
  if (value === 'cancelled') {
    return 'cancelada';
  }
  return value || 'sin estado';
}

function normalizePlanInterval(monthRaw) {
  const month = String(monthRaw || '').trim();
  if (!month) {
    return null;
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return 'invalid';
  }

  const [year, monthPart] = month.split('-').map((value) => Number.parseInt(value, 10));
  if (!Number.isInteger(year) || !Number.isInteger(monthPart) || monthPart < 1 || monthPart > 12) {
    return 'invalid';
  }

  const startDate = `${String(year).padStart(4, '0')}-${String(monthPart).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(year, monthPart, 0)).toISOString().slice(0, 10);

  return { startDate, endDate, month };
}

function normalizeInventoryMovementTypeLabel(movementType) {
  const value = String(movementType || '').toLowerCase();
  if (value === 'purchase') {
    return 'compra';
  }
  if (value === 'sale') {
    return 'venta';
  }
  if (value === 'adjustment_in') {
    return 'ajuste entrada';
  }
  if (value === 'adjustment_out') {
    return 'ajuste salida';
  }
  if (value === 'return') {
    return 'devolucion';
  }
  return value || 'sin tipo';
}

// Reporte de ventas por producto en PDF
reportsRouter.get('/product-sales/pdf', async (req, res, next) => {
  console.log('Usuario autenticado en /product-sales/pdf:', req.user);
  try {
    const { fechaInicio, fechaFin, category_id, product_id, product_search } = req.query;
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const categoryId = category_id ? Number.parseInt(String(category_id), 10) : null;
    if (category_id && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      return res.status(400).json({ message: 'category_id debe ser un entero positivo' });
    }

    const productId = product_id ? Number.parseInt(String(product_id), 10) : null;
    if (product_id && (!Number.isInteger(productId) || productId <= 0)) {
      return res.status(400).json({ message: 'product_id debe ser un entero positivo' });
    }

    const productSearch = String(product_search || '').trim();
    const conditions = ["s.sold_at::date BETWEEN $1 AND $2", "s.status = 'completed'"];
    const sqlParams = [fechaInicio, fechaFin];

    if (categoryId) {
      sqlParams.push(categoryId);
      conditions.push(`p.category_id = $${sqlParams.length}`);
    }

    if (productId) {
      sqlParams.push(productId);
      conditions.push(`p.id = $${sqlParams.length}`);
    } else if (productSearch) {
      sqlParams.push(`%${productSearch}%`);
      conditions.push(`(p.name ILIKE $${sqlParams.length} OR COALESCE(p.sku, '') ILIKE $${sqlParams.length})`);
    }

    // Query para ventas por producto
    const { rows } = await query(
      `SELECT p.name AS producto, SUM(si.quantity) AS cantidad_vendida, SUM(si.line_total) AS total_vendido
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       JOIN sales s ON si.sale_id = s.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY p.name
       ORDER BY total_vendido DESC`
      , sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    // Crear PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas_por_producto.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Ventas por Producto', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${fechaInicio}  Hasta: ${fechaFin}`, 20);
    const appliedFilters = [];
    if (categoryId) {
      appliedFilters.push(`Categoria ID: ${categoryId}`);
    }
    if (productId) {
      appliedFilters.push(`Producto ID: ${productId}`);
    } else if (productSearch) {
      appliedFilters.push(`Busqueda de producto: ${productSearch}`);
    }
    doc.text(`Filtros: ${appliedFilters.join(' | ') || 'Sin filtros adicionales'}`, 20);
    doc.moveDown();

    if (rows.length === 0) {
      doc.text('No hay ventas registradas para el rango de fechas.');
    } else {
      const startY = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('Producto', 20, startY, { width: 200, align: 'left' });
      doc.text('Cantidad', 220, startY, { width: 100, align: 'right' });
      doc.text('Total vendido (C$)', 320, startY, { width: 150, align: 'right' });
      doc.moveDown(1);
      doc.font('Helvetica');
      rows.forEach(row => {
        const y = doc.y;
        doc.text(row.producto, 20, y, { width: 200, align: 'left' });
        doc.text(Number(row.cantidad_vendida).toFixed(2), 220, y, { width: 100, align: 'right' });
        doc.text(`C$${Number(row.total_vendido).toFixed(2)}`, 320, y, { width: 150, align: 'right' });
        doc.moveDown(0.5);
      });
    }

    // Pie de página personalizado
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Página: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Ventas por Producto', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    console.log('PDF generado correctamente para ventas por producto');
    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/daily-sales/pdf', async (req, res, next) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      cashier_user_id: cashierUserIdRaw,
      status: saleStatusRaw,
      cash_register_session_id: cashSessionIdRaw,
      source_type: sourceTypeRaw
    } = req.query;

    const systemTimeZone = await getSystemTimeZone();
    const today = getCurrentDateInTimeZone(systemTimeZone);
    const startDate = String(fechaInicio || today);
    const endDate = String(fechaFin || startDate);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const allowedStatuses = new Set(['pending', 'completed', 'cancelled']);
    const saleStatus = String(saleStatusRaw || '').trim();
    if (saleStatus && !allowedStatuses.has(saleStatus)) {
      return res.status(400).json({ message: 'status debe ser pending, completed o cancelled' });
    }

    const allowedSourceTypes = new Set(['all', 'pos', 'membership', 'daily_pass']);
    const sourceType = String(sourceTypeRaw || 'all').trim() || 'all';
    if (!allowedSourceTypes.has(sourceType)) {
      return res.status(400).json({ message: 'source_type debe ser all, pos, membership o daily_pass' });
    }

    const cashierUserId = cashierUserIdRaw
      ? Number.parseInt(String(cashierUserIdRaw), 10)
      : null;
    if (cashierUserIdRaw && (!Number.isInteger(cashierUserId) || cashierUserId <= 0)) {
      return res.status(400).json({ message: 'cashier_user_id debe ser un entero positivo' });
    }

    const cashSessionId = cashSessionIdRaw
      ? Number.parseInt(String(cashSessionIdRaw), 10)
      : null;
    if (cashSessionIdRaw && (!Number.isInteger(cashSessionId) || cashSessionId <= 0)) {
      return res.status(400).json({ message: 'cash_register_session_id debe ser un entero positivo' });
    }

    const includeAdditionalIncome = (!saleStatus || saleStatus === 'completed') && !cashSessionId;

    const { rows } = await query(
      `WITH routine_pricing AS (
         SELECT
           COALESCE(
             (
               SELECT CASE
                 WHEN TRIM(setting_value) ~ '^[0-9]+([.][0-9]+)?$'
                   THEN TRIM(setting_value)::numeric(12,2)
                 ELSE 0::numeric(12,2)
               END
               FROM system_settings
               WHERE setting_key = 'routine_base_price'
               LIMIT 1
             ),
             0::numeric(12,2)
           ) AS routine_base_price
       ),
       pos_sales_source AS (
         SELECT
           s.sale_number AS operation_number,
           COALESCE(s.total, 0)::numeric(12,2) AS total,
           COALESCE(s.discount, 0)::numeric(12,2) AS global_discount,
           COALESCE(sa.base_lines_total, 0)::numeric(14,4) AS base_lines_total,
           COALESCE(sa.gross_lines_total, 0)::numeric(14,4) AS gross_lines_total,
           s.sold_at AS operation_at,
           s.cashier_user_id,
           u.username AS cashier_username,
           s.status,
           s.cash_register_session_id,
           'pos'::text AS source_type
         FROM sales s
         LEFT JOIN users u ON u.id = s.cashier_user_id
         LEFT JOIN (
           SELECT
             si.sale_id,
             COALESCE(
               SUM(
                 CASE
                   WHEN si.item_type = 'product' AND COALESCE(p.tax_rate, 0) > 0
                     THEN si.line_total / (1 + COALESCE(p.tax_rate, 0) / 100.0)
                   ELSE si.line_total
                 END
               ),
               0
             )::numeric(14,4) AS base_lines_total,
             COALESCE(SUM(si.line_total), 0)::numeric(14,4) AS gross_lines_total
           FROM sale_items si
           LEFT JOIN products p ON p.id = si.product_id
           GROUP BY si.sale_id
         ) sa ON sa.sale_id = s.id
         WHERE (s.sold_at AT TIME ZONE $7)::date BETWEEN $1::date AND $2::date
           AND ($5::text IS NULL OR s.status = $5::text)
           AND ($5::text IS NOT NULL OR s.status = 'completed')
           AND ($4::bigint IS NULL OR s.cashier_user_id = $4::bigint)
           AND ($6::bigint IS NULL OR s.cash_register_session_id = $6::bigint)
       ),
       pos_sales AS (
         SELECT
           pss.operation_number,
           calc.base_subtotal AS subtotal,
           GREATEST(pss.total - calc.base_subtotal, 0)::numeric(12,2) AS tax,
           pss.total,
           pss.operation_at,
           pss.cashier_user_id,
           pss.cashier_username,
           pss.status,
           pss.cash_register_session_id,
           pss.source_type
         FROM pos_sales_source pss
         CROSS JOIN LATERAL (
           SELECT
             GREATEST(
               CASE
                 WHEN pss.gross_lines_total > 0
                   THEN pss.base_lines_total - (pss.global_discount * (pss.base_lines_total / pss.gross_lines_total))
                 ELSE pss.base_lines_total
               END,
               0
             )::numeric(12,2) AS base_subtotal
         ) calc
       ),
       memberships_income AS (
         SELECT
           p.payment_number AS operation_number,
           CASE
             WHEN COALESCE(mp.tax_rate, 0) > 0
               THEN COALESCE(p.amount, 0) / (1 + COALESCE(mp.tax_rate, 0) / 100.0)
             ELSE COALESCE(p.amount, 0)
           END::numeric(12,2) AS subtotal,
           CASE
             WHEN COALESCE(mp.tax_rate, 0) > 0
               THEN GREATEST(COALESCE(p.amount, 0) - (COALESCE(p.amount, 0) / (1 + COALESCE(mp.tax_rate, 0) / 100.0)), 0)
             ELSE 0::numeric
           END::numeric(12,2) AS tax,
           COALESCE(p.amount, 0)::numeric(12,2) AS total,
           p.paid_at AS operation_at,
           p.received_by_user_id AS cashier_user_id,
           u.username AS cashier_username,
           'completed'::text AS status,
           NULL::bigint AS cash_register_session_id,
           'membership'::text AS source_type
         FROM payments p
         LEFT JOIN memberships m ON m.id = p.membership_id
         LEFT JOIN membership_plans mp ON mp.id = m.plan_id
         LEFT JOIN users u ON u.id = p.received_by_user_id
         WHERE $3::boolean = TRUE
           AND p.membership_id IS NOT NULL
           AND (p.paid_at AT TIME ZONE $7)::date BETWEEN $1::date AND $2::date
           AND ($4::bigint IS NULL OR p.received_by_user_id = $4::bigint)

         UNION ALL

         SELECT
           m.membership_number AS operation_number,
           CASE
             WHEN COALESCE(mp.tax_rate, 0) > 0
               THEN COALESCE(m.amount_paid, 0) / (1 + COALESCE(mp.tax_rate, 0) / 100.0)
             ELSE COALESCE(m.amount_paid, 0)
           END::numeric(12,2) AS subtotal,
           CASE
             WHEN COALESCE(mp.tax_rate, 0) > 0
               THEN GREATEST(COALESCE(m.amount_paid, 0) - (COALESCE(m.amount_paid, 0) / (1 + COALESCE(mp.tax_rate, 0) / 100.0)), 0)
             ELSE 0::numeric
           END::numeric(12,2) AS tax,
           COALESCE(m.amount_paid, 0)::numeric(12,2) AS total,
           m.created_at AS operation_at,
           m.sold_by_user_id AS cashier_user_id,
           u.username AS cashier_username,
           'completed'::text AS status,
           NULL::bigint AS cash_register_session_id,
           'membership'::text AS source_type
         FROM memberships m
         LEFT JOIN membership_plans mp ON mp.id = m.plan_id
         LEFT JOIN users u ON u.id = m.sold_by_user_id
         WHERE $3::boolean = TRUE
           AND m.amount_paid > 0
           AND (m.created_at AT TIME ZONE $7)::date BETWEEN $1::date AND $2::date
           AND ($4::bigint IS NULL OR m.sold_by_user_id = $4::bigint)
           AND NOT EXISTS (
             SELECT 1
             FROM payments p2
             WHERE p2.membership_id = m.id
           )
       ),
       daily_pass_income AS (
         SELECT
           p.payment_number AS operation_number,
           CASE
             WHEN rp.routine_base_price > 0 THEN rp.routine_base_price
             ELSE p.amount
           END::numeric(12,2) AS subtotal,
           CASE
             WHEN rp.routine_base_price > 0 THEN GREATEST(p.amount - rp.routine_base_price, 0)
             ELSE 0::numeric
           END::numeric(12,2) AS tax,
           p.amount AS total,
           p.paid_at AS operation_at,
           p.received_by_user_id AS cashier_user_id,
           u.username AS cashier_username,
           'completed'::text AS status,
           NULL::bigint AS cash_register_session_id,
           'daily_pass'::text AS source_type
         FROM payments p
         LEFT JOIN users u ON u.id = p.received_by_user_id
         CROSS JOIN routine_pricing rp
         WHERE $3::boolean = TRUE
           AND p.payment_number LIKE 'DAY-%'
           AND p.sale_id IS NULL
           AND p.membership_id IS NULL
           AND (p.paid_at AT TIME ZONE $7)::date BETWEEN $1::date AND $2::date
           AND ($4::bigint IS NULL OR p.received_by_user_id = $4::bigint)
       ),
       all_operations AS (
         SELECT * FROM pos_sales
         UNION ALL
         SELECT * FROM memberships_income
         UNION ALL
         SELECT * FROM daily_pass_income
       )
       SELECT *
       FROM all_operations
       WHERE ($8::text = 'all' OR all_operations.source_type = $8::text)
       ORDER BY operation_at DESC`,
      [
        startDate,
        endDate,
        includeAdditionalIncome,
        cashierUserId,
        saleStatus || null,
        cashSessionId,
        systemTimeZone,
        sourceType
      ]
    );

    // Datos de usuario autenticado
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    // Totales
    const totalVentas = rows.length;
    const subtotalTotal = rows.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
    const ivaTotal = rows.reduce((sum, row) => sum + Number(row.tax || 0), 0);
    const montoTotal = rows.reduce((sum, row) => sum + Number(row.total), 0);

    // Crear PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas_diarias.pdf"');
    doc.pipe(res);

    // Encabezado
    doc.fontSize(18).text('Reporte de Ventas Diarias', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    const appliedFilters = [];
    if (saleStatus) {
      appliedFilters.push(`Estado: ${saleStatus}`);
    } else {
      appliedFilters.push('Estado: completed');
    }
    if (cashierUserId) {
      appliedFilters.push(`Cajero ID: ${cashierUserId}`);
    }
    if (cashSessionId) {
      appliedFilters.push(`Sesion caja: ${cashSessionId}`);
    }
    const sourceTypeLabelMap = {
      all: 'Todas',
      pos: 'Solo POS',
      membership: 'Solo membresias',
      daily_pass: 'Solo rutina diaria'
    };
    appliedFilters.push(`Tipo: ${sourceTypeLabelMap[sourceType] || 'Todas'}`);
    doc.text(`Filtros: ${appliedFilters.join(' | ')}`, 20);
    doc.moveDown();

    if (rows.length === 0) {
      doc.text('No hay ventas registradas para hoy.');
    } else {
      const contentBottomY = doc.page.height - 125;
      const rowHeight = 16;

      const drawDailySalesHeader = () => {
        const headerY = doc.y;
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text('N° Venta', 20, headerY, { width: 215, align: 'left', lineBreak: false });
        doc.text('SubTotal', 240, headerY, { width: 65, align: 'right', lineBreak: false });
        doc.text('Impuesto', 310, headerY, { width: 65, align: 'right', lineBreak: false });
        doc.text('Total (C$)', 380, headerY, { width: 65, align: 'right', lineBreak: false });
        doc.text('Fecha y hora', 450, headerY, { width: 105, align: 'left', lineBreak: false });
        doc.y = headerY + 18;
      };

      drawDailySalesHeader();
      doc.font('Helvetica').fontSize(10);

      rows.forEach((row) => {
        if (doc.y + rowHeight > contentBottomY) {
          doc.addPage();
          drawDailySalesHeader();
          doc.font('Helvetica').fontSize(10);
        }

        const y = doc.y;
        const sourceLabel =
          row.source_type === 'membership'
            ? 'Membresia'
            : row.source_type === 'daily_pass'
              ? 'Rutina diaria'
              : 'POS';
        const operationDateText = new Intl.DateTimeFormat('es-NI', {
          timeZone: systemTimeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(new Date(row.operation_at));

        doc.text(`${row.operation_number} (${sourceLabel})`, 20, y, {
          width: 215,
          align: 'left',
          lineBreak: false
        });
        doc.text(`C$${Number(row.subtotal || 0).toFixed(2)}`, 240, y, {
          width: 65,
          align: 'right',
          lineBreak: false
        });
        doc.text(`C$${Number(row.tax || 0).toFixed(2)}`, 310, y, {
          width: 65,
          align: 'right',
          lineBreak: false
        });
        doc.text(`C$${Number(row.total).toFixed(2)}`, 380, y, {
          width: 65,
          align: 'right',
          lineBreak: false
        });
        doc.text(operationDateText, 450, y, { width: 105, align: 'left', lineBreak: false });
        doc.y = y + rowHeight;
      });

      if (doc.y + 24 > contentBottomY) {
        doc.addPage();
      }

      doc.moveDown(1);
      const totalsY = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('Totales:', 20, totalsY, { width: 95, align: 'left' });
      doc.font('Helvetica');
      doc.text(`Cantidad Ventas: ${totalVentas}`, 120, totalsY, { width: 115, align: 'left' });
      doc.text(`C$${subtotalTotal.toFixed(2)}`, 240, totalsY, { width: 65, align: 'right' });
      doc.text(`C$${ivaTotal.toFixed(2)}`, 310, totalsY, { width: 65, align: 'right' });
      doc.text(`C$${montoTotal.toFixed(2)}`, 380, totalsY, { width: 65, align: 'right' });
    }

    // Pie de página personalizado
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      const now = new Date();
      // Lado izquierdo
      doc.fontSize(8).text(`Página: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(
        `Hora Ejec.: ${now.toLocaleTimeString('es-NI', { hour12: false, timeZone: systemTimeZone })}`,
        40,
        bottom + 12,
        { align: 'left' }
      );
      doc.text(
        `Fecha Ejec.: ${now.toLocaleDateString('es-NI', { timeZone: systemTimeZone })}`,
        40,
        bottom + 24,
        { align: 'left' }
      );
      // Centro
      doc.fontSize(9).text('Reporte de Ventas Diarias', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      // Lado derecho
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
      //doc.fontSize(8).text('Módulo: Reportes', doc.page.width - 120, bottom + 12, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/seller-sales/pdf', async (req, res, next) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      seller_user_id: sellerUserIdRaw,
      status: saleStatusRaw,
      cash_register_session_id: cashSessionIdRaw
    } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio);
    const endDate = String(fechaFin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const allowedStatuses = new Set(['pending', 'completed', 'cancelled']);
    const saleStatus = String(saleStatusRaw || '').trim();
    if (saleStatus && !allowedStatuses.has(saleStatus)) {
      return res.status(400).json({ message: 'status debe ser pending, completed o cancelled' });
    }

    const sellerUserId = sellerUserIdRaw
      ? Number.parseInt(String(sellerUserIdRaw), 10)
      : null;
    if (sellerUserIdRaw && (!Number.isInteger(sellerUserId) || sellerUserId <= 0)) {
      return res.status(400).json({ message: 'seller_user_id debe ser un entero positivo' });
    }

    const cashSessionId = cashSessionIdRaw
      ? Number.parseInt(String(cashSessionIdRaw), 10)
      : null;
    if (cashSessionIdRaw && (!Number.isInteger(cashSessionId) || cashSessionId <= 0)) {
      return res.status(400).json({ message: 'cash_register_session_id debe ser un entero positivo' });
    }

    const systemTimeZone = await getSystemTimeZone();

    const includeAdditionalIncome = (!saleStatus || saleStatus === 'completed') && !cashSessionId;

    const { rows } = await query(
      `WITH operations AS (
         SELECT
           s.cashier_user_id AS seller_user_id,
           s.total,
           s.discount,
           s.tax,
           s.sold_at AS operation_at
         FROM sales s
         WHERE (s.sold_at AT TIME ZONE $7)::date BETWEEN $1::date AND $2::date
           AND ($5::text IS NULL OR s.status = $5::text)
           AND ($5::text IS NOT NULL OR s.status = 'completed')
           AND ($4::bigint IS NULL OR s.cashier_user_id = $4::bigint)
           AND ($6::bigint IS NULL OR s.cash_register_session_id = $6::bigint)

         UNION ALL

         SELECT
           p.received_by_user_id AS seller_user_id,
           p.amount AS total,
           0::numeric(12,2) AS discount,
           0::numeric(12,2) AS tax,
           p.paid_at AS operation_at
         FROM payments p
         WHERE $3::boolean = TRUE
           AND p.membership_id IS NOT NULL
           AND (p.paid_at AT TIME ZONE $7)::date BETWEEN $1::date AND $2::date
           AND ($4::bigint IS NULL OR p.received_by_user_id = $4::bigint)

         UNION ALL

         SELECT
           m.sold_by_user_id AS seller_user_id,
           m.amount_paid AS total,
           0::numeric(12,2) AS discount,
           0::numeric(12,2) AS tax,
           m.created_at AS operation_at
         FROM memberships m
         WHERE $3::boolean = TRUE
           AND m.amount_paid > 0
           AND (m.created_at AT TIME ZONE $7)::date BETWEEN $1::date AND $2::date
           AND ($4::bigint IS NULL OR m.sold_by_user_id = $4::bigint)
           AND NOT EXISTS (
             SELECT 1
             FROM payments p2
             WHERE p2.membership_id = m.id
           )

         UNION ALL

         SELECT
           p.received_by_user_id AS seller_user_id,
           p.amount AS total,
           0::numeric(12,2) AS discount,
           0::numeric(12,2) AS tax,
           p.paid_at AS operation_at
         FROM payments p
         WHERE $3::boolean = TRUE
           AND p.payment_number LIKE 'DAY-%'
           AND p.sale_id IS NULL
           AND p.membership_id IS NULL
           AND (p.paid_at AT TIME ZONE $7)::date BETWEEN $1::date AND $2::date
           AND ($4::bigint IS NULL OR p.received_by_user_id = $4::bigint)
       )
       SELECT
         operations.seller_user_id,
         COALESCE(
           NULLIF(u.username, ''),
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
           CONCAT('Usuario #', operations.seller_user_id)
         ) AS seller_name,
         COUNT(*)::int AS total_sales,
         COALESCE(SUM(operations.total), 0)::numeric(12,2) AS total_amount,
         COALESCE(SUM(operations.discount), 0)::numeric(12,2) AS total_discount,
         COALESCE(SUM(operations.tax), 0)::numeric(12,2) AS total_tax,
         COALESCE(AVG(operations.total), 0)::numeric(12,2) AS average_ticket,
         MIN(operations.operation_at) AS first_sale_at,
         MAX(operations.operation_at) AS last_sale_at
       FROM operations
       LEFT JOIN users u ON u.id = operations.seller_user_id
       GROUP BY operations.seller_user_id, seller_name
       ORDER BY total_amount DESC, seller_name ASC`,
      [
        startDate,
        endDate,
        includeAdditionalIncome,
        sellerUserId,
        saleStatus || null,
        cashSessionId,
        systemTimeZone
      ]
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalSales = rows.reduce((sum, row) => sum + Number(row.total_sales || 0), 0);
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const weightedAverageTicket = totalSales > 0 ? totalAmount / totalSales : 0;

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas_por_vendedor.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Ventas por Vendedor', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    const appliedFilters = [];
    if (sellerUserId) {
      appliedFilters.push(`Vendedor ID: ${sellerUserId}`);
    }
    if (saleStatus) {
      appliedFilters.push(`Estado: ${saleStatus}`);
    } else {
      appliedFilters.push('Estado: completed');
    }
    if (cashSessionId) {
      appliedFilters.push(`Sesion caja: ${cashSessionId}`);
    }
    doc.text(`Filtros: ${appliedFilters.join(' | ')}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Vendedores: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Ventas: ${totalSales}`, { continued: true });
    doc.text(`  Total vendido: C$${totalAmount.toFixed(2)}`, { continued: true });
    doc.text(`  Ticket promedio: C$${weightedAverageTicket.toFixed(2)}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay ventas registradas para los filtros seleccionados.');
    } else {
      const startY = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('Vendedor', 20, startY, { width: 190, align: 'left' });
      doc.text('Ventas', 210, startY, { width: 55, align: 'right' });
      doc.text('Total (C$)', 265, startY, { width: 95, align: 'right' });
      doc.text('Ticket prom.', 360, startY, { width: 90, align: 'right' });
      doc.text('Descuento', 450, startY, { width: 90, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica');
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(row.seller_name, 20, y, { width: 190, align: 'left' });
        doc.text(String(row.total_sales || 0), 210, y, { width: 55, align: 'right' });
        doc.text(`C$${Number(row.total_amount || 0).toFixed(2)}`, 265, y, { width: 95, align: 'right' });
        doc.text(`C$${Number(row.average_ticket || 0).toFixed(2)}`, 360, y, { width: 90, align: 'right' });
        doc.text(`C$${Number(row.total_discount || 0).toFixed(2)}`, 450, y, { width: 90, align: 'right' });
        doc.moveDown(0.5);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      const now = new Date();
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(
        `Hora Ejec.: ${now.toLocaleTimeString('es-NI', { hour12: false, timeZone: systemTimeZone })}`,
        40,
        bottom + 12,
        { align: 'left' }
      );
      doc.text(
        `Fecha Ejec.: ${now.toLocaleDateString('es-NI', { timeZone: systemTimeZone })}`,
        40,
        bottom + 24,
        { align: 'left' }
      );
      doc.fontSize(9).text('Reporte de Ventas por Vendedor', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/active-clients/pdf', async (req, res, next) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      search: searchRaw,
      only_with_active_membership: onlyWithActiveMembershipRaw
    } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio);
    const endDate = String(fechaFin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const search = String(searchRaw || '').trim();
    const onlyWithActiveMembership = String(onlyWithActiveMembershipRaw || '').trim() === 'true';

    const conditions = ['c.is_active = TRUE', 'c.join_date BETWEEN $1 AND $2'];
    const sqlParams = [startDate, endDate];

    if (search) {
      sqlParams.push(`%${search}%`);
      conditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR COALESCE(c.email, '') ILIKE $${sqlParams.length} OR COALESCE(c.phone, '') ILIKE $${sqlParams.length})`
      );
    }

    if (onlyWithActiveMembership) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM memberships m2
        WHERE m2.client_id = c.id
          AND m2.status = 'active'
          AND CURRENT_DATE BETWEEN m2.start_date AND m2.end_date
      )`);
    }

    const { rows } = await query(
      `SELECT
         c.id,
         c.client_code,
         c.first_name,
         c.last_name,
         c.email,
         c.phone,
         c.join_date,
         latest_m.membership_number,
         latest_m.status AS membership_status,
         latest_m.end_date AS membership_end_date,
         latest_mp.name AS membership_plan_name,
         EXISTS (
           SELECT 1
           FROM memberships ma
           WHERE ma.client_id = c.id
             AND ma.status = 'active'
             AND CURRENT_DATE BETWEEN ma.start_date AND ma.end_date
         ) AS has_active_membership
       FROM clients c
       LEFT JOIN LATERAL (
         SELECT m.membership_number, m.status, m.end_date, m.plan_id
         FROM memberships m
         WHERE m.client_id = c.id
         ORDER BY m.end_date DESC, m.id DESC
         LIMIT 1
       ) latest_m ON TRUE
       LEFT JOIN membership_plans latest_mp ON latest_mp.id = latest_m.plan_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.join_date DESC, c.id DESC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const withActiveMembershipCount = rows.reduce(
      (sum, row) => sum + (row.has_active_membership ? 1 : 0),
      0
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes_activos.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Clientes Activos', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    const appliedFilters = [];
    if (search) {
      appliedFilters.push(`Busqueda: ${search}`);
    }
    appliedFilters.push(
      onlyWithActiveMembership
        ? 'Solo clientes con membresia activa vigente'
        : 'Todos los clientes activos'
    );
    doc.text(`Filtros: ${appliedFilters.join(' | ')}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Clientes activos: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Con membresia activa: ${withActiveMembershipCount}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay clientes activos para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Codigo', 20, headerY, { width: 70, align: 'left' });
      doc.text('Cliente', 90, headerY, { width: 160, align: 'left' });
      doc.text('Contacto', 250, headerY, { width: 130, align: 'left' });
      doc.text('Fecha ingreso', 380, headerY, { width: 70, align: 'center' });
      doc.text('Membresia', 450, headerY, { width: 90, align: 'center' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const membershipLabel = row.has_active_membership
          ? `Activa (${row.membership_plan_name || 'Plan'})`
          : 'No activa';
        const contactLabel = row.email || row.phone || '--';

        doc.text(row.client_code || `#${row.id}`, 20, y, { width: 70, align: 'left' });
        doc.text(`${row.first_name || ''} ${row.last_name || ''}`.trim(), 90, y, {
          width: 160,
          align: 'left'
        });
        doc.text(contactLabel, 250, y, { width: 130, align: 'left' });
        doc.text(new Date(row.join_date).toLocaleDateString('es-NI'), 380, y, {
          width: 70,
          align: 'center'
        });
        doc.text(membershipLabel, 450, y, { width: 90, align: 'center' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Clientes Activos', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/new-clients/pdf', async (req, res, next) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      search: searchRaw,
      active_status: activeStatusRaw,
      with_membership: withMembershipRaw
    } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio);
    const endDate = String(fechaFin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const search = String(searchRaw || '').trim();
    const activeStatus = String(activeStatusRaw || '').trim();
    if (activeStatus && !['active', 'inactive'].includes(activeStatus)) {
      return res.status(400).json({ message: "active_status debe ser 'active' o 'inactive'" });
    }

    const withMembership = String(withMembershipRaw || '').trim() === 'true';

    const conditions = ['c.join_date BETWEEN $1 AND $2'];
    const sqlParams = [startDate, endDate];

    if (search) {
      sqlParams.push(`%${search}%`);
      conditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR COALESCE(c.email, '') ILIKE $${sqlParams.length} OR COALESCE(c.phone, '') ILIKE $${sqlParams.length})`
      );
    }

    if (activeStatus === 'active') {
      conditions.push('c.is_active = TRUE');
    }
    if (activeStatus === 'inactive') {
      conditions.push('c.is_active = FALSE');
    }

    if (withMembership) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM memberships mx
        WHERE mx.client_id = c.id
      )`);
    }

    const { rows } = await query(
      `SELECT
         c.id,
         c.client_code,
         c.first_name,
         c.last_name,
         c.email,
         c.phone,
         c.join_date,
         c.is_active,
         COALESCE(mb.memberships_count, 0)::int AS memberships_count,
         latest_m.membership_number,
         latest_m.status AS membership_status,
         latest_m.end_date AS membership_end_date,
         latest_mp.name AS membership_plan_name
       FROM clients c
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS memberships_count
         FROM memberships m_count
         WHERE m_count.client_id = c.id
       ) mb ON TRUE
       LEFT JOIN LATERAL (
         SELECT m.membership_number, m.status, m.end_date, m.plan_id
         FROM memberships m
         WHERE m.client_id = c.id
         ORDER BY m.end_date DESC, m.id DESC
         LIMIT 1
       ) latest_m ON TRUE
       LEFT JOIN membership_plans latest_mp ON latest_mp.id = latest_m.plan_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.join_date DESC, c.id DESC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalActive = rows.reduce((sum, row) => sum + (row.is_active ? 1 : 0), 0);
    const totalInactive = rows.length - totalActive;
    const totalWithMembership = rows.reduce(
      (sum, row) => sum + (Number(row.memberships_count || 0) > 0 ? 1 : 0),
      0
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes_nuevos.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Clientes Nuevos', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    const appliedFilters = [];
    if (search) {
      appliedFilters.push(`Busqueda: ${search}`);
    }
    if (activeStatus === 'active') {
      appliedFilters.push('Estado cliente: activo');
    } else if (activeStatus === 'inactive') {
      appliedFilters.push('Estado cliente: inactivo');
    } else {
      appliedFilters.push('Estado cliente: todos');
    }
    if (withMembership) {
      appliedFilters.push('Solo clientes con membresia');
    }
    doc.text(`Filtros: ${appliedFilters.join(' | ')}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Clientes nuevos: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Activos: ${totalActive}`, { continued: true });
    doc.text(`  Inactivos: ${totalInactive}`, { continued: true });
    doc.text(`  Con membresia: ${totalWithMembership}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay clientes nuevos para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Codigo', 20, headerY, { width: 65, align: 'left' });
      doc.text('Cliente', 85, headerY, { width: 150, align: 'left' });
      doc.text('Contacto', 235, headerY, { width: 120, align: 'left' });
      doc.text('Ingreso', 355, headerY, { width: 65, align: 'center' });
      doc.text('Estado', 420, headerY, { width: 50, align: 'center' });
      doc.text('Membresia', 470, headerY, { width: 70, align: 'center' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const contactLabel = row.email || row.phone || '--';
        const membershipLabel = Number(row.memberships_count || 0) > 0
          ? latestMembershipLabel(row.membership_plan_name, row.membership_status)
          : 'Sin membresia';

        doc.text(row.client_code || `#${row.id}`, 20, y, { width: 65, align: 'left' });
        doc.text(`${row.first_name || ''} ${row.last_name || ''}`.trim(), 85, y, {
          width: 150,
          align: 'left'
        });
        doc.text(contactLabel, 235, y, { width: 120, align: 'left' });
        doc.text(new Date(row.join_date).toLocaleDateString('es-NI'), 355, y, {
          width: 65,
          align: 'center'
        });
        doc.text(row.is_active ? 'Activo' : 'Inactivo', 420, y, { width: 50, align: 'center' });
        doc.text(membershipLabel, 470, y, { width: 70, align: 'center' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Clientes Nuevos', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/inactive-clients/pdf', async (req, res, next) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      search: searchRaw,
      with_membership: withMembershipRaw
    } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio);
    const endDate = String(fechaFin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const search = String(searchRaw || '').trim();
    const withMembership = String(withMembershipRaw || '').trim() === 'true';

    const conditions = ['c.is_active = FALSE', 'c.join_date BETWEEN $1 AND $2'];
    const sqlParams = [startDate, endDate];

    if (search) {
      sqlParams.push(`%${search}%`);
      conditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR COALESCE(c.email, '') ILIKE $${sqlParams.length} OR COALESCE(c.phone, '') ILIKE $${sqlParams.length})`
      );
    }

    if (withMembership) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM memberships mx
        WHERE mx.client_id = c.id
      )`);
    }

    const { rows } = await query(
      `SELECT
         c.id,
         c.client_code,
         c.first_name,
         c.last_name,
         c.email,
         c.phone,
         c.join_date,
         COALESCE(mb.memberships_count, 0)::int AS memberships_count,
         latest_m.membership_number,
         latest_m.status AS membership_status,
         latest_m.end_date AS membership_end_date,
         latest_mp.name AS membership_plan_name
       FROM clients c
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS memberships_count
         FROM memberships m_count
         WHERE m_count.client_id = c.id
       ) mb ON TRUE
       LEFT JOIN LATERAL (
         SELECT m.membership_number, m.status, m.end_date, m.plan_id
         FROM memberships m
         WHERE m.client_id = c.id
         ORDER BY m.end_date DESC, m.id DESC
         LIMIT 1
       ) latest_m ON TRUE
       LEFT JOIN membership_plans latest_mp ON latest_mp.id = latest_m.plan_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.join_date DESC, c.id DESC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalWithMembership = rows.reduce(
      (sum, row) => sum + (Number(row.memberships_count || 0) > 0 ? 1 : 0),
      0
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes_inactivos.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Clientes Inactivos', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    const appliedFilters = [];
    if (search) {
      appliedFilters.push(`Busqueda: ${search}`);
    }
    if (withMembership) {
      appliedFilters.push('Solo clientes con membresia');
    }
    doc.text(`Filtros: ${appliedFilters.join(' | ') || 'Sin filtros adicionales'}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Clientes inactivos: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Con membresia: ${totalWithMembership}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay clientes inactivos para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Codigo', 20, headerY, { width: 70, align: 'left' });
      doc.text('Cliente', 90, headerY, { width: 170, align: 'left' });
      doc.text('Contacto', 260, headerY, { width: 130, align: 'left' });
      doc.text('Ingreso', 390, headerY, { width: 70, align: 'center' });
      doc.text('Membresia', 460, headerY, { width: 80, align: 'center' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const contactLabel = row.email || row.phone || '--';
        const membershipLabel = Number(row.memberships_count || 0) > 0
          ? latestMembershipLabel(row.membership_plan_name, row.membership_status)
          : 'Sin membresia';

        doc.text(row.client_code || `#${row.id}`, 20, y, { width: 70, align: 'left' });
        doc.text(`${row.first_name || ''} ${row.last_name || ''}`.trim(), 90, y, {
          width: 170,
          align: 'left'
        });
        doc.text(contactLabel, 260, y, { width: 130, align: 'left' });
        doc.text(new Date(row.join_date).toLocaleDateString('es-NI'), 390, y, {
          width: 70,
          align: 'center'
        });
        doc.text(membershipLabel, 460, y, { width: 80, align: 'center' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Clientes Inactivos', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/memberships-by-client/pdf', async (req, res, next) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      client_search: clientSearchRaw,
      status: membershipStatusRaw,
      plan_id: planIdRaw,
      only_active_clients: onlyActiveClientsRaw
    } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio);
    const endDate = String(fechaFin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const clientSearch = String(clientSearchRaw || '').trim();
    const membershipStatus = String(membershipStatusRaw || '').trim();
    if (membershipStatus && !['pending', 'active', 'expired', 'cancelled'].includes(membershipStatus)) {
      return res.status(400).json({ message: 'status debe ser pending, active, expired o cancelled' });
    }

    const planId = planIdRaw ? Number.parseInt(String(planIdRaw), 10) : null;
    if (planIdRaw && (!Number.isInteger(planId) || planId <= 0)) {
      return res.status(400).json({ message: 'plan_id debe ser un entero positivo' });
    }

    const onlyActiveClients = String(onlyActiveClientsRaw || '').trim() === 'true';

    const conditions = ['m.start_date BETWEEN $1 AND $2'];
    const sqlParams = [startDate, endDate];

    if (clientSearch) {
      sqlParams.push(`%${clientSearch}%`);
      conditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR COALESCE(c.email, '') ILIKE $${sqlParams.length} OR COALESCE(c.phone, '') ILIKE $${sqlParams.length})`
      );
    }

    if (membershipStatus) {
      sqlParams.push(membershipStatus);
      conditions.push(`m.status = $${sqlParams.length}`);
    }

    if (planId) {
      sqlParams.push(planId);
      conditions.push(`m.plan_id = $${sqlParams.length}`);
    }

    if (onlyActiveClients) {
      conditions.push('c.is_active = TRUE');
    }

    const { rows } = await query(
      `SELECT
         m.id,
         m.membership_number,
         m.start_date,
         m.end_date,
         m.status,
         m.price,
         m.discount,
         m.amount_paid,
         (m.price - m.discount - m.amount_paid) AS balance_due,
         m.client_id,
         c.client_code,
         c.first_name,
         c.last_name,
         c.email,
         c.phone,
         c.is_active AS client_is_active,
         mp.name AS plan_name
       FROM memberships m
       INNER JOIN clients c ON c.id = m.client_id
       INNER JOIN membership_plans mp ON mp.id = m.plan_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.last_name ASC, c.first_name ASC, m.start_date DESC, m.id DESC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.price || 0), 0);
    const totalPaid = rows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
    const totalBalance = rows.reduce((sum, row) => sum + Number(row.balance_due || 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="membresias_por_cliente.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Membresias por Cliente', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    const appliedFilters = [];
    if (clientSearch) {
      appliedFilters.push(`Cliente: ${clientSearch}`);
    }
    if (membershipStatus) {
      appliedFilters.push(`Estado membresia: ${membershipStatus}`);
    }
    if (planId) {
      appliedFilters.push(`Plan ID: ${planId}`);
    }
    if (onlyActiveClients) {
      appliedFilters.push('Solo clientes activos');
    }
    doc.text(`Filtros: ${appliedFilters.join(' | ') || 'Sin filtros adicionales'}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Membresias: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Monto: C$${totalAmount.toFixed(2)}`, { continued: true });
    doc.text(`  Pagado: C$${totalPaid.toFixed(2)}`, { continued: true });
    doc.text(`  Saldo: C$${totalBalance.toFixed(2)}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay membresias para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Cliente', 20, headerY, { width: 150, align: 'left' });
      doc.text('Plan', 170, headerY, { width: 95, align: 'left' });
      doc.text('Estado', 265, headerY, { width: 55, align: 'center' });
      doc.text('Vigencia', 320, headerY, { width: 90, align: 'center' });
      doc.text('Precio', 410, headerY, { width: 45, align: 'right' });
      doc.text('Pagado', 455, headerY, { width: 45, align: 'right' });
      doc.text('Saldo', 500, headerY, { width: 45, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const clientLabel = `${row.client_code || `#${row.client_id}`} - ${`${row.first_name || ''} ${row.last_name || ''}`.trim()}`;

        doc.text(clientLabel, 20, y, { width: 150, align: 'left' });
        doc.text(row.plan_name || '--', 170, y, { width: 95, align: 'left' });
        doc.text(row.status || '--', 265, y, { width: 55, align: 'center' });
        doc.text(
          `${new Date(row.start_date).toLocaleDateString('es-NI')} - ${new Date(row.end_date).toLocaleDateString('es-NI')}`,
          320,
          y,
          { width: 90, align: 'center' }
        );
        doc.text(`C$${Number(row.price || 0).toFixed(2)}`, 410, y, { width: 45, align: 'right' });
        doc.text(`C$${Number(row.amount_paid || 0).toFixed(2)}`, 455, y, { width: 45, align: 'right' });
        doc.text(`C$${Number(row.balance_due || 0).toFixed(2)}`, 500, y, { width: 45, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Membresias por Cliente', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/active-memberships/pdf', async (req, res, next) => {
  try {
    const {
      as_of_date: asOfDateRaw,
      plan_id: planIdRaw,
      search: searchRaw,
      with_balance_only: withBalanceOnlyRaw,
      include_pending: includePendingRaw
    } = req.query;

    const asOfDate = String(asOfDateRaw || new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return res.status(400).json({ message: 'as_of_date debe tener formato YYYY-MM-DD' });
    }

    const planId = planIdRaw ? Number.parseInt(String(planIdRaw), 10) : null;
    if (planIdRaw && (!Number.isInteger(planId) || planId <= 0)) {
      return res.status(400).json({ message: 'plan_id debe ser un entero positivo' });
    }

    const search = String(searchRaw || '').trim();
    const withBalanceOnly = String(withBalanceOnlyRaw || '').trim() === 'true';
    const includePending = String(includePendingRaw || '').trim() === 'true';

    const sqlParams = [asOfDate];
    const conditions = [
      'm.start_date <= $1::date',
      'm.end_date >= $1::date',
      includePending ? "m.status IN ('active', 'pending')" : "m.status = 'active'"
    ];

    if (planId) {
      sqlParams.push(planId);
      conditions.push(`m.plan_id = $${sqlParams.length}`);
    }

    if (search) {
      sqlParams.push(`%${search}%`);
      conditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR m.membership_number ILIKE $${sqlParams.length})`
      );
    }

    if (withBalanceOnly) {
      conditions.push('(m.price - m.discount - m.amount_paid) > 0');
    }

    const { rows } = await query(
      `SELECT
         m.membership_number,
         m.start_date,
         m.end_date,
         m.status,
         m.price,
         m.discount,
         m.amount_paid,
         (m.price - m.discount - m.amount_paid) AS balance_due,
         c.id AS client_id,
         c.client_code,
         c.first_name,
         c.last_name,
         c.is_active AS client_is_active,
         mp.name AS plan_name
       FROM memberships m
       INNER JOIN clients c ON c.id = m.client_id
       INNER JOIN membership_plans mp ON mp.id = m.plan_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.end_date ASC, c.last_name ASC, c.first_name ASC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.price || 0), 0);
    const totalPaid = rows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
    const totalBalance = rows.reduce((sum, row) => sum + Number(row.balance_due || 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="membresias_vigentes.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Membresias Vigentes', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Corte: ${asOfDate}`, 20);
    const filters = [];
    if (planId) {
      filters.push(`Plan ID: ${planId}`);
    }
    if (search) {
      filters.push(`Busqueda: ${search}`);
    }
    if (withBalanceOnly) {
      filters.push('Solo con saldo pendiente');
    }
    filters.push(includePending ? 'Incluye pendientes' : 'Solo estado activo');
    doc.text(`Filtros: ${filters.join(' | ')}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Membresias: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Monto: C$${totalAmount.toFixed(2)}`, { continued: true });
    doc.text(`  Pagado: C$${totalPaid.toFixed(2)}`, { continued: true });
    doc.text(`  Saldo: C$${totalBalance.toFixed(2)}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay membresias vigentes para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Cliente', 20, headerY, { width: 145, align: 'left' });
      doc.text('Membresia', 165, headerY, { width: 80, align: 'left' });
      doc.text('Plan', 245, headerY, { width: 90, align: 'left' });
      doc.text('Estado', 335, headerY, { width: 55, align: 'center' });
      doc.text('Vence', 390, headerY, { width: 65, align: 'center' });
      doc.text('Pagado', 455, headerY, { width: 45, align: 'right' });
      doc.text('Saldo', 500, headerY, { width: 45, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const clientLabel = `${row.client_code || `#${row.client_id}`} - ${`${row.first_name || ''} ${row.last_name || ''}`.trim()}`;
        doc.text(clientLabel, 20, y, { width: 145, align: 'left' });
        doc.text(row.membership_number || '--', 165, y, { width: 80, align: 'left' });
        doc.text(row.plan_name || '--', 245, y, { width: 90, align: 'left' });
        doc.text(normalizeMembershipStatusLabel(row.status), 335, y, { width: 55, align: 'center' });
        doc.text(new Date(row.end_date).toLocaleDateString('es-NI'), 390, y, {
          width: 65,
          align: 'center'
        });
        doc.text(`C$${Number(row.amount_paid || 0).toFixed(2)}`, 455, y, { width: 45, align: 'right' });
        doc.text(`C$${Number(row.balance_due || 0).toFixed(2)}`, 500, y, { width: 45, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Membresias Vigentes', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/memberships-by-plan/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin, status: statusRaw, plan_id: planIdRaw } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const status = String(statusRaw || '').trim();
    if (status && !['pending', 'active', 'expired', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'status debe ser pending, active, expired o cancelled' });
    }

    const planId = planIdRaw ? Number.parseInt(String(planIdRaw), 10) : null;
    if (planIdRaw && (!Number.isInteger(planId) || planId <= 0)) {
      return res.status(400).json({ message: 'plan_id debe ser un entero positivo' });
    }

    const sqlParams = [startDate, endDate];
    const conditions = ['m.start_date BETWEEN $1 AND $2'];

    if (status) {
      sqlParams.push(status);
      conditions.push(`m.status = $${sqlParams.length}`);
    }

    if (planId) {
      sqlParams.push(planId);
      conditions.push(`m.plan_id = $${sqlParams.length}`);
    }

    const { rows } = await query(
      `SELECT
         mp.id AS plan_id,
         mp.name AS plan_name,
         mp.duration_days,
         COUNT(m.id)::int AS memberships_count,
         COUNT(m.id) FILTER (WHERE m.status = 'active')::int AS active_count,
         COUNT(m.id) FILTER (WHERE m.status = 'pending')::int AS pending_count,
         COUNT(m.id) FILTER (WHERE m.status = 'expired')::int AS expired_count,
         COUNT(m.id) FILTER (WHERE m.status = 'cancelled')::int AS cancelled_count,
         COALESCE(SUM(m.price), 0)::numeric(12,2) AS gross_amount,
         COALESCE(SUM(m.amount_paid), 0)::numeric(12,2) AS paid_amount,
         COALESCE(SUM(m.price - m.discount - m.amount_paid), 0)::numeric(12,2) AS balance_amount
       FROM memberships m
       INNER JOIN membership_plans mp ON mp.id = m.plan_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY mp.id, mp.name, mp.duration_days
       ORDER BY memberships_count DESC, mp.name ASC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalMemberships = rows.reduce((sum, row) => sum + Number(row.memberships_count || 0), 0);
    const totalGross = rows.reduce((sum, row) => sum + Number(row.gross_amount || 0), 0);
    const totalPaid = rows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
    const totalBalance = rows.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="membresias_por_plan.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Membresias por Plan', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    const filters = [];
    if (status) {
      filters.push(`Estado: ${status}`);
    }
    if (planId) {
      filters.push(`Plan ID: ${planId}`);
    }
    doc.text(`Filtros: ${filters.join(' | ') || 'Sin filtros adicionales'}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Planes: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Membresias: ${totalMemberships}`, { continued: true });
    doc.text(`  Facturado: C$${totalGross.toFixed(2)}`, { continued: true });
    doc.text(`  Pagado: C$${totalPaid.toFixed(2)}`, { continued: true });
    doc.text(`  Saldo: C$${totalBalance.toFixed(2)}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay datos de membresias por plan para el rango indicado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Plan', 20, headerY, { width: 145, align: 'left' });
      doc.text('Total', 165, headerY, { width: 35, align: 'right' });
      doc.text('Act.', 200, headerY, { width: 35, align: 'right' });
      doc.text('Pend.', 235, headerY, { width: 35, align: 'right' });
      doc.text('Exp.', 270, headerY, { width: 35, align: 'right' });
      doc.text('Canc.', 305, headerY, { width: 35, align: 'right' });
      doc.text('Facturado', 340, headerY, { width: 70, align: 'right' });
      doc.text('Pagado', 410, headerY, { width: 70, align: 'right' });
      doc.text('Saldo', 480, headerY, { width: 65, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(row.plan_name || `Plan #${row.plan_id}`, 20, y, { width: 145, align: 'left' });
        doc.text(String(row.memberships_count || 0), 165, y, { width: 35, align: 'right' });
        doc.text(String(row.active_count || 0), 200, y, { width: 35, align: 'right' });
        doc.text(String(row.pending_count || 0), 235, y, { width: 35, align: 'right' });
        doc.text(String(row.expired_count || 0), 270, y, { width: 35, align: 'right' });
        doc.text(String(row.cancelled_count || 0), 305, y, { width: 35, align: 'right' });
        doc.text(`C$${Number(row.gross_amount || 0).toFixed(2)}`, 340, y, { width: 70, align: 'right' });
        doc.text(`C$${Number(row.paid_amount || 0).toFixed(2)}`, 410, y, { width: 70, align: 'right' });
        doc.text(`C$${Number(row.balance_amount || 0).toFixed(2)}`, 480, y, { width: 65, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Membresias por Plan', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/upcoming-renewals/pdf', async (req, res, next) => {
  try {
    const {
      as_of_date: asOfDateRaw,
      days_ahead: daysAheadRaw,
      plan_id: planIdRaw,
      search: searchRaw,
      only_active_clients: onlyActiveClientsRaw
    } = req.query;

    const asOfDate = String(asOfDateRaw || new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return res.status(400).json({ message: 'as_of_date debe tener formato YYYY-MM-DD' });
    }

    const daysAhead = daysAheadRaw ? Number.parseInt(String(daysAheadRaw), 10) : 7;
    if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 90) {
      return res.status(400).json({ message: 'days_ahead debe ser un entero entre 1 y 90' });
    }

    const planId = planIdRaw ? Number.parseInt(String(planIdRaw), 10) : null;
    if (planIdRaw && (!Number.isInteger(planId) || planId <= 0)) {
      return res.status(400).json({ message: 'plan_id debe ser un entero positivo' });
    }

    const search = String(searchRaw || '').trim();
    const onlyActiveClients = String(onlyActiveClientsRaw || '').trim() === 'true';

    const sqlParams = [asOfDate, daysAhead];
    const conditions = [
      "m.status IN ('active', 'pending')",
      "m.end_date BETWEEN $1::date AND ($1::date + ($2 * INTERVAL '1 day'))"
    ];

    if (planId) {
      sqlParams.push(planId);
      conditions.push(`m.plan_id = $${sqlParams.length}`);
    }

    if (search) {
      sqlParams.push(`%${search}%`);
      conditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR COALESCE(c.phone, '') ILIKE $${sqlParams.length})`
      );
    }

    if (onlyActiveClients) {
      conditions.push('c.is_active = TRUE');
    }

    const { rows } = await query(
      `SELECT
         m.membership_number,
         m.start_date,
         m.end_date,
         m.status,
         m.price,
         m.discount,
         m.amount_paid,
         (m.price - m.discount - m.amount_paid) AS balance_due,
         c.id AS client_id,
         c.client_code,
         c.first_name,
         c.last_name,
         c.phone,
         c.is_active AS client_is_active,
         mp.name AS plan_name,
         GREATEST((m.end_date - $1::date), 0)::int AS days_to_expire
       FROM memberships m
       INNER JOIN clients c ON c.id = m.client_id
       INNER JOIN membership_plans mp ON mp.id = m.plan_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.end_date ASC, c.last_name ASC, c.first_name ASC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const withBalance = rows.reduce((sum, row) => sum + (Number(row.balance_due || 0) > 0 ? 1 : 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="renovaciones_proximas.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Renovaciones Proximas', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Corte: ${asOfDate}  Ventana: ${daysAhead} dias`, 20);
    const filters = [];
    if (planId) {
      filters.push(`Plan ID: ${planId}`);
    }
    if (search) {
      filters.push(`Busqueda: ${search}`);
    }
    if (onlyActiveClients) {
      filters.push('Solo clientes activos');
    }
    doc.text(`Filtros: ${filters.join(' | ') || 'Sin filtros adicionales'}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Renovaciones: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Con saldo: ${withBalance}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay renovaciones proximas para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Cliente', 20, headerY, { width: 155, align: 'left' });
      doc.text('Plan', 175, headerY, { width: 90, align: 'left' });
      doc.text('Vence', 265, headerY, { width: 65, align: 'center' });
      doc.text('Dias', 330, headerY, { width: 35, align: 'right' });
      doc.text('Estado', 365, headerY, { width: 65, align: 'center' });
      doc.text('Telefono', 430, headerY, { width: 70, align: 'center' });
      doc.text('Saldo', 500, headerY, { width: 45, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const clientLabel = `${row.client_code || `#${row.client_id}`} - ${`${row.first_name || ''} ${row.last_name || ''}`.trim()}`;
        doc.text(clientLabel, 20, y, { width: 155, align: 'left' });
        doc.text(row.plan_name || '--', 175, y, { width: 90, align: 'left' });
        doc.text(new Date(row.end_date).toLocaleDateString('es-NI'), 265, y, { width: 65, align: 'center' });
        doc.text(String(row.days_to_expire || 0), 330, y, { width: 35, align: 'right' });
        doc.text(normalizeMembershipStatusLabel(row.status), 365, y, { width: 65, align: 'center' });
        doc.text(row.phone || '--', 430, y, { width: 70, align: 'center' });
        doc.text(`C$${Number(row.balance_due || 0).toFixed(2)}`, 500, y, { width: 45, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Renovaciones Proximas', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/clients-no-visit-days/pdf', async (req, res, next) => {
  try {
    const {
      as_of_date: asOfDateRaw,
      inactivity_days: inactivityDaysRaw,
      search: searchRaw,
      only_active_clients: onlyActiveClientsRaw
    } = req.query;

    const asOfDate = String(asOfDateRaw || new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return res.status(400).json({ message: 'as_of_date debe tener formato YYYY-MM-DD' });
    }

    const inactivityDays = inactivityDaysRaw ? Number.parseInt(String(inactivityDaysRaw), 10) : 30;
    if (!Number.isInteger(inactivityDays) || inactivityDays < 1 || inactivityDays > 365) {
      return res.status(400).json({ message: 'inactivity_days debe ser un entero entre 1 y 365' });
    }

    const search = String(searchRaw || '').trim();
    const onlyActiveClients = String(onlyActiveClientsRaw || 'true').trim() !== 'false';

    const sqlParams = [asOfDate, inactivityDays];
    const whereConditions = [];

    if (search) {
      sqlParams.push(`%${search}%`);
      whereConditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR COALESCE(c.phone, '') ILIKE $${sqlParams.length} OR COALESCE(c.email, '') ILIKE $${sqlParams.length})`
      );
    }

    if (onlyActiveClients) {
      whereConditions.push('c.is_active = TRUE');
    }

    const { rows } = await query(
      `SELECT
         c.id,
         c.client_code,
         c.first_name,
         c.last_name,
         c.phone,
         c.email,
         c.is_active,
         MAX(ch.checked_in_at) AS last_checkin_at,
         COALESCE(($1::date - MAX(ch.checked_in_at::date)), $2 + 1)::int AS days_without_visit,
         COUNT(ch.id)::int AS total_checkins
       FROM clients c
       LEFT JOIN checkins ch ON ch.client_id = c.id
       ${whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : ''}
       GROUP BY c.id, c.client_code, c.first_name, c.last_name, c.phone, c.email, c.is_active
       HAVING COALESCE(($1::date - MAX(ch.checked_in_at::date)), $2 + 1)::int >= $2
       ORDER BY days_without_visit DESC, c.last_name ASC, c.first_name ASC
       LIMIT 1000`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const neverVisitedCount = rows.reduce((sum, row) => sum + (row.last_checkin_at ? 0 : 1), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes_sin_visita_x_dias.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Clientes que No Han Venido en X Dias', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Fecha corte: ${asOfDate}  Dias sin venir >= ${inactivityDays}`, 20);
    doc.text(`Clientes encontrados: ${rows.length} | Nunca han venido: ${neverVisitedCount}`, 20);
    doc.text(`Filtro: ${search || 'Sin busqueda'} | Solo activos: ${onlyActiveClients ? 'Si' : 'No'}`, 20);
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text('No hay clientes que cumplan con el criterio seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Cliente', 20, headerY, { width: 200, align: 'left' });
      doc.text('Contacto', 220, headerY, { width: 120, align: 'left' });
      doc.text('Ultima visita', 340, headerY, { width: 85, align: 'center' });
      doc.text('Dias', 425, headerY, { width: 45, align: 'right' });
      doc.text('Check-ins', 470, headerY, { width: 75, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const clientLabel = `${row.client_code || `#${row.id}`} - ${`${row.first_name || ''} ${row.last_name || ''}`.trim()}`;
        const contactLabel = row.phone || row.email || '--';
        doc.text(clientLabel, 20, y, { width: 200, align: 'left' });
        doc.text(contactLabel, 220, y, { width: 120, align: 'left' });
        doc.text(
          row.last_checkin_at ? new Date(row.last_checkin_at).toLocaleDateString('es-NI') : 'Nunca',
          340,
          y,
          { width: 85, align: 'center' }
        );
        doc.text(String(Number(row.days_without_visit || 0)), 425, y, { width: 45, align: 'right' });
        doc.text(String(Number(row.total_checkins || 0)), 470, y, { width: 75, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Clientes que No Han Venido en X Dias', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/memberships-expiring-window/pdf', async (req, res, next) => {
  try {
    const {
      as_of_date: asOfDateRaw,
      min_days: minDaysRaw,
      max_days: maxDaysRaw,
      plan_id: planIdRaw,
      search: searchRaw,
      only_active_clients: onlyActiveClientsRaw
    } = req.query;

    const asOfDate = String(asOfDateRaw || new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return res.status(400).json({ message: 'as_of_date debe tener formato YYYY-MM-DD' });
    }

    const minDays = minDaysRaw ? Number.parseInt(String(minDaysRaw), 10) : 3;
    const maxDays = maxDaysRaw ? Number.parseInt(String(maxDaysRaw), 10) : 5;
    if (!Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 0 || maxDays > 90 || minDays > maxDays) {
      return res.status(400).json({ message: 'min_days y max_days deben ser enteros validos (0-90) y min_days <= max_days' });
    }

    const planId = planIdRaw ? Number.parseInt(String(planIdRaw), 10) : null;
    if (planIdRaw && (!Number.isInteger(planId) || planId <= 0)) {
      return res.status(400).json({ message: 'plan_id debe ser un entero positivo' });
    }

    const search = String(searchRaw || '').trim();
    const onlyActiveClients = String(onlyActiveClientsRaw || 'true').trim() !== 'false';

    const sqlParams = [asOfDate, minDays, maxDays];
    const conditions = [
      "m.status IN ('active', 'pending')",
      'm.end_date BETWEEN ($1::date + ($2 * INTERVAL \'1 day\')) AND ($1::date + ($3 * INTERVAL \'1 day\'))'
    ];

    if (planId) {
      sqlParams.push(planId);
      conditions.push(`m.plan_id = $${sqlParams.length}`);
    }

    if (search) {
      sqlParams.push(`%${search}%`);
      conditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR COALESCE(c.phone, '') ILIKE $${sqlParams.length})`
      );
    }

    if (onlyActiveClients) {
      conditions.push('c.is_active = TRUE');
    }

    const { rows } = await query(
      `SELECT
         m.membership_number,
         m.end_date,
         m.status,
         m.price,
         m.discount,
         m.amount_paid,
         GREATEST((m.price - m.discount - m.amount_paid), 0)::numeric(12,2) AS balance_due,
         c.id AS client_id,
         c.client_code,
         c.first_name,
         c.last_name,
         c.phone,
         mp.name AS plan_name,
         GREATEST((m.end_date - $1::date), 0)::int AS days_to_expire
       FROM memberships m
       INNER JOIN clients c ON c.id = m.client_id
       INNER JOIN membership_plans mp ON mp.id = m.plan_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.end_date ASC, c.last_name ASC, c.first_name ASC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const balanceCount = rows.reduce((sum, row) => sum + (Number(row.balance_due || 0) > 0 ? 1 : 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="membresias_por_vencer_3_5_dias.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Membresias por Vencer', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Fecha corte: ${asOfDate}  Ventana: ${minDays}-${maxDays} dias`, 20);
    doc.text(`Membresias por vencer: ${rows.length} | Con saldo: ${balanceCount}`, 20);
    doc.text(`Filtro: ${search || 'Sin busqueda'} | Solo clientes activos: ${onlyActiveClients ? 'Si' : 'No'}`, 20);
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text('No hay membresias por vencer en la ventana seleccionada.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Cliente', 20, headerY, { width: 150, align: 'left' });
      doc.text('Plan', 170, headerY, { width: 90, align: 'left' });
      doc.text('Vence', 260, headerY, { width: 65, align: 'center' });
      doc.text('Dias', 325, headerY, { width: 35, align: 'right' });
      doc.text('Telefono', 360, headerY, { width: 85, align: 'left' });
      doc.text('Saldo', 445, headerY, { width: 100, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const clientLabel = `${row.client_code || `#${row.client_id}`} - ${`${row.first_name || ''} ${row.last_name || ''}`.trim()}`;
        doc.text(clientLabel, 20, y, { width: 150, align: 'left' });
        doc.text(row.plan_name || '--', 170, y, { width: 90, align: 'left' });
        doc.text(new Date(row.end_date).toLocaleDateString('es-NI'), 260, y, { width: 65, align: 'center' });
        doc.text(String(Number(row.days_to_expire || 0)), 325, y, { width: 35, align: 'right' });
        doc.text(row.phone || '--', 360, y, { width: 85, align: 'left' });
        doc.text(`C$${Number(row.balance_due || 0).toFixed(2)}`, 445, y, { width: 100, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Membresias por Vencer', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/recurring-income/pdf', async (req, res, next) => {
  try {
    const {
      month: monthRaw,
      plan_id: planIdRaw,
      status: statusRaw,
      only_paid: onlyPaidRaw
    } = req.query;

    const interval = normalizePlanInterval(monthRaw);
    if (interval === 'invalid') {
      return res.status(400).json({ message: 'month debe tener formato YYYY-MM' });
    }

    const selectedMonth = interval || normalizePlanInterval(new Date().toISOString().slice(0, 7));
    const { startDate, endDate, month } = selectedMonth;

    const planId = planIdRaw ? Number.parseInt(String(planIdRaw), 10) : null;
    if (planIdRaw && (!Number.isInteger(planId) || planId <= 0)) {
      return res.status(400).json({ message: 'plan_id debe ser un entero positivo' });
    }

    const status = String(statusRaw || '').trim();
    if (status && !['pending', 'active', 'expired', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'status debe ser pending, active, expired o cancelled' });
    }

    const onlyPaid = String(onlyPaidRaw || '').trim() === 'true';

    const sqlParams = [startDate, endDate];
    const conditions = ['m.start_date BETWEEN $1 AND $2'];

    if (planId) {
      sqlParams.push(planId);
      conditions.push(`m.plan_id = $${sqlParams.length}`);
    }

    if (status) {
      sqlParams.push(status);
      conditions.push(`m.status = $${sqlParams.length}`);
    }

    if (onlyPaid) {
      conditions.push('m.amount_paid > 0');
    }

    const { rows } = await query(
      `SELECT
         mp.id AS plan_id,
         mp.name AS plan_name,
         COUNT(m.id)::int AS memberships_count,
         COALESCE(SUM(m.price), 0)::numeric(12,2) AS expected_income,
         COALESCE(SUM(m.amount_paid), 0)::numeric(12,2) AS paid_income,
         COALESCE(SUM(m.price - m.discount - m.amount_paid), 0)::numeric(12,2) AS pending_income,
         COALESCE(SUM(m.discount), 0)::numeric(12,2) AS discount_amount
       FROM memberships m
       INNER JOIN membership_plans mp ON mp.id = m.plan_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY mp.id, mp.name
       ORDER BY expected_income DESC, mp.name ASC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totals = rows.reduce(
      (acc, row) => {
        acc.memberships += Number(row.memberships_count || 0);
        acc.expected += Number(row.expected_income || 0);
        acc.paid += Number(row.paid_income || 0);
        acc.pending += Number(row.pending_income || 0);
        acc.discount += Number(row.discount_amount || 0);
        return acc;
      },
      { memberships: 0, expected: 0, paid: 0, pending: 0, discount: 0 }
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ingresos_recurrentes.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Ingresos Recurrentes', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Mes: ${month}  Rango: ${startDate} a ${endDate}`, 20);
    const filters = [];
    if (planId) {
      filters.push(`Plan ID: ${planId}`);
    }
    if (status) {
      filters.push(`Estado: ${status}`);
    }
    if (onlyPaid) {
      filters.push('Solo membresias con pago');
    }
    doc.text(`Filtros: ${filters.join(' | ') || 'Sin filtros adicionales'}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Membresias: ${totals.memberships}`, 20, doc.y, { continued: true });
    doc.text(`  Esperado: C$${totals.expected.toFixed(2)}`, { continued: true });
    doc.text(`  Cobrado: C$${totals.paid.toFixed(2)}`, { continued: true });
    doc.text(`  Pendiente: C$${totals.pending.toFixed(2)}`, { continued: true });
    doc.text(`  Descuento: C$${totals.discount.toFixed(2)}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay ingresos de membresias para el periodo seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Plan', 20, headerY, { width: 190, align: 'left' });
      doc.text('Membresias', 210, headerY, { width: 65, align: 'right' });
      doc.text('Esperado', 275, headerY, { width: 90, align: 'right' });
      doc.text('Cobrado', 365, headerY, { width: 90, align: 'right' });
      doc.text('Pendiente', 455, headerY, { width: 90, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(row.plan_name || `Plan #${row.plan_id}`, 20, y, { width: 190, align: 'left' });
        doc.text(String(row.memberships_count || 0), 210, y, { width: 65, align: 'right' });
        doc.text(`C$${Number(row.expected_income || 0).toFixed(2)}`, 275, y, { width: 90, align: 'right' });
        doc.text(`C$${Number(row.paid_income || 0).toFixed(2)}`, 365, y, { width: 90, align: 'right' });
        doc.text(`C$${Number(row.pending_income || 0).toFixed(2)}`, 455, y, { width: 90, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Ingresos Recurrentes', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/expired-memberships/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const { rows } = await query(
      `SELECT
         m.id,
         m.client_id,
         m.membership_number,
         m.end_date,
         m.price,
         m.discount,
         m.amount_paid,
         c.client_code,
         c.first_name,
         c.last_name,
         mp.name AS plan_name,
         GREATEST((CURRENT_DATE - m.end_date), 0)::int AS days_expired
       FROM memberships m
       INNER JOIN clients c ON c.id = m.client_id
       LEFT JOIN membership_plans mp ON mp.id = m.plan_id
       WHERE m.end_date::date BETWEEN $1::date AND $2::date
         AND NOT EXISTS (
           SELECT 1
           FROM memberships m2
           WHERE m2.client_id = m.client_id
             AND (m2.start_date > m.end_date OR m2.id > m.id)
         )
       ORDER BY m.end_date ASC, c.last_name ASC, c.first_name ASC`,
      [startDate, endDate]
    );

    const totalAtRisk = rows.reduce(
      (sum, row) => sum + Math.max(Number(row.price || 0) - Number(row.discount || 0), 0),
      0
    );
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="membresias_vencidas.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Membresias Vencidas', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(`Clientes sin renovar: ${rows.length} | Monto en riesgo: C$${totalAtRisk.toFixed(2)}`, 20);
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text('No hay membresias vencidas sin renovar en el rango seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Cliente', 20, headerY, { width: 180, align: 'left' });
      doc.text('Membresia', 200, headerY, { width: 90, align: 'left' });
      doc.text('Plan', 290, headerY, { width: 95, align: 'left' });
      doc.text('Vencio', 385, headerY, { width: 65, align: 'center' });
      doc.text('Dias', 450, headerY, { width: 35, align: 'right' });
      doc.text('Monto', 485, headerY, { width: 60, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const clientLabel = `${row.client_code || `#${row.client_id}`} - ${`${row.first_name || ''} ${row.last_name || ''}`.trim()}`;
        const amountAtRisk = Math.max(Number(row.price || 0) - Number(row.discount || 0), 0);

        doc.text(clientLabel, 20, y, { width: 180, align: 'left' });
        doc.text(row.membership_number || '--', 200, y, { width: 90, align: 'left' });
        doc.text(row.plan_name || '--', 290, y, { width: 95, align: 'left' });
        doc.text(new Date(row.end_date).toLocaleDateString('es-NI'), 385, y, { width: 65, align: 'center' });
        doc.text(String(Number(row.days_expired || 0)), 450, y, { width: 35, align: 'right' });
        doc.text(`C$${amountAtRisk.toFixed(2)}`, 485, y, { width: 60, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Membresias Vencidas', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/renewal-rate/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const result = await query(
      `WITH expired_base AS (
         SELECT m.id, m.client_id, m.end_date
         FROM memberships m
         WHERE m.end_date::date BETWEEN $1::date AND $2::date
       ),
       renewals AS (
         SELECT eb.id
         FROM expired_base eb
         WHERE EXISTS (
           SELECT 1
           FROM memberships m2
           WHERE m2.client_id = eb.client_id
             AND m2.start_date > eb.end_date
         )
       )
       SELECT
         (SELECT COUNT(*)::int FROM expired_base) AS eligible_count,
         (SELECT COUNT(*)::int FROM renewals) AS renewed_count`,
      [startDate, endDate]
    );

    const data = result.rows[0] || {};
    const eligible = Number(data.eligible_count || 0);
    const renewed = Number(data.renewed_count || 0);
    const notRenewed = Math.max(eligible - renewed, 0);
    const renewalRate = eligible > 0 ? (renewed / eligible) * 100 : 0;
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="tasa_renovacion.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Tasa de Renovacion', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('KPI principal', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Clientes elegibles para renovar: ${eligible}`, 30);
    doc.text(`Clientes que renovaron: ${renewed}`, 30);
    doc.text(`Clientes que no renovaron: ${notRenewed}`, 30);
    doc.text(`Tasa de renovacion: ${renewalRate.toFixed(2)}%`, 30);
    doc.moveDown();

    let interpretation = 'Sin datos suficientes para medir la renovación.';
    if (eligible > 0) {
      if (renewalRate >= 70) {
        interpretation = 'Lectura: Excelente retencion de clientes.';
      } else if (renewalRate >= 40) {
        interpretation = 'Lectura: Retencion intermedia, con espacio de mejora.';
      } else {
        interpretation = 'Lectura: Retencion baja, hay fuga importante de clientes.';
      }
    }
    doc.font('Helvetica-Bold').fontSize(11).text(interpretation, 20);

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Tasa de Renovacion', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/projected-income/pdf', async (req, res, next) => {
  try {
    const { as_of_date: asOfDateRaw, months_ahead: monthsAheadRaw } = req.query;

    const asOfDate = String(asOfDateRaw || new Date().toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return res.status(400).json({ message: 'as_of_date debe tener formato YYYY-MM-DD' });
    }

    const monthsAhead = monthsAheadRaw ? Number.parseInt(String(monthsAheadRaw), 10) : 3;
    if (!Number.isInteger(monthsAhead) || monthsAhead < 1 || monthsAhead > 12) {
      return res.status(400).json({ message: 'months_ahead debe ser un entero entre 1 y 12' });
    }

    const projectionResult = await query(
      `WITH active_memberships AS (
         SELECT
           m.client_id,
           m.plan_id,
           m.end_date,
           GREATEST((m.price - m.discount), 0)::numeric(12,2) AS expected_amount
         FROM memberships m
         WHERE m.status = 'active'
           AND m.start_date <= $1::date
           AND m.end_date >= $1::date
       ),
       projection_window AS (
         SELECT
           to_char(date_trunc('month', am.end_date::timestamp), 'YYYY-MM') AS projection_month,
           COUNT(*)::int AS memberships_count,
           COALESCE(SUM(am.expected_amount), 0)::numeric(12,2) AS projected_amount
         FROM active_memberships am
         WHERE am.end_date <= ($1::date + ($2 * INTERVAL '1 month'))
         GROUP BY to_char(date_trunc('month', am.end_date::timestamp), 'YYYY-MM')
       )
       SELECT
         pw.projection_month,
         pw.memberships_count,
         pw.projected_amount
       FROM projection_window pw
       ORDER BY pw.projection_month ASC`,
      [asOfDate, monthsAhead]
    );

    const totalsResult = await query(
      `SELECT
         COUNT(*)::int AS active_memberships,
         COALESCE(SUM(GREATEST(m.price - m.discount, 0)), 0)::numeric(12,2) AS active_portfolio_amount
       FROM memberships m
       WHERE m.status = 'active'
         AND m.start_date <= $1::date
         AND m.end_date >= $1::date`,
      [asOfDate]
    );

    const rows = projectionResult.rows || [];
    const totals = totalsResult.rows[0] || {};
    const projectedTotal = rows.reduce((sum, row) => sum + Number(row.projected_amount || 0), 0);
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ingresos_proyectados.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Ingresos Proyectados', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Fecha base: ${asOfDate}  Horizonte: ${monthsAhead} meses`, 20);
    doc.text(
      `Membresias activas base: ${Number(totals.active_memberships || 0)} | Monto cartera activa: C$${Number(
        totals.active_portfolio_amount || 0
      ).toFixed(2)}`,
      20
    );
    doc.text(`Ingreso proyectado del horizonte: C$${projectedTotal.toFixed(2)}`, 20);
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text('No hay vencimientos de membresias activas dentro del horizonte seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Mes proyectado', 20, headerY, { width: 180, align: 'left' });
      doc.text('Membresias', 240, headerY, { width: 120, align: 'right' });
      doc.text('Ingreso proyectado', 360, headerY, { width: 180, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(10);
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(String(row.projection_month || '--'), 20, y, { width: 180, align: 'left' });
        doc.text(String(Number(row.memberships_count || 0)), 240, y, { width: 120, align: 'right' });
        doc.text(`C$${Number(row.projected_amount || 0).toFixed(2)}`, 360, y, { width: 180, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Ingresos Proyectados', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/inventory-current/pdf', async (req, res, next) => {
  try {
    const {
      category_id: categoryIdRaw,
      search: searchRaw,
      include_inactive: includeInactiveRaw,
      include_zero_stock: includeZeroStockRaw
    } = req.query;

    const categoryId = categoryIdRaw ? Number.parseInt(String(categoryIdRaw), 10) : null;
    if (categoryIdRaw && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      return res.status(400).json({ message: 'category_id debe ser un entero positivo' });
    }

    const search = String(searchRaw || '').trim();
    const includeInactive = String(includeInactiveRaw || '').trim() === 'true';
    const includeZeroStock = String(includeZeroStockRaw || '').trim() === 'true';

    const conditions = [];
    const sqlParams = [];

    if (categoryId) {
      sqlParams.push(categoryId);
      conditions.push(`p.category_id = $${sqlParams.length}`);
    }

    if (search) {
      sqlParams.push(`%${search}%`);
      conditions.push(
        `(p.sku ILIKE $${sqlParams.length} OR p.name ILIKE $${sqlParams.length} OR COALESCE(pc.name, '') ILIKE $${sqlParams.length} OR COALESCE(p.barcode, '') ILIKE $${sqlParams.length})`
      );
    }

    if (!includeInactive) {
      conditions.push('p.is_active = TRUE');
    }

    if (!includeZeroStock) {
      conditions.push('p.stock_quantity > 0');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT
         p.id,
         p.sku,
         p.name,
         p.stock_quantity,
         p.minimum_stock,
         p.sale_price,
         p.cost_price,
         p.is_active,
         pc.name AS category_name,
         (p.stock_quantity * p.cost_price)::numeric(12,2) AS stock_cost_value,
         (p.stock_quantity * p.sale_price)::numeric(12,2) AS stock_sale_value
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       ${whereClause}
       ORDER BY p.name ASC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalCostValue = rows.reduce((sum, row) => sum + Number(row.stock_cost_value || 0), 0);
    const totalSaleValue = rows.reduce((sum, row) => sum + Number(row.stock_sale_value || 0), 0);
    const lowStockCount = rows.reduce(
      (sum, row) => sum + (Number(row.stock_quantity) <= Number(row.minimum_stock) ? 1 : 0),
      0
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="inventario_actual.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Inventario Actual', { align: 'center' });
    doc.moveDown();
    const filters = [];
    if (categoryId) {
      filters.push(`Categoria ID: ${categoryId}`);
    }
    if (search) {
      filters.push(`Busqueda: ${search}`);
    }
    filters.push(includeInactive ? 'Incluye inactivos' : 'Solo activos');
    filters.push(includeZeroStock ? 'Incluye stock en cero' : 'Excluye stock en cero');
    doc.fontSize(12).text(`Filtros: ${filters.join(' | ')}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Productos: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Bajo stock: ${lowStockCount}`, { continued: true });
    doc.text(`  Valor costo: C$${totalCostValue.toFixed(2)}`, { continued: true });
    doc.text(`  Valor venta: C$${totalSaleValue.toFixed(2)}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay productos para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('SKU', 20, headerY, { width: 70, align: 'left' });
      doc.text('Producto', 90, headerY, { width: 160, align: 'left' });
      doc.text('Categoria', 250, headerY, { width: 95, align: 'left' });
      doc.text('Stock', 345, headerY, { width: 40, align: 'right' });
      doc.text('Min.', 385, headerY, { width: 35, align: 'right' });
      doc.text('Costo', 420, headerY, { width: 60, align: 'right' });
      doc.text('Venta', 480, headerY, { width: 65, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(row.sku || '--', 20, y, { width: 70, align: 'left' });
        doc.text(row.name || '--', 90, y, { width: 160, align: 'left' });
        doc.text(row.category_name || '--', 250, y, { width: 95, align: 'left' });
        doc.text(Number(row.stock_quantity || 0).toFixed(2), 345, y, { width: 40, align: 'right' });
        doc.text(Number(row.minimum_stock || 0).toFixed(2), 385, y, { width: 35, align: 'right' });
        doc.text(`C$${Number(row.cost_price || 0).toFixed(2)}`, 420, y, { width: 60, align: 'right' });
        doc.text(`C$${Number(row.sale_price || 0).toFixed(2)}`, 480, y, { width: 65, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Inventario Actual', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/low-stock-products/pdf', async (req, res, next) => {
  try {
    const {
      category_id: categoryIdRaw,
      search: searchRaw,
      include_inactive: includeInactiveRaw,
      include_zero_minimum: includeZeroMinimumRaw
    } = req.query;

    const categoryId = categoryIdRaw ? Number.parseInt(String(categoryIdRaw), 10) : null;
    if (categoryIdRaw && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      return res.status(400).json({ message: 'category_id debe ser un entero positivo' });
    }

    const search = String(searchRaw || '').trim();
    const includeInactive = String(includeInactiveRaw || '').trim() === 'true';
    const includeZeroMinimum = String(includeZeroMinimumRaw || '').trim() === 'true';

    const sqlParams = [];
    const conditions = ['p.stock_quantity <= p.minimum_stock'];

    if (!includeZeroMinimum) {
      conditions.push('p.minimum_stock > 0');
    }

    if (categoryId) {
      sqlParams.push(categoryId);
      conditions.push(`p.category_id = $${sqlParams.length}`);
    }

    if (search) {
      sqlParams.push(`%${search}%`);
      conditions.push(
        `(p.sku ILIKE $${sqlParams.length} OR p.name ILIKE $${sqlParams.length} OR COALESCE(pc.name, '') ILIKE $${sqlParams.length})`
      );
    }

    if (!includeInactive) {
      conditions.push('p.is_active = TRUE');
    }

    const { rows } = await query(
      `SELECT
         p.id,
         p.sku,
         p.name,
         p.stock_quantity,
         p.minimum_stock,
         p.sale_price,
         p.cost_price,
         p.is_active,
         pc.name AS category_name,
         (p.minimum_stock - p.stock_quantity)::numeric(12,2) AS deficit
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY deficit DESC, p.name ASC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalDeficit = rows.reduce((sum, row) => sum + Math.max(Number(row.deficit || 0), 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="productos_bajos_stock.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Productos Bajos en Stock', { align: 'center' });
    doc.moveDown();
    const filters = [];
    if (categoryId) {
      filters.push(`Categoria ID: ${categoryId}`);
    }
    if (search) {
      filters.push(`Busqueda: ${search}`);
    }
    filters.push(includeInactive ? 'Incluye inactivos' : 'Solo activos');
    filters.push(includeZeroMinimum ? 'Incluye minimo cero' : 'Excluye minimo cero');
    doc.fontSize(12).text(`Filtros: ${filters.join(' | ')}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Productos: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Deficit total: ${totalDeficit.toFixed(2)} unidades`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay productos bajo stock con los filtros indicados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('SKU', 20, headerY, { width: 75, align: 'left' });
      doc.text('Producto', 95, headerY, { width: 180, align: 'left' });
      doc.text('Categoria', 275, headerY, { width: 105, align: 'left' });
      doc.text('Stock', 380, headerY, { width: 45, align: 'right' });
      doc.text('Min.', 425, headerY, { width: 45, align: 'right' });
      doc.text('Deficit', 470, headerY, { width: 75, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(row.sku || '--', 20, y, { width: 75, align: 'left' });
        doc.text(row.name || '--', 95, y, { width: 180, align: 'left' });
        doc.text(row.category_name || '--', 275, y, { width: 105, align: 'left' });
        doc.text(Number(row.stock_quantity || 0).toFixed(2), 380, y, { width: 45, align: 'right' });
        doc.text(Number(row.minimum_stock || 0).toFixed(2), 425, y, { width: 45, align: 'right' });
        doc.text(Number(row.deficit || 0).toFixed(2), 470, y, { width: 75, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Productos Bajos en Stock', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/inventory-movements/pdf', async (req, res, next) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      movement_type: movementTypeRaw,
      category_id: categoryIdRaw,
      product_id: productIdRaw,
      search: searchRaw
    } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const movementType = String(movementTypeRaw || '').trim();
    const allowedMovementTypes = new Set([
      'purchase',
      'sale',
      'adjustment_in',
      'adjustment_out',
      'return'
    ]);
    if (movementType && !allowedMovementTypes.has(movementType)) {
      return res.status(400).json({
        message: 'movement_type debe ser purchase, sale, adjustment_in, adjustment_out o return'
      });
    }

    const categoryId = categoryIdRaw ? Number.parseInt(String(categoryIdRaw), 10) : null;
    if (categoryIdRaw && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      return res.status(400).json({ message: 'category_id debe ser un entero positivo' });
    }

    const productId = productIdRaw ? Number.parseInt(String(productIdRaw), 10) : null;
    if (productIdRaw && (!Number.isInteger(productId) || productId <= 0)) {
      return res.status(400).json({ message: 'product_id debe ser un entero positivo' });
    }

    const search = String(searchRaw || '').trim();

    const sqlParams = [startDate, endDate];
    const conditions = ['im.moved_at::date BETWEEN $1 AND $2'];

    if (movementType) {
      sqlParams.push(movementType);
      conditions.push(`im.movement_type = $${sqlParams.length}`);
    }

    if (categoryId) {
      sqlParams.push(categoryId);
      conditions.push(`p.category_id = $${sqlParams.length}`);
    }

    if (productId) {
      sqlParams.push(productId);
      conditions.push(`im.product_id = $${sqlParams.length}`);
    }

    if (search) {
      sqlParams.push(`%${search}%`);
      conditions.push(
        `(p.sku ILIKE $${sqlParams.length} OR p.name ILIKE $${sqlParams.length} OR COALESCE(im.notes, '') ILIKE $${sqlParams.length} OR COALESCE(u.username, '') ILIKE $${sqlParams.length})`
      );
    }

    const { rows } = await query(
      `SELECT
         im.id,
         im.movement_type,
         im.quantity,
         im.previous_stock,
         im.new_stock,
         im.unit_cost,
         im.reference_type,
         im.reference_id,
         im.notes,
         im.moved_at,
         p.id AS product_id,
         p.sku,
         p.name AS product_name,
         pc.name AS category_name,
         u.username AS user_name
       FROM inventory_movements im
       INNER JOIN products p ON p.id = im.product_id
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN users u ON u.id = im.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY im.moved_at DESC, im.id DESC`,
      sqlParams
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalEntries = rows.reduce(
      (sum, row) => sum + (['purchase', 'adjustment_in', 'return'].includes(row.movement_type) ? Number(row.quantity || 0) : 0),
      0
    );
    const totalExits = rows.reduce(
      (sum, row) => sum + (['sale', 'adjustment_out'].includes(row.movement_type) ? Number(row.quantity || 0) : 0),
      0
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="movimientos_inventario.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Movimientos de Inventario', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    const filters = [];
    if (movementType) {
      filters.push(`Tipo: ${movementType}`);
    }
    if (categoryId) {
      filters.push(`Categoria ID: ${categoryId}`);
    }
    if (productId) {
      filters.push(`Producto ID: ${productId}`);
    }
    if (search) {
      filters.push(`Busqueda: ${search}`);
    }
    doc.text(`Filtros: ${filters.join(' | ') || 'Sin filtros adicionales'}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Movimientos: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Entradas: ${totalEntries.toFixed(2)}`, { continued: true });
    doc.text(`  Salidas: ${totalExits.toFixed(2)}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay movimientos de inventario para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Fecha', 20, headerY, { width: 70, align: 'left' });
      doc.text('Producto', 90, headerY, { width: 170, align: 'left' });
      doc.text('Tipo', 260, headerY, { width: 80, align: 'left' });
      doc.text('Cant.', 340, headerY, { width: 45, align: 'right' });
      doc.text('Antes', 385, headerY, { width: 50, align: 'right' });
      doc.text('Despues', 435, headerY, { width: 55, align: 'right' });
      doc.text('Usuario', 490, headerY, { width: 55, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(new Date(row.moved_at).toLocaleDateString('es-NI'), 20, y, {
          width: 70,
          align: 'left'
        });
        doc.text(`${row.sku || '--'} - ${row.product_name || '--'}`, 90, y, {
          width: 170,
          align: 'left'
        });
        doc.text(normalizeInventoryMovementTypeLabel(row.movement_type), 260, y, {
          width: 80,
          align: 'left'
        });
        doc.text(Number(row.quantity || 0).toFixed(2), 340, y, { width: 45, align: 'right' });
        doc.text(Number(row.previous_stock || 0).toFixed(2), 385, y, { width: 50, align: 'right' });
        doc.text(Number(row.new_stock || 0).toFixed(2), 435, y, { width: 55, align: 'right' });
        doc.text(row.user_name || '--', 490, y, { width: 55, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Movimientos de Inventario', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/product-kardex/pdf', async (req, res, next) => {
  try {
    const { product_id: productIdRaw, fechaInicio, fechaFin } = req.query;

    const productId = productIdRaw ? Number.parseInt(String(productIdRaw), 10) : null;
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: 'product_id es requerido y debe ser un entero positivo' });
    }

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const productResult = await query(
      `SELECT p.id, p.sku, p.name, p.stock_quantity, p.minimum_stock, p.unit_label, pc.name AS category_name
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE p.id = $1`,
      [productId]
    );

    if (productResult.rowCount === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const product = productResult.rows[0];

    const openingStockResult = await query(
      `SELECT new_stock
       FROM inventory_movements
       WHERE product_id = $1
         AND moved_at::date < $2::date
       ORDER BY moved_at DESC, id DESC
       LIMIT 1`,
      [productId, startDate]
    );

    const openingStock = openingStockResult.rowCount > 0
      ? Number(openingStockResult.rows[0].new_stock)
      : 0;

    const { rows } = await query(
      `SELECT
         im.id,
         im.movement_type,
         im.quantity,
         im.previous_stock,
         im.new_stock,
         im.unit_cost,
         im.reference_type,
         im.reference_id,
         im.notes,
         im.moved_at,
         u.username AS user_name
       FROM inventory_movements im
       LEFT JOIN users u ON u.id = im.user_id
       WHERE im.product_id = $1
         AND im.moved_at::date BETWEEN $2 AND $3
       ORDER BY im.moved_at ASC, im.id ASC`,
      [productId, startDate, endDate]
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalEntries = rows.reduce(
      (sum, row) => sum + (['purchase', 'adjustment_in', 'return'].includes(row.movement_type) ? Number(row.quantity || 0) : 0),
      0
    );
    const totalExits = rows.reduce(
      (sum, row) => sum + (['sale', 'adjustment_out'].includes(row.movement_type) ? Number(row.quantity || 0) : 0),
      0
    );
    const closingStock = rows.length > 0
      ? Number(rows[rows.length - 1].new_stock || 0)
      : openingStock;

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="kardex_producto_${productId}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('Kardex de Producto', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Producto: ${product.sku || '--'} - ${product.name || '--'}`, 20);
    doc.text(`Categoria: ${product.category_name || '--'} | Unidad: ${product.unit_label || 'unit'}`, 20);
    doc.text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text(`Stock inicial: ${openingStock.toFixed(2)}`, 20, doc.y, { continued: true });
    doc.text(`  Entradas: ${totalEntries.toFixed(2)}`, { continued: true });
    doc.text(`  Salidas: ${totalExits.toFixed(2)}`, { continued: true });
    doc.text(`  Stock final: ${closingStock.toFixed(2)}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.font('Helvetica').text('No hay movimientos del producto en el rango de fechas seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Fecha', 20, headerY, { width: 70, align: 'left' });
      doc.text('Tipo', 90, headerY, { width: 95, align: 'left' });
      doc.text('Entrada', 185, headerY, { width: 55, align: 'right' });
      doc.text('Salida', 240, headerY, { width: 55, align: 'right' });
      doc.text('Stock', 295, headerY, { width: 55, align: 'right' });
      doc.text('Referencia', 350, headerY, { width: 90, align: 'left' });
      doc.text('Usuario', 440, headerY, { width: 50, align: 'right' });
      doc.text('Nota', 490, headerY, { width: 55, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const isEntry = ['purchase', 'adjustment_in', 'return'].includes(row.movement_type);
        const reference = row.reference_type
          ? `${row.reference_type}${row.reference_id ? `#${row.reference_id}` : ''}`
          : '--';

        doc.text(new Date(row.moved_at).toLocaleDateString('es-NI'), 20, y, { width: 70, align: 'left' });
        doc.text(normalizeInventoryMovementTypeLabel(row.movement_type), 90, y, { width: 95, align: 'left' });
        doc.text(isEntry ? Number(row.quantity || 0).toFixed(2) : '--', 185, y, { width: 55, align: 'right' });
        doc.text(!isEntry ? Number(row.quantity || 0).toFixed(2) : '--', 240, y, { width: 55, align: 'right' });
        doc.text(Number(row.new_stock || 0).toFixed(2), 295, y, { width: 55, align: 'right' });
        doc.text(reference, 350, y, { width: 90, align: 'left' });
        doc.text(row.user_name || '--', 440, y, { width: 50, align: 'right' });
        doc.text(row.notes || '--', 490, y, { width: 55, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Kardex de Producto', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

function latestMembershipLabel(planName, status) {
  if (!planName) {
    return 'Con membresia';
  }

  if (!status) {
    return planName;
  }

  return `${planName} (${status})`;
}

reportsRouter.get('/attendance-daily/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio);
    const endDate = String(fechaFin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const result = await query(
      `SELECT
         day_series.calendar_day,
         COALESCE(COUNT(ch.id), 0)::int AS total_checkins,
         COALESCE(COUNT(ch.id) FILTER (WHERE ch.status = 'allowed'), 0)::int AS allowed_checkins,
         COALESCE(COUNT(ch.id) FILTER (WHERE ch.status = 'denied'), 0)::int AS denied_checkins,
         COALESCE(COUNT(DISTINCT ch.client_id) FILTER (WHERE ch.status = 'allowed'), 0)::int AS unique_clients
       FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS day_series(calendar_day)
       LEFT JOIN checkins ch
         ON ch.checked_in_at::date = day_series.calendar_day::date
       GROUP BY day_series.calendar_day
       ORDER BY day_series.calendar_day ASC`,
      [startDate, endDate]
    );

    const rows = result.rows;
    const totals = rows.reduce(
      (acc, row) => {
        acc.total += Number(row.total_checkins || 0);
        acc.allowed += Number(row.allowed_checkins || 0);
        acc.denied += Number(row.denied_checkins || 0);
        return acc;
      },
      { total: 0, allowed: 0, denied: 0 }
    );
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="asistencias_diarias.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Asistencias Diarias', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(
      `Totales: ${totals.total} registros | Permitidos: ${totals.allowed} | Denegados: ${totals.denied}`,
      20
    );
    doc.moveDown();

    if (rows.length === 0) {
      doc.text('No hay asistencias registradas en el rango de fechas seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Fecha', 20, headerY, { width: 140, align: 'left' });
      doc.text('Total', 170, headerY, { width: 70, align: 'right' });
      doc.text('Permitidos', 250, headerY, { width: 90, align: 'right' });
      doc.text('Denegados', 350, headerY, { width: 90, align: 'right' });
      doc.text('Clientes unicos', 450, headerY, { width: 100, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(10);
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(new Date(row.calendar_day).toLocaleDateString('es-NI'), 20, y, {
          width: 140,
          align: 'left'
        });
        doc.text(String(row.total_checkins || 0), 170, y, { width: 70, align: 'right' });
        doc.text(String(row.allowed_checkins || 0), 250, y, { width: 90, align: 'right' });
        doc.text(String(row.denied_checkins || 0), 350, y, { width: 90, align: 'right' });
        doc.text(String(row.unique_clients || 0), 450, y, { width: 100, align: 'right' });
        doc.moveDown(0.6);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Asistencias Diarias', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/attendance-by-client/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin, search, status } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio);
    const endDate = String(fechaFin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const normalizedSearch = String(search || '').trim();
    const normalizedStatus = String(status || '').trim();
    if (normalizedStatus && !['allowed', 'denied'].includes(normalizedStatus)) {
      return res.status(400).json({ message: "status debe ser 'allowed' o 'denied'" });
    }

    const conditions = ['ch.checked_in_at::date BETWEEN $1 AND $2'];
    const sqlParams = [startDate, endDate];

    if (normalizedSearch) {
      sqlParams.push(`%${normalizedSearch}%`);
      conditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR COALESCE(c.phone, '') ILIKE $${sqlParams.length})`
      );
    }

    if (normalizedStatus) {
      sqlParams.push(normalizedStatus);
      conditions.push(`ch.status = $${sqlParams.length}`);
    }

    const result = await query(
      `SELECT
         c.client_code,
         c.first_name,
         c.last_name,
         COUNT(ch.id)::int AS total_checkins,
         COUNT(ch.id) FILTER (WHERE ch.status = 'allowed')::int AS allowed_checkins,
         COUNT(ch.id) FILTER (WHERE ch.status = 'denied')::int AS denied_checkins,
         MAX(ch.checked_in_at) AS last_checkin_at
       FROM checkins ch
       INNER JOIN clients c ON c.id = ch.client_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY c.client_code, c.first_name, c.last_name
       ORDER BY total_checkins DESC, last_checkin_at DESC
       LIMIT 400`,
      sqlParams
    );

    const rows = result.rows;
    const totals = rows.reduce(
      (acc, row) => {
        acc.total += Number(row.total_checkins || 0);
        acc.allowed += Number(row.allowed_checkins || 0);
        acc.denied += Number(row.denied_checkins || 0);
        return acc;
      },
      { total: 0, allowed: 0, denied: 0 }
    );
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="asistencias_por_cliente.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Asistencias por Cliente', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(
      `Totales: ${totals.total} registros | Permitidos: ${totals.allowed} | Denegados: ${totals.denied}`,
      20
    );
    doc.text(`Filtro de busqueda: ${normalizedSearch || 'Ninguno'} | Estado: ${normalizedStatus || 'Todos'}`, 20);
    doc.moveDown();

    if (rows.length === 0) {
      doc.text('No hay registros para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Cliente', 20, headerY, { width: 220, align: 'left' });
      doc.text('Total', 250, headerY, { width: 55, align: 'right' });
      doc.text('Permit.', 315, headerY, { width: 55, align: 'right' });
      doc.text('Deneg.', 380, headerY, { width: 55, align: 'right' });
      doc.text('Ultimo registro', 445, headerY, { width: 105, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
        const clientLabel = `${row.client_code || '--'} - ${fullName || 'Sin nombre'}`;
        doc.text(clientLabel, 20, y, { width: 220, align: 'left' });
        doc.text(String(row.total_checkins || 0), 250, y, { width: 55, align: 'right' });
        doc.text(String(row.allowed_checkins || 0), 315, y, { width: 55, align: 'right' });
        doc.text(String(row.denied_checkins || 0), 380, y, { width: 55, align: 'right' });
        doc.text(
          row.last_checkin_at
            ? new Date(row.last_checkin_at).toLocaleString('es-NI')
            : '--',
          445,
          y,
          { width: 105, align: 'right' }
        );
        doc.moveDown(0.6);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Asistencias por Cliente', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/attendance-client-detail/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin, search, status, access_type } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio);
    const endDate = String(fechaFin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const normalizedSearch = String(search || '').trim();
    const normalizedStatus = String(status || '').trim();
    if (normalizedStatus && !['allowed', 'denied'].includes(normalizedStatus)) {
      return res.status(400).json({ message: "status debe ser 'allowed' o 'denied'" });
    }

    const normalizedAccessType = String(access_type || '').trim();
    if (normalizedAccessType && !['membership', 'daily_pass'].includes(normalizedAccessType)) {
      return res.status(400).json({ message: "access_type debe ser 'membership' o 'daily_pass'" });
    }

    const conditions = ['ch.checked_in_at::date BETWEEN $1 AND $2'];
    const sqlParams = [startDate, endDate];

    if (normalizedSearch) {
      sqlParams.push(`%${normalizedSearch}%`);
      conditions.push(
        `(c.client_code ILIKE $${sqlParams.length} OR c.first_name ILIKE $${sqlParams.length} OR c.last_name ILIKE $${sqlParams.length} OR COALESCE(c.phone, '') ILIKE $${sqlParams.length})`
      );
    }

    if (normalizedStatus) {
      sqlParams.push(normalizedStatus);
      conditions.push(`ch.status = $${sqlParams.length}`);
    }

    if (normalizedAccessType) {
      sqlParams.push(normalizedAccessType);
      conditions.push(`ch.access_type = $${sqlParams.length}`);
    }

    const result = await query(
      `SELECT
         ch.checked_in_at,
         ch.status,
         ch.access_type,
         ch.notes,
         c.client_code,
         c.first_name,
         c.last_name,
         COALESCE(u.username, u.email, 'sistema') AS checked_by
       FROM checkins ch
       INNER JOIN clients c ON c.id = ch.client_id
       LEFT JOIN users u ON u.id = ch.checked_in_by_user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.first_name ASC, c.last_name ASC, ch.checked_in_at DESC
       LIMIT 1200`,
      sqlParams
    );

    const rows = result.rows;
    const totals = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === 'allowed') {
          acc.allowed += 1;
        }
        if (row.status === 'denied') {
          acc.denied += 1;
        }
        return acc;
      },
      { total: 0, allowed: 0, denied: 0 }
    );
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 32, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="detalle_marcaciones_clientes.pdf"');
    doc.pipe(res);

    doc.fontSize(17).text('Detalle de Marcaciones por Cliente', { align: 'center' });
    doc.moveDown(0.7);
    doc.fontSize(11).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(
      `Totales: ${totals.total} registros | Permitidos: ${totals.allowed} | Denegados: ${totals.denied}`,
      20
    );
    doc.text(
      `Busqueda: ${normalizedSearch || 'Ninguna'} | Estado: ${normalizedStatus || 'Todos'} | Acceso: ${normalizedAccessType || 'Todos'}`,
      20
    );
    doc.moveDown();

    if (rows.length === 0) {
      doc.text('No hay marcaciones para los filtros seleccionados.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.text('Fecha/Hora', 20, headerY, { width: 90, align: 'left' });
      doc.text('Cliente', 112, headerY, { width: 170, align: 'left' });
      doc.text('Estado', 284, headerY, { width: 54, align: 'left' });
      doc.text('Acceso', 340, headerY, { width: 66, align: 'left' });
      doc.text('Usuario', 408, headerY, { width: 64, align: 'left' });
      doc.text('Notas', 474, headerY, { width: 95, align: 'left' });
      doc.moveDown(0.9);

      doc.font('Helvetica').fontSize(8.5);
      rows.forEach((row) => {
        const y = doc.y;
        const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Sin nombre';
        const clientLabel = `${row.client_code || '--'} - ${fullName}`;
        const statusLabel = row.status === 'allowed' ? 'Permitido' : 'Denegado';
        const accessLabel = row.access_type === 'membership' ? 'Membresia' : 'Pase diario';

        doc.text(
          row.checked_in_at ? new Date(row.checked_in_at).toLocaleString('es-NI') : '--',
          20,
          y,
          { width: 90, align: 'left' }
        );
        doc.text(clientLabel, 112, y, { width: 170, align: 'left' });
        doc.text(statusLabel, 284, y, { width: 54, align: 'left' });
        doc.text(accessLabel, 340, y, { width: 66, align: 'left' });
        doc.text(String(row.checked_by || '--'), 408, y, { width: 64, align: 'left' });
        doc.text(String(row.notes || '--'), 474, y, { width: 95, align: 'left' });
        doc.moveDown(0.8);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 86;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 32, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 32, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 32, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Detalle de Marcaciones por Cliente', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 112, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/daily-pass-without-attendance/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const result = await query(
      `SELECT
         p.id,
         p.payment_number,
         p.paid_at,
         p.amount,
         p.payment_method,
         p.reference,
         c.client_code,
         c.first_name,
         c.last_name,
         COALESCE(c.phone, '') AS phone
       FROM payments p
       INNER JOIN clients c ON c.id = p.client_id
       WHERE p.payment_number LIKE 'DAY-%'
         AND p.sale_id IS NULL
         AND p.membership_id IS NULL
         AND p.client_id IS NOT NULL
         AND p.paid_at::date BETWEEN $1::date AND $2::date
         AND NOT EXISTS (
           SELECT 1
           FROM checkins ch
           WHERE ch.client_id = p.client_id
             AND ch.checked_in_at::date = p.paid_at::date
         )
       ORDER BY p.paid_at DESC, p.id DESC
       LIMIT 1500`,
      [startDate, endDate]
    );

    const rows = result.rows;
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const paymentMethodLabel = {
      cash: 'Efectivo',
      card: 'Tarjeta',
      transfer: 'Transferencia',
      mobile: 'Pago movil',
      other: 'Otro'
    };

    const doc = new PDFDocument({ margin: 32, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="rutina_pagada_sin_asistencia.pdf"');
    doc.pipe(res);

    doc.fontSize(17).text('Reporte de Rutina Pagada sin Asistencia', { align: 'center' });
    doc.moveDown(0.7);
    doc.fontSize(11).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(`Registros: ${rows.length} | Monto total: C$${totalAmount.toFixed(2)}`, 20);
    doc.moveDown();

    if (!rows.length) {
      doc.text('No hay pagos de rutina sin asistencia en el periodo seleccionado.');
    } else {
      rows.forEach((row, index) => {
        const paidAt = row.paid_at ? new Date(row.paid_at).toLocaleString('es-NI') : '--';
        const clientName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Sin nombre';
        const clientLabel = `${row.client_code || '--'} - ${clientName}`;
        const method = paymentMethodLabel[row.payment_method] || row.payment_method || 'Sin metodo';
        const reference = String(row.reference || '').trim() || '--';
        const phone = String(row.phone || '').trim() || '--';

        doc.font('Helvetica-Bold').fontSize(10).text(`${index + 1}. ${clientLabel}`, 20);
        doc.font('Helvetica').fontSize(9.5).text(
          `Fecha pago: ${paidAt} | Recibo: ${row.payment_number || row.id} | Metodo: ${method} | Monto: C$${Number(row.amount || 0).toFixed(2)}`,
          30
        );
        doc.text(`Telefono: ${phone} | Referencia: ${reference}`, 30);
        doc.moveDown(0.5);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 86;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 32, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 32, bottom + 12, {
        align: 'left'
      });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 32, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Rutina Pagada sin Asistencia', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 112, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/operational-stats/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio);
    const endDate = String(fechaFin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const result = await query(
      `WITH checkin_summary AS (
         SELECT
           COUNT(*)::int AS total_checkins,
           COUNT(*) FILTER (WHERE status = 'allowed')::int AS allowed_checkins,
           COUNT(*) FILTER (WHERE status = 'denied')::int AS denied_checkins,
           COUNT(DISTINCT client_id) FILTER (WHERE status = 'allowed')::int AS unique_clients
         FROM checkins
         WHERE checked_in_at::date BETWEEN $1 AND $2
       ),
       sales_summary AS (
         SELECT
           COUNT(*)::int AS total_sales,
           COALESCE(SUM(total), 0)::numeric(12,2) AS sales_amount
         FROM sales
         WHERE sold_at::date BETWEEN $1 AND $2
           AND status = 'completed'
       )
       SELECT
         checkin_summary.total_checkins,
         checkin_summary.allowed_checkins,
         checkin_summary.denied_checkins,
         checkin_summary.unique_clients,
         sales_summary.total_sales,
         sales_summary.sales_amount
       FROM checkin_summary
       CROSS JOIN sales_summary`,
      [startDate, endDate]
    );

    const stats = result.rows[0] || {
      total_checkins: 0,
      allowed_checkins: 0,
      denied_checkins: 0,
      unique_clients: 0,
      total_sales: 0,
      sales_amount: 0
    };
    const totalSales = Number(stats.total_sales || 0);
    const salesAmount = Number(stats.sales_amount || 0);
    const avgTicket = totalSales > 0 ? salesAmount / totalSales : 0;
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="estadisticas_operativas.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Estadisticas Operativas', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Asistencias', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Total registros: ${Number(stats.total_checkins || 0)}`, 30);
    doc.text(`Permitidos: ${Number(stats.allowed_checkins || 0)}`, 30);
    doc.text(`Denegados: ${Number(stats.denied_checkins || 0)}`, 30);
    doc.text(`Clientes unicos con ingreso: ${Number(stats.unique_clients || 0)}`, 30);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Ventas', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Ventas completadas: ${totalSales}`, 30);
    doc.text(`Monto vendido: C$${salesAmount.toFixed(2)}`, 30);
    doc.text(`Ticket promedio: C$${avgTicket.toFixed(2)}`, 30);

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Estadisticas Operativas', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/attendance-vs-income/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const result = await query(
      `WITH checkins_summary AS (
         SELECT
           COUNT(*) FILTER (WHERE ch.status = 'allowed')::int AS entries,
           COUNT(DISTINCT ch.client_id) FILTER (WHERE ch.status = 'allowed')::int AS unique_clients
         FROM checkins ch
         WHERE ch.checked_in_at::date BETWEEN $1::date AND $2::date
       ),
       pos_sales AS (
         SELECT
           COUNT(*)::int AS operations,
           COALESCE(SUM(s.total), 0)::numeric(12,2) AS amount
         FROM sales s
         WHERE s.status = 'completed'
           AND s.sold_at::date BETWEEN $1::date AND $2::date
       ),
       membership_income AS (
         SELECT
           COUNT(*)::int AS operations,
           COALESCE(SUM(income_amount), 0)::numeric(12,2) AS amount
         FROM (
           SELECT COALESCE(p.amount, 0)::numeric(12,2) AS income_amount
           FROM payments p
           WHERE p.membership_id IS NOT NULL
             AND p.paid_at::date BETWEEN $1::date AND $2::date

           UNION ALL

           SELECT COALESCE(m.amount_paid, 0)::numeric(12,2) AS income_amount
           FROM memberships m
           WHERE m.amount_paid > 0
             AND m.created_at::date BETWEEN $1::date AND $2::date
             AND NOT EXISTS (
               SELECT 1
               FROM payments p2
               WHERE p2.membership_id = m.id
             )
         ) income_rows
       ),
       daily_pass_income AS (
         SELECT
           COUNT(*)::int AS operations,
           COALESCE(SUM(p.amount), 0)::numeric(12,2) AS amount
         FROM payments p
         WHERE p.payment_number LIKE 'DAY-%'
           AND p.sale_id IS NULL
           AND p.membership_id IS NULL
           AND p.paid_at::date BETWEEN $1::date AND $2::date
       )
       SELECT
         cs.entries,
         cs.unique_clients,
         ps.operations AS pos_operations,
         ps.amount AS pos_amount,
         mi.operations AS membership_operations,
         mi.amount AS membership_amount,
         dp.operations AS daily_pass_operations,
         dp.amount AS daily_pass_amount
       FROM checkins_summary cs
       CROSS JOIN pos_sales ps
       CROSS JOIN membership_income mi
       CROSS JOIN daily_pass_income dp`,
      [startDate, endDate]
    );

    const data = result.rows[0] || {};
    const entries = Number(data.entries || 0);
    const uniqueClients = Number(data.unique_clients || 0);
    const posAmount = Number(data.pos_amount || 0);
    const membershipAmount = Number(data.membership_amount || 0);
    const dailyPassAmount = Number(data.daily_pass_amount || 0);
    const totalIncome = posAmount + membershipAmount + dailyPassAmount;
    const incomePerEntry = entries > 0 ? totalIncome / entries : 0;
    const incomePerClient = uniqueClients > 0 ? totalIncome / uniqueClients : 0;

    let insight = 'Sin suficientes datos para interpretar el periodo.';
    if (entries > 0 && totalIncome > 0) {
      if (entries >= 20 && incomePerEntry < 5) {
        insight = 'Lectura: Hay alta asistencia con bajo ingreso por entrada.';
      } else if (entries <= 10 && incomePerEntry >= 20) {
        insight = 'Lectura: Se genera buen ingreso aun con pocos clientes.';
      } else {
        insight = 'Lectura: Asistencia e ingreso se mantienen en un balance intermedio.';
      }
    }

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="asistencia_vs_ingresos.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Asistencia vs Ingresos', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Asistencia', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Personas que entraron (registros permitidos): ${entries}`, 30);
    doc.text(`Clientes unicos que asistieron: ${uniqueClients}`, 30);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Ingresos generados', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Ventas POS: C$${posAmount.toFixed(2)} (${Number(data.pos_operations || 0)} operaciones)`, 30);
    doc.text(`Membresias: C$${membershipAmount.toFixed(2)} (${Number(data.membership_operations || 0)} operaciones)`, 30);
    doc.text(`Rutina diaria: C$${dailyPassAmount.toFixed(2)} (${Number(data.daily_pass_operations || 0)} operaciones)`, 30);
    doc.text(`Ingreso total: C$${totalIncome.toFixed(2)}`, 30);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Indicadores', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Ingreso por entrada: C$${incomePerEntry.toFixed(2)}`, 30);
    doc.text(`Ingreso por cliente unico: C$${incomePerClient.toFixed(2)}`, 30);
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(11).text(insight, 20);

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, {
        align: 'left'
      });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Asistencia vs Ingresos', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/hourly-occupancy/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const result = await query(
      `WITH hours AS (
         SELECT generate_series(0, 23) AS hour_number
       )
       SELECT
         h.hour_number,
         COALESCE(COUNT(ch.id), 0)::int AS entries,
         COALESCE(COUNT(DISTINCT ch.client_id), 0)::int AS unique_clients
       FROM hours h
       LEFT JOIN checkins ch
         ON EXTRACT(HOUR FROM ch.checked_in_at) = h.hour_number
        AND ch.status = 'allowed'
        AND ch.checked_in_at::date BETWEEN $1::date AND $2::date
       GROUP BY h.hour_number
       ORDER BY h.hour_number ASC`,
      [startDate, endDate]
    );

    const rows = result.rows || [];
    const peak = rows.reduce(
      (best, row) => (Number(row.entries || 0) > Number(best.entries || 0) ? row : best),
      { hour_number: 0, entries: 0 }
    );
    const totalEntries = rows.reduce((sum, row) => sum + Number(row.entries || 0), 0);
    const avgPerHour = rows.length > 0 ? totalEntries / rows.length : 0;

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ocupacion_por_hora.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Ocupacion por Hora', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(`Hora pico: ${String(peak.hour_number || 0).padStart(2, '0')}:00 (${Number(peak.entries || 0)} ingresos)`, 20);
    doc.text(`Promedio por hora: ${avgPerHour.toFixed(2)} ingresos`, 20);
    doc.moveDown();

    const headerY = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Hora', 20, headerY, { width: 120, align: 'left' });
    doc.text('Ingresos', 220, headerY, { width: 120, align: 'right' });
    doc.text('Clientes unicos', 360, headerY, { width: 180, align: 'right' });
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(10);
    rows.forEach((row) => {
      const y = doc.y;
      const hourLabel = `${String(Number(row.hour_number || 0)).padStart(2, '0')}:00`;
      doc.text(hourLabel, 20, y, { width: 120, align: 'left' });
      doc.text(String(Number(row.entries || 0)), 220, y, { width: 120, align: 'right' });
      doc.text(String(Number(row.unique_clients || 0)), 360, y, { width: 180, align: 'right' });
      doc.moveDown(0.7);
    });

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, {
        align: 'left'
      });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Ocupacion por Hora', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/real-active-clients/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const result = await query(
      `SELECT
         c.id,
         c.client_code,
         c.first_name,
         c.last_name,
         COUNT(ch.id)::int AS attendance_count,
         MAX(ch.checked_in_at) AS last_checkin_at,
         lm.plan_name,
         lm.membership_status
       FROM clients c
       INNER JOIN checkins ch
         ON ch.client_id = c.id
        AND ch.status = 'allowed'
        AND ch.checked_in_at::date BETWEEN $1::date AND $2::date
       LEFT JOIN LATERAL (
         SELECT
           mp.name AS plan_name,
           m.status AS membership_status
         FROM memberships m
         LEFT JOIN membership_plans mp ON mp.id = m.plan_id
         WHERE m.client_id = c.id
         ORDER BY m.end_date DESC, m.id DESC
         LIMIT 1
       ) lm ON TRUE
       GROUP BY c.id, c.client_code, c.first_name, c.last_name, lm.plan_name, lm.membership_status
       ORDER BY attendance_count DESC, last_checkin_at DESC
       LIMIT 1000`,
      [startDate, endDate]
    );

    const rows = result.rows || [];
    const activeClientsCount = rows.length;
    const activeWithMembership = rows.filter((row) => String(row.membership_status || '').toLowerCase() === 'active').length;

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const doc = new PDFDocument({ margin: 32, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes_activos_reales.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Clientes Activos Reales', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(`Clientes activos reales (asistieron): ${activeClientsCount}`, 20);
    doc.text(`Activos con membresia vigente: ${activeWithMembership}`, 20);
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text('No hay clientes con asistencias permitidas en el periodo seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.text('Cliente', 20, headerY, { width: 185, align: 'left' });
      doc.text('Asistencias', 205, headerY, { width: 65, align: 'right' });
      doc.text('Ultimo ingreso', 270, headerY, { width: 120, align: 'right' });
      doc.text('Plan', 390, headerY, { width: 105, align: 'left' });
      doc.text('Estado memb.', 495, headerY, { width: 65, align: 'right' });
      doc.moveDown(0.9);

      doc.font('Helvetica').fontSize(8.5);
      rows.forEach((row) => {
        const y = doc.y;
        const clientLabel = `${row.client_code || '--'} - ${row.first_name || ''} ${row.last_name || ''}`.trim();
        doc.text(clientLabel || 'Sin nombre', 20, y, { width: 185, align: 'left' });
        doc.text(String(Number(row.attendance_count || 0)), 205, y, { width: 65, align: 'right' });
        doc.text(
          row.last_checkin_at ? new Date(row.last_checkin_at).toLocaleString('es-NI') : '--',
          270,
          y,
          { width: 120, align: 'right' }
        );
        doc.text(row.plan_name || '--', 390, y, { width: 105, align: 'left' });
        doc.text(normalizeMembershipStatusLabel(row.membership_status || '--'), 495, y, {
          width: 65,
          align: 'right'
        });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 86;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 32, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 32, bottom + 12, {
        align: 'left'
      });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 32, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Clientes Activos Reales', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 112, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/cash-sessions/options', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, status, opened_at, closed_at
       FROM cash_register_sessions
       ORDER BY opened_at DESC
       LIMIT 100`
    );

    res.json({ ok: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/cash-summary/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin, session_id, session_status } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const sessionId = session_id ? Number.parseInt(String(session_id), 10) : null;
    if (session_id && (!Number.isInteger(sessionId) || sessionId <= 0)) {
      return res.status(400).json({ message: 'session_id debe ser un entero positivo' });
    }

    const sessionStatus = String(session_status || '').trim();
    if (sessionStatus && !['open', 'closed'].includes(sessionStatus)) {
      return res.status(400).json({ message: "session_status debe ser 'open' o 'closed'" });
    }

    const conditions = ['cs.opened_at::date BETWEEN $1 AND $2'];
    const sqlParams = [fechaInicio, fechaFin];

    if (sessionId) {
      sqlParams.push(sessionId);
      conditions.push(`cs.id = $${sqlParams.length}`);
    }

    if (sessionStatus) {
      sqlParams.push(sessionStatus);
      conditions.push(`cs.status = $${sqlParams.length}`);
    }

    const sessionResult = await query(
      `SELECT
         cs.id,
         cs.status,
         cs.opened_at,
         cs.closed_at,
         cs.opening_amount,
         cs.closing_amount,
         cs.expected_amount,
         cs.difference_amount
       FROM cash_register_sessions cs
       WHERE ${conditions.join(' AND ')}
       ORDER BY cs.opened_at DESC`,
      sqlParams
    );

    const sessionRows = sessionResult.rows;
    const rows = await Promise.all(
      sessionRows.map(async (sessionRow) => {
        const summary = await buildCashSessionSummary(sessionRow.id);
        const totalOperations =
          Number(summary.metrics.pos_sales_count || 0) +
          Number(summary.metrics.membership_sales_count || 0) +
          Number(summary.metrics.daily_pass_sales_count || 0);

        return {
          id: summary.session.id,
          status: summary.session.status,
          opened_at: summary.session.opened_at,
          closed_at: summary.session.closed_at,
          opening_amount: Number(summary.session.opening_amount || 0),
          closing_amount:
            summary.session.closing_amount == null ? null : Number(summary.session.closing_amount),
          expected_amount:
            summary.session.status === 'closed' && summary.session.expected_amount != null
              ? Number(summary.session.expected_amount)
              : Number(summary.metrics.expected_closing_amount || 0),
          difference_amount:
            summary.session.status === 'closed' && summary.session.difference_amount != null
              ? Number(summary.session.difference_amount)
              : null,
          total_sales: totalOperations,
          total_sales_amount: Number(summary.metrics.total_sales_all_channels || 0),
          total_cash: Number(summary.metrics.all_channels_income_by_payment_method?.cash || 0),
          total_card: Number(summary.metrics.all_channels_income_by_payment_method?.card || 0),
          total_transfer: Number(summary.metrics.all_channels_income_by_payment_method?.transfer || 0),
          total_mobile: Number(summary.metrics.all_channels_income_by_payment_method?.mobile || 0),
          total_other: Number(summary.metrics.all_channels_income_by_payment_method?.other || 0),
          membership_income: Number(summary.metrics.membership_sales_amount || 0),
          daily_pass_income: Number(summary.metrics.daily_pass_sales_amount || 0),
          total_extra_income:
            Number(summary.metrics.membership_sales_amount || 0) +
            Number(summary.metrics.daily_pass_sales_amount || 0)
        };
      })
    );

    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const totals = rows.reduce(
      (acc, row) => {
        acc.totalSales += Number(row.total_sales || 0);
        acc.totalSalesAmount += Number(row.total_sales_amount || 0);
        acc.totalCash += Number(row.total_cash || 0);
        acc.totalCard += Number(row.total_card || 0);
        acc.totalTransfer += Number(row.total_transfer || 0);
        acc.totalMobile += Number(row.total_mobile || 0);
        acc.totalOther += Number(row.total_other || 0);
        acc.membershipIncome += Number(row.membership_income || 0);
        acc.dailyPassIncome += Number(row.daily_pass_income || 0);
        acc.totalExtraIncome += Number(row.total_extra_income || 0);
        return acc;
      },
      {
        totalSales: 0,
        totalSalesAmount: 0,
        totalCash: 0,
        totalCard: 0,
        totalTransfer: 0,
        totalMobile: 0,
        totalOther: 0,
        membershipIncome: 0,
        dailyPassIncome: 0,
        totalExtraIncome: 0
      }
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resumen_caja.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte Resumen de Caja', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${fechaInicio}  Hasta: ${fechaFin}`, 20);
    const filters = [];
    if (sessionId) {
      filters.push(`Sesion: ${sessionId}`);
    }
    if (sessionStatus) {
      filters.push(`Estado: ${sessionStatus}`);
    }
    doc.text(`Filtros: ${filters.join(' | ') || 'Sin filtros adicionales'}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(`Sesiones: ${rows.length}`, 20, doc.y, { continued: true });
    doc.text(`  Ventas: ${totals.totalSales}`, { continued: true });
    doc.text(`  Total vendido: C$${totals.totalSalesAmount.toFixed(2)}`);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10);
    doc.text(
      `Pagos - Efectivo: C$${totals.totalCash.toFixed(2)} | Tarjeta: C$${totals.totalCard.toFixed(2)} | Transferencia: C$${totals.totalTransfer.toFixed(2)} | Movil: C$${totals.totalMobile.toFixed(2)} | Otros: C$${totals.totalOther.toFixed(2)}`
    );
    doc.text(
      `Ventas - Ventas POS: C$${(totals.totalSalesAmount - totals.membershipIncome - totals.dailyPassIncome).toFixed(2)} | Membresias: C$${totals.membershipIncome.toFixed(2)} | Rutina diaria: C$${totals.dailyPassIncome.toFixed(2)}`
    );
    doc.moveDown();

    if (rows.length === 0) {
      doc.text('No hay sesiones de caja en el rango de fechas seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Sesion', 20, headerY, { width: 45, align: 'left' });
      doc.text('Estado', 65, headerY, { width: 50, align: 'left' });
      doc.text('Apertura', 115, headerY, { width: 115, align: 'left' });
      doc.text('Ventas', 230, headerY, { width: 40, align: 'right' });
      doc.text('Total', 270, headerY, { width: 70, align: 'right' });
      doc.text('Esperado', 340, headerY, { width: 70, align: 'right' });
      doc.text('Cierre', 410, headerY, { width: 70, align: 'right' });
      doc.text('Dif.', 480, headerY, { width: 70, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(String(row.id), 20, y, { width: 45, align: 'left' });
        doc.text(row.status === 'open' ? 'Abierta' : 'Cerrada', 65, y, { width: 50, align: 'left' });
        doc.text(new Date(row.opened_at).toLocaleString('es-NI'), 115, y, { width: 115, align: 'left' });
        doc.text(String(row.total_sales || 0), 230, y, { width: 40, align: 'right' });
        doc.text(`C$${Number(row.total_sales_amount || 0).toFixed(2)}`, 270, y, { width: 70, align: 'right' });
        doc.text(`C$${Number(row.expected_amount || 0).toFixed(2)}`, 340, y, { width: 70, align: 'right' });
        doc.text(`C$${Number(row.closing_amount || 0).toFixed(2)}`, 410, y, { width: 70, align: 'right' });
        doc.text(`C$${Number(row.difference_amount || 0).toFixed(2)}`, 480, y, { width: 70, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte Resumen de Caja', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/cash-flow/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const result = await query(
      `WITH product_entries AS (
         SELECT
           COUNT(*)::int AS operations,
           COALESCE(SUM(s.total), 0)::numeric(12,2) AS amount
         FROM sales s
         WHERE s.status = 'completed'
           AND s.sold_at::date BETWEEN $1::date AND $2::date
       ),
       membership_entries AS (
         SELECT
           COALESCE(SUM(membership_amount), 0)::numeric(12,2) AS amount
         FROM (
           SELECT COALESCE(p.amount, 0)::numeric(12,2) AS membership_amount
           FROM payments p
           WHERE p.membership_id IS NOT NULL
             AND p.paid_at::date BETWEEN $1::date AND $2::date

           UNION ALL

           SELECT COALESCE(m.amount_paid, 0)::numeric(12,2) AS membership_amount
           FROM memberships m
           WHERE m.amount_paid > 0
             AND m.created_at::date BETWEEN $1::date AND $2::date
             AND NOT EXISTS (
               SELECT 1
               FROM payments p2
               WHERE p2.membership_id = m.id
             )
         ) membership_rows
       ),
       routine_entries AS (
         SELECT
           COUNT(*)::int AS operations,
           COALESCE(SUM(p.amount), 0)::numeric(12,2) AS amount
         FROM payments p
         WHERE p.payment_number LIKE 'DAY-%'
           AND p.sale_id IS NULL
           AND p.membership_id IS NULL
           AND p.paid_at::date BETWEEN $1::date AND $2::date
       ),
       expenses AS (
         SELECT COALESCE(SUM(cm.amount), 0)::numeric(12,2) AS amount
         FROM cash_movements cm
         WHERE cm.movement_type = 'expense'
           AND cm.created_at::date BETWEEN $1::date AND $2::date
       ),
       sessions AS (
         SELECT
           COUNT(*)::int AS sessions_count,
           COALESCE(
             (
               SELECT first_session.opening_amount::numeric(12,2)
               FROM cash_register_sessions first_session
               WHERE first_session.opened_at::date BETWEEN $1::date AND $2::date
               ORDER BY first_session.opened_at ASC, first_session.id ASC
               LIMIT 1
             ),
             0
           )::numeric(12,2) AS opening_total,
           COALESCE(
             (
               SELECT COALESCE(last_session.closing_amount, last_session.expected_amount, last_session.opening_amount)::numeric(12,2)
               FROM cash_register_sessions last_session
               WHERE last_session.opened_at::date BETWEEN $1::date AND $2::date
               ORDER BY last_session.opened_at DESC, last_session.id DESC
               LIMIT 1
             ),
             0
           )::numeric(12,2) AS closing_total
         FROM cash_register_sessions cs
         WHERE cs.opened_at::date BETWEEN $1::date AND $2::date
       )
       SELECT
         pe.operations AS product_operations,
         pe.amount AS product_amount,
         me.amount AS membership_amount,
         re.operations AS routine_operations,
         re.amount AS routine_amount,
         ex.amount AS expense_amount,
         s.sessions_count,
         s.opening_total,
         s.closing_total
       FROM product_entries pe
       CROSS JOIN membership_entries me
       CROSS JOIN routine_entries re
       CROSS JOIN expenses ex
       CROSS JOIN sessions s`,
      [startDate, endDate]
    );

    const data = result.rows[0] || {};
    const productAmount = Number(data.product_amount || 0);
    const membershipAmount = Number(data.membership_amount || 0);
    const routineAmount = Number(data.routine_amount || 0);
    const expenseAmount = Number(data.expense_amount || 0);
    const totalEntries = productAmount + membershipAmount + routineAmount;
    const netCashFlow = totalEntries - expenseAmount;

    const previousBalanceResult = await query(
      `SELECT COALESCE(cs.closing_amount, cs.expected_amount, cs.opening_amount, 0)::numeric(12,2) AS previous_balance
       FROM cash_register_sessions cs
       WHERE cs.opened_at::date < $1::date
       ORDER BY cs.opened_at DESC, cs.id DESC
       LIMIT 1`,
      [startDate]
    );

    const openingTotal = Number(previousBalanceResult.rows[0]?.previous_balance || 0);
    const closingTotal = openingTotal + netCashFlow;

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="flujo_efectivo.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Flujo de Efectivo', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Entradas del periodo', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Productos (ventas): C$${productAmount.toFixed(2)} (${Number(data.product_operations || 0)} ventas)`, 30);
    doc.text(`Membresias: C$${membershipAmount.toFixed(2)}`, 30);
    doc.text(`Rutinas diarias: C$${routineAmount.toFixed(2)} (${Number(data.routine_operations || 0)} pagos)`, 30);
    doc.text(`Total entradas: C$${totalEntries.toFixed(2)}`, 30);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Salidas del periodo', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Gastos / egresos: C$${expenseAmount.toFixed(2)}`, 30);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Caja', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Sesiones consideradas: ${Number(data.sessions_count || 0)}`, 30);
    doc.text(`Caja inicial total: C$${openingTotal.toFixed(2)}`, 30);
    doc.text(`Caja final total: C$${closingTotal.toFixed(2)}`, 30);
    doc.text(`Flujo neto (entradas - salidas): C$${netCashFlow.toFixed(2)}`, 30);

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Flujo de Efectivo', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/income-by-payment-method/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const { rows } = await query(
      `WITH payments_source AS (
         SELECT
           p.payment_method,
           COALESCE(p.amount, 0)::numeric(12,2) AS amount
         FROM payments p
         WHERE p.paid_at::date BETWEEN $1::date AND $2::date
       ),
       memberships_without_payment AS (
         SELECT
           'cash'::text AS payment_method,
           COALESCE(m.amount_paid, 0)::numeric(12,2) AS amount
         FROM memberships m
         WHERE m.amount_paid > 0
           AND m.created_at::date BETWEEN $1::date AND $2::date
           AND NOT EXISTS (
             SELECT 1
             FROM payments p2
             WHERE p2.membership_id = m.id
           )
       ),
       all_income_rows AS (
         SELECT * FROM payments_source
         UNION ALL
         SELECT * FROM memberships_without_payment
       )
       SELECT
         payment_method,
         COUNT(*)::int AS operations,
         COALESCE(SUM(amount), 0)::numeric(12,2) AS amount
       FROM all_income_rows
       GROUP BY payment_method
       ORDER BY amount DESC`,
      [startDate, endDate]
    );

    const methodLabel = {
      cash: 'Efectivo',
      transfer: 'Transferencia',
      card: 'POS',
      mobile: 'Pago movil',
      other: 'Otro'
    };

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ingresos_por_metodo_pago.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Ingresos por Metodo de Pago', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(`Ingreso total cobrado: C$${totalAmount.toFixed(2)}`, 20);
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text('No hay ingresos registrados en el rango seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Metodo', 20, headerY, { width: 220, align: 'left' });
      doc.text('Operaciones', 240, headerY, { width: 120, align: 'right' });
      doc.text('Monto', 360, headerY, { width: 180, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(10);
      rows.forEach((row) => {
        const y = doc.y;
        doc.text(methodLabel[row.payment_method] || row.payment_method || 'Sin metodo', 20, y, {
          width: 220,
          align: 'left'
        });
        doc.text(String(row.operations || 0), 240, y, { width: 120, align: 'right' });
        doc.text(`C$${Number(row.amount || 0).toFixed(2)}`, 360, y, { width: 180, align: 'right' });
        doc.moveDown(0.8);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Ingresos por Metodo de Pago', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/sales-vs-income/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const result = await query(
      `WITH billed_sales AS (
         SELECT
           COUNT(*)::int AS operations,
           COALESCE(SUM(s.total), 0)::numeric(12,2) AS amount
         FROM sales s
         WHERE s.status = 'completed'
           AND s.sold_at::date BETWEEN $1::date AND $2::date
       ),
       collected_income AS (
         SELECT
           COUNT(*)::int AS operations,
           COALESCE(SUM(p.amount), 0)::numeric(12,2) AS amount
         FROM payments p
         WHERE p.paid_at::date BETWEEN $1::date AND $2::date
       ),
       collected_from_sales AS (
         SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2) AS amount
         FROM payments p
         WHERE p.sale_id IS NOT NULL
           AND p.paid_at::date BETWEEN $1::date AND $2::date
       ),
       collected_other AS (
         SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2) AS amount
         FROM payments p
         WHERE p.sale_id IS NULL
           AND p.paid_at::date BETWEEN $1::date AND $2::date
       )
       SELECT
         bs.operations AS billed_operations,
         bs.amount AS billed_amount,
         ci.operations AS collected_operations,
         ci.amount AS collected_amount,
         cfs.amount AS collected_sales_amount,
         co.amount AS collected_other_amount
       FROM billed_sales bs
       CROSS JOIN collected_income ci
       CROSS JOIN collected_from_sales cfs
       CROSS JOIN collected_other co`,
      [startDate, endDate]
    );

    const data = result.rows[0] || {};
    const billedAmount = Number(data.billed_amount || 0);
    const collectedAmount = Number(data.collected_amount || 0);
    const collectedSalesAmount = Number(data.collected_sales_amount || 0);
    const collectedOtherAmount = Number(data.collected_other_amount || 0);
    const gap = collectedAmount - billedAmount;

    const usuario = req.user?.username || req.user?.email || 'Desconocido';
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas_vs_ingresos.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Ventas vs Ingresos', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Comparativo principal', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Ventas facturadas: C$${billedAmount.toFixed(2)} (${Number(data.billed_operations || 0)} ventas)`, 30);
    doc.text(`Ingresos cobrados: C$${collectedAmount.toFixed(2)} (${Number(data.collected_operations || 0)} cobros)`, 30);
    doc.text(`Diferencia (ingresos - ventas): C$${gap.toFixed(2)}`, 30);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).text('Detalle de ingresos cobrados', 20);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Cobrado de ventas POS: C$${collectedSalesAmount.toFixed(2)}`, 30);
    doc.text(`Cobrado de membresias/rutinas: C$${collectedOtherAmount.toFixed(2)}`, 30);

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Ventas vs Ingresos', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/top-clients/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin, limit: limitRaw } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const limit = limitRaw ? Number.parseInt(String(limitRaw), 10) : 10;
    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      return res.status(400).json({ message: 'limit debe ser un entero entre 1 y 100' });
    }

    const { rows } = await query(
      `WITH sales_source AS (
         SELECT
           s.client_id,
           s.sold_at::date AS operation_date,
           COALESCE(s.total, 0)::numeric(12,2) AS amount
         FROM sales s
         WHERE s.status = 'completed'
           AND s.client_id IS NOT NULL
           AND s.sold_at::date BETWEEN $1::date AND $2::date
       ),
       membership_source AS (
         SELECT
           m.client_id,
           m.created_at::date AS operation_date,
           COALESCE(m.amount_paid, 0)::numeric(12,2) AS amount
         FROM memberships m
         WHERE m.client_id IS NOT NULL
           AND m.amount_paid > 0
           AND m.created_at::date BETWEEN $1::date AND $2::date
       ),
       all_operations AS (
         SELECT * FROM sales_source
         UNION ALL
         SELECT * FROM membership_source
       )
       SELECT
         c.id AS client_id,
         c.client_code,
         c.first_name,
         c.last_name,
         COUNT(*)::int AS operation_count,
         COUNT(DISTINCT ao.operation_date)::int AS active_days,
         COALESCE(SUM(ao.amount), 0)::numeric(12,2) AS total_paid
       FROM all_operations ao
       INNER JOIN clients c ON c.id = ao.client_id
       GROUP BY c.id, c.client_code, c.first_name, c.last_name
       ORDER BY total_paid DESC, operation_count DESC, c.last_name ASC
       LIMIT $3`,
      [startDate, endDate, limit]
    );

    const totalAmount = rows.reduce((sum, row) => sum + Number(row.total_paid || 0), 0);
    const totalOperations = rows.reduce((sum, row) => sum + Number(row.operation_count || 0), 0);
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="top_clientes.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Top Clientes', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(`Top: ${limit} clientes | Monto total del top: C$${totalAmount.toFixed(2)} | Frecuencia total: ${totalOperations}`, 20);
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text('No hay operaciones con cliente en el rango seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Cliente', 20, headerY, { width: 220, align: 'left' });
      doc.text('Compras', 240, headerY, { width: 70, align: 'right' });
      doc.text('Dias activos', 310, headerY, { width: 80, align: 'right' });
      doc.text('Pagado', 390, headerY, { width: 160, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const clientLabel = `${row.client_code || `#${row.client_id}`} - ${`${row.first_name || ''} ${row.last_name || ''}`.trim()}`;
        doc.text(clientLabel, 20, y, { width: 220, align: 'left' });
        doc.text(String(Number(row.operation_count || 0)), 240, y, { width: 70, align: 'right' });
        doc.text(String(Number(row.active_days || 0)), 310, y, { width: 80, align: 'right' });
        doc.text(`C$${Number(row.total_paid || 0).toFixed(2)}`, 390, y, { width: 160, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Top Clientes', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/top-products/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin, limit: limitRaw } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const limit = limitRaw ? Number.parseInt(String(limitRaw), 10) : 10;
    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      return res.status(400).json({ message: 'limit debe ser un entero entre 1 y 100' });
    }

    const { rows } = await query(
      `SELECT
         p.id,
         p.name AS product_name,
         p.sku,
         COUNT(DISTINCT s.id)::int AS tickets_count,
         COALESCE(SUM(si.quantity), 0)::numeric(12,2) AS units_sold,
         COALESCE(SUM(si.line_total), 0)::numeric(12,2) AS sales_amount
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       INNER JOIN products p ON p.id = si.product_id
       WHERE s.status = 'completed'
         AND s.sold_at::date BETWEEN $1::date AND $2::date
       GROUP BY p.id, p.name, p.sku
       ORDER BY units_sold DESC, sales_amount DESC, p.name ASC
       LIMIT $3`,
      [startDate, endDate, limit]
    );

    const totalUnits = rows.reduce((sum, row) => sum + Number(row.units_sold || 0), 0);
    const totalSales = rows.reduce((sum, row) => sum + Number(row.sales_amount || 0), 0);
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="productos_mas_vendidos.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Productos Mas Vendidos', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(`Top: ${limit} productos | Unidades vendidas del top: ${totalUnits.toFixed(2)} | Venta del top: C$${totalSales.toFixed(2)}`, 20);
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text('No hay ventas de productos en el rango seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Producto', 20, headerY, { width: 240, align: 'left' });
      doc.text('Tickets', 260, headerY, { width: 60, align: 'right' });
      doc.text('Unidades', 320, headerY, { width: 80, align: 'right' });
      doc.text('Monto', 400, headerY, { width: 150, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(9);
      rows.forEach((row) => {
        const y = doc.y;
        const productLabel = row.sku ? `${row.product_name} (${row.sku})` : row.product_name;
        doc.text(productLabel, 20, y, { width: 240, align: 'left' });
        doc.text(String(Number(row.tickets_count || 0)), 260, y, { width: 60, align: 'right' });
        doc.text(Number(row.units_sold || 0).toFixed(2), 320, y, { width: 80, align: 'right' });
        doc.text(`C$${Number(row.sales_amount || 0).toFixed(2)}`, 400, y, { width: 150, align: 'right' });
        doc.moveDown(0.7);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Productos Mas Vendidos', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/sales-by-hour/pdf', async (req, res, next) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    const startDate = String(fechaInicio).trim();
    const endDate = String(fechaFin).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'fechaInicio y fechaFin deben tener formato YYYY-MM-DD' });
    }

    const { rows } = await query(
      `SELECT
         EXTRACT(HOUR FROM s.sold_at)::int AS sale_hour,
         COUNT(*)::int AS sales_count,
         COALESCE(SUM(s.total), 0)::numeric(12,2) AS sales_amount,
         COALESCE(AVG(s.total), 0)::numeric(12,2) AS avg_ticket
       FROM sales s
       WHERE s.status = 'completed'
         AND s.sold_at::date BETWEEN $1::date AND $2::date
       GROUP BY EXTRACT(HOUR FROM s.sold_at)
       ORDER BY EXTRACT(HOUR FROM s.sold_at) ASC`,
      [startDate, endDate]
    );

    const totalSales = rows.reduce((sum, row) => sum + Number(row.sales_amount || 0), 0);
    const totalOperations = rows.reduce((sum, row) => sum + Number(row.sales_count || 0), 0);
    const topHour = rows.reduce(
      (best, row) => (Number(row.sales_amount || 0) > Number(best.sales_amount || 0) ? row : best),
      rows[0] || { sale_hour: null, sales_amount: 0 }
    );
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas_por_horario.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Ventas por Horario', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Desde: ${startDate}  Hasta: ${endDate}`, 20);
    doc.text(`Operaciones: ${totalOperations} | Monto total: C$${totalSales.toFixed(2)}`, 20);
    if (rows.length) {
      doc.text(
        `Hora pico de ingresos: ${String(Number(topHour.sale_hour || 0)).padStart(2, '0')}:00 (C$${Number(topHour.sales_amount || 0).toFixed(2)})`,
        20
      );
    }
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(11).text('No hay ventas en el rango seleccionado.');
    } else {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Horario', 20, headerY, { width: 120, align: 'left' });
      doc.text('Ventas', 140, headerY, { width: 120, align: 'right' });
      doc.text('Monto', 260, headerY, { width: 140, align: 'right' });
      doc.text('Ticket promedio', 400, headerY, { width: 150, align: 'right' });
      doc.moveDown(1);

      doc.font('Helvetica').fontSize(10);
      rows.forEach((row) => {
        const y = doc.y;
        const hour = String(Number(row.sale_hour || 0)).padStart(2, '0');
        doc.text(`${hour}:00 - ${hour}:59`, 20, y, { width: 120, align: 'left' });
        doc.text(String(Number(row.sales_count || 0)), 140, y, { width: 120, align: 'right' });
        doc.text(`C$${Number(row.sales_amount || 0).toFixed(2)}`, 260, y, { width: 140, align: 'right' });
        doc.text(`C$${Number(row.avg_ticket || 0).toFixed(2)}`, 400, y, { width: 150, align: 'right' });
        doc.moveDown(0.8);
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      doc.fontSize(8).text(`Pagina: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
      doc.fontSize(9).text('Reporte de Ventas por Horario', 1, bottom, { align: 'center' });
      doc.fontSize(8).text(`Usuario: ${usuario}`, 1, bottom + 12, { align: 'center' });
      doc.fontSize(9).text('Rohi-POS', doc.page.width - 120, bottom, { align: 'left' });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/membership-card/client/:clientId/pdf', async (req, res, next) => {
  try {
    const clientId = Number.parseInt(req.params.clientId, 10);

    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ message: 'clientId debe ser un entero positivo' });
    }

    const result = await query(
      `SELECT
         c.id,
         c.client_code,
         c.first_name,
         c.last_name,
         c.email,
         c.phone,
         c.photo_url,
         c.is_active,
         m.membership_number,
         m.start_date,
         m.end_date,
         m.status AS membership_status,
         mp.name AS plan_name
       FROM clients c
       LEFT JOIN LATERAL (
         SELECT *
         FROM memberships
         WHERE client_id = c.id
         ORDER BY end_date DESC, id DESC
         LIMIT 1
       ) m ON TRUE
       LEFT JOIN membership_plans mp ON mp.id = m.plan_id
       WHERE c.id = $1`,
      [clientId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    const client = result.rows[0];
    const effectiveStatus = inferMembershipStatus(
      client.start_date,
      client.end_date,
      client.membership_status
    );

    const doc = new PDFDocument({ margin: 32, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="carnet_membresia_${client.client_code || client.id}.pdf"`
    );
    doc.pipe(res);

    doc.roundedRect(70, 120, 460, 260, 18).lineWidth(1).strokeColor('#d6c9ad').stroke();
    doc.rect(70, 120, 460, 48).fill('#18473d');

    doc
      .fillColor('#ffffff')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('ROHIPOS - CARNET DE MEMBRESIA', 90, 136, { width: 420, align: 'left' });

    const qrDataUrl = await QRCode.toDataURL(String(client.client_code || client.id), {
      width: 420,
      margin: 1,
      errorCorrectionLevel: 'M'
    });
    const qrImage = getImageBufferFromDataUrl(qrDataUrl);

    doc.roundedRect(90, 186, 120, 144, 8).lineWidth(0.8).strokeColor('#d6c9ad').stroke();
    if (qrImage?.buffer) {
      doc.image(qrImage.buffer, 96, 202, { fit: [108, 108], align: 'center', valign: 'center' });
    }
    doc
      .fillColor('#6b7280')
      .fontSize(9)
      .font('Helvetica')
      .text('QR de cliente', 90, 316, { width: 120, align: 'center' });

    doc.fillColor('#18473d').fontSize(11).font('Helvetica-Bold');
    doc.text('Codigo', 230, 188);
    doc.text('Cliente', 230, 215);
    doc.text('Plan', 230, 242);
    doc.text('Numero membresia', 230, 269);
    doc.text('Vigencia', 230, 296);
    doc.text('Estado', 230, 323);

    doc.fillColor('#1f2937').fontSize(12).font('Helvetica');
    doc.text(client.client_code || '--', 360, 188, { width: 150, align: 'left' });
    doc.text(`${client.first_name || ''} ${client.last_name || ''}`.trim() || '--', 360, 215, {
      width: 150,
      align: 'left'
    });
    doc.text(client.plan_name || 'Sin plan activo', 360, 242, { width: 150, align: 'left' });
    doc.text(client.membership_number || '--', 360, 269, { width: 150, align: 'left' });
    doc.text(
      client.start_date && client.end_date
        ? `${new Date(client.start_date).toLocaleDateString('es-NI')} - ${new Date(
            client.end_date
          ).toLocaleDateString('es-NI')}`
        : 'No definida',
      360,
      296,
      { width: 150, align: 'left' }
    );
    doc.text(effectiveStatus, 360, 323, { width: 150, align: 'left' });

    doc
      .fillColor('#6b7280')
      .fontSize(10)
      .font('Helvetica')
      .text(
        `Emitido por: ${req.user?.username || req.user?.email || 'sistema'}  |  Fecha: ${new Date().toLocaleDateString('es-NI')}`,
        70,
        402,
        { width: 460, align: 'center' }
      );

    doc.end();
  } catch (err) {
    next(err);
  }
});

export default reportsRouter;
