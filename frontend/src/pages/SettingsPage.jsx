import { useEffect, useMemo, useState } from 'react';
import { DataPanel } from '../components/DataPanel';
import { useSettings } from '../context/SettingsContext';

const TIME_ZONE_OPTIONS = [
  { value: 'America/Managua', label: 'America/Managua (Nicaragua)' },
  { value: 'America/Guatemala', label: 'America/Guatemala' },
  { value: 'America/Costa_Rica', label: 'America/Costa Rica' },
  { value: 'America/Mexico_City', label: 'America/Mexico City' },
  { value: 'America/Bogota', label: 'America/Bogota' },
  { value: 'America/Lima', label: 'America/Lima' },
  { value: 'America/Panama', label: 'America/Panama' },
  { value: 'America/New_York', label: 'America/New York' },
  { value: 'UTC', label: 'UTC' }
];

function toNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function toTaxRate(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  if (parsed > 100) {
    return 100;
  }

  return parsed;
}

function calculateRoutinePrice(basePrice, taxRate) {
  const base = toNonNegativeNumber(basePrice, 0);
  const tax = toTaxRate(taxRate, 0);
  return Number((base * (1 + tax / 100)).toFixed(2));
}

export function SettingsPage() {
  const { settings, loading, updateSettings, updateBranding } = useSettings();
  const [companyName, setCompanyName] = useState(settings.company_name || 'RohiPOS');
  const [companyMotto, setCompanyMotto] = useState(settings.company_motto || '');
  const [companyLegalName, setCompanyLegalName] = useState(settings.company_legal_name || '');
  const [companyRuc, setCompanyRuc] = useState(settings.company_ruc || '');
  const [companyPhone, setCompanyPhone] = useState(settings.company_phone || '');
  const [companyEmail, setCompanyEmail] = useState(settings.company_email || '');
  const [companyAddress, setCompanyAddress] = useState(settings.company_address || '');
  const [timeZone, setTimeZone] = useState(settings.time_zone || 'America/Managua');
  const [alertDays, setAlertDays] = useState(settings.membership_expiry_alert_days || 3);
  const [routineBasePrice, setRoutineBasePrice] = useState(settings.routine_base_price || 0);
  const [routineTaxRate, setRoutineTaxRate] = useState(settings.routine_tax_rate || 0);
  const [taxOptions, setTaxOptions] = useState(
    settings.tax_options || [
      { name: 'Exento', rate: 0 },
      { name: 'IVA', rate: 15 }
    ]
  );
  const [companyLogoFile, setCompanyLogoFile] = useState(null);
  const [loginBackgroundFile, setLoginBackgroundFile] = useState(null);
  const [kioskLogoFile, setKioskLogoFile] = useState(null);
  const [kioskBackgroundFile, setKioskBackgroundFile] = useState(null);
  const [removeCompanyLogo, setRemoveCompanyLogo] = useState(false);
  const [removeLoginBackground, setRemoveLoginBackground] = useState(false);
  const [removeKioskLogo, setRemoveKioskLogo] = useState(false);
  const [removeKioskBackground, setRemoveKioskBackground] = useState(false);
  const [saving, setSaving] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const routinePrice = useMemo(
    () => calculateRoutinePrice(routineBasePrice, routineTaxRate),
    [routineBasePrice, routineTaxRate]
  );

  useEffect(() => {
    setRoutineBasePrice(toNonNegativeNumber(settings.routine_base_price, 0));
    setRoutineTaxRate(toTaxRate(settings.routine_tax_rate, 0));
    setTaxOptions(
      settings.tax_options || [
        { name: 'Exento', rate: 0 },
        { name: 'IVA', rate: 15 }
      ]
    );
    setAlertDays(settings.membership_expiry_alert_days || 3);
    setCompanyName(settings.company_name || 'RohiPOS');
    setCompanyMotto(settings.company_motto || '');
    setCompanyLegalName(settings.company_legal_name || '');
    setCompanyRuc(settings.company_ruc || '');
    setCompanyPhone(settings.company_phone || '');
    setCompanyEmail(settings.company_email || '');
    setCompanyAddress(settings.company_address || '');
    setTimeZone(settings.time_zone || 'America/Managua');
  }, [
    settings.company_name,
    settings.company_motto,
    settings.company_legal_name,
    settings.company_ruc,
    settings.company_phone,
    settings.company_email,
    settings.company_address,
    settings.time_zone,
    settings.membership_expiry_alert_days,
    settings.routine_base_price,
    settings.routine_tax_rate,
    settings.tax_options
  ]);

  function handleTaxOptionChange(index, field, value) {
    setTaxOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index
          ? {
              ...option,
              [field]: field === 'rate' ? value : value
            }
          : option
      )
    );
  }

  function addTaxOption() {
    setTaxOptions((current) => [...current, { name: '', rate: '0' }]);
  }

  function removeTaxOption(index) {
    setTaxOptions((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  }

  function buildSettingsPayload() {
    const normalizedRoutineBasePrice = toNonNegativeNumber(routineBasePrice, 0);
    const normalizedRoutineTaxRate = toTaxRate(routineTaxRate, 0);

    return {
      company_name: String(companyName || '').trim(),
      company_motto: String(companyMotto || '').trim(),
      company_legal_name: String(companyLegalName || '').trim(),
      company_ruc: String(companyRuc || '').trim(),
      company_phone: String(companyPhone || '').trim(),
      company_email: String(companyEmail || '').trim(),
      company_address: String(companyAddress || '').trim(),
      time_zone: String(timeZone || 'America/Managua').trim(),
      membership_expiry_alert_days: Number(alertDays),
      routine_base_price: normalizedRoutineBasePrice,
      routine_tax_rate: normalizedRoutineTaxRate,
      routine_price: calculateRoutinePrice(normalizedRoutineBasePrice, normalizedRoutineTaxRate),
      tax_options: taxOptions.map((option) => ({
        name: String(option.name || '').trim(),
        rate: Number(option.rate || 0)
      }))
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      await updateSettings(buildSettingsPayload());
      setMessage('Configuracion guardada correctamente.');
    } catch (requestError) {
      setError(requestError.message || 'No fue posible guardar la configuracion');
    } finally {
      setSaving(false);
    }
  }

  async function handleBrandingSubmit(event) {
    event.preventDefault();
    setBrandingSaving(true);
    setMessage('');
    setError('');

    try {
      const formData = new FormData();

      if (companyLogoFile) {
        formData.append('company_logo', companyLogoFile);
      }

      if (loginBackgroundFile) {
        formData.append('login_background', loginBackgroundFile);
      }

      if (kioskLogoFile) {
        formData.append('kiosk_logo', kioskLogoFile);
      }

      if (kioskBackgroundFile) {
        formData.append('kiosk_background', kioskBackgroundFile);
      }

      if (removeCompanyLogo) {
        formData.append('remove_company_logo', 'true');
      }

      if (removeLoginBackground) {
        formData.append('remove_login_background', 'true');
      }

      if (removeKioskLogo) {
        formData.append('remove_kiosk_logo', 'true');
      }

      if (removeKioskBackground) {
        formData.append('remove_kiosk_background', 'true');
      }

      await updateBranding(formData);
      setMessage('Branding actualizado correctamente.');
      setCompanyLogoFile(null);
      setLoginBackgroundFile(null);
      setKioskLogoFile(null);
      setKioskBackgroundFile(null);
      setRemoveCompanyLogo(false);
      setRemoveLoginBackground(false);
      setRemoveKioskLogo(false);
      setRemoveKioskBackground(false);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible guardar el branding');
    } finally {
      setBrandingSaving(false);
    }
  }

  return (
    <div>
      {message ? <p className="mb-4 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="grid content-start gap-6">
          <DataPanel title="Configuracion general" subtitle="La moneda del sistema queda fija en cordobas nicaraguenses.">
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3">
                <p className="text-sm font-semibold text-brand-forest">Moneda</p>
                <p className="mt-1 text-sm text-brand-forest/70">Cordoba nicaraguense (NIO)</p>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Zona horaria del gimnasio</span>
                <select
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  onChange={(event) => setTimeZone(event.target.value)}
                  value={timeZone}
                >
                  {TIME_ZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
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

              <div className="grid gap-3 rounded-2xl border border-brand-sand bg-brand-cream/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-brand-forest">Impuestos disponibles</span>
                  <button
                    className="rounded-xl border border-brand-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand-forest"
                    onClick={addTaxOption}
                    type="button"
                  >
                    Agregar
                  </button>
                </div>

                {taxOptions.map((option, index) => (
                  <div className="grid gap-2 md:grid-cols-[1fr_140px_auto]" key={`tax-option-${index}`}>
                    <input
                      className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                      onChange={(event) => handleTaxOptionChange(index, 'name', event.target.value)}
                      placeholder="Nombre impuesto"
                      value={option.name}
                    />
                    <input
                      className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                      min="0"
                      onChange={(event) => handleTaxOptionChange(index, 'rate', event.target.value)}
                      step="0.01"
                      type="number"
                      value={option.rate}
                    />
                    <button
                      className="rounded-2xl border border-rose-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-600 disabled:opacity-60"
                      disabled={taxOptions.length <= 1}
                      onClick={() => removeTaxOption(index)}
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <p className="text-xs text-brand-forest/70">Ejemplos: Exento 0%, IVA 15%.</p>
              </div>

              <button
                className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                disabled={saving || loading}
                type="submit"
              >
                {saving ? 'Guardando...' : 'Guardar configuracion'}
              </button>
            </form>
          </DataPanel>

          <DataPanel title="Precio de rutina" subtitle="Define precio base, impuesto y precio final aplicado en caja.">
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Precio base</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  min="0"
                  onChange={(event) => setRoutineBasePrice(event.target.value)}
                  step="0.01"
                  type="number"
                  value={routineBasePrice}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Impuesto (%)</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  max="100"
                  min="0"
                  onChange={(event) => setRoutineTaxRate(event.target.value)}
                  step="0.01"
                  type="number"
                  value={routineTaxRate}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Precio de la rutina</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/30 px-4 py-3 text-brand-forest/80"
                  readOnly
                  type="number"
                  value={routinePrice}
                />
              </label>

              <button
                className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                disabled={saving || loading}
                type="submit"
              >
                {saving ? 'Guardando...' : 'Guardar precio rutina'}
              </button>
            </form>
          </DataPanel>

          <DataPanel title="Registro de empresa" subtitle="Completa los datos fiscales y de contacto de tu empresa.">
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Nombre de la empresa</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  maxLength="120"
                  onChange={(event) => setCompanyName(event.target.value)}
                  type="text"
                  value={companyName}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Lema de la empresa (opcional)</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  maxLength="180"
                  onChange={(event) => setCompanyMotto(event.target.value)}
                  type="text"
                  value={companyMotto}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">RUC (opcional)</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  maxLength="40"
                  onChange={(event) => setCompanyRuc(event.target.value)}
                  type="text"
                  value={companyRuc}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Razon social (opcional)</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  maxLength="140"
                  onChange={(event) => setCompanyLegalName(event.target.value)}
                  type="text"
                  value={companyLegalName}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Telefono (opcional)</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  maxLength="30"
                  onChange={(event) => setCompanyPhone(event.target.value)}
                  type="text"
                  value={companyPhone}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Correo (opcional)</span>
                <input
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  maxLength="120"
                  onChange={(event) => setCompanyEmail(event.target.value)}
                  type="email"
                  value={companyEmail}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Direccion (opcional)</span>
                <textarea
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  maxLength="250"
                  onChange={(event) => setCompanyAddress(event.target.value)}
                  rows={3}
                  value={companyAddress}
                />
              </label>

              <button
                className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                disabled={saving || loading}
                type="submit"
              >
                {saving ? 'Guardando...' : 'Guardar registro'}
              </button>
            </form>
          </DataPanel>
        </div>

        <div className="grid content-start gap-6">
          <DataPanel title="Branding de empresa" subtitle="Estas imagenes se mostraran en Login y Kiosko QR.">
            <form className="grid gap-4" onSubmit={handleBrandingSubmit}>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Logo de empresa (Login)</span>
              <input
                accept="image/png,image/jpeg,image/webp"
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setCompanyLogoFile(event.target.files?.[0] || null)}
                type="file"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-brand-forest/80">
              <input
                checked={removeCompanyLogo}
                onChange={(event) => setRemoveCompanyLogo(event.target.checked)}
                type="checkbox"
              />
              Quitar logo de empresa actual
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Fondo de Login</span>
              <input
                accept="image/png,image/jpeg,image/webp"
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setLoginBackgroundFile(event.target.files?.[0] || null)}
                type="file"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-brand-forest/80">
              <input
                checked={removeLoginBackground}
                onChange={(event) => setRemoveLoginBackground(event.target.checked)}
                type="checkbox"
              />
              Quitar fondo de login actual
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Logo de Kiosko QR</span>
              <input
                accept="image/png,image/jpeg,image/webp"
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setKioskLogoFile(event.target.files?.[0] || null)}
                type="file"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-brand-forest/80">
              <input
                checked={removeKioskLogo}
                onChange={(event) => setRemoveKioskLogo(event.target.checked)}
                type="checkbox"
              />
              Quitar logo de kiosko actual
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Fondo de Kiosko QR</span>
              <input
                accept="image/png,image/jpeg,image/webp"
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                onChange={(event) => setKioskBackgroundFile(event.target.files?.[0] || null)}
                type="file"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-brand-forest/80">
              <input
                checked={removeKioskBackground}
                onChange={(event) => setRemoveKioskBackground(event.target.checked)}
                type="checkbox"
              />
              Quitar fondo de kiosko actual
            </label>

            <button
              className="rounded-2xl bg-brand-moss px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
              disabled={brandingSaving || loading}
              type="submit"
            >
              {brandingSaving ? 'Subiendo...' : 'Guardar branding'}
            </button>
            </form>
          </DataPanel>
        </div>
      </div>
    </div>
  );
}
