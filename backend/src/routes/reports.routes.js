import PDFDocument from 'pdfkit';
import { Router } from 'express';
import { query } from '../config/db.js';

const reportsRouter = Router();

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
    doc.fontSize(12).text(`Fecha: ${new Date().toLocaleDateString()}`);
    doc.moveDown();

    if (rows.length === 0) {
      doc.text('No hay ventas registradas para hoy.');
    } else {
      // Titulos de columna alineados
      const startY = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('N° Venta', 60, startY, { width: 100, align: 'left' });
      doc.text('Total (C$)', 160, startY, { width: 100, align: 'right' });
      doc.text('Hora', 270, startY, { width: 100, align: 'center' });
      doc.text('Cajero', 370, startY, { width: 100, align: 'center' });
      doc.moveDown(1);
      doc.font('Helvetica');
      rows.forEach(row => {
        const y = doc.y;
        doc.text(row.sale_number, 60, y, { width: 100, align: 'left' });
        doc.text(`C$${Number(row.total).toFixed(2)}`, 160, y, { width: 100, align: 'right' });
        doc.text(new Date(row.sold_at).toLocaleTimeString(), 270, y, { width: 100, align: 'center' });
        doc.text(String(row.cashier_user_id), 370, y, { width: 100, align: 'center' });
        doc.moveDown(0.5);
      });
      doc.moveDown(1);
      doc.font('Helvetica-Bold');
      doc.text('Totales:', 60, doc.y, { continued: true });
      doc.font('Helvetica');
      doc.text(`Cantidad de ventas: ${totalVentas}`, 160, doc.y, { continued: true });
      doc.text(`Monto total: C$${montoTotal.toFixed(2)}`, 320, doc.y);
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
