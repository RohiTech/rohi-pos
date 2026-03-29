let activeCurrencyCode = 'NIO';
let activeLocale = 'es-NI';

export function setCurrencyFormatterOptions(options = {}) {
  if (options.currency) {
    activeCurrencyCode = options.currency;
  }

  if (options.locale) {
    activeLocale = options.locale;
  }
}

export function formatCurrency(value) {
  const numericValue = Number(value || 0);

  return new Intl.NumberFormat(activeLocale, {
    style: 'currency',
    currency: activeCurrencyCode
  }).format(numericValue);
}

export function formatDate(value) {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium'
  }).format(new Date(value));
}
