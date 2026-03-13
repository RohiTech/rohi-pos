import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navigation = [
  { to: '/', label: 'Dashboard' },
  { to: '/clients', label: 'Clientes' },
  { to: '/memberships', label: 'Membresias' },
  { to: '/pos', label: 'POS' }
];

function navClassName({ isActive }) {
  return [
    'rounded-2xl px-4 py-3 text-sm font-semibold transition',
    isActive
      ? 'bg-brand-clay text-white shadow-panel'
      : 'text-brand-forest hover:bg-white/80 hover:text-brand-ink'
  ].join(' ');
}

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen text-brand-ink">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
        <aside className="rounded-[2rem] bg-brand-forest p-6 text-brand-cream shadow-panel">
          <div className="mb-10">
            <p className="text-sm uppercase tracking-[0.3em] text-brand-sand/80">RohiPOS</p>
            <h1 className="mt-3 font-display text-4xl leading-none">Gym control with a sales pulse.</h1>
            <p className="mt-4 text-sm text-brand-sand/85">
              Panel operativo para recepcion, membresias, inventario y ventas del gimnasio.
            </p>
          </div>

          <nav className="grid gap-2">
            {navigation.map((item) => (
              <NavLink key={item.to} className={navClassName} to={item.to} end={item.to === '/'}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-10 rounded-3xl bg-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-brand-sand/70">Servidor</p>
            <p className="mt-2 text-lg font-semibold">API local conectada</p>
            <p className="mt-2 text-sm text-brand-sand/85">
              Usa `http://localhost:3001/api` mientras montamos autenticacion y despliegue.
            </p>
          </div>

          <div className="mt-4 rounded-3xl bg-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-brand-sand/70">Sesion</p>
            <p className="mt-2 text-lg font-semibold">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="mt-1 text-sm text-brand-sand/85">
              {user?.role_name} · {user?.username}
            </p>
            <button
              className="mt-4 rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-brand-cream transition hover:bg-white/25"
              onClick={logout}
              type="button"
            >
              Cerrar sesion
            </button>
          </div>
        </aside>

        <main className="rounded-[2rem] border border-brand-sand/60 bg-white/75 p-5 shadow-panel backdrop-blur lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
