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

async function runFase32e1Suite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.2E.1 ===");
  console.log("=== VERIFICACIÓN DIRIGIDA DE CORRECCIONES RAG ===");

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
  const admin = await loginUser("admin", "PassSegura_2026!*");

  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const codPrueba = `POL-VIG-${suffix}`;

  let docPasadoId = "";
  let docActualId = "";
  let docFuturoId = "";

  // 1. PDF con fecha anterior, actual y futura
  await test(1, "Carga de PDF con fecha de vigencia anterior (pasada)", async () => {
    const pdfBuf = generarPdfValidoConTexto("ARTICULO 1. Política de vacaciones históricas de Agroquímica Industrial RIMAC S.A.");
    const form = new FormData();
    form.append("archivo", new Blob([pdfBuf], { type: "application/pdf" }), "politica_pasada.pdf");
    form.append("codigo", codPrueba);
    form.append("titulo", "Política de Vacaciones");
    form.append("version", "1.0");
    form.append("fecha_vigencia", "2020-01-15");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
      },
      body: form,
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 201, `Error en carga fecha pasada: ${JSON.stringify(body)}`);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.estado_procesamiento, "LISTO");
    assert.strictEqual(body.datos.activo, false, "Debe quedar inactivo por defecto");
    assert.ok(body.datos.fecha_vigencia.startsWith("2020-01-15"));
    docPasadoId = body.datos.id;
  });

  await test(2, "Carga de PDF con fecha de vigencia actual (hoy)", async () => {
    const hoyStr = new Date().toISOString().slice(0, 10);
    const pdfBuf = generarPdfValidoConTexto("ARTICULO 2. Política de jornada laboral vigente de Agroquímica Industrial RIMAC S.A.");
    const form = new FormData();
    form.append("archivo", new Blob([pdfBuf], { type: "application/pdf" }), "politica_actual.pdf");
    form.append("codigo", codPrueba);
    form.append("titulo", "Política de Vacaciones");
    form.append("version", "2.0");
    form.append("fecha_vigencia", hoyStr);

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
      },
      body: form,
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 201, `Error en carga fecha actual: ${JSON.stringify(body)}`);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.estado_procesamiento, "LISTO");
    assert.strictEqual(body.datos.activo, false);
    docActualId = body.datos.id;
  });

  await test(3, "Carga de PDF con fecha de vigencia futura", async () => {
    const pdfBuf = generarPdfValidoConTexto("ARTICULO 3. Reforma de beneficios futuros de Agroquímica Industrial RIMAC S.A.");
    const form = new FormData();
    form.append("archivo", new Blob([pdfBuf], { type: "application/pdf" }), "politica_futura.pdf");
    form.append("codigo", codPrueba);
    form.append("titulo", "Política de Vacaciones");
    form.append("version", "3.0");
    form.append("fecha_vigencia", "2030-12-31");

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos`, {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
      },
      body: form,
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 201, `Error en carga fecha futura: ${JSON.stringify(body)}`);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.estado_procesamiento, "LISTO");
    assert.strictEqual(body.datos.activo, false);
    assert.ok(body.datos.fecha_vigencia.startsWith("2030-12-31"));
    docFuturoId = body.datos.id;
  });

  // 2. Activación y desactivación repetida
  await test(4, "Activación exitosa de documento v2.0", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docActualId}/activar`, {
      method: "PATCH",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
      },
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.activo, true);
  });

  await test(5, "Desactivación exitosa de documento v2.0", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docActualId}/desactivar`, {
      method: "PATCH",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
      },
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.activo, false);
  });

  await test(6, "Reactivación repetida de documento v2.0", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docActualId}/activar`, {
      method: "PATCH",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
      },
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.activo, true);
  });

  // 3. Consulta RAG antes y después de desactivar
  await test(7, "Fragmentos participan en RAG mientras está ACTIVO", async () => {
    const dbRes = await pool.query(
      `SELECT c.chunk_codigo FROM rag_chunks c
       JOIN rag_documentos d ON c.documento_id = d.id
       WHERE d.id = $1 AND d.activo = true AND d.estado_procesamiento = 'LISTO';`,
      [docActualId]
    );
    assert.ok(dbRes.rows.length > 0, "Debe tener fragmentos activos");
  });

  await test(8, "Desactivación excluye fragmentos inmediatamente de consultas RAG", async () => {
    // Desactivar
    const resDesact = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docActualId}/desactivar`, {
      method: "PATCH",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
      },
    });
    const bodyDesact = (await resDesact.json()) as any;
    assert.strictEqual(bodyDesact.exito, true);
    assert.strictEqual(bodyDesact.datos.activo, false);

    // Comprobar que ningún fragmento de este documento esté disponible en activos
    const dbRes = await pool.query(
      `SELECT c.chunk_codigo FROM rag_chunks c
       JOIN rag_documentos d ON c.documento_id = d.id
       WHERE d.id = $1 AND d.activo = true;`,
      [docActualId]
    );
    assert.strictEqual(dbRes.rows.length, 0, "No debe haber ningún fragmento activo");
  });

  // 4. Intento de descarga de documento sin archivo físico (DTH-REG-001)
  await test(9, "Intento de descarga de documento legado sin archivo responde HTTP 404 ARCHIVO_ORIGINAL_NO_DISPONIBLE", async () => {
    const docLegado = await pool.query("SELECT id FROM rag_documentos WHERE codigo = 'DTH-REG-001' LIMIT 1;");
    assert.ok(docLegado.rows.length > 0);
    const legadoId = docLegado.rows[0].id;

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${legadoId}/descargar`, {
      method: "GET",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
      },
    });

    assert.strictEqual(res.status, 404);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error?.codigo || body.codigo, "ARCHIVO_ORIGINAL_NO_DISPONIBLE");
  });

  // 5. Intento de eliminación de documento activo (debe ser rechazado)
  await test(10, "Intento de eliminación de documento ACTIVO es rechazado con DOCUMENTO_ACTIVO_NO_ELIMINABLE", async () => {
    // Primero activar v1.0
    await fetch(`${BASE_URL}/api/admin/rag/documentos/${docPasadoId}/activar`, {
      method: "PATCH",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
      },
    });

    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docPasadoId}`, {
      method: "DELETE",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ motivo: "Prueba de borrado indebido de documento activo" }),
    });

    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error?.codigo || body.codigo, "DOCUMENTO_ACTIVO_NO_ELIMINABLE");

    // Verificar que el documento SIGUE existiendo
    const checkDoc = await pool.query("SELECT id, activo FROM rag_documentos WHERE id = $1;", [docPasadoId]);
    assert.strictEqual(checkDoc.rows.length, 1);
    assert.strictEqual(checkDoc.rows[0].activo, true);
  });

  // 6. Eliminación de documento inactivo o con error
  await test(11, "Eliminación requiere motivo explícito", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docFuturoId}`, {
      method: "DELETE",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ motivo: "" }),
    });

    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error?.codigo || body.codigo, "MOTIVO_ELIMINACION_REQUERIDO");
  });

  await test(12, "Eliminación controlada de documento inactivo (v3.0) retira fragmentos y conserva auditoría", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rag/documentos/${docFuturoId}`, {
      method: "DELETE",
      headers: {
        Cookie: admin.cookie,
        "X-Session-Id": admin.sid,
        "X-CSRF-Token": admin.csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ motivo: "Versión experimental revocada formalmente" }),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);

    // Verificar que ya no existe en rag_documentos
    const docCheck = await pool.query("SELECT id FROM rag_documentos WHERE id = $1;", [docFuturoId]);
    assert.strictEqual(docCheck.rows.length, 0, "El documento debe ser eliminado de la base de datos");

    // Verificar que se eliminaron sus chunks
    const chunksCheck = await pool.query("SELECT id FROM rag_chunks WHERE documento_id = $1;", [docFuturoId]);
    assert.strictEqual(chunksCheck.rows.length, 0, "Los fragmentos deben ser eliminados de rag_chunks");

    // Verificar que se registró auditoría
    const audCheck = await pool.query(
      "SELECT accion, motivo FROM auditoria_eventos WHERE entidad_tipo = 'rag_documentos' AND entidad_id = $1 ORDER BY timestamp_evento DESC;",
      [docFuturoId]
    );
    assert.ok(audCheck.rows.length > 0, "Debe existir registro en auditoria_eventos");
    const acciones = audCheck.rows.map((r) => r.accion);
    assert.ok(acciones.includes("ELIMINAR_DOCUMENTO_RAG"), "Debe contener el evento ELIMINAR_DOCUMENTO_RAG");
  });

  // 7. Conservación del Reglamento Interno y sus fragmentos originales
  await test(13, "Conservación del Reglamento Interno DTH-REG-001 y sus fragmentos en base de datos", async () => {
    const regDoc = await pool.query("SELECT id, codigo, titulo, activo, total_fragmentos FROM rag_documentos WHERE codigo = 'DTH-REG-001';");
    assert.strictEqual(regDoc.rows.length, 1, "DTH-REG-001 debe existir");
    assert.strictEqual(regDoc.rows[0].activo, true, "DTH-REG-001 debe continuar activo");

    const regChunks = await pool.query("SELECT COUNT(*) as total FROM rag_chunks WHERE documento_id = $1;", [regDoc.rows[0].id]);
    const totalChunks = parseInt(regChunks.rows[0].total, 10);
    assert.ok(totalChunks >= 25, `El Reglamento Interno debe conservar sus fragmentos originales (encontrados: ${totalChunks})`);
  });

  console.log(`\n=== RESUMEN DE PRUEBAS FASE 3.2E.1 ===`);
  console.log(`Total: ${passCount + failCount} | Aprobadas: ${passCount} | Fallidas: ${failCount}`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runFase32e1Suite()
  .catch((e) => {
    console.error("Error fatal en suite Fase 3.2E.1:", e);
    process.exit(1);
  })
  .finally(() => {
    getPool().end().catch(() => {});
  });
