# RohiPOS

**RohiPOS** es un sistema web de **Punto de Venta (POS) y gestión de gimnasios**, diseñado para ayudar a centros de entrenamiento a administrar sus clientes, membresías, ventas de productos e inventario desde una interfaz moderna accesible desde cualquier navegador.

El sistema funciona completamente en el navegador y está alojado en una **VPS en la nube**, lo que permite acceder desde **Mac, Windows, tablets o teléfonos móviles** sin necesidad de instalar software adicional.

---

# Objetivo del Proyecto

El objetivo de RohiPOS es ofrecer una plataforma simple, moderna y eficiente para gimnasios que necesitan gestionar:

* Clientes
* Membresías
* Ventas de productos
* Inventario
* Reportes financieros
* Control de acceso de miembros

El sistema está diseñado para ser **escalable**, permitiendo en el futuro convertirse en una **plataforma SaaS para múltiples gimnasios**.

---

# Funcionalidades Principales

## Gestión de Clientes

* Registrar nuevos clientes
* Almacenar información de contacto
* Subir fotografía del cliente
* Registrar fecha de inscripción
* Consultar historial del cliente

## Gestión de Membresías

* Planes mensuales, semanales o anuales
* Control de fecha de inicio y vencimiento
* Detección automática de membresías vencidas
* Alertas de vencimiento

## Punto de Venta (POS)

Permite vender productos del gimnasio como:

* Suplementos
* Proteínas
* Bebidas
* Ropa deportiva
* Accesorios

Características:

* Interfaz rápida de venta
* Historial de ventas
* Diferentes métodos de pago

## Gestión de Inventario

* Catálogo de productos
* Control de stock
* Categorías de productos
* Gestión de precios

## Reportes y Estadísticas

* Reportes de ventas diarias
* Ingresos por membresías
* Ventas por producto
* Clientes activos y vencidos

## Sistema de Acceso al Gimnasio

* Búsqueda rápida de clientes
* Check-in mediante código QR
* Validación de membresía
* Alertas visuales de membresía activa o vencida

---

# Arquitectura del Sistema

RohiPOS utiliza una arquitectura web moderna.

Los usuarios acceden al sistema desde el navegador.
El frontend se comunica con el backend mediante una **API REST**, y el backend interactúa con la base de datos.

---

# Tecnologías Utilizadas

## Frontend

* React
* Next.js
* TailwindCSS

## Backend

* Node.js
* Express.js
* Prisma ORM

## Base de Datos

* PostgreSQL

## Infraestructura

* VPS con Ubuntu
* Docker
* Nginx

---

# Estructura del Proyecto

```
rohi-pos
│
├── frontend        # Interfaz web del sistema
├── backend         # Servidor API REST
├── database        # Esquema y migraciones de la base de datos
├── docker          # Configuración de contenedores
├── docs            # Documentación del proyecto
└── README.md
```

---

# Usuarios Objetivo

RohiPOS está diseñado para:

* Gimnasios pequeños y medianos
* Centros de fitness
* Estudios de entrenamiento personal
* Box de CrossFit

---

# Funcionalidades Futuras

En futuras versiones RohiPOS podría incluir:

* Soporte para múltiples gimnasios (SaaS)
* Pagos en línea de membresías
* Aplicación móvil
* Estadísticas avanzadas de asistencia
* Gestión de entrenadores
* Registro de rutinas de entrenamiento
* Notificaciones por WhatsApp o correo electrónico

---

# Estado del Proyecto

RohiPOS se encuentra actualmente **en desarrollo activo**.

La primera versión incluirá:

* Gestión de clientes
* Control de membresías
* Sistema POS
* Gestión de inventario
* Reportes básicos

---

# Licencia

Este proyecto se encuentra actualmente en desarrollo y es de uso privado.
