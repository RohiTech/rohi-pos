export function formatCurrency(value) {
  const numericValue = Number(value || 0);

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
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
