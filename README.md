# RIMAC — Control de asistencia y horas laborales

Proyecto académico del Curso 3 – Generative AI. Integra Autoservicio y Garita, personal y horarios, solicitudes y aprobaciones, incidencias y correcciones, jornadas, tiempo adicional, reportes y consulta de políticas mediante RAG.

Utiliza React, TypeScript, Vite, Express, PostgreSQL, Drizzle ORM y Gemini desde el servidor. Combina permisos por rol y alcance por jefatura. Roles: ADMINISTRADOR, TALENTO_HUMANO, SUPERVISOR_SEGURIDAD, SEGURIDAD y EMPLEADO.

## Instalación local

Requisitos: Node.js con gestor de paquetes compatible con package.json, PostgreSQL con soporte para btree_gist y clave Gemini para RAG. Se conserva bun.lock: `bun install --frozen-lockfile` permite utilizar ese bloqueo. Como alternativa, `npm install` genera un bloqueo npm nuevo que deberá revisarse y versionarse si se elige ese gestor.

1. Instalar dependencias desde la raíz.
2. Copiar `.env.example` a `.env` y completar una conexión a PostgreSQL dedicada a demostración. El backend carga `.env`, no `.env.local` explícitamente.
3. Configurar GEMINI_API_KEY solo en el servidor; no usar prefijos VITE_ para secretos.
4. Aplicar migraciones:

```sh
node --import tsx --import dotenv/config src/db/migrator.ts
```

5. Cargar datos sintéticos, si se necesita la demostración:

```sh
node --import tsx --import dotenv/config src/server/seed-cli.ts
```

6. Ejecutar `npm run dev` y abrir http://localhost:3000.

El servidor escucha en 3000 de forma fija aunque exista PORT. DATABASE_URL permite configuración local. También se admiten SQL_HOST, SQL_USER, SQL_PASSWORD y SQL_DB_NAME; tienen prioridad sobre DATABASE_URL. Evitar definir ambos esquemas simultáneamente.

## Base de datos y demostración

Se conservan siete migraciones en `src/db/migrations/`. El migrador las ordena y registra en `_migrations`. La cuenta debe poder crear el esquema y la extensión requerida. El ZIP no incluye los registros de la base de AI Studio.

El seed crea cuentas con credenciales conocidas, incorporadas también en el acceso de demostración. Son datos de ejemplo. El seed puede actualizar datos y restablecer contraseñas: ejecutarlo solamente sobre una base de demostración.

Hay dos configuraciones Drizzle con destinos distintos. Para reproducir esta entrega usar el migrador anterior; no ejecutar push ni generar migraciones automáticamente sobre una base en uso.

## Documentos RAG y distribución

`storage/rag_docs/` y `.rag_embeddings_cache.json` quedan fuera de Git. Conservarlos en almacenamiento privado. El corpus administrado requiere recuperar documentos y base de datos por separado, o realizar nuevas cargas autorizadas. El código exportado no reproduce por sí solo los documentos y versiones existentes en AI Studio.

`src/server/rag/corpus/reglamento-data.ts` contiene texto institucional incorporado al código e importado por la ingesta. Se conserva para mantener funcionalidad. Antes de publicar un repositorio público, confirmar autorización para distribuir ese contenido, nombres institucionales e imágenes de marca. Mientras se resuelve, mantener el repositorio privado.

Los identificadores Gemini permanecen como en la exportación; su disponibilidad y cuotas no se comprobaron en esta preparación.

## Verificación y compilación

```sh
npm run lint
npm run build
```

Para ejecutar la compilación, establecer NODE_ENV=production en el entorno y ejecutar `npm start`. `npm run preview` no sustituye al servidor Express.

Las suites históricas escriben datos e incluyen una prueba externa Firestore. Revisar sus efectos antes de ejecutarlas. La configuración Firebase exportada queda excluida y esa prueba requiere configuración privada adicional. PostgreSQL es la única persistencia operativa admitida por el código actual.

## Repositorio

Versionar código, contratos, migraciones, package.json, el bloqueo elegido, .env.example y documentación. Excluir entornos reales, configuración Firebase exportada, documentos cargados, cachés, respaldos, claves, logs y dependencias instaladas. No forzar archivos ignorados.

Esta preparación no incluye commit, push, publicación ni despliegue. Consultar PREPARACION_GITHUB.md para hallazgos y límites.
