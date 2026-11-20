# GSP Security Pro

**GSP Security Pro (Gestión de Seguridad Profesional)** es una aplicación web para gestionar la operación de servicios de seguridad privada: empresas, objetivos, vigiladores, asignaciones, turnos, novedades, avisos y solicitudes operativas.

Repositorio: [FraNkoRasia/Gps-Security-Pro](https://github.com/FraNkoRasia/Gps-Security-Pro)

> **Alcance de esta documentación:** describe la implementación identificada mediante inspección estática del código. No es una auditoría de seguridad ni confirma que todas las migraciones estén aplicadas o que cada flujo se haya probado en producción.

## Funcionalidades principales

- Autenticación con Supabase Auth, carga de perfiles y control de cuentas.
- Recuperación y cambio de contraseña, incluido el cambio obligatorio cuando corresponde.
- Gestión de empresas, objetivos, vigiladores y asignaciones.
- Grilla mensual de turnos y tipos de turno.
- Vistas Mi turno, Mi mes e historial laboral.
- Solicitudes de horas extra y revisión administrativa.
- Cambios de turno, respuesta del destinatario y resolución administrativa.
- Libro digital de novedades, búsqueda, filtros y corrección con motivo.
- Avisos asociados a objetivos y estados de lectura.
- Consulta de feriados argentinos con caché y mecanismo de respaldo.
- Perfil, preferencias de idioma y tema, ayuda, acerca de, privacidad y términos.
- Configuración de Progressive Web App (PWA) y service worker.

La presencia de un módulo en el código no garantiza que todos sus escenarios funcionen en producción.

## Roles

El sistema declara cinco roles: **Super Administrador**, **Administrador**, **Supervisor**, **Encargado de Empresa** y **Vigilador**. Sus permisos concretos dependen de los controles de la interfaz, las operaciones de backend y las políticas RLS de Supabase. Esta descripción no sustituye una matriz de permisos completa; ocultar un botón no reemplaza la autorización en el servidor o la base de datos.

## Módulos

### Autenticación y perfiles
El contexto de autenticación gestiona la sesión de Supabase, carga el perfil vinculado al usuario y contempla estados de cuenta y empresa. Incluye flujos de recuperación y cambio de contraseña. El perfil presenta datos personales y laborales cuando existe la vinculación correspondiente.

### Empresas, objetivos, vigiladores y asignaciones
El modelo incluye empresas, objetivos o puestos de vigilancia, vigiladores y asignaciones temporales. Los objetivos pueden registrar nombre, dirección, localidad, provincia y descripción. Las asignaciones relacionan vigiladores con objetivos y contemplan fechas y estado.

### Grilla y turnos
La grilla organiza turnos por vigilador, objetivo y fecha. El modelo contempla turnos diurnos, nocturnos, francos y especiales, además de tipos personalizados. Las restricciones de edición dependen también de las funciones y triggers SQL desplegados.

### Mi turno, Mi mes e historial laboral
- **Mi turno:** consulta de la guardia individual.
- **Mi mes:** resumen mensual de horas trabajadas, diurnas, nocturnas y extras.
- **Historial laboral:** consulta de períodos anteriores.

La utilidad compartida de cálculo contempla duplicados, turnos que cruzan medianoche y límites de mes. La franja nocturna identificada es desde las 21:00 hasta antes de las 06:00; el resto se clasifica como diurno. Los totales dependen de la exactitud de los horarios y estados almacenados. No se realizó una prueba comparativa completa con datos de producción.

### Horas extra y cambios de turno
El flujo de horas extra contempla informar horarios, minutos y motivo, y revisión administrativa para aprobar o rechazar la solicitud. El flujo de cambio de turno contempla solicitud, respuesta del destinatario y revisión administrativa cuando corresponde. La persistencia y autorización finales deben verificarse contra las migraciones y políticas activas en Supabase.

### Libro de novedades y avisos
El libro digital contempla novedades asociadas a objetivos, personal, fecha, hora, turno, supervisor, elementos a cargo e informe, con búsqueda y filtros. Los avisos permiten comunicar información por objetivo y contemplan prioridad y estados de lectura. La visibilidad real depende también de las políticas de acceso de Supabase.

### Feriados, preferencias y páginas informativas
La utilidad de feriados consulta la API pública de ArgentinaDatos y mantiene caché local por año, con un cálculo de respaldo y soporte para feriados manuales. El proyecto incluye preferencias de tema e idioma, traducciones al español e inglés y páginas de ayuda, acerca de, privacidad y términos.

## Tecnologías

| Tecnología | Uso |
|---|---|
| React 19 | Interfaz por componentes |
| TypeScript 6 | Tipado estático |
| Vite 8 | Desarrollo y compilación |
| React Router DOM 7 | Enrutamiento |
| Tailwind CSS 4 | Estilos |
| Supabase JS 2 | Autenticación y acceso a datos |
| Supabase Edge Functions | Operaciones de backend |
| Zod 4 | Validación en módulos que lo utilizan |
| Lucide React | Iconografía |
| vite-plugin-pwa | Manifiesto y service worker |
| Oxlint | Análisis estático |
| pnpm | Gestor de paquetes |

Las versiones se basan en `package.json` y `pnpm-lock.yaml`.

## Arquitectura y estructura

Aplicación React construida con Vite. Los contextos gestionan autenticación, operación y tema; las vistas y componentes se organizan por responsabilidad.

```text
.
├── .github/workflows/       # Automatización de despliegue
├── public/                  # Recursos e iconos
├── src/
│   ├── componentes/
│   │   ├── autenticacion/
│   │   ├── layout/
│   │   ├── operativo/
│   │   ├── pwa/
│   │   └── ui/
│   ├── contextos/           # Autenticación, operación y tema
│   ├── esquemas/            # Validaciones
│   ├── i18n/                # Traducciones
│   ├── servicios/           # Cliente y servicios externos
│   ├── tipos/               # Tipos del dominio
│   ├── utilidades/          # Cálculos y utilidades
│   ├── vistas/              # Páginas principales
│   ├── App.tsx
│   ├── main.tsx
│   └── registro-pwa.ts
├── supabase/
│   ├── functions/           # Edge Functions
│   └── migrations/          # Cambios SQL versionados
├── .env.example
├── package.json
├── pnpm-lock.yaml
└── vite.config.ts
```

Archivos destacados: `src/contextos/contexto-autenticacion.tsx`, `src/contextos/contexto-operativo.tsx`, `src/tipos/index.ts`, `src/servicios/supabase.ts`, `supabase/migrations/`, `supabase/functions/` y `.github/workflows/`.

## Requisitos e instalación

Se necesita Node.js compatible con Vite 8, pnpm, Git y un proyecto Supabase para autenticación y persistencia.

```bash
git clone https://github.com/FraNkoRasia/Gps-Security-Pro.git
cd Gps-Security-Pro
pnpm install
```

En CI, se recomienda respetar el archivo de bloqueo con `pnpm install --frozen-lockfile`.

### Variables de entorno

Copiá `.env.example` a `.env` y configurá:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
```

Las variables con prefijo `VITE_` se exponen al navegador. **Nunca coloques secretos de servidor, claves `service_role` ni tokens privados en variables del frontend.** Sin una configuración válida, la autenticación real no estará disponible. El alcance del modo simulador mencionado en el archivo de ejemplo debe revisarse antes de usarlo como sustituto del backend real.

### Comandos

```bash
pnpm dev
pnpm build
pnpm lint
pnpm preview
```

- `pnpm dev`: desarrollo con Vite.
- `pnpm build`: ejecuta `tsc -b` y la compilación de Vite.
- `pnpm lint`: ejecuta Oxlint.
- `pnpm preview`: sirve la compilación localmente.

Estos comandos se documentan a partir de los scripts declarados; no se ejecutaron durante la preparación de este archivo.

## Supabase y datos

Las migraciones versionadas describen entidades como:

| Entidad | Propósito |
|---|---|
| `empresas` | Empresas de seguridad |
| `perfiles` | Perfil, rol, empresa y estado de cuenta |
| `objetivos` | Puestos de vigilancia |
| `vigiladores` | Datos operativos del personal |
| `asignaciones` | Relación temporal entre vigiladores y objetivos |
| `turnos` | Planificación, horarios y estado de turnos |
| `novedades_libro` | Registros del libro de novedades |
| Otras tablas | Solicitudes, avisos, tipos de turno y datos laborales |

El esquema contempla perfiles vinculados a `auth.users`, objetivos y vigiladores asociados a empresas, asignaciones vinculadas a vigiladores y objetivos, y turnos relacionados con entidades operativas. Hay migraciones para restricciones por asignación, perfiles, cambios y edición de turnos, horas extra y ficha ampliada.

Antes de aplicar migraciones, confirmá el proyecto y entorno, revisá los archivos y su orden, realizá un respaldo y probá en un entorno no productivo. Después verificá tablas, relaciones, funciones, triggers y políticas. **No se aplicaron migraciones ni se hicieron escrituras en Supabase** durante la preparación de esta documentación; la estructura remota activa no fue verificada.

### Edge Functions
El repositorio contiene funciones para operaciones administrativas y flujos de contraseña. Revisá `supabase/functions/DEPLOY.md` y `.github/workflows/deploy-supabase-functions.yml` para conocer los requisitos de despliegue y secretos. El despliegue de funciones es independiente del frontend.

## Seguridad

En el código y las migraciones se identifican Supabase Auth, comprobaciones de perfil y cuenta, controles por rol en distintos módulos, migraciones que contemplan RLS, funciones de backend y validaciones en formularios.

Esto **no certifica la seguridad del entorno desplegado**:
- Verificá RLS en todas las tablas accesibles desde el cliente.
- Las Edge Functions deben validar identidad, rol, empresa y parámetros en servidor.
- La presencia de migraciones en Git no demuestra que estén aplicadas en producción.
- La clave pública de Supabase no sustituye la autorización.
- Los secretos de GitHub Actions deben guardarse en la configuración de secretos.
- Revisá el modo simulador para evitar confusión con datos reales.

No se realizaron pruebas de penetración ni auditoría de permisos, sesiones, RLS o funciones desplegadas.

## PWA y modo sin conexión

La configuración de `vite-plugin-pwa` incluye manifiesto, iconos, visualización independiente, registro del service worker, actualización y limpieza de cachés. La utilidad de feriados mantiene caché local y un mecanismo de respaldo. Una PWA no implica que todas las funciones estén disponibles sin conexión: operaciones que requieren autenticación o escrituras en Supabase pueden necesitar conectividad. No se probaron todas las pantallas offline ni la sincronización posterior.

## Despliegue

### Frontend (Vercel u otro hosting estático)
- **Instalación:** `pnpm install --frozen-lockfile` en CI.
- **Build:** `pnpm build`.
- **Salida:** `dist`.
- **Variables:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Verificá que el hosting resuelva las rutas del cliente al recargar una URL interna. La configuración activa de Vercel, dominio y reglas de reescritura debe confirmarse en ese entorno.

### Funciones Supabase
Revisá el workflow de GitHub Actions y `supabase/functions/DEPLOY.md` antes de habilitar el despliegue. No se ejecutó ningún despliegue durante la documentación.

## Verificaciones pendientes

- Ejecutar `pnpm build`, `pnpm lint` y las pruebas automatizadas.
- Completar la matriz de permisos de los cuatro roles en frontend, Edge Functions y RLS.
- Comparar migraciones del repositorio con la base Supabase activa.
- Verificar despliegue y secretos de Edge Functions.
- Probar el alcance real del funcionamiento offline.
- Confirmar persistencia de cambios de turno y autorización de horas extra en producción.
- Probar cálculos de horas en turnos que cruzan medianoche o mes.
- Revisar el alcance y las restricciones del modo simulador.

Son puntos pendientes de validación, no afirmaciones de fallas confirmadas.

## Mejoras propuestas

- Añadir pruebas para horas nocturnas, cruces de mes y cambios de turno.
- Probar autorización por rol y empresa en RLS y Edge Functions.
- Documentar respaldo, restauración y despliegues por ambiente.
- Fijar versiones de Node.js y pnpm para desarrollo y CI.
- Mantener una matriz de permisos actualizada.
- Probar instalación y modo offline en Android y escritorio.
- Revisar las migraciones antes de producción.

## Autoría y créditos

- **Proyecto:** GSP Security Pro — Gestión de Seguridad Profesional.
- **Repositorio:** [FraNkoRasia/Gps-Security-Pro](https://github.com/FraNkoRasia/Gps-Security-Pro).
- **Tecnologías:** React, TypeScript, Vite, Tailwind CSS, Supabase, Lucide y dependencias de `package.json`.
- **Feriados:** API pública de [ArgentinaDatos](https://api.argentinadatos.com/), con caché y cálculo de respaldo.

Para atribuciones y licencias de terceros, consultá los metadatos de cada dependencia y la información legal del repositorio. Esta documentación no atribuye licencias no verificadas.
