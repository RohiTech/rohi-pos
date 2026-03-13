import { createContext, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost, setAuthToken } from '../lib/api';

const AuthContext = createContext(null);

function getStoredToken() {
  return localStorage.getItem('rohipos_token') || '';
}

function getStoredUser() {
  const raw = localStorage.getItem('rohipos_user');
  return raw ? JSON.parse(raw) : null;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken);
  const [user, setUser] = useState(getStoredUser);
  const [loading, setLoading] = useState(Boolean(getStoredToken()));

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    async function hydrateSession() {
      const storedToken = getStoredToken();

      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        setAuthToken(storedToken);
        const response = await apiGet('/auth/me');
        setToken(storedToken);
        setUser(response.data);
      } catch (_error) {
        localStorage.removeItem('rohipos_token');
        localStorage.removeItem('rohipos_user');
        setAuthToken('');
        setToken('');
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    hydrateSession();
  }, []);

  async function login(credentials) {
    const response = await apiPost('/auth/login', credentials);
    const nextToken = response.data.token;
    const nextUser = response.data.user;

    localStorage.setItem('rohipos_token', nextToken);
    localStorage.setItem('rohipos_user', JSON.stringify(nextUser));
    setAuthToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);

    return nextUser;
  }

  function logout() {
    localStorage.removeItem('rohipos_token');
    localStorage.removeItem('rohipos_user');
    setAuthToken('');
    setToken('');
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        isAuthenticated: Boolean(token && user),
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
