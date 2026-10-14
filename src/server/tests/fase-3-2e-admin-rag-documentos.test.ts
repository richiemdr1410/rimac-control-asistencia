import assert from "node:assert";
import { getPool } from "../../db/index.js";

const BASE_URL = "http://127.0.0.1:3000";

interface LoginResult {
  cookie: string;
  sid: string;
  csrf: string;
  usuario: any;
}

async function loginUser(username: string, pass: string): Promise<LoginResult> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador: username, password: pass }),
  });

  const body = (await res.json()) as any;
  assert.strictEqual(res.status, 200, `Login fallido para ${username}: ${JSON.stringify(body)}`);
  assert.strictEqual(body.exito, true);

  const rawCookie = res.headers.get("set-cookie") || "";
  const match = rawCookie.match(/sid=([^;]+)/);
  const sid = match ? match[1] : body.datos.sesion_id;

  return {
    cookie: rawCookie,
    sid,
    csrf: body.datos.token_csrf || body.datos.csrf_token,
    usuario: body.datos.usuario,
  };
}

function generarPdfValidoConTexto(texto: string): Buffer {
  const streamContent = `BT\n/F1 12 Tf\n72 712 Td\n(${texto.replace(/[()\\]/g, "")}) Tj\nET`;
  const streamLen = Buffer.byteLength(streamContent, "ascii");

  const contenido = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${streamLen} >> stream
${streamContent}
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000236 00000 n 
0000000305 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
${450 + streamLen}
%%EOF`;

  return Buffer.from(contenido, "ascii");
}

function generarPdfSinTexto(): Buffer {
  const contenido = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer << /Size 4 /Root 1 0 R >>
startxref
200
%%EOF`;
  return Buffer.from(contenido, "ascii");
}

async function runFase32eSuite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.2E ===");
  console.log("=== ADMINISTRACIÓN DOCUMENTAL RAG Y CARGA DE PDF ===");

  let passCount = 0;
  let failCount = 0;

  async function test(num: number, desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      passCount++;
      console.log(`[PASS] Test ${num}: ${desc}`);
    } catch (err: any) {
      failCount++;
      console.error(`[FAIL] Test ${num}: ${desc} -> Error: ${err.message}`);
    }
  }

  const pool = getPool();
  const ts = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const testDocCodigo = `POL-TEST-${ts.toUpperCase()}`;

  // Limpiar posibles residuos previos de pruebas
  await pool.query("DELETE FROM rag_chunks WHERE documento_id IN (SELECT id FROM rag_documentos WHERE codigo LIKE 'POL-TEST-%');");
  await pool.query("DELETE FROM rag_documentos WHERE codigo LIKE 'POL-TEST-%';");

  // 1. Iniciar sesión con actores
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");
  const talentoHumano = await loginUser("talento_humano", "PassSegura_2026!*");

  // Helper para headers autenticados
  const authHeaders = (actor: LoginResult, extra: Record<string, string> = {}) => ({
    "X-Session-Id": actor.sid,
    Authorization: `Bearer ${actor.sid}`,
    "X-CSRF-Token": actor.csrf,
    Cookie: `sid=${actor.sid}`,
    ...extra,
  });

  // Test 1: Rechazo de acceso a administración RAG sin autenticación
  await test(1, "Acceso no autenticado a GET /api/admin/rag/documentos devuelve HTTP 401 NO_AUTENTICADO", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`);
    assert.strictEqual(res.status, 401);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error?.codigo, "NO_AUTENTICADO");
  });

  // Test 2: Rechazo a usuario sin permiso RAG_DOCUMENTOS_ADMINISTRAR
  await test(2, "Usuario con rol EMPLEADO es rechazado con HTTP 403 PERMISO_DENEGADO", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      headers: authHeaders(empleado),
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error?.codigo, "PERMISO_DENEGADO");
  });

  // Test 3: Acceso concedido a TALENTO_HUMANO o ADMINISTRADOR con permiso
  await test(3, "Usuario TALENTO_HUMANO con permiso consulta exitosamente GET /api/admin/rag/documentos", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      headers: authHeaders(talentoHumano),
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos), "datos debe ser un arreglo de documentos");
    const regInicial = body.datos.find((d: any) => d.codigo === "DTH-REG-001");
    assert.ok(regInicial, "El catálogo debe contener el documento inicial DTH-REG-001");
    assert.strictEqual(regInicial.activo, true);
    assert.strictEqual(regInicial.estado_procesamiento, "LISTO");
  });

  // Test 4: Rechazo al cargar sin archivo adjunto
  await test(4, "Carga de documento sin archivo adjunto devuelve HTTP 400 ARCHIVO_REQUERIDO", async () => {
    const form = new FormData();
    form.append("codigo", testDocCodigo);
    form.append("titulo", "Politica de Prueba");
    form.append("version", "1.0");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: authHeaders(admin),
      body: form,
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error?.codigo, "ARCHIVO_REQUERIDO");
  });

  // Test 5: Rechazo de archivo con extensión no permitida (no .pdf)
  await test(5, "Carga de archivo no PDF (.txt) devuelve HTTP 400 FORMATO_INVALIDO", async () => {
    const form = new FormData();
    const fakeTxt = new Blob(["Texto plano no permitido"], { type: "text/plain" });
    form.append("archivo", fakeTxt, "politica.txt");
    form.append("codigo", testDocCodigo);
    form.append("titulo", "Politica de Prueba");
    form.append("version", "1.0");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: authHeaders(admin),
      body: form,
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error?.codigo, "FORMATO_INVALIDO");
  });

  // Test 6: Rechazo de archivo vacío (0 bytes)
  await test(6, "Carga de archivo vacío (0 bytes) devuelve HTTP 400 ARCHIVO_VACIO", async () => {
    const form = new FormData();
    const emptyPdf = new Blob([], { type: "application/pdf" });
    form.append("archivo", emptyPdf, "vacio.pdf");
    form.append("codigo", testDocCodigo);
    form.append("titulo", "Politica Vacía");
    form.append("version", "1.0");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: authHeaders(admin),
      body: form,
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error?.codigo, "ARCHIVO_VACIO");
  });

  // Test 7: Rechazo de archivo con extensión .pdf pero cabecera binaria corrupta / falsa
  await test(7, "Carga de binario falso con extensión .pdf devuelve HTTP 400 PDF_CORRUPTO_O_INVALIDO", async () => {
    const form = new FormData();
    const corrupto = new Blob(["NO_MAGIC_HEADER_PDF_CONTENIDO_INVALIDO_XYZ"], { type: "application/pdf" });
    form.append("archivo", corrupto, "falso.pdf");
    form.append("codigo", testDocCodigo);
    form.append("titulo", "Politica Corrupta");
    form.append("version", "1.0");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: authHeaders(admin),
      body: form,
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error?.codigo, "PDF_CORRUPTO_O_INVALIDO");
  });

  // Test 8: Rechazo de PDF sin texto digital extraíble (documento escaneado / sin OCR)
  await test(8, "Carga de PDF sin texto extraíble devuelve HTTP 400 PDF_SIN_TEXTO_EXTRAIBLE", async () => {
    const form = new FormData();
    const pdfSinTexto = generarPdfSinTexto();
    const blob = new Blob([pdfSinTexto], { type: "application/pdf" });
    form.append("archivo", blob, "sin_texto.pdf");
    form.append("codigo", `${testDocCodigo}-SCAN`);
    form.append("titulo", "Politica Sin Texto");
    form.append("version", "1.0");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: authHeaders(admin),
      body: form,
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error?.codigo, "PDF_SIN_TEXTO_EXTRAIBLE");
  });

  let docCreadoIdV1: string = "";

  // Test 9: Carga exitosa de PDF válido con texto normativo
  await test(9, "Carga exitosa de PDF válido persiste archivo fuera de DB, indexa fragmentos y queda LISTO pero INACTIVO", async () => {
    const textoDoc = `Politica Interna de Teletrabajo RIMAC SA. Articulo 1: Definicion y ambito de aplicacion del trabajo a distancia. Articulo 2: Obligaciones del teletrabajador respecto a la marcacion biometrica y conexion digital continua.`;
    const pdfValido = generarPdfValidoConTexto(textoDoc);
    const blob = new Blob([pdfValido], { type: "application/pdf" });

    const form = new FormData();
    form.append("archivo", blob, "Politica_Teletrabajo_v1.0.pdf");
    form.append("codigo", testDocCodigo);
    form.append("titulo", "Política Corporativa de Teletrabajo RIMAC");
    form.append("version", "1.0");
    form.append("descripcion", "Reglamento interno sobre modalidad híbrida y remota.");
    form.append("fecha_vigencia", "2026-06-01");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: authHeaders(admin),
      body: form,
    });

    assert.strictEqual(res.status, 201, `Status esperado 201, obtenido ${res.status}`);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.ok(body.datos?.id);
    assert.strictEqual(body.datos.codigo, testDocCodigo);
    assert.strictEqual(body.datos.version, "1.0");
    assert.strictEqual(body.datos.estado_procesamiento, "LISTO");
    assert.strictEqual(body.datos.activo, false, "REGLA: Debe permanecer INACTIVO al cargarse hasta aprobación");
    assert.ok(body.datos.total_fragmentos > 0, "Debe haber indexado al menos 1 fragmento");
    assert.ok(body.datos.hash_archivo, "Debe tener hash SHA-256");
    assert.ok(body.datos.ruta_almacenamiento, "Debe tener ruta de almacenamiento externo persistente");

    docCreadoIdV1 = body.datos.id;

    // Verificar en DB que no se almacenó binario en la base de datos
    const dbCheck = await pool.query("SELECT * FROM rag_documentos WHERE id = $1;", [docCreadoIdV1]);
    assert.strictEqual(dbCheck.rows.length, 1);
    const fila = dbCheck.rows[0];
    assert.strictEqual(fila.codigo, testDocCodigo);
    assert.strictEqual(fila.version, "1.0");
    assert.strictEqual(fila.activo, false);
    assert.strictEqual(fila.estado_procesamiento, "LISTO");
    assert.ok(fila.ruta_almacenamiento.startsWith("storage/rag_docs"));
  });

  // Test 10: Prevención de duplicados de misma versión y código
  await test(10, "Carga de duplicado exacto (mismo código y versión) devuelve HTTP 409 VERSION_YA_EXISTE", async () => {
    const pdfValido = generarPdfValidoConTexto("Contenido de duplicado");
    const blob = new Blob([pdfValido], { type: "application/pdf" });

    const form = new FormData();
    form.append("archivo", blob, "duplicado.pdf");
    form.append("codigo", testDocCodigo);
    form.append("titulo", "Intento Duplicado");
    form.append("version", "1.0");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: authHeaders(admin),
      body: form,
    });

    assert.strictEqual(res.status, 409);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error?.codigo, "VERSION_YA_EXISTE");
  });

  let docCreadoIdV2: string = "";

  // Test 11: Carga de nueva versión (v2.0) conserva historial
  await test(11, "Carga de versión v2.0 para el mismo código documental es aceptada y conserva v1.0", async () => {
    const textoDocV2 = `Politica Interna de Teletrabajo RIMAC SA Version 2. Articulo 1: Actualizacion de subsidio energetico y ergonomia domiciliaria. Articulo 2: Horarios de desconexion digital obligatoria.`;
    const pdfValido = generarPdfValidoConTexto(textoDocV2);
    const blob = new Blob([pdfValido], { type: "application/pdf" });

    const form = new FormData();
    form.append("archivo", blob, "Politica_Teletrabajo_v2.0.pdf");
    form.append("codigo", testDocCodigo);
    form.append("titulo", "Política Corporativa de Teletrabajo RIMAC - Reforma 2026");
    form.append("version", "2.0");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: authHeaders(talentoHumano),
      body: form,
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.version, "2.0");
    assert.strictEqual(body.datos.activo, false);
    docCreadoIdV2 = body.datos.id;

    // Verificar que ambas versiones coexisten en la base de datos
    const dbVersiones = await pool.query(
      "SELECT version, activo, estado_procesamiento FROM rag_documentos WHERE codigo = $1 ORDER BY version ASC;",
      [testDocCodigo]
    );
    assert.strictEqual(dbVersiones.rows.length, 2, "Deben coexistir v1.0 y v2.0");
    assert.strictEqual(dbVersiones.rows[0].version, "1.0");
    assert.strictEqual(dbVersiones.rows[1].version, "2.0");
  });

  // Test 12: Activación formal de v1.0
  await test(12, "Activación de versión v1.0 mediante PATCH /documentos/:id/activar", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docCreadoIdV1}/activar`, {
      method: "PATCH",
      headers: authHeaders(admin),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.activo, true);
    assert.ok(body.datos.activado_en);

    // Verificar en DB
    const checkDb = await pool.query("SELECT activo, activado_por_id FROM rag_documentos WHERE id = $1;", [docCreadoIdV1]);
    assert.strictEqual(checkDb.rows[0].activo, true);
  });

  // Test 13: Activación transaccional de nueva versión desactiva automáticamente la previa
  await test(13, "Activación de v2.0 desactiva atómica y transaccionalmente la v1.0 del mismo código", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docCreadoIdV2}/activar`, {
      method: "PATCH",
      headers: authHeaders(talentoHumano),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.activo, true);

    // Verificar en DB que v2.0 quedó ACTIVA y v1.0 quedó INACTIVA
    const checkV1 = await pool.query("SELECT activo FROM rag_documentos WHERE id = $1;", [docCreadoIdV1]);
    const checkV2 = await pool.query("SELECT activo FROM rag_documentos WHERE id = $1;", [docCreadoIdV2]);

    assert.strictEqual(checkV1.rows[0].activo, false, "v1.0 debió ser desactivada transaccionalmente");
    assert.strictEqual(checkV2.rows[0].activo, true, "v2.0 debe estar activa");
  });

  // Test 14: Desactivación manual de versión
  await test(14, "Desactivación de documento mediante PATCH /documentos/:id/desactivar", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docCreadoIdV2}/desactivar`, {
      method: "PATCH",
      headers: authHeaders(admin),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.activo, false);

    const checkV2 = await pool.query("SELECT activo FROM rag_documentos WHERE id = $1;", [docCreadoIdV2]);
    assert.strictEqual(checkV2.rows[0].activo, false);
  });

  // Test 15: Descarga privada y autenticada del PDF original
  await test(15, "Descarga autenticada de PDF original devuelve stream con binario idéntico al persistido", async () => {
    // Intento sin sesión -> 401
    const unauthRes = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docCreadoIdV1}/descargar`);
    assert.strictEqual(unauthRes.status, 401);

    // Intento con admin autenticado -> 200 application/pdf
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docCreadoIdV1}/descargar`, {
      headers: authHeaders(admin),
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("application/pdf"));
    assert.ok(res.headers.get("content-disposition")?.includes("attachment"));

    const arrayBuf = await res.arrayBuffer();
    const downloadedBuf = Buffer.from(arrayBuf);
    assert.ok(downloadedBuf.length > 0);
    assert.strictEqual(downloadedBuf.subarray(0, 5).toString("ascii"), "%PDF-");
  });

  // Test 16: Consulta de estado de procesamiento
  await test(16, "Consulta de estado GET /api/admin/rag/documentos/:id/estado devuelve metadatos de indexación", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docCreadoIdV1}/estado`, {
      headers: authHeaders(admin),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.codigo, testDocCodigo);
    assert.strictEqual(body.datos.version, "1.0");
    assert.strictEqual(body.datos.estado_procesamiento, "LISTO");
    assert.ok(body.datos.total_fragmentos > 0);
  });

  // Test 17: Integridad de aislamiento de fragmentos inactivos en consultas RAG
  await test(17, "El motor RAG excluye fragmentos de documentos inactivos garantizando estricta gobernanza", async () => {
    // Ambas versiones v1.0 y v2.0 de testDocCodigo están actualmente INACTIVAS
    const chunksInactivos = await pool.query(
      `SELECT c.chunk_codigo, d.activo 
       FROM rag_chunks c 
       JOIN rag_documentos d ON c.documento_id = d.id 
       WHERE d.codigo = $1;`,
      [testDocCodigo]
    );
    assert.ok(chunksInactivos.rows.length > 0, "Existen fragmentos en la base de datos");
    assert.strictEqual(chunksInactivos.rows.every((r) => r.activo === false), true);

    // Consultar fragmentos activos a través del repositorio RAG
    const resFragmentosActivos = await pool.query(
      `SELECT c.chunk_codigo 
       FROM rag_chunks c 
       JOIN rag_documentos d ON c.documento_id = d.id 
       WHERE d.activo = true AND d.estado_procesamiento = 'LISTO' AND d.codigo = $1;`,
      [testDocCodigo]
    );
    assert.strictEqual(resFragmentosActivos.rows.length, 0, "Ningún fragmento del documento inactivo debe participar en RAG");
  });

  // Test 18: Registro de auditoría para operaciones documentales RAG
  await test(18, "Operaciones de carga, activación y desactivación registran eventos en auditoria_eventos", async () => {
    const eventos = await pool.query(
      `SELECT accion, entidad_tipo, entidad_id 
       FROM auditoria_eventos 
       WHERE entidad_tipo = 'rag_documentos' AND entidad_id IN ($1, $2);`,
      [docCreadoIdV1, docCreadoIdV2]
    );

    assert.ok(eventos.rows.length >= 2, "Debe registrar eventos de auditoría para los documentos creados");
    const acciones = eventos.rows.map((e) => e.accion);
    assert.ok(acciones.includes("CARGAR_DOCUMENTO_RAG") || acciones.includes("CARGAR_VERSION_DOCUMENTO_RAG"));
    assert.ok(acciones.includes("ACTIVAR_DOCUMENTO_RAG"));
  });

  console.log(`\n=== RESUMEN DE PRUEBAS FASE 3.2E ===`);
  console.log(`Total: ${passCount + failCount} | Aprobadas: ${passCount} | Fallidas: ${failCount}`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runFase32eSuite()
  .catch((e) => {
    console.error("Error fatal en suite Fase 3.2E:", e);
    process.exit(1);
  })
  .finally(() => {
    getPool().end().catch(() => {});
  });
