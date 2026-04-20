import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../lib/api';

const REMEMBER_USERNAME_KEY = 'rohipos_remember_username';
const SAVED_USERNAME_KEY = 'rohipos_saved_username';

function getInitialRememberState() {
  return localStorage.getItem(REMEMBER_USERNAME_KEY) === 'true';
}

function getInitialUsername() {
  if (!getInitialRememberState()) {
    return '';
  }

  return localStorage.getItem(SAVED_USERNAME_KEY) || '';
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [branding, setBranding] = useState({
    company_name: 'RohiPOS',
    company_legal_name: '',
    company_motto: '',
    company_logo_data_url: null,
    login_background_data_url: null
  });
  const [form, setForm] = useState({ username: getInitialUsername(), password: '' });
  const [rememberUsername, setRememberUsername] = useState(getInitialRememberState);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    apiGet('/auth/branding')
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setBranding({
          company_name: response.data.company_name || 'RohiPOS',
          company_legal_name: response.data.company_legal_name || '',
          company_motto: response.data.company_motto || '',
          company_logo_data_url: response.data.company_logo_data_url || null,
          login_background_data_url: response.data.login_background_data_url || null
        });
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setBranding({
          company_name: 'RohiPOS',
          company_legal_name: '',
          company_motto: '',
          company_logo_data_url: null,
          login_background_data_url: null
        });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await login(form);

      if (rememberUsername) {
        localStorage.setItem(REMEMBER_USERNAME_KEY, 'true');
        localStorage.setItem(SAVED_USERNAME_KEY, String(form.username || '').trim());
      } else {
        localStorage.removeItem(REMEMBER_USERNAME_KEY);
        localStorage.removeItem(SAVED_USERNAME_KEY);
      }

      navigate('/', { replace: true });
    } catch (loginError) {
      setError(loginError.message || 'No fue posible iniciar sesion');
    } finally {
      setSubmitting(false);
    }
  }

  function handleChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  }

  const displayLegalName = String(branding.company_legal_name || '').trim() || branding.company_name;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-brand-cream/70 px-4 py-10"
      style={
        branding.login_background_data_url
          ? {
              backgroundImage: `linear-gradient(rgba(248,245,236,0.82), rgba(248,245,236,0.86)), url(${branding.login_background_data_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }
          : undefined
      }
    >
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/45 bg-white/20 shadow-panel backdrop-blur-[4px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="bg-transparent p-8 text-brand-forest lg:p-12">
          <div className="flex min-h-full flex-col justify-center">
            <div className="max-w-xl rounded-[1.75rem] border border-white/45 bg-white/25 p-6 backdrop-blur-[3px]">
              {branding.company_logo_data_url ? (
                <img
                  alt="Logo de la empresa"
                  className="h-28 w-44 rounded-2xl border border-brand-forest/20 bg-white/45 p-2 object-contain shadow-sm"
                  src={branding.company_logo_data_url}
                />
              ) : null}

              <h1 className="mt-6 font-display text-5xl leading-none text-brand-forest">{displayLegalName}</h1>
              <p className="mt-4 text-lg leading-7 text-brand-forest/90">
                {branding.company_motto || 'Bienvenido a tu sistema de gestion.'}
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white/30 p-8 backdrop-blur-[6px] lg:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-moss">Login</p>
          <h2 className="mt-4 text-3xl font-semibold text-brand-forest">Bienvenido de nuevo</h2>

          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-brand-forest">Usuario o correo</span>
              <input
                className="w-full rounded-2xl border border-brand-sand/90 bg-white/55 px-4 py-3 outline-none transition focus:border-brand-clay"
                name="username"
                onChange={handleChange}
                value={form.username}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-brand-forest">Contrasena</span>
              <input
                className="w-full rounded-2xl border border-brand-sand/90 bg-white/55 px-4 py-3 outline-none transition focus:border-brand-clay"
                name="password"
                onChange={handleChange}
                type="password"
                value={form.password}
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-brand-forest/85">
              <input
                checked={rememberUsername}
                className="h-4 w-4"
                onChange={(event) => setRememberUsername(event.target.checked)}
                type="checkbox"
              />
              Recordar usuario
            </label>

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <button
              className="w-full rounded-2xl bg-brand-clay px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Ingresando...' : 'Entrar al sistema'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
