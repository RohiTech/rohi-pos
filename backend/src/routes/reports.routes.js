
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Router } from 'express';
import { query } from '../config/db.js';

const reportsRouter = Router();

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
      cash_register_session_id: cashSessionIdRaw
    } = req.query;

    const today = new Date().toISOString().slice(0, 10);
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

    const conditions = ['s.sold_at::date BETWEEN $1 AND $2'];
    const sqlParams = [startDate, endDate];

    if (saleStatus) {
      sqlParams.push(saleStatus);
      conditions.push(`s.status = $${sqlParams.length}`);
    } else {
      conditions.push("s.status = 'completed'");
    }

    if (cashierUserId) {
      sqlParams.push(cashierUserId);
      conditions.push(`s.cashier_user_id = $${sqlParams.length}`);
    }

    if (cashSessionId) {
      sqlParams.push(cashSessionId);
      conditions.push(`s.cash_register_session_id = $${sqlParams.length}`);
    }

    const { rows } = await query(
      `SELECT
         s.sale_number,
         s.total,
         s.sold_at,
         s.cashier_user_id,
         u.username AS cashier_username,
         s.status,
         s.cash_register_session_id
       FROM sales s
       LEFT JOIN users u ON u.id = s.cashier_user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.sold_at DESC`,
      sqlParams
    );

    // Datos de usuario autenticado
    const usuario = req.user?.username || req.user?.email || 'Desconocido';

    // Totales
    const totalVentas = rows.length;
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
    doc.text(`Filtros: ${appliedFilters.join(' | ')}`, 20);
    doc.moveDown();

    if (rows.length === 0) {
      doc.text('No hay ventas registradas para hoy.');
    } else {
      // Titulos de columna alineados
      const startY = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('N° Venta', 20, startY, { width: 100, align: 'left' });
      doc.text('Total (C$)', 120, startY, { width: 100, align: 'right' });
      doc.text('Hora', 230, startY, { width: 100, align: 'center' });
      doc.text('Cajero', 330, startY, { width: 100, align: 'center' });
      doc.moveDown(1);
      doc.font('Helvetica');
      rows.forEach(row => {
        const y = doc.y;
        doc.text(row.sale_number, 20, y, { width: 100, align: 'left' });
        doc.text(`C$${Number(row.total).toFixed(2)}`, 120, y, { width: 100, align: 'right' });
        doc.text(new Date(row.sold_at).toLocaleTimeString(), 230, y, { width: 100, align: 'center' });
        doc.text(row.cashier_username || String(row.cashier_user_id), 330, y, { width: 100, align: 'center' });
        doc.moveDown(0.5);
      });
      doc.moveDown(1);
      doc.font('Helvetica-Bold');
      doc.text('Totales:', 20, doc.y, { continued: true });
      doc.font('Helvetica');
      doc.text(`Cantidad Ventas: ${totalVentas}`, 120, doc.y, { continued: true });
      doc.text(`Monto Total: C$${montoTotal.toFixed(2)}`, 280, doc.y);
    }

    // Pie de página personalizado
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 90;
      // Lado izquierdo
      doc.fontSize(8).text(`Página: ${i + 1} de ${pageCount}`, 40, bottom, { align: 'left' });
      doc.text(`Hora Ejec.: ${new Date().toLocaleTimeString('es-NI', { hour12: false })}`, 40, bottom + 12, { align: 'left' });
      doc.text(`Fecha Ejec.: ${new Date().toLocaleDateString('es-NI')}`, 40, bottom + 24, { align: 'left' });
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

    const result = await query(
      `SELECT
         cs.id,
         cs.status,
         cs.opened_at,
         cs.closed_at,
         cs.opening_amount,
         cs.closing_amount,
         cs.expected_amount,
         cs.difference_amount,
         COUNT(DISTINCT s.id)::int AS total_sales,
         COALESCE(SUM(s.total), 0)::numeric(12,2) AS total_sales_amount,
         COALESCE(SUM(CASE WHEN p.payment_method = 'cash' THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS total_cash,
         COALESCE(SUM(CASE WHEN p.payment_method = 'card' THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS total_card,
         COALESCE(SUM(CASE WHEN p.payment_method = 'transfer' THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS total_transfer,
         COALESCE(SUM(CASE WHEN p.payment_method = 'mobile' THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS total_mobile,
         COALESCE(SUM(CASE WHEN p.payment_method = 'other' THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS total_other
       FROM cash_register_sessions cs
       LEFT JOIN sales s
         ON s.cash_register_session_id = cs.id
        AND s.status = 'completed'
       LEFT JOIN payments p
         ON p.sale_id = s.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY
         cs.id,
         cs.status,
         cs.opened_at,
         cs.closed_at,
         cs.opening_amount,
         cs.closing_amount,
         cs.expected_amount,
         cs.difference_amount
       ORDER BY cs.opened_at DESC`,
      sqlParams
    );

    const rows = result.rows;
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
        return acc;
      },
      {
        totalSales: 0,
        totalSalesAmount: 0,
        totalCash: 0,
        totalCard: 0,
        totalTransfer: 0,
        totalMobile: 0,
        totalOther: 0
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
