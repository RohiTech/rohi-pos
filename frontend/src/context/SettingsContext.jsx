import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiGet, apiPut } from '../lib/api';
import { setCurrencyFormatterOptions } from '../lib/format';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState({
    currency_code: 'USD'
  });
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
        setSettings({ currency_code: 'USD' });
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const response = await apiGet('/settings');
        setSettings({
          currency_code: response.data.currency_code || 'USD'
        });
      } catch (_error) {
        setSettings({ currency_code: 'USD' });
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [isAuthenticated]);

  async function updateSettings(nextSettings) {
    const response = await apiPut('/settings', nextSettings);
    setSettings({
      currency_code: response.data.currency_code || 'USD'
    });
    return response.data;
  }

  const value = useMemo(
    () => ({
      settings,
      loading,
      updateSettings
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
