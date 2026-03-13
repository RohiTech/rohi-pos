# RohiPOS

**RohiPOS** es un sistema web de **gestion para gimnasios y punto de venta (POS)**. Su objetivo es centralizar en una sola plataforma el control de clientes, membresias, ventas, inventario, caja y acceso al gimnasio, funcionando directamente desde el navegador.

El sistema esta pensado para clientes que trabajan desde **Mac, Windows, tablets o telefonos moviles**, sin instalar software adicional. Toda la aplicacion se desplegara en una **VPS con Ubuntu**, permitiendo acceso remoto, mantenimiento centralizado y crecimiento futuro hacia un modelo SaaS.

---

# Vision del Proyecto

RohiPOS nace para resolver las operaciones diarias de un gimnasio desde un solo sistema:

- Registrar y administrar clientes
- Controlar membresias activas, vencidas y renovaciones
- Gestionar ventas de productos en mostrador
- Mantener inventario actualizado
- Llevar caja y reportes operativos
- Validar acceso de miembros al gimnasio

La primera version estara enfocada en un gimnasio individual, pero la arquitectura se definira desde el inicio para poder escalar a **multi-sucursal** o incluso **multi-gimnasio**.

---

# Stack Tecnologico

## Frontend

- `React.js`
- `Vite`
- `Tailwind CSS`
- `React Router`

## Backend

- `Node.js`
- `Express.js`
- `Prisma ORM`
- `JWT` para autenticacion

## Base de Datos

- `PostgreSQL`

## Infraestructura

- `Ubuntu` en VPS
- `Nginx` como reverse proxy
- `Docker` y `Docker Compose`
- `HTTPS` con SSL

## Herramientas recomendadas

- `Git` y `GitHub`
- `Postman` o `Insomnia`
- `pgAdmin` o `DBeaver`
- `Figma` para diseno de interfaces

---

# Por que una Aplicacion Web

Elegir una aplicacion web es conveniente para RohiPOS por estas razones:

- Es compatible con laptops Mac sin instalar software local
- Facilita el soporte remoto y las actualizaciones
- Permite acceso desde recepcion, caja o dispositivos moviles
- Centraliza la informacion en una sola base de datos
- Reduce problemas de versionado entre equipos

---

# Modulos Principales

## 1. Gestion de Clientes

- Registro de clientes
- Datos personales y de contacto
- Fotografia de perfil
- Estado del cliente
- Historial de membresias y pagos

## 2. Gestion de Membresias

- Creacion de planes
- Asignacion de membresias a clientes
- Fecha de inicio y vencimiento
- Renovaciones
- Alertas de membresias por vencer o vencidas

## 3. Punto de Venta (POS)

- Venta rapida de productos
- Carrito de compra
- Multiples metodos de pago
- Impresion de comprobante
- Historial de ventas

## 4. Inventario

- Registro de productos
- Categorias
- Stock actual
- Entradas y salidas de inventario
- Control de precios y costo

## 5. Caja y Reportes

- Apertura y cierre de caja
- Ingresos por membresias
- Ingresos por ventas
- Reportes diarios, semanales y mensuales
- Productos mas vendidos

## 6. Control de Acceso

- Busqueda rapida de cliente
- Check-in
- Validacion de membresia activa
- Historial de asistencia
- Preparado para QR en fases posteriores

## 7. Usuarios y Roles

- Administrador
- Recepcionista
- Cajero
- Permisos por modulo

---

# Arquitectura Propuesta

RohiPOS seguira una arquitectura cliente-servidor:

1. El usuario accede al sistema desde el navegador.
2. El frontend en `React` consume una API REST construida en `Node.js + Express`.
3. El backend aplica reglas de negocio, autenticacion y validaciones.
4. `Prisma` gestiona la comunicacion con `PostgreSQL`.
5. La aplicacion se despliega en una VPS con `Ubuntu`, `Docker` y `Nginx`.

## Flujo general

```text
Navegador (Mac/Windows/Tablet)
        |
        v
Frontend React
        |
        v
API REST Node.js + Express
        |
        v
Prisma ORM
        |
        v
PostgreSQL
```

---

# Modelo Inicial de Base de Datos

Estas son las entidades base recomendadas para la primera version:

- `users`
- `roles`
- `clients`
- `membership_plans`
- `memberships`
- `products`
- `product_categories`
- `inventory_movements`
- `sales`
- `sale_items`
- `payments`
- `cash_register_sessions`
- `checkins`

## Relaciones clave

- Un cliente puede tener muchas membresias
- Una membresia pertenece a un plan
- Una venta tiene muchos items
- Un producto puede participar en muchas ventas
- Cada movimiento de inventario afecta a un producto
- Un pago puede corresponder a una membresia o a una venta

---

# Requisitos Funcionales Iniciales

## MVP del gimnasio

- Registrar clientes
- Crear planes de membresia
- Vender membresias
- Registrar pagos
- Consultar vencimientos
- Registrar productos
- Vender productos en POS
- Descontar stock automaticamente
- Generar reportes basicos

## Requisitos no funcionales

- Interfaz rapida y simple para recepcion
- Seguridad por login y roles
- Respaldo automatico de base de datos
- Acceso seguro por HTTPS
- Buen rendimiento en navegadores modernos

---

# Estructura Sugerida del Proyecto

```text
rohi-pos/
|-- frontend/              # Aplicacion React
|-- backend/               # API REST con Node.js y Express
|-- database/              # Schema Prisma, migraciones y seeds
|-- docker/                # Configuracion de contenedores
|-- docs/                  # Documentacion funcional y tecnica
`-- README.md
```

---

# Roadmap de Desarrollo

## Fase 1. Fundacion tecnica

- Definir estructura del monorepo o repositorio unico
- Configurar frontend, backend y base de datos
- Configurar Docker y entorno local
- Definir autenticacion y roles

## Fase 2. Clientes y membresias

- CRUD de clientes
- CRUD de planes
- Registro de membresias
- Pagos y renovaciones
- Alertas de vencimiento

## Fase 3. POS e inventario

- CRUD de productos
- Control de stock
- Registro de ventas
- Detalle de venta
- Caja basica

## Fase 4. Reportes y acceso

- Reportes de ingresos
- Reportes de clientes activos y vencidos
- Check-in de clientes
- Historial de asistencia

## Fase 5. Mejoras futuras

- Multi-sucursal
- App movil
- Pagos en linea
- Notificaciones por WhatsApp o correo
- Codigo QR para acceso

---

# Despliegue Propuesto

## En la VPS

- `Ubuntu`
- `Docker Compose`
- `Nginx`
- `PostgreSQL`
- API backend
- Frontend compilado y servido por `Nginx`

## Consideraciones de produccion

- Configurar dominio y SSL
- Automatizar backups de PostgreSQL
- Definir variables de entorno seguras
- Monitorear uso de disco, memoria y logs
- Preparar restauracion ante fallos

---

# Estado Actual

RohiPOS se encuentra en etapa de definicion y arquitectura inicial.

La meta de la primera entrega es contar con un sistema funcional que incluya:

- Gestion de clientes
- Gestion de membresias
- Punto de venta
- Inventario basico
- Caja y reportes iniciales

---

# Proximos Pasos Recomendados

1. Crear la estructura base de `frontend` y `backend`
2. Definir el esquema inicial en `PostgreSQL`
3. Disenar las pantallas principales del sistema
4. Construir autenticacion y roles
5. Implementar primero clientes, membresias y POS

---

# Licencia

Proyecto privado en desarrollo.
