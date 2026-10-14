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

async function runFase5Suite() {
  console.log("==========================================================================================");
  console.log("=== SUITE DE PRUEBAS DE INTEGRACIÓN FASE 5 — DASHBOARD, REPORTERÍA Y ANALÍTICA OPERATIVA ===");
  console.log("==========================================================================================");

  let passCount = 0;
  let failCount = 0;

  async function test(num: number, desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      passCount++;
      console.log(`[PASS] Prueba ${num}: ${desc}`);
    } catch (err: any) {
      failCount++;
      console.error(`[FAIL] Prueba ${num}: ${desc} -> Error: ${err.message}`);
    }
  }

  const pool = getPool();

  // Iniciar sesiones con los roles oficiales del sistema
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const supervisor = await loginUser("supervisor_seg", "PassSegura_2026!*");
  const seguridad = await loginUser("seguridad", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");

  // Obtener IDs de empleados de referencia
  const resEmps = await pool.query("SELECT id, cedula, nombre_completo FROM empleados ORDER BY id LIMIT 5;");
  const emp1 = resEmps.rows[0];
  const emp2 = resEmps.rows[1];

  // 1. Verificación de Permisos en BD
  await test(1, "Permisos de Fase 5 existen en catálogo y tabla permisos", async () => {
    const res = await pool.query(
      "SELECT codigo FROM permisos WHERE codigo IN ('REPORTES_PERSONALES_VER', 'REPORTES_EQUIPO_VER', 'REPORTES_INSTITUCIONALES_VER', 'REPORTES_EXPORTAR') ORDER BY codigo;"
    );
    assert.strictEqual(res.rows.length, 4, "Deben existir exactamente los 4 permisos canónicos");
  });

  // 2. Verificación de Matriz Inicial de Roles y Permisos
  await test(2, "Matriz inicial de roles_permisos en base de datos cumple especificación", async () => {
    const res = await pool.query(`
      SELECT rol, permiso_codigo, activo 
      FROM roles_permisos 
      WHERE permiso_codigo LIKE 'REPORTES%'
      ORDER BY rol, permiso_codigo;
    `);

    const mapa: Record<string, Record<string, boolean>> = {};
    for (const r of res.rows) {
      if (!mapa[r.rol]) mapa[r.rol] = {};
      mapa[r.rol][r.permiso_codigo] = r.activo;
    }

    // EMPLEADO: personales=true, exportar=false, institucionales=false
    assert.strictEqual(mapa["EMPLEADO"]["REPORTES_PERSONALES_VER"], true);
    assert.strictEqual(mapa["EMPLEADO"]["REPORTES_INSTITUCIONALES_VER"], false);
    assert.strictEqual(mapa["EMPLEADO"]["REPORTES_EXPORTAR"], false);

    // SUPERVISOR_SEGURIDAD: personales=true, equipo=true, institucionales=false, exportar=true
    assert.strictEqual(mapa["SUPERVISOR_SEGURIDAD"]["REPORTES_PERSONALES_VER"], true);
    assert.strictEqual(mapa["SUPERVISOR_SEGURIDAD"]["REPORTES_EQUIPO_VER"], true);
    assert.strictEqual(mapa["SUPERVISOR_SEGURIDAD"]["REPORTES_INSTITUCIONALES_VER"], false);
    assert.strictEqual(mapa["SUPERVISOR_SEGURIDAD"]["REPORTES_EXPORTAR"], true);

    // TALENTO_HUMANO: personales=true, institucionales=true, exportar=true
    assert.strictEqual(mapa["TALENTO_HUMANO"]["REPORTES_PERSONALES_VER"], true);
    assert.strictEqual(mapa["TALENTO_HUMANO"]["REPORTES_INSTITUCIONALES_VER"], true);
    assert.strictEqual(mapa["TALENTO_HUMANO"]["REPORTES_EXPORTAR"], true);

    // SEGURIDAD: sin reportería por defecto (todos inactivos)
    assert.strictEqual(mapa["SEGURIDAD"]["REPORTES_PERSONALES_VER"], false);
    assert.strictEqual(mapa["SEGURIDAD"]["REPORTES_INSTITUCIONALES_VER"], false);
    assert.strictEqual(mapa["SEGURIDAD"]["REPORTES_EXPORTAR"], false);
  });

  // 3. Denegación estricta para SEGURIDAD
  await test(3, "Usuario con rol SEGURIDAD sin permisos recibe HTTP 403 en endpoints de reporte", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/dashboard`, {
      headers: { Cookie: seguridad.cookie },
    });
    assert.strictEqual(res.status, 403, "SEGURIDAD no debe tener acceso a /api/reportes/dashboard");

    const resAsist = await fetch(`${BASE_URL}/api/reportes/asistencia`, {
      headers: { Cookie: seguridad.cookie },
    });
    assert.strictEqual(resAsist.status, 403, "SEGURIDAD no debe tener acceso a /api/reportes/asistencia");
  });

  // 4. Alcance Personal Estricto de EMPLEADO
  await test(4, "EMPLEADO ordinario consulta dashboard personal y es bloqueado con 403 si consulta a un tercero", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/dashboard`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.alcance.esPersonal, true);
    assert.strictEqual(body.datos.alcance.esInstitucional, false);

    // Intento de suplantar empleado_id de otro colaborador
    const resFraude = await fetch(`${BASE_URL}/api/reportes/dashboard?empleado_id=00000000-0000-0000-0000-000000000000`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(resFraude.status, 403, "Debe rechazar con HTTP 403 intento de EMPLEADO de consultar a terceros");
  });

  // 5. Alcance ABAC de SUPERVISOR_SEGURIDAD
  await test(5, "SUPERVISOR_SEGURIDAD consulta alcance de equipo y es bloqueado con 403 fuera de su alcance ABAC", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/dashboard`, {
      headers: { Cookie: supervisor.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);

    // Intento de consultar un empleado ficticio fuera de asignaciones_jefatura
    const resFuera = await fetch(`${BASE_URL}/api/reportes/dashboard?empleado_id=11111111-2222-3333-4444-555555555555`, {
      headers: { Cookie: supervisor.cookie },
    });
    assert.strictEqual(resFuera.status, 403, "Debe retornar HTTP 403 para colaboradores fuera de alcance ABAC");
  });

  // 6. Alcance Institucional Global de TALENTO_HUMANO y ADMINISTRADOR
  await test(6, "TALENTO_HUMANO y ADMINISTRADOR disponen de alcance institucional global", async () => {
    const resTH = await fetch(`${BASE_URL}/api/reportes/dashboard`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(resTH.status, 200);
    const bodyTH = await resTH.json();
    assert.strictEqual(bodyTH.exito, true);
    assert.strictEqual(bodyTH.datos.alcance.esInstitucional, true);

    const resAdmin = await fetch(`${BASE_URL}/api/reportes/dashboard`, {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(resAdmin.status, 200);
    const bodyAdmin = await resAdmin.json();
    assert.strictEqual(bodyAdmin.exito, true);
    assert.strictEqual(bodyAdmin.datos.alcance.esInstitucional, true);
  });

  // 7. Reporte A: Asistencia
  await test(7, "Endpoint GET /api/reportes/asistencia retorna métricas de colaborador", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/asistencia`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos), "datos debe ser un arreglo de colaboradores");
    if (body.datos.length > 0) {
      const primero = body.datos[0];
      assert.ok("empleado_nombre" in primero);
      assert.ok("jornadas_registradas" in primero);
      assert.ok("entradas_registradas" in primero);
      assert.ok("tardias" in primero);
      assert.ok("ausencias" in primero);
      assert.ok("salidas_omitidas" in primero);
      assert.ok("minutos_efectivos_totales" in primero);
    }
  });

  // 8. Reporte B: Horas y Jornadas con totales consolidados
  await test(8, "Endpoint GET /api/reportes/horas-jornadas retorna items y objeto de totales", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/horas-jornadas`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos.items));
    assert.ok(body.datos.totales);
    assert.ok(typeof body.datos.totales.total_tiempo_minutos === "number");
    assert.ok(typeof body.datos.totales.total_efectivo_minutos === "number");
    assert.ok(typeof body.datos.totales.total_descansos_minutos === "number");
  });

  // 9. Reporte C: Incidencias
  await test(9, "Endpoint GET /api/reportes/incidencias retorna incidencias filtrables", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/incidencias`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos));
  });

  // 10. Reporte D: Solicitudes
  await test(10, "Endpoint GET /api/reportes/solicitudes retorna solicitudes y justificaciones", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/solicitudes`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos));
  });

  // 11. Reporte E: Feriados
  await test(11, "Endpoint GET /api/reportes/feriados retorna feriados y personal sin cálculo extraordinario", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/feriados`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos));
    if (body.datos.length > 0) {
      const fer = body.datos[0];
      assert.ok("descripcion" in fer);
      assert.ok("tipo_feriado" in fer);
      assert.ok("trabajo_en_feriado" in fer);
    }
  });

  // 12. Reporte F: Correcciones de marcas
  await test(12, "Endpoint GET /api/reportes/correcciones retorna historial de correcciones", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/correcciones`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos));
  });

  // 13. Reporte G: Auditoría sujeto a AUDITORIA_VER
  await test(13, "Endpoint GET /api/reportes/auditoria requiere AUDITORIA_VER y devuelve eventos", async () => {
    // Administrador posee AUDITORIA_VER
    const resAdmin = await fetch(`${BASE_URL}/api/reportes/auditoria`, {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(resAdmin.status, 200);
    const bodyAdmin = await resAdmin.json();
    assert.strictEqual(bodyAdmin.exito, true);
    assert.ok(Array.isArray(bodyAdmin.datos));

    // EMPLEADO ordinario no posee AUDITORIA_VER
    const resEmp = await fetch(`${BASE_URL}/api/reportes/auditoria`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(resEmp.status, 403, "EMPLEADO debe ser rechazado con 403 sin AUDITORIA_VER");
  });

  // 14. Exportación a CSV con REPORTES_EXPORTAR
  await test(14, "Endpoint GET /api/reportes/exportar genera CSV UTF-8 con BOM y valida permiso", async () => {
    // 14.1 EMPLEADO no posee REPORTES_EXPORTAR -> 403
    const resEmpExport = await fetch(`${BASE_URL}/api/reportes/exportar?tipo=asistencia`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(resEmpExport.status, 403, "EMPLEADO debe recibir 403 sin REPORTES_EXPORTAR");

    // 14.2 TALENTO_HUMANO posee REPORTES_EXPORTAR -> 200 con archivo CSV
    const resTHExport = await fetch(`${BASE_URL}/api/reportes/exportar?tipo=asistencia`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(resTHExport.status, 200);
    assert.ok(resTHExport.headers.get("content-type")?.includes("text/csv"));
    assert.ok(resTHExport.headers.get("content-disposition")?.includes("attachment"));

    const rawBuf = Buffer.from(await resTHExport.arrayBuffer());
    // Debe iniciar con UTF-8 BOM bytes (0xEF, 0xBB, 0xBF)
    assert.strictEqual(rawBuf[0], 0xef, "Primer byte debe ser 0xEF de BOM UTF-8");
    assert.strictEqual(rawBuf[1], 0xbb, "Segundo byte debe ser 0xBB de BOM UTF-8");
    assert.strictEqual(rawBuf[2], 0xbf, "Tercer byte debe ser 0xBF de BOM UTF-8");

    const csvText = rawBuf.subarray(3).toString("utf-8");
    assert.ok(csvText.includes("Colaborador"), "Debe contener encabezados legibles en español");
    assert.ok(csvText.includes("Jornadas Registradas"));
  });

  console.log("==========================================================================================");
  console.log(`=== RESULTADOS: ${passCount} PASADAS, ${failCount} FALLIDAS ===`);
  console.log("==========================================================================================");

  await pool.end();

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runFase5Suite().catch((err) => {
  console.error("Error fatal en suite Fase 5:", err);
  process.exit(1);
});
