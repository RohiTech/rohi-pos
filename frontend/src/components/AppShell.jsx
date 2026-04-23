import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { apiPost } from '../lib/api';

const navigation = [
  { to: '/', label: 'Dashboard', shortLabel: 'DB' },
  { to: '/attendance', label: 'Pago Rutina', shortLabel: 'PR' },
  { to: '/attendance-kiosk', label: 'Kiosko', shortLabel: 'KI' },
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
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const companyName = settings.company_name || 'RohiPOS';
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(sidebarStorageKey) === 'true';
  });
  const [kioskAccessModalOpen, setKioskAccessModalOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [kioskAccessLoading, setKioskAccessLoading] = useState(false);
  const [kioskAccessError, setKioskAccessError] = useState('');

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    if (!kioskAccessModalOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !kioskAccessLoading) {
        setKioskAccessModalOpen(false);
        setKioskAccessError('');
        setAdminUsername('');
        setAdminPassword('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [kioskAccessLoading, kioskAccessModalOpen]);

  function openKioskAccessModal() {
    setKioskAccessModalOpen(true);
    setKioskAccessError('');
    setAdminUsername('');
    setAdminPassword('');
  }

  function closeKioskAccessModal() {
    if (kioskAccessLoading) {
      return;
    }

    setKioskAccessModalOpen(false);
    setKioskAccessError('');
    setAdminUsername('');
    setAdminPassword('');
  }

  async function handleKioskAccessSubmit(event) {
    event.preventDefault();

    const normalizedUsername = String(adminUsername || '').trim();
    const normalizedPassword = String(adminPassword || '');

    if (!normalizedUsername || !normalizedPassword) {
      setKioskAccessError('Ingresa usuario y clave de administrador.');
      return;
    }

    setKioskAccessLoading(true);
    setKioskAccessError('');

    try {
      const response = await apiPost('/auth/login', {
        username: normalizedUsername,
        password: normalizedPassword
      });
      const roleName = String(response?.data?.user?.role_name || '').toLowerCase();

      if (roleName !== 'admin') {
        setKioskAccessError('El usuario no tiene permisos de administrador.');
        return;
      }

      setKioskAccessModalOpen(false);
      setAdminUsername('');
      setAdminPassword('');
      navigate('/attendance-kiosk');
    } catch (_error) {
      setKioskAccessError('Clave de administrador invalida.');
    } finally {
      setKioskAccessLoading(false);
    }
  }

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
              <p className="text-sm uppercase tracking-[0.3em] text-brand-sand/80">{companyName}</p>
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
                {companyName}
              </p>
            </div>
          ) : null}

          <nav className="grid gap-2">
            {navigation.map((item) => (
              item.to === '/attendance-kiosk' ? (
                <button
                  key={item.to}
                  className={navClassName({ isActive: false }, isCollapsed)}
                  onClick={openKioskAccessModal}
                  style={{ textAlign: isCollapsed ? 'center' : 'left' }}
                  title={isCollapsed ? item.label : undefined}
                  type="button"
                >
                  {isCollapsed ? item.shortLabel : item.label}
                </button>
              ) : (
                <NavLink
                  key={item.to}
                  className={(navState) => navClassName(navState, isCollapsed)}
                  title={isCollapsed ? item.label : undefined}
                  to={item.to}
                  end={item.to === '/'}
                >
                  {isCollapsed ? item.shortLabel : item.label}
                </NavLink>
              )
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

      {kioskAccessModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-brand-sand/70 bg-white p-5 shadow-panel">
            <h2 className="text-xl font-semibold text-brand-forest">Acceso al kiosko</h2>
            <p className="mt-2 text-sm text-brand-forest/70">
              Ingresa credenciales de administrador para abrir el modo kiosko.
            </p>

            <form className="mt-4 grid gap-3" onSubmit={handleKioskAccessSubmit}>
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Usuario admin</span>
                <input
                  autoComplete="username"
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  onChange={(event) => setAdminUsername(event.target.value)}
                  placeholder="Ej: admin"
                  value={adminUsername}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Clave admin</span>
                <input
                  autoComplete="current-password"
                  className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Ingresa la clave"
                  type="password"
                  value={adminPassword}
                />
              </label>

              {kioskAccessError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {kioskAccessError}
                </p>
              ) : null}

              <div className="mt-1 flex justify-end gap-2">
                <button
                  className="rounded-2xl border border-brand-sand px-4 py-2 text-sm font-semibold text-brand-forest"
                  onClick={closeKioskAccessModal}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="rounded-2xl bg-brand-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={kioskAccessLoading}
                  type="submit"
                >
                  {kioskAccessLoading ? 'Validando...' : 'Entrar al kiosko'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
