const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
let authToken = localStorage.getItem('rohipos_token') || '';

export function setAuthToken(token) {
  authToken = token || '';
}

export function buildApiUrl(path = '') {
  const normalizedPath = String(path || '');
  return `${API_URL}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

export function getAuthHeaders(headers = {}) {
  return authToken
    ? {
        ...headers,
        Authorization: `Bearer ${authToken}`
      }
    : headers;
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
  const response = await fetch(buildApiUrl(path), {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
}

export async function apiPost(path, payload) {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: getAuthHeaders({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify(payload)
  });

  return handleResponse(response);
}

export async function apiPostForm(path, formData) {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData
  });

  return handleResponse(response);
}

export async function apiPut(path, payload) {
  const response = await fetch(buildApiUrl(path), {
    method: 'PUT',
    headers: getAuthHeaders({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify(payload)
  });

  return handleResponse(response);
}

export async function apiPutForm(path, formData) {
  const response = await fetch(buildApiUrl(path), {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: formData
  });

  return handleResponse(response);
}

export async function apiFetch(path, options = {}) {
  return fetch(buildApiUrl(path), {
    ...options,
    headers: getAuthHeaders(options.headers || {})
  });
}

export { authToken }; // Exportar el token para uso en otras partes
