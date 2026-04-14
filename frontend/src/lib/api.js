const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
let authToken = localStorage.getItem('rohipos_token') || '';

export function setAuthToken(token) {
  authToken = token || '';
}

export function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

async function handleResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Unexpected API error');
  }

  return data;
}

export async function apiGet(path) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: authToken
      ? {
          Authorization: `Bearer ${authToken}`
        }
      : {}
  });
  return handleResponse(response);
}

export async function apiPost(path, payload) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken
        ? {
            Authorization: `Bearer ${authToken}`
          }
        : {})
    },
    body: JSON.stringify(payload)
  });

  return handleResponse(response);
}

export async function apiPostForm(path, formData) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: authToken
      ? {
          Authorization: `Bearer ${authToken}`
        }
      : {},
    body: formData
  });

  return handleResponse(response);
}

export async function apiPut(path, payload) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken
        ? {
            Authorization: `Bearer ${authToken}`
          }
        : {})
    },
    body: JSON.stringify(payload)
  });

  return handleResponse(response);
}

export async function apiPutForm(path, formData) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: authToken
      ? {
          Authorization: `Bearer ${authToken}`
        }
      : {},
    body: formData
  });

  return handleResponse(response);
}

export { authToken }; // Exportar el token para uso en otras partes
