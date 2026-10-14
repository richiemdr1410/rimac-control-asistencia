# Informe de preparación para GitHub

Fecha: 14 de octubre de 2026. Origen: control-de-asistencia-y-horas-laborales.zip exportado desde Google AI Studio.

## Resultado

Copia preparada para revisar y realizar un primer commit local. Repositorio Git inicializado en la rama main, sin commits, sin remoto y sin publicación externa. El ZIP original no se modificó. Los archivos privados permanecen localmente y están ignorados; no compartir la carpeta completa o el ZIP original como si fueran una exportación saneada.

## Cambios realizados

- README.md: sustituida la plantilla AI Studio por documentación del sistema, configuración, migraciones, seed, ejecución, RAG y límites.
- .env.example: corregido FIRESTORE a POSTGRESQL, conexión ficticia, clave Gemini vacía y variables SQL documentadas.
- .gitignore: excluidos configuración Firebase exportada, metadatos AI Studio, 34 PDFs de storage/rag_docs, caché de embeddings, credenciales y respaldos locales.
- Este informe es un archivo nuevo. La comparación SHA-256 con todos los archivos del ZIP confirmó que solo cambiaron README.md, .env.example y .gitignore. Código, contratos, pruebas y siete migraciones no cambiaron.

## Hallazgos

1. El ZIP solo contenía .env.example; no se encontró un .env real. La plantilla anterior indicaba un proveedor que el código rechaza. Quedó corregida sin cambiar el comportamiento de la aplicación.
2. firebase-applet-config.json contiene una cadena con formato de API key Google y datos de identificación del proyecto. Se excluyó íntegramente, sin copiar valores a la documentación. No se verificó su validez ni se hicieron llamadas externas. La única referencia detectada al archivo es una prueba externa Firestore, no el flujo operativo PostgreSQL. firebase-blueprint.json y metadata.json también se excluyeron como metadatos del entorno de origen.
3. Hay contraseñas conocidas de DEMO en shared/contracts/demo-data.ts, src/db/seed.ts y pruebas. Son utilizadas por la pantalla de acceso de demostración; permanecen para no modificar funcionalidad. No reutilizarlas en cuentas reales. El seed puede restablecer contraseñas y actualizar registros existentes.
4. drizzle.config.ts conserva una conexión de ejemplo localhost con credenciales por defecto, distinta de la configuración src/db/drizzle.config.ts. No se identificó como credencial productiva. Se documentó el uso del migrador existente para evitar confundir rutas de migraciones.
5. Los PDFs y embeddings quedan excluidos. La base PostgreSQL no está en el ZIP; no puede darse por reproducido el corpus multidocumental de AI Studio en una instalación nueva.
6. El reglamento institucional sigue incorporado en src/server/rag/corpus/reglamento-data.ts y es importado por la ingesta. Contiene texto y nombres institucionales. Eliminarlo o excluirlo rompería esa importación o modificaría el RAG. Antes de publicación pública se requiere confirmar autorización de distribución; en ausencia de esa decisión, mantener el repositorio privado. Revisar igualmente imágenes de marca y datos de ejemplo que utilizan dominios institucionales.
7. No se detectaron claves privadas, tokens GitHub ni credenciales reales de PostgreSQL o Gemini en los candidatos examinados. Esta revisión estática por patrones y lectura dirigida no garantiza la ausencia de cualquier secreto posible. No se comprobó vigencia de credenciales ni se rotaron claves.

## Qué versionar

Código src y shared, server.ts, componentes, recursos de marca sujetos a autorización, package.json, bun.lock, configuraciones de compilación, reglas Firestore, las siete migraciones SQL, .env.example, .gitignore y documentación.

## Qué excluir

.env y variantes reales, firebase-applet-config.json, firebase-blueprint.json, metadata.json, storage/rag_docs completo, .rag_embeddings_cache.json, claves y archivos de credenciales, respaldos de bases, logs, dependencias instaladas y resultados de compilación. Las exclusiones no sustituyen una revisión de contenido: un secreto dentro de un archivo de código no se protege por .gitignore.

## Validación y límites

- Verificada la exclusión con git check-ignore y la lista de archivos candidatos con git ls-files --others --exclude-standard.
- Verificado que .env.example y las migraciones siguen disponibles para versionar.
- No había historial Git en la exportación; no hay historial previo que auditar en esta copia.
- No se instalaron dependencias ni se ejecutaron build, typecheck, seed, migraciones o suites externas: la copia no incluye node_modules y este entorno no dispone de npm/bun como comandos. La validación técnica previa relatada en el chat no se considera una ejecución comprobada aquí.
- No se conectó a PostgreSQL, Gemini, Firestore ni GitHub.

## Antes del push

Resolver la visibilidad y autorización del contenido institucional, ejecutar las comprobaciones técnicas del README en el entorno preparado y revisar los archivos del commit. No usar git add -f para incluir archivos privados. No subir este ZIP original ni adjuntar respaldos. La publicación y el remoto se gestionarán posteriormente.
