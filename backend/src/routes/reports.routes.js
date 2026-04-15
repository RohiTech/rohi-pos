
import PDFDocument from 'pdfkit';
import { Router } from 'express';
import { query } from '../config/db.js';

const reportsRouter = Router();

// Reporte de ventas por producto en PDF
reportsRouter.get('/product-sales/pdf', async (req, res, next) => {
  console.log('Usuario autenticado en /product-sales/pdf:', req.user);
  try {
    const { fechaInicio, fechaFin } = req.query;
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ message: 'Debe proporcionar fechaInicio y fechaFin' });
    }

    // Query para ventas por producto
    const { rows } = await query(
      `SELECT p.name AS producto, SUM(si.quantity) AS cantidad_vendida, SUM(si.line_total) AS total_vendido
       FROM sales_items si
       JOIN products p ON si.product_id = p.id
       JOIN sales s ON si.sale_id = s.id
       WHERE s.sold_at::date BETWEEN $1 AND $2 AND s.status = 'completed'
       GROUP BY p.name
       ORDER BY total_vendido DESC`
      , [fechaInicio, fechaFin]
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
    // Obtener ventas del día
    const { rows } = await query(
      `SELECT sale_number, total, sold_at, cashier_user_id FROM sales WHERE sold_at::date = CURRENT_DATE AND status = 'completed' ORDER BY sold_at DESC`
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
    doc.fontSize(12).text(`Fecha: ${new Date().toLocaleDateString()}`, 20);
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
        doc.text(String(row.cashier_user_id), 330, y, { width: 100, align: 'center' });
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

export default reportsRouter;
