import { useEffect, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { PageHeader } from '../components/PageHeader';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency } from '../lib/format';

const currencyOptions = [
  { code: 'USD', label: 'Dolar estadounidense (USD)' },
  { code: 'NIO', label: 'Cordoba nicaraguense (NIO)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'MXN', label: 'Peso mexicano (MXN)' },
  { code: 'COP', label: 'Peso colombiano (COP)' }
];

export function SettingsPage() {
  const { settings, loading, updateSettings } = useSettings();
  const [currencyCode, setCurrencyCode] = useState(settings.currency_code || 'USD');
  const [alertDays, setAlertDays] = useState(settings.membership_expiry_alert_days || 3);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setCurrencyCode(settings.currency_code || 'USD');
    setAlertDays(settings.membership_expiry_alert_days || 3);
  }, [settings.currency_code, settings.membership_expiry_alert_days]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      await updateSettings({
        currency_code: currencyCode,
        membership_expiry_alert_days: Number(alertDays)
      });
      setMessage('Configuracion guardada correctamente.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible guardar la configuracion');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Configuracion"
        title="Preferencias del sistema"
        description="Desde aqui puedes definir la moneda principal usada en ventas, reportes y membresias."
      />

      {message ? <p className="mb-4 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <DataPanel title="Moneda principal" subtitle="Afecta todo el formato monetario del sistema.">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Moneda</span>
              <select
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setCurrencyCode(event.target.value)}
                value={currencyCode}
              >
                {currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">
                Dias de aviso antes del vencimiento
              </span>
              <input
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                max="30"
                min="0"
                onChange={(event) => setAlertDays(event.target.value)}
                type="number"
                value={alertDays}
              />
            </label>

            <button
              className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
              disabled={saving || loading}
              type="submit"
            >
              {saving ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </form>
        </DataPanel>

        <DataPanel title="Vista previa" subtitle="Asi se veran los importes con la moneda actual.">
          <div className="grid gap-3">
            <div className="rounded-2xl border border-brand-sand/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Venta simple</p>
              <p className="mt-3 text-3xl font-bold text-brand-clay">{formatCurrency(25)}</p>
            </div>
            <div className="rounded-2xl border border-brand-sand/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Membresia mensual</p>
              <p className="mt-3 text-3xl font-bold text-brand-clay">{formatCurrency(45)}</p>
            </div>
            <div className="rounded-2xl border border-brand-sand/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Inventario</p>
              <p className="mt-3 text-3xl font-bold text-brand-clay">{formatCurrency(1234.56)}</p>
            </div>
          </div>
        </DataPanel>
      </div>
    </div>
  );
}
