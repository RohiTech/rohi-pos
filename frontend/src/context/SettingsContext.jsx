import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiGet, apiPut, apiPutForm } from '../lib/api';
import { setCurrencyFormatterOptions } from '../lib/format';

const SettingsContext = createContext(null);
const DEFAULT_SETTINGS = {
  currency_code: 'NIO',
  time_zone: 'America/Managua',
  membership_expiry_alert_days: 3,
  routine_base_price: 0,
  routine_tax_rate: 0,
  routine_price: 0,
  tax_options: [
    { name: 'Exento', rate: 0 },
    { name: 'IVA', rate: 15 }
  ],
  company_name: 'RohiPOS',
  company_motto: '',
  company_ruc: '',
  company_phone: '',
  company_email: '',
  company_address: '',
  company_legal_name: '',
  company_logo_data_url: null,
  login_background_data_url: null,
  kiosk_logo_data_url: null,
  kiosk_background_data_url: null
};

function normalizeSettings(raw = {}) {
  const normalizedTaxOptions = Array.isArray(raw.tax_options)
    ? raw.tax_options
        .map((item) => ({
          name: String(item?.name || '').trim(),
          rate: Number(item?.rate)
        }))
        .filter((item) => item.name && Number.isFinite(item.rate) && item.rate >= 0 && item.rate <= 100)
    : [];

  return {
    currency_code: raw.currency_code || 'NIO',
    time_zone: raw.time_zone || 'America/Managua',
    membership_expiry_alert_days: Number(raw.membership_expiry_alert_days || 3),
    routine_base_price: Number(raw.routine_base_price || 0),
    routine_tax_rate: Number(raw.routine_tax_rate || 0),
    routine_price: Number(raw.routine_price || 0),
    tax_options:
      normalizedTaxOptions.length > 0
        ? normalizedTaxOptions
        : [
            { name: 'Exento', rate: 0 },
            { name: 'IVA', rate: 15 }
          ],
    company_name: raw.company_name || 'RohiPOS',
    company_motto: raw.company_motto || '',
    company_ruc: raw.company_ruc || '',
    company_phone: raw.company_phone || '',
    company_email: raw.company_email || '',
    company_address: raw.company_address || '',
    company_legal_name: raw.company_legal_name || '',
    company_logo_data_url: raw.company_logo_data_url || null,
    login_background_data_url: raw.login_background_data_url || null,
    kiosk_logo_data_url: raw.kiosk_logo_data_url || null,
    kiosk_background_data_url: raw.kiosk_background_data_url || null
  };
}

export function SettingsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCurrencyFormatterOptions({
      currency: settings.currency_code,
      locale: 'es-NI'
    });
  }, [settings.currency_code]);

  useEffect(() => {
    async function loadSettings() {
      if (!isAuthenticated) {
        setSettings(DEFAULT_SETTINGS);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const response = await apiGet('/settings');
        setSettings(normalizeSettings(response.data));
      } catch (_error) {
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [isAuthenticated]);

  async function updateSettings(nextSettings) {
    const response = await apiPut('/settings', nextSettings);
    setSettings(normalizeSettings(response.data));
    return response.data;
  }

  async function updateBranding(formData) {
    const response = await apiPutForm('/settings/branding', formData);
    setSettings(normalizeSettings(response.data));
    return response.data;
  }

  const value = useMemo(
    () => ({
      settings,
      loading,
      updateSettings,
      updateBranding
    }),
    [loading, settings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }

  return context;
}
