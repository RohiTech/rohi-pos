const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
let authToken = localStorage.getItem('rohipos_token') || '';

export function setAuthToken(token) {
  authToken = token || '';
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
