import { useEffect, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { PageHeader } from '../components/PageHeader';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency } from '../lib/format';

export function SettingsPage() {
  const { settings, loading, updateSettings } = useSettings();
  const [alertDays, setAlertDays] = useState(settings.membership_expiry_alert_days || 3);
  const [routinePrice, setRoutinePrice] = useState(settings.routine_price || 0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setRoutinePrice(settings.routine_price || 0);
    setAlertDays(settings.membership_expiry_alert_days || 3);
  }, [settings.membership_expiry_alert_days, settings.routine_price]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      await updateSettings({
        membership_expiry_alert_days: Number(alertDays),
        routine_price: Number(routinePrice)
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
        description="Desde aqui puedes ajustar los parametros base del sistema para cobros y alertas."
      />

      {message ? <p className="mb-4 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <DataPanel title="Configuracion general" subtitle="La moneda del sistema queda fija en cordobas nicaraguenses.">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3">
              <p className="text-sm font-semibold text-brand-forest">Moneda</p>
              <p className="mt-1 text-sm text-brand-forest/70">Cordoba nicaraguense (NIO)</p>
            </div>

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

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Precio de la rutina</span>
              <input
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                min="0"
                onChange={(event) => setRoutinePrice(event.target.value)}
                step="0.01"
                type="number"
                value={routinePrice}
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

        <DataPanel title="Vista previa" subtitle="Asi se veran los importes en cordobas dentro del sistema.">
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
              <p className="text-xs uppercase tracking-[0.18em] text-brand-moss">Rutina</p>
              <p className="mt-3 text-3xl font-bold text-brand-clay">{formatCurrency(routinePrice || 0)}</p>
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
