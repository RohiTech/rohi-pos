import React from 'react';

export default function SimpleModal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-2xl shadow-xl p-6 min-w-[320px] max-w-full">
        <button
          className="absolute top-2 right-4 text-lg font-bold text-gray-500 hover:text-gray-800"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
