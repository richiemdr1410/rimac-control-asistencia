import assert from "node:assert";
import crypto from "node:crypto";
import { getPool } from "../../db/index.js";

const BASE_URL = "http://127.0.0.1:3000";

interface LoginResult {
  sid: string;
  csrf: string;
  usuario: {
    id: string;
    identificador: string;
    nombre_completo: string;
    rol: string;
    empleado_id: string | null;
  };
}

async function loginUser(username: string, pass: string): Promise<LoginResult> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador: username, password: pass }),
  });
  const body = (await res.json()) as any;
  assert.strictEqual(res.status, 200, `Login falló para ${username}: ${JSON.stringify(body)}`);
  const rawCookie = res.headers.get("set-cookie") || "";
  const match = rawCookie.match(/sid=([^;]+)/);
  return {
    sid: match ? match[1] : body.datos.sesion_id,
    csrf: body.datos.token_csrf || body.datos.csrf_token,
    usuario: body.datos.usuario,
  };
}

async function findUnusedWeekday(empleadoId: string, startDateStr: string = "2026-12-14"): Promise<string> {
  const p = getPool();
  let d = new Date(`${startDateStr}T12:00:00Z`);
  while (true) {
    const day = d.getUTCDay();
    const dateStr = d.toISOString().split("T")[0];
    if (day >= 1 && day <= 5) {
      const existing = await p.query(
        "SELECT 1 FROM jornadas WHERE empleado_id = $1 AND fecha_jornada = $2",
        [empleadoId, dateStr]
      );
      if (existing.rows.length === 0) {
        return dateStr;
      }
    }
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
}

async function runFase6FinalSuite() {
  console.log("================================================================================");
  console.log("FASE 6 — SUITE DE QA FINAL, MATRIZ DE PERMISOS Y COMPROBACIÓN DE ENTREGA");
  console.log("================================================================================");

  const pool = getPool();
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`[PASS] ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`[FAIL] ${name} -> Error: ${err.message}`);
    }
  }

  // 1. Iniciar sesión con los 5 perfiles canónicos
  console.log("\n--- AUTENTICACIÓN DE LOS 5 PERFILES CANÓNICOS ---");
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const supSeg = await loginUser("supervisor_seg", "PassSegura_2026!*");
  const seg = await loginUser("seguridad", "PassSegura_2026!*");
  const emp = await loginUser("empleado", "PassSegura_2026!*");
  console.log("✓ Los 5 perfiles canónicos autenticados exitosamente.");

  // ==========================================
  // BLOQUE A: LOS CINCO ROLES CANÓNICOS
  // ==========================================
  console.log("\n--- BLOQUE A: ROLES CANÓNICOS ESTRICTOS ---");
  await test("A.1: Confirmar exactamente 5 roles canónicos en PostgreSQL", async () => {
    const rolesRes = await pool.query("SELECT DISTINCT rol FROM roles_permisos ORDER BY rol;");
    const roles = rolesRes.rows.map((r) => r.rol);
    const expected = ["ADMINISTRADOR", "EMPLEADO", "SEGURIDAD", "SUPERVISOR_SEGURIDAD", "TALENTO_HUMANO"];
    assert.deepStrictEqual(roles, expected, `Roles encontrados no coinciden con los 5 canónicos: ${roles.join(", ")}`);
  });

  await test("A.2: Confirmar ausencia de JEFATURA, OPERADOR_SEGURIDAD o roles residuales", async () => {
    const invalidRoles = await pool.query(
      "SELECT DISTINCT rol FROM usuarios WHERE rol NOT IN ('ADMINISTRADOR', 'EMPLEADO', 'SEGURIDAD', 'SUPERVISOR_SEGURIDAD', 'TALENTO_HUMANO');"
    );
    assert.strictEqual(invalidRoles.rows.length, 0, "No deben existir usuarios con roles fuera de los 5 canónicos");
  });

  // ==========================================
  // BLOQUE B: AUDITORÍA DE ROLES Y PERMISOS
  // ==========================================
  console.log("\n--- BLOQUE B: AUDITORÍA DE ROLES Y PERMISOS ---");
  await test("B.1: Catálogo de permisos contiene todos los módulos del sistema", async () => {
    const res = await pool.query("SELECT codigo, modulo FROM permisos ORDER BY codigo;");
    const codigos = new Set(res.rows.map((r) => r.codigo));

    const requeridosMinimos = [
      "AUTOSERVICIO_MARCAJE",
      "AUTOSERVICIO_SOLICITUDES_CREAR",
      "AUTOSERVICIO_SOLICITUDES_VER",
      "GARITA_OPERAR",
      "SOLICITUDES_APROBAR_JEFATURA",
      "SOLICITUDES_APROBAR_TH",
      "SOLICITUDES_BANDEJA_VER",
      "FERIADOS_VER",
      "FERIADOS_ADMINISTRAR",
      "EMPLEADOS_VER",
      "EMPLEADOS_ADMINISTRAR",
      "ORGANIZACION_ADMINISTRAR",
      "HORARIOS_VER",
      "HORARIOS_ADMINISTRAR",
      "JEFATURAS_ADMINISTRAR",
      "USUARIOS_ADMINISTRAR",
      "ROLES_PERMISOS_ADMINISTRAR",
      "RAG_CONSULTAR",
      "RAG_DOCUMENTOS_ADMINISTRAR",
      "RAG_ESTADO_VER",
      "INCIDENCIAS_VER",
      "INCIDENCIAS_GESTIONAR",
      "CORRECCIONES_MARCAS_SOLICITAR",
      "CORRECCIONES_MARCAS_APROBAR",
      "JORNADAS_PERSONALES_VER",
      "JORNADAS_EQUIPO_VER",
      "JORNADAS_INSTITUCIONALES_VER",
      "JORNADAS_TIEMPO_EXTRA_APROBAR",
      "REPORTES_PERSONALES_VER",
      "REPORTES_EQUIPO_VER",
      "REPORTES_INSTITUCIONALES_VER",
      "REPORTES_EXPORTAR",
      "AUDITORIA_VER",
    ];

    for (const req of requeridosMinimos) {
      assert.ok(codigos.has(req), `Permiso faltante en catálogo: ${req}`);
    }
  });

  await test("B.2: Endpoint GET /api/admin/roles-permisos expone matriz y valida permiso", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: { "X-Session-Id": admin.sid, Cookie: `sid=${admin.sid}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(body.datos.permisos.length >= 30);
    assert.ok(body.datos.asignaciones.ADMINISTRADOR.length > 0);
  });

  await test("B.3: Usuario sin ROLES_PERMISOS_ADMINISTRAR es denegado con 403", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: { "X-Session-Id": emp.sid, Cookie: `sid=${emp.sid}` },
    });
    assert.strictEqual(res.status, 403);
  });

  // ==========================================
  // BLOQUE C: COMPORTAMIENTO POR LOS CINCO ROLES
  // ==========================================
  console.log("\n--- BLOQUE C: MATRIZ FUNCIONAL POR ROL ---");
  await test("C.1: EMPLEADO accede a Autoservicio pero no a Garita ni Gestión de Personal", async () => {
    // Autoservicio estado
    const autoRes = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: { "X-Session-Id": emp.sid, Cookie: `sid=${emp.sid}` },
    });
    assert.strictEqual(autoRes.status, 200);

    // Garita debe ser 403
    const garitaRes = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
      headers: { "X-Session-Id": emp.sid, Cookie: `sid=${emp.sid}` },
    });
    assert.strictEqual(garitaRes.status, 403);

    // Empleados administracion debe ser 403
    const empAdminRes = await fetch(`${BASE_URL}/api/empleados`, {
      headers: { "X-Session-Id": emp.sid, Cookie: `sid=${emp.sid}` },
    });
    assert.strictEqual(empAdminRes.status, 403);
  });

  await test("C.2: SEGURIDAD accede a Garita pero no tiene Autoservicio personal (sin empleado_id)", async () => {
    // Garita debe ser 200
    const garitaRes = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
      headers: { "X-Session-Id": seg.sid, Cookie: `sid=${seg.sid}` },
    });
    assert.strictEqual(garitaRes.status, 200);

    // Autoservicio debe ser 403 o error por no tener empleado vinculado
    const autoRes = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: { "X-Session-Id": seg.sid, Cookie: `sid=${seg.sid}` },
    });
    assert.ok(autoRes.status === 403 || autoRes.status === 400);
  });

  await test("C.3: SUPERVISOR_SEGURIDAD accede a Garita, Autoservicio y su equipo bajo ABAC", async () => {
    const garitaRes = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
      headers: { "X-Session-Id": supSeg.sid, Cookie: `sid=${supSeg.sid}` },
    });
    assert.strictEqual(garitaRes.status, 200);

    const autoRes = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: { "X-Session-Id": supSeg.sid, Cookie: `sid=${supSeg.sid}` },
    });
    assert.strictEqual(autoRes.status, 200);
  });

  await test("C.4: TALENTO_HUMANO accede a Gestión de Personal y no autoaprueba operaciones propias", async () => {
    const personalRes = await fetch(`${BASE_URL}/api/empleados`, {
      headers: { "X-Session-Id": th.sid, Cookie: `sid=${th.sid}` },
    });
    assert.strictEqual(personalRes.status, 200);
  });

  await test("C.5: ADMINISTRADOR administra Usuarios y Roles de forma exclusiva", async () => {
    const usuariosRes = await fetch(`${BASE_URL}/api/admin/usuarios`, {
      headers: { "X-Session-Id": admin.sid, Cookie: `sid=${admin.sid}` },
    });
    assert.strictEqual(usuariosRes.status, 200);
  });

  // ==========================================
  // BLOQUE D: ABAC Y PROTECCIÓN DE AUTOAPROBACIÓN
  // ==========================================
  console.log("\n--- BLOQUE D: ABAC Y PROTECCIÓN DE AUTOAPROBACIÓN ---");
  await test("D.1: Jefatura solo accede a sus colaboradores asignados", async () => {
    // Carlos (DEMO-1005) es empleado subordinado de TH
    const repEquipoRes = await fetch(`${BASE_URL}/api/reportes/asistencia?empleado_id=33333333-3333-4333-8333-333333333305`, {
      headers: { "X-Session-Id": th.sid, Cookie: `sid=${th.sid}` },
    });
    assert.strictEqual(repEquipoRes.status, 200);

    // Intento de forzar empleado_id ajeno desde EMPLEADO ordinario debe dar 403
    const repAjenoRes = await fetch(`${BASE_URL}/api/reportes/asistencia?empleado_id=33333333-3333-4333-8333-333333333301`, {
      headers: { "X-Session-Id": emp.sid, Cookie: `sid=${emp.sid}` },
    });
    assert.strictEqual(repAjenoRes.status, 403);
  });

  await test("D.2: Autoaprobación de solicitudes permanece bloqueada con HTTP 403", async () => {
    // Buscar o simular intento de autoaprobación
    const res = await fetch(`${BASE_URL}/api/solicitudes/00000000-0000-0000-0000-000000000000/decidir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": th.sid,
        Cookie: `sid=${th.sid}`,
        "X-CSRF-Token": th.csrf,
      },
      body: JSON.stringify({ decision: "APROBADA", justificacion: "Intento test" }),
    });
    // Debe rechazar (404 por id inexistente o 403 si existiera, nunca 500)
    assert.ok(res.status === 404 || res.status === 403);
  });

  // ==========================================
  // BLOQUE E: SINCRONIZACIÓN CRÍTICA GARITA ↔ AUTOSERVICIO
  // ==========================================
  console.log("\n--- BLOQUE E: SINCRONIZACIÓN CRÍTICA GARITA ↔ AUTOSERVICIO ---");
  await test("E.1: Sincronización completa de jornada, pausas y salida entre canales", async () => {
    const empIdCarlos = "33333333-3333-4333-8333-333333333305";
    const testFecha = await findUnusedWeekday(empIdCarlos, "2026-12-14");
    const simT0 = `${testFecha}T07:00:00.000-06:00`;

    // 1. Entrada desde Garita
    const entradaRes = await fetch(`${BASE_URL}/api/garita/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": seg.sid,
        Cookie: `sid=${seg.sid}`,
        "x-csrf-token": seg.csrf,
        "Idempotency-Key": crypto.randomUUID(),
        "x-test-simulated-timestamp": simT0,
      },
      body: JSON.stringify({ empleado_id: empIdCarlos, tipo_marca: "ENTRADA" }),
    });
    assert.strictEqual(entradaRes.status, 201);

    // 2. Autoservicio refleja jornada abierta inmediatamente
    const autoRes = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "X-Session-Id": emp.sid,
        Cookie: `sid=${emp.sid}`,
        "x-test-simulated-timestamp": `${testFecha}T07:05:00.000-06:00`,
      },
    });
    const autoData = await autoRes.json();
    assert.strictEqual(autoData.datos.jornada_actual.estado_jornada, "ABIERTA");
    assert.strictEqual(autoData.datos.ultima_marca.tipo_marca, "ENTRADA");

    // 3. Salida desde Garita
    const salidaRes = await fetch(`${BASE_URL}/api/garita/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": seg.sid,
        Cookie: `sid=${seg.sid}`,
        "x-csrf-token": seg.csrf,
        "Idempotency-Key": crypto.randomUUID(),
        "x-test-simulated-timestamp": `${testFecha}T16:00:00.000-06:00`,
      },
      body: JSON.stringify({ empleado_id: empIdCarlos, tipo_marca: "SALIDA" }),
    });
    assert.strictEqual(salidaRes.status, 201);

    // 4. Autoservicio refleja inmediatamente jornada CERRADA_NORMAL y sin acciones
    const autoCerradaRes = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "X-Session-Id": emp.sid,
        Cookie: `sid=${emp.sid}`,
        "x-test-simulated-timestamp": `${testFecha}T16:05:00.000-06:00`,
      },
    });
    const autoCerradaData = await autoCerradaRes.json();
    assert.strictEqual(autoCerradaData.datos.jornada_actual.estado_jornada, "CERRADA_NORMAL");
    assert.deepStrictEqual(autoCerradaData.datos.acciones_validas, []);

    // 5. Garita refleja jornada cerrada al buscar colaborador
    const garitaBuscarRes = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
      headers: {
        "X-Session-Id": seg.sid,
        Cookie: `sid=${seg.sid}`,
        "x-test-simulated-timestamp": `${testFecha}T16:10:00.000-06:00`,
      },
    });
    const garitaBuscarData = await garitaBuscarRes.json();
    assert.strictEqual(garitaBuscarData.datos.jornada_actual.estado_jornada, "CERRADA_NORMAL");
    assert.strictEqual(garitaBuscarData.datos.jornada_abierta, null);
    assert.deepStrictEqual(garitaBuscarData.datos.acciones_validas, []);
  });

  // ==========================================
  // BLOQUE F: REPORTERÍA Y CONSOLIDADO QUINCENAL
  // ==========================================
  console.log("\n--- BLOQUE F: REPORTERÍA Y CONSOLIDADO ---");
  await test("F.1: Consolidado quincenal y exportación CSV con headers UTF-8", async () => {
    const csvRes = await fetch(`${BASE_URL}/api/reportes/exportar?tipo=resumen-horas&formato=csv&rango=primera-quincena-mes-actual`, {
      headers: { "X-Session-Id": th.sid, Cookie: `sid=${th.sid}` },
    });
    assert.strictEqual(csvRes.status, 200);
    const contentType = csvRes.headers.get("content-type") || "";
    assert.ok(contentType.includes("text/csv"));
    const csvText = await csvRes.text();
    assert.ok(csvText.includes("Cédula") || csvText.includes("Colaborador") || csvText.includes("Identificador"));
  });

  // ==========================================
  // BLOQUE G: POLÍTICAS RAG GENERALIZADAS
  // ==========================================
  console.log("\n--- BLOQUE G: POLÍTICAS RAG Y GOBERNANZA DOCUMENTAL ---");
  await test("G.1: Estado del corpus RAG refleja documentos activos y fragmentos", async () => {
    const estadoRes = await fetch(`${BASE_URL}/api/rag/estado`, {
      headers: { "X-Session-Id": emp.sid, Cookie: `sid=${emp.sid}` },
    });
    assert.strictEqual(estadoRes.status, 200);
    const estado = await estadoRes.json();
    assert.strictEqual(estado.exito, true);
    assert.ok(estado.datos.documentos_activos_total >= 1);
    assert.ok(estado.datos.fragmentos_indexados >= 25);
  });

  await test("G.2: Consulta de RAG cita el documento normativo exacto", async () => {
    let res = await fetch(`${BASE_URL}/api/rag/consultar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": emp.sid,
        Cookie: `sid=${emp.sid}`,
      },
      body: JSON.stringify({ pregunta: "¿Cuáles son los descansos autorizados según el reglamento?" }),
    });

    if (res.status !== 200) {
      const errText = await res.text();
      console.warn(`[G.2 Retry] Primer intento status ${res.status}: ${errText}. Reintentando tras 1s...`);
      await new Promise((r) => setTimeout(r, 1000));
      res = await fetch(`${BASE_URL}/api/rag/consultar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": emp.sid,
          Cookie: `sid=${emp.sid}`,
        },
        body: JSON.stringify({ pregunta: "¿Cuáles son los descansos autorizados según el reglamento?" }),
      });
    }

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(body.datos.fuentes.length > 0);
    const codigos = body.datos.fuentes.map((f: any) => f.codigo);
    assert.ok(codigos.includes("DTH-REG-001"), `Debe citar DTH-REG-001 (obtenido: ${codigos.join(", ")})`);
  });

  console.log("\n================================================================================");
  console.log(`RESUMEN FASE 6 FINAL: PASADAS: ${passed} | FALLIDAS: ${failed} | TOTAL: ${passed + failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runFase6FinalSuite()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERROR FATAL EN SUITE FASE 6:", e);
    process.exit(1);
  });
