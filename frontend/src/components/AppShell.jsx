import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navigation = [
  { to: '/', label: 'Dashboard', shortLabel: 'DB' },
  { to: '/attendance', label: 'Asistencia', shortLabel: 'AS' },
  { to: '/attendance-kiosk', label: 'Asistencia QR', shortLabel: 'QR' },
  { to: '/clients', label: 'Clientes', shortLabel: 'CL' },
  { to: '/memberships', label: 'Membresias', shortLabel: 'MB' },
  { to: '/pos', label: 'POS', shortLabel: 'POS' },
  { to: '/security', label: 'Seguridad', shortLabel: 'SEG' },
  { to: '/reports', label: 'Reportes', shortLabel: 'REP' },
  { to: '/settings', label: 'Configuracion', shortLabel: 'CFG' }
];

const sidebarStorageKey = 'rohipos_sidebar_collapsed';

function navClassName({ isActive }, isCollapsed) {
  return [
    'rounded-2xl px-4 py-3 text-sm font-semibold transition',
    isCollapsed ? 'flex items-center justify-center px-2' : '',
    isActive
      ? 'bg-brand-clay text-white shadow-panel'
      : 'text-brand-forest hover:bg-white/80 hover:text-brand-ink'
  ].join(' ');
}

export function AppShell() {
  const { user, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(sidebarStorageKey) === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(isCollapsed));
  }, [isCollapsed]);

  return (
    <div className="min-h-screen text-brand-ink">
      <div
        className={`mx-auto grid min-h-screen max-w-[1700px] gap-4 px-4 py-4 lg:px-6 ${
          isCollapsed ? 'lg:grid-cols-[96px_minmax(0,1fr)]' : 'lg:grid-cols-[280px_minmax(0,1fr)]'
        }`}
      >
        <aside
          className={`rounded-[2rem] bg-brand-forest text-brand-cream shadow-panel transition-all duration-200 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto ${
            isCollapsed ? 'p-3' : 'p-6'
          }`}
        >
          <div className={`mb-6 flex items-start ${isCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
            <div className={isCollapsed ? 'hidden' : 'min-w-0'}>
              <p className="text-sm uppercase tracking-[0.3em] text-brand-sand/80">RohiPOS</p>
            </div>

            <button
              aria-label={isCollapsed ? 'Expandir panel lateral' : 'Contraer panel lateral'}
              className={`rounded-2xl bg-white/10 text-sm font-semibold text-brand-cream transition hover:bg-white/20 ${
                isCollapsed ? 'w-full px-0 py-3' : 'px-4 py-3'
              }`}
              onClick={() => setIsCollapsed((current) => !current)}
              type="button"
            >
              {isCollapsed ? '>>' : '<<'}
            </button>
          </div>

          {isCollapsed ? (
            <div className="mb-6 flex justify-center">
              <p className="text-xs uppercase tracking-[0.28em] text-brand-sand/80 [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                RohiPOS
              </p>
            </div>
          ) : null}

          <nav className="grid gap-2">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                className={(navState) => navClassName(navState, isCollapsed)}
                title={isCollapsed ? item.label : undefined}
                to={item.to}
                end={item.to === '/'}
              >
                {isCollapsed ? item.shortLabel : item.label}
              </NavLink>
            ))}
          </nav>

          <div className={`mt-4 rounded-3xl bg-white/10 ${isCollapsed ? 'p-3 text-center' : 'p-4'}`}>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-sand/70">Sesion</p>
            <p className={`mt-2 font-semibold ${isCollapsed ? 'text-sm' : 'text-lg'}`}>
              {isCollapsed ? user?.username : `${user?.first_name} ${user?.last_name}`}
            </p>
            {!isCollapsed ? (
              <p className="mt-1 text-sm text-brand-sand/85">
                {user?.role_name} · {user?.username}
              </p>
            ) : null}
            <button
              className={`mt-4 rounded-2xl bg-white/15 text-sm font-semibold text-brand-cream transition hover:bg-white/25 ${
                isCollapsed ? 'w-full px-2 py-3' : 'px-4 py-2'
              }`}
              onClick={logout}
              title={isCollapsed ? 'Cerrar sesion' : undefined}
              type="button"
            >
              {isCollapsed ? 'Salir' : 'Cerrar sesion'}
            </button>
          </div>
        </aside>

        <main className="rounded-[2rem] border border-brand-sand/60 bg-white/75 p-4 shadow-panel backdrop-blur lg:min-h-[calc(100vh-2rem)] lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
