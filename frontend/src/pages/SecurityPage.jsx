import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { DataPanel } from '../components/DataPanel';
import { PageHeader } from '../components/PageHeader';
import { apiGet, apiPost, apiPut, buildQueryString } from '../lib/api';

const initialUserForm = {
  role_id: '',
  first_name: '',
  last_name: '',
  email: '',
  username: '',
  password: '',
  phone: '',
  is_active: true
};

const initialPagination = {
  page: 1,
  limit: 10,
  totalItems: 0,
  totalPages: 1
};

export function SecurityPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [pagination, setPagination] = useState(initialPagination);
  const [userPage, setUserPage] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAdmin = user?.role_name === 'admin';

  useEffect(() => {
    loadRoles();
  }, []);

  useEffect(() => {
    loadUsers();
  }, [userSearch, activeFilter, userPage]);

  async function loadRoles() {
    setLoadingRoles(true);
    setError('');

    try {
      const response = await apiGet('/roles');
      setRoles(response.data);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar los roles');
    } finally {
      setLoadingRoles(false);
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    setError('');

    try {
      const query = buildQueryString({
        search: userSearch.trim(),
        active: activeFilter !== 'all' ? activeFilter : undefined,
        page: userPage,
        limit: pagination.limit
      });
      const response = await apiGet(`/users${query}`);

      setUsers(response.data);
      setPagination(response.pagination || initialPagination);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible cargar los usuarios');
    } finally {
      setLoadingUsers(false);
    }
  }

  function resetUserForm() {
    setSelectedUserId(null);
    setUserForm(initialUserForm);
    setMessage('');
    setError('');
  }

  function handleUserFormChange(event) {
    const { name, value, type, checked } = event.target;
    setUserForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  }

  function startEditUser(userData) {
    setSelectedUserId(userData.id);
    setUserForm({
      role_id: String(userData.role_id),
      first_name: userData.first_name,
      last_name: userData.last_name,
      email: userData.email,
      username: userData.username,
      password: '',
      phone: userData.phone || '',
      is_active: userData.is_active
    });
    setMessage('Editando usuario seleccionado. Deja el campo de contraseña vacío si no deseas cambiarla.');
  }

  async function handleUserSubmit(event) {
    event.preventDefault();
    setSavingUser(true);
    setError('');
    setMessage('');

    try {
      if (selectedUserId) {
        const payload = {
          role_id: Number(userForm.role_id),
          first_name: userForm.first_name,
          last_name: userForm.last_name,
          email: userForm.email,
          username: userForm.username,
          phone: userForm.phone || null,
          is_active: userForm.is_active
        };

        if (userForm.password) {
          payload.password = userForm.password;
        }

        await apiPut(`/users/${selectedUserId}`, payload);
        setMessage('Usuario actualizado correctamente.');
      } else {
        await apiPost('/users', {
          role_id: Number(userForm.role_id),
          first_name: userForm.first_name,
          last_name: userForm.last_name,
          email: userForm.email,
          username: userForm.username,
          password: userForm.password,
          phone: userForm.phone || null,
          is_active: userForm.is_active
        });
        setMessage('Usuario creado correctamente.');
      }

      resetUserForm();
      setUserPage(1);
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message || 'No fue posible guardar el usuario');
    } finally {
      setSavingUser(false);
    }
  }

  async function toggleUserState(userData) {
    setError('');

    try {
      await apiPut(`/users/${userData.id}`, { is_active: !userData.is_active });
      await loadUsers();
      setMessage(`Usuario ${userData.is_active ? 'desactivado' : 'activado'} correctamente.`);
    } catch (requestError) {
      setError(requestError.message || 'No fue posible actualizar el estado del usuario');
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Seguridad"
        title="Usuarios, roles y accesos"
        description="Administra el acceso al sistema con cuentas, roles y permisos." 
      />

      {message ? <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}

      {!isAdmin ? (
        <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Solo los usuarios con rol <strong>admin</strong> pueden crear y modificar cuentas.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <DataPanel title="Usuarios" subtitle="Registra y administra cuentas de acceso.">
          <form className="grid gap-4" onSubmit={handleUserSubmit}>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-forest">Rol</span>
              <select
                className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
                name="role_id"
                onChange={handleUserFormChange}
                required
                value={userForm.role_id}
                disabled={!isAdmin}
              >
                <option value="">Selecciona un rol</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Nombre</span>
                <input
                  className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-3 py-3"
                  name="first_name"
                  onChange={handleUserFormChange}
                  required
                  type="text"
                  value={userForm.first_name}
                  disabled={!isAdmin}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Apellido</span>
                <input
                  className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-3 py-3"
                  name="last_name"
                  onChange={handleUserFormChange}
                  required
                  type="text"
                  value={userForm.last_name}
                  disabled={!isAdmin}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Correo</span>
                <input
                  className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-3 py-3"
                  name="email"
                  onChange={handleUserFormChange}
                  required
                  type="email"
                  value={userForm.email}
                  disabled={!isAdmin}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Usuario</span>
                <input
                  className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-3 py-3"
                  name="username"
                  onChange={handleUserFormChange}
                  required
                  type="text"
                  value={userForm.username}
                  disabled={!isAdmin}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Contraseña</span>
                <input
                  className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-3 py-3"
                  name="password"
                  onChange={handleUserFormChange}
                  type="password"
                  value={userForm.password}
                  placeholder={selectedUserId ? 'Dejar vacío para no cambiarla' : ''}
                  disabled={!isAdmin}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-forest">Teléfono</span>
                <input
                  className="w-full rounded-2xl border border-brand-sand bg-brand-cream/40 px-3 py-3"
                  name="phone"
                  onChange={handleUserFormChange}
                  type="tel"
                  value={userForm.phone}
                  disabled={!isAdmin}
                />
              </label>
            </div>

            <label className="flex items-center gap-3 text-sm font-semibold text-brand-forest">
              <input
                checked={userForm.is_active}
                className="h-4 w-4 rounded border-brand-sand text-brand-forest"
                disabled={!isAdmin}
                name="is_active"
                onChange={handleUserFormChange}
                type="checkbox"
              />
              Usuario activo
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-2xl bg-brand-forest px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                disabled={!isAdmin || savingUser}
                type="submit"
              >
                {savingUser ? 'Guardando...' : selectedUserId ? 'Actualizar usuario' : 'Crear usuario'}
              </button>
              <button
                className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-forest"
                onClick={resetUserForm}
                type="button"
              >
                Limpiar
              </button>
            </div>
          </form>
        </DataPanel>

        <div className="grid gap-6">
          <DataPanel title="Roles" subtitle="Perfiles y descripciones disponibles.">
            {loadingRoles ? (
              <p className="text-sm text-brand-forest/70">Cargando roles...</p>
            ) : (
              <ul className="grid gap-3">
                {roles.map((role) => (
                  <li key={role.id} className="rounded-2xl border border-brand-sand/70 bg-brand-cream/40 p-4">
                    <p className="font-semibold text-brand-forest">{role.name}</p>
                    <p className="text-sm text-brand-forest/70">{role.description || 'Sin descripción'}</p>
                  </li>
                ))}
              </ul>
            )}
          </DataPanel>

          <DataPanel title="Accesos" subtitle="Control rápido por rol.">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-brand-sand/70 bg-brand-cream/40 p-4">
                <p className="font-semibold text-brand-forest">Administradores</p>
                <p className="text-sm text-brand-forest/70">Acceso completo al sistema, incluida la gestión de usuarios.</p>
              </div>
              <div className="rounded-2xl border border-brand-sand/70 bg-brand-cream/40 p-4">
                <p className="font-semibold text-brand-forest">Cajeros</p>
                <p className="text-sm text-brand-forest/70">Solo ventas y cobros en el módulo POS.</p>
              </div>
              <div className="rounded-2xl border border-brand-sand/70 bg-brand-cream/40 p-4">
                <p className="font-semibold text-brand-forest">Recepción</p>
                <p className="text-sm text-brand-forest/70">Clientes, membresías y control de asistencia.</p>
              </div>
            </div>
          </DataPanel>
        </div>
      </div>

      <DataPanel title="Usuarios registrados" subtitle="Listado de cuentas activas e inactivas.">
        <div className="grid gap-4 mb-4 md:grid-cols-[1fr_180px]">
          <input
            className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
            onChange={(event) => {
              setUserSearch(event.target.value);
              setUserPage(1);
            }}
            placeholder="Buscar usuarios por nombre, correo o rol"
            type="text"
            value={userSearch}
          />
          <select
            className="rounded-2xl border border-brand-sand bg-brand-cream/40 px-4 py-3"
            onChange={(event) => {
              setActiveFilter(event.target.value);
              setUserPage(1);
            }}
            value={activeFilter}
          >
            <option value="all">Todos los usuarios</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </div>

        {loadingUsers ? (
          <p className="text-sm text-brand-forest/70">Cargando usuarios...</p>
        ) : !users.length ? (
          <p className="text-sm text-brand-forest/70">No hay usuarios que coincidan con la búsqueda actual.</p>
        ) : (
          <div className="grid gap-3">
            {users.map((userData) => (
              <div key={userData.id} className="rounded-2xl border border-brand-sand/70 bg-brand-cream/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-brand-forest">{userData.first_name} {userData.last_name}</p>
                    <p className="text-sm text-brand-forest/70">{userData.email} · {userData.username}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-brand-moss">{userData.role_name}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-2xl border border-brand-sand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-forest"
                      onClick={() => startEditUser(userData)}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className={`rounded-2xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                        userData.is_active ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-brand-moss bg-brand-moss/10 text-brand-forest'
                      }`}
                      onClick={() => toggleUserState(userData)}
                      type="button"
                    >
                      {userData.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-brand-forest/70">
            Página {pagination.page} de {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold text-brand-forest disabled:opacity-60"
              disabled={pagination.page <= 1}
              onClick={() => setUserPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Anterior
            </button>
            <button
              className="rounded-2xl border border-brand-sand px-4 py-3 text-sm font-semibold text-brand-forest disabled:opacity-60"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setUserPage((current) => Math.min(pagination.totalPages, current + 1))}
              type="button"
            >
              Siguiente
            </button>
          </div>
        </div>
      </DataPanel>
    </div>
  );
}
