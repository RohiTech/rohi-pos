import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

export default function DailySalesReport() {
  const [pdfUrl, setPdfUrl] = useState(null);

  const generatePdf = async () => {
    // Aquí deberías obtener los datos reales de ventas diarias desde tu API
    // Por ahora, ejemplo estático:
    const doc = new jsPDF();
    doc.text('Reporte de Ventas Diarias', 10, 10);
    doc.text('Fecha: 2026-04-14', 10, 20);
    doc.text('Total ventas: $1234.56', 10, 30);
    // ...agrega más datos y formato aquí...
    const pdfBlob = doc.output('blob');
    setPdfUrl(URL.createObjectURL(pdfBlob));
  };

  return (
    <div className="grid gap-4">
      <button
        className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold text-white"
        onClick={generatePdf}
      >
        Generar PDF de ventas diarias
      </button>
      {pdfUrl && (
        <div style={{ height: '600px' }}>
          <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
            <Viewer fileUrl={pdfUrl} />
          </Worker>
        </div>
      )}
    </div>
  );
}
