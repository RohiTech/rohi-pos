import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ username: 'admin', password: 'admin123' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await login(form);
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

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-panel lg:grid-cols-[1.05fr_0.95fr]">
        <section className="bg-brand-forest p-8 text-brand-cream lg:p-12">
          <p className="text-sm uppercase tracking-[0.28em] text-brand-sand/80">RohiPOS Access</p>
          <h1 className="mt-5 font-display text-5xl leading-none">
            Recepcion, membresias y ventas en un solo tablero.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-brand-sand/85">
            Inicia sesion para administrar clientes, controlar vigencias y registrar ventas del gimnasio.
          </p>

          <div className="mt-10 rounded-[1.75rem] bg-white/10 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-brand-sand/70">Acceso inicial</p>
            <p className="mt-3 text-lg font-semibold">Usuario: admin</p>
            <p className="mt-1 text-sm text-brand-sand/85">Clave temporal: admin123</p>
          </div>
        </section>

        <section className="p-8 lg:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-moss">Login</p>
          <h2 className="mt-4 text-3xl font-semibold text-brand-forest">Bienvenido de nuevo</h2>
          <p className="mt-2 text-sm text-brand-forest/70">
            Esta es la primera version del acceso seguro para RohiPOS.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-brand-forest">Usuario o correo</span>
              <input
                className="w-full rounded-2xl border border-brand-sand bg-brand-cream/50 px-4 py-3 outline-none transition focus:border-brand-clay"
                name="username"
                onChange={handleChange}
                value={form.username}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-brand-forest">Contrasena</span>
              <input
                className="w-full rounded-2xl border border-brand-sand bg-brand-cream/50 px-4 py-3 outline-none transition focus:border-brand-clay"
                name="password"
                onChange={handleChange}
                type="password"
                value={form.password}
              />
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
