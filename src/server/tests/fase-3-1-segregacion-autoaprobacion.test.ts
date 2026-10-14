import assert from "node:assert";
import crypto from "node:crypto";
import { calcularJornadaDeterminista } from "../services/calculo-jornada.js";
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

async function runFase31Suite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.1 ===");
  console.log("=== JEFATURAS, SEGREGACIÓN DE FUNCIONES Y AUTOAPROBACIÓN ===");

  let passCount = 0;
  let failCount = 0;

  async function test(num: number, desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      passCount++;
      console.log(`[PASS] Test ${num}: ${desc}`);
    } catch (err: any) {
      failCount++;
      console.error(`[FAIL] Test ${num}: ${desc} ->`, err.message);
    }
  }

  // 1. Iniciar sesión de los perfiles requeridos
  const empLogin = await loginUser("empleado", "PassSegura_2026!*");
  const thLogin = await loginUser("talento_humano", "PassSegura_2026!*");
  const adminLogin = await loginUser("admin", "PassSegura_2026!*");
  const supLogin = await loginUser("supervisor_seg", "PassSegura_2026!*");
  const segLogin = await loginUser("seguridad", "PassSegura_2026!*");

  // Prueba 1: Empleado solicita PERMISO -> jefatura directa puede aprobar
  let solPermisoEmpId: string = "";
  await test(1, "Empleado solicita PERMISO -> jefatura directa (talento_humano) puede aprobar", async () => {
    const resCrear = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "PERMISO",
        fecha_inicio: "2026-10-20",
        fecha_fin: "2026-10-20",
        motivo: "Trámite bancario personal",
      }),
    });
    assert.strictEqual(resCrear.status, 201);
    const bodyCrear = (await resCrear.json()) as any;
    solPermisoEmpId = bodyCrear.datos.id;

    const resAprobar = await fetch(`${BASE_URL}/api/solicitudes/${solPermisoEmpId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Permiso aprobado por jefatura directa." }),
    });
    assert.strictEqual(resAprobar.status, 200);
    const bodyAprobar = (await resAprobar.json()) as any;
    assert.strictEqual(bodyAprobar.datos.nuevo_estado, "APROBADA");
  });

  // Prueba 2: Usuario que no es jefatura -> 403 ACCESO_NO_AUTORIZADO
  await test(2, "Usuario que no es jefatura directa del solicitante -> 403 ACCESO_NO_AUTORIZADO", async () => {
    // Empleado crea nueva solicitud
    const resCrear = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "JUSTIFICACION_TARDIA",
        fecha_inicio: "2026-10-21",
        fecha_fin: "2026-10-21",
        motivo: "Avería mecánica",
      }),
    });
    assert.strictEqual(resCrear.status, 201);
    const bodyCrear = (await resCrear.json()) as any;
    const solId = bodyCrear.datos.id;

    // Supervisor de Seguridad intenta resolverla (no es su jefatura)
    const resAprobar = await fetch(`${BASE_URL}/api/solicitudes/${solId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: supLogin.cookie,
        "x-csrf-token": supLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Intento no autorizado" }),
    });
    assert.strictEqual(resAprobar.status, 403);
    const body = (await resAprobar.json()) as any;
    const codigo = body.error?.codigo || body.codigo;
    assert.strictEqual(codigo, "ACCESO_NO_AUTORIZADO");
  });

  // Prueba 3: Solicitante intenta aprobar su propia solicitud -> 403 AUTOAPROBACION_NO_PERMITIDA
  await test(3, "Solicitante intenta aprobar o rechazar su propia solicitud -> 403 AUTOAPROBACION_NO_PERMITIDA", async () => {
    const resCrear = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "PERMISO",
        fecha_inicio: "2026-10-22",
        fecha_fin: "2026-10-22",
        motivo: "Asunto propio",
      }),
    });
    const bodyCrear = (await resCrear.json()) as any;
    const solId = bodyCrear.datos.id;

    // Intento de autoaprobación
    const resAprobar = await fetch(`${BASE_URL}/api/solicitudes/${solId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Autoaprobándome" }),
    });
    assert.strictEqual(resAprobar.status, 403);
    const bodyAprobar = (await resAprobar.json()) as any;
    const codAprobar = bodyAprobar.error?.codigo || bodyAprobar.codigo;
    assert.strictEqual(codAprobar, "AUTOAPROBACION_NO_PERMITIDA");

    // Intento de autorechazo
    const resRechazar = await fetch(`${BASE_URL}/api/solicitudes/${solId}/rechazar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Autorechazándome" }),
    });
    assert.strictEqual(resRechazar.status, 403);
    const bodyRechazar = (await resRechazar.json()) as any;
    const codRechazar = bodyRechazar.error?.codigo || bodyRechazar.codigo;
    assert.strictEqual(codRechazar, "AUTOAPROBACION_NO_PERMITIDA");
  });

  // Prueba 4: TH crea solicitud propia -> aparece en Mis Solicitudes
  let solTHId: string = "";
  await test(4, "TH crea solicitud propia -> aparece en Mis Solicitudes (GET /mis-solicitudes)", async () => {
    const resCrear = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "PERMISO",
        fecha_inicio: "2026-10-23",
        fecha_fin: "2026-10-23",
        motivo: "Capacitación externa de Talento Humano",
      }),
    });
    assert.strictEqual(resCrear.status, 201);
    const bodyCrear = (await resCrear.json()) as any;
    solTHId = bodyCrear.datos.id;

    // Consultar Mis Solicitudes de TH
    const resMis = await fetch(`${BASE_URL}/api/solicitudes/mis-solicitudes`, {
      headers: {
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
    });
    assert.strictEqual(resMis.status, 200);
    const bodyMis = (await resMis.json()) as any;
    const encontrada = bodyMis.datos.find((s: any) => s.id === solTHId);
    assert.ok(encontrada, "La solicitud propia de TH debe figurar en sus Mis Solicitudes");
  });

  // Prueba 5: TH no puede aprobar ni rechazar su propia solicitud
  await test(5, "TH no puede autoaprobar ni autorechazar su solicitud y NO aparece en su bandeja pendiente", async () => {
    assert.ok(solTHId);

    // Intento de autoaprobación de TH
    const resAprobar = await fetch(`${BASE_URL}/api/solicitudes/${solTHId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "TH intentando autoaprobarse" }),
    });
    assert.strictEqual(resAprobar.status, 403);
    const body = (await resAprobar.json()) as any;
    const cod = body.error?.codigo || body.codigo;
    assert.strictEqual(cod, "AUTOAPROBACION_NO_PERMITIDA");

    // Verificar que NO aparece en la bandeja de pendientes de TH
    const resPend = await fetch(`${BASE_URL}/api/solicitudes/pendientes`, {
      headers: {
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
    });
    assert.strictEqual(resPend.status, 200);
    const bodyPend = (await resPend.json()) as any;
    const enPendientes = bodyPend.datos.some((s: any) => s.id === solTHId);
    assert.strictEqual(enPendientes, false, "La solicitud propia de TH nunca debe aparecer en su bandeja pendiente");
  });

  // Prueba 6: Jefatura de TH (Admin Demo Sistemas) puede aprobar nivel 1 de la solicitud de TH
  await test(6, "Jefatura directa DEMO de TH (Admin Demo Sistemas) puede aprobar nivel 1 de la solicitud de TH", async () => {
    assert.ok(solTHId);
    const resAprobar = await fetch(`${BASE_URL}/api/solicitudes/${solTHId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminLogin.cookie,
        "x-csrf-token": adminLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Aprobado por jefatura superior DEMO." }),
    });
    assert.strictEqual(resAprobar.status, 200);
    const body = (await resAprobar.json()) as any;
    assert.strictEqual(body.datos.nuevo_estado, "APROBADA");
  });

  // Prueba 7: VACACIONES de empleado normal -> Jefatura (TH) -> TH -> APROBADA
  let solVacacionesEmpId: string = "";
  await test(7, "VACACIONES de empleado normal completan flujo multinivel: Jefatura -> TH -> APROBADA", async () => {
    const resCrear = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "VACACIONES",
        fecha_inicio: "2026-11-10",
        fecha_fin: "2026-11-12",
        motivo: "Vacaciones regulares de colaborador",
      }),
    });
    assert.strictEqual(resCrear.status, 201);
    const bodyCrear = (await resCrear.json()) as any;
    solVacacionesEmpId = bodyCrear.datos.id;

    // Nivel 1: Jefatura directa (Lic. Andrea Humano)
    const resN1 = await fetch(`${BASE_URL}/api/solicitudes/${solVacacionesEmpId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Nivel 1: Jefatura directa conforme" }),
    });
    assert.strictEqual(resN1.status, 200);
    const bodyN1 = (await resN1.json()) as any;
    assert.strictEqual(bodyN1.datos.nuevo_estado, "EN_REVISION");

    // Nivel 2: TALENTO_HUMANO confirma resolución final
    const resN2 = await fetch(`${BASE_URL}/api/solicitudes/${solVacacionesEmpId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Nivel 2: Talento Humano aprueba control de asistencia" }),
    });
    assert.strictEqual(resN2.status, 200);
    const bodyN2 = (await resN2.json()) as any;
    assert.strictEqual(bodyN2.datos.nuevo_estado, "APROBADA");
  });

  // Prueba 8: VACACIONES de TH -> Jefatura aprueba nivel 1 -> segundo nivel NO puede ser ejecutado por la solicitante
  let solVacacionesTHId: string = "";
  await test(8, "VACACIONES de TH -> Jefatura aprueba nivel 1 -> solicitante NO puede ejecutar nivel 2 (403)", async () => {
    const resCrear = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "VACACIONES",
        fecha_inicio: "2026-12-01",
        fecha_fin: "2026-12-05",
        motivo: "Vacaciones anuales solicitadas por Lic. Andrea Humano",
      }),
    });
    assert.strictEqual(resCrear.status, 201);
    const bodyCrear = (await resCrear.json()) as any;
    solVacacionesTHId = bodyCrear.datos.id;

    // Nivel 1: Jefatura directa de TH (Admin Demo Sistemas)
    const resN1 = await fetch(`${BASE_URL}/api/solicitudes/${solVacacionesTHId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminLogin.cookie,
        "x-csrf-token": adminLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Nivel 1 aprobado por jefatura superior." }),
    });
    assert.strictEqual(resN1.status, 200);
    const bodyN1 = (await resN1.json()) as any;
    assert.strictEqual(bodyN1.datos.nuevo_estado, "EN_REVISION");

    // Intento de la solicitante (TH) de aprobar el Nivel 2 sobre su propia solicitud
    const resN2Self = await fetch(`${BASE_URL}/api/solicitudes/${solVacacionesTHId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Intentando autoaprobar nivel 2" }),
    });
    assert.strictEqual(resN2Self.status, 403);
    const bodyN2Self = (await resN2Self.json()) as any;
    const cod = bodyN2Self.error?.codigo || bodyN2Self.codigo;
    assert.strictEqual(cod, "AUTOAPROBACION_NO_PERMITIDA");
  });

  // Prueba 9: ADMINISTRADOR alternativo puede completar nivel TH en el escenario DEMO sin ser el solicitante
  await test(9, "ADMINISTRADOR alternativo completa Nivel 2 de TH evitando autoaprobación", async () => {
    assert.ok(solVacacionesTHId);
    const resN2Admin = await fetch(`${BASE_URL}/api/solicitudes/${solVacacionesTHId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminLogin.cookie,
        "x-csrf-token": adminLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Nivel 2 completado por Administrador alternativo para evitar autoaprobación." }),
    });
    assert.strictEqual(resN2Admin.status, 200);
    const bodyN2Admin = (await resN2Admin.json()) as any;
    assert.strictEqual(bodyN2Admin.datos.nuevo_estado, "APROBADA");
    assert.strictEqual(bodyN2Admin.datos.decision.rol_evaluador, "ADMINISTRADOR");
  });

  // Prueba 10: Cada decisión conserva actor real, nivel y timestamp en solicitud_decisiones
  await test(10, "Cada decisión en solicitud_decisiones conserva inmutablemente actor real, nivel y timestamp", async () => {
    assert.ok(solVacacionesTHId);
    const resDetalle = await fetch(`${BASE_URL}/api/solicitudes/${solVacacionesTHId}`, {
      headers: {
        Cookie: adminLogin.cookie,
        "x-csrf-token": adminLogin.csrf,
      },
    });
    assert.strictEqual(resDetalle.status, 200);
    const body = (await resDetalle.json()) as any;
    const decisiones = body.datos.decisiones;
    assert.strictEqual(decisiones.length, 2);

    // Decisión Nivel 1
    assert.strictEqual(decisiones[0].nivel, 1);
    assert.strictEqual(decisiones[0].usuario_decisor_id, adminLogin.usuario.id);
    assert.ok(decisiones[0].fecha_decision);

    // Decisión Nivel 2 (Administrador alternativo)
    assert.strictEqual(decisiones[1].nivel, 2);
    assert.strictEqual(decisiones[1].usuario_decisor_id, adminLogin.usuario.id);
    assert.strictEqual(decisiones[1].rol_evaluador, "ADMINISTRADOR");
    assert.ok(decisiones[1].fecha_decision);
  });

  // Prueba 11: No existe rol de usuario JEFATURA
  await test(11, "No existe rol de usuario JEFATURA en base de datos ni usuarios", async () => {
    const pool = getPool();
    const res = await pool.query(`SELECT DISTINCT rol FROM usuarios;`);
    const rolesEnBd = res.rows.map((r) => r.rol);
    assert.strictEqual(rolesEnBd.includes("JEFATURA"), false, "JEFATURA no debe existir como rol en base de datos");

    // Verificar los 5 roles canónicos
    const rolesCanonicosEsperados = [
      "ADMINISTRADOR",
      "TALENTO_HUMANO",
      "SEGURIDAD",
      "SUPERVISOR_SEGURIDAD",
      "EMPLEADO",
    ];
    for (const r of rolesEnBd) {
      assert.ok(rolesCanonicosEsperados.includes(r), `Rol ${r} debe ser uno de los 5 roles canónicos`);
    }
  });

  // Prueba 12: Cuenta SEGURIDAD no participa como empleado/jefatura
  await test(12, "Cuenta genérica SEGURIDAD no tiene empleado_id ni participa en asignaciones_jefatura", async () => {
    const pool = getPool();
    const resUser = await pool.query(`SELECT id, username, rol, empleado_id FROM usuarios WHERE rol = 'SEGURIDAD';`);
    assert.strictEqual(resUser.rows.length, 1);
    assert.strictEqual(resUser.rows[0].empleado_id, null, "SEGURIDAD no debe tener empleado_id");

    const resJef = await pool.query(`
      SELECT * FROM asignaciones_jefatura 
      WHERE jefatura_empleado_id IS NULL OR subordinado_empleado_id IS NULL;
    `);
    assert.strictEqual(resJef.rows.length, 0);

    // No puede acceder a Autoservicio
    const resAuto = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        Cookie: segLogin.cookie,
        "x-csrf-token": segLogin.csrf,
      },
    });
    assert.strictEqual(resAuto.status, 403);
  });

  // Pruebas de Frontera de Tardía (Requisito 8)
  console.log("\n--- EJECUCIÓN DE PRUEBAS DE FRONTERA DE TARDÍA (Jornada 07:00, Tolerancia 5m) ---");
  const snapshot = {
    hora_entrada_programada: "07:00",
    hora_salida_programada: "16:30",
    tolerancia_minutos: 5,
    minutos_esperados: 540,
    cruza_medianoche: false,
  };

  const fronteras = [
    { caso: "07:00", ts: "2026-10-05T07:00:00-06:00" },
    { caso: "07:04:59", ts: "2026-10-05T07:04:59-06:00" },
    { caso: "07:05:00", ts: "2026-10-05T07:05:00-06:00" },
    { caso: "07:05:01", ts: "2026-10-05T07:05:01-06:00" },
    { caso: "07:15:00", ts: "2026-10-05T07:15:00-06:00" },
    { caso: "07:15:01", ts: "2026-10-05T07:15:01-06:00" },
  ];

  for (let i = 0; i < fronteras.length; i++) {
    const f = fronteras[i];
    await test(13 + i, `Frontera ${f.caso} en jornada 07:00`, async () => {
      const marcas = [
        {
          id: `m-frontera-${i}`,
          jornada_id: `j-frontera-${i}`,
          empleado_id: "e-demo",
          tipo_marca: "ENTRADA" as const,
          timestamp_servidor: f.ts,
          origen_marca: "AUTOSERVICIO" as const,
          estado_marca: "ACTIVA" as const,
          usuario_registrador_id: "u-demo",
          creado_en: f.ts,
        },
      ];
      const resultado = calcularJornadaDeterminista(marcas, snapshot);
      console.log(`    -> Timestamp: ${f.caso} | minutos_tardanza: ${resultado.minutos_tardanza} | clasificacion: ${resultado.clasificacion_tardanza}`);
      assert.ok(resultado.clasificacion_tardanza);
    });
  }

  console.log(`\n======================================================`);
  console.log(`RESUMEN FASE 3.1: PASS: ${passCount} / FAIL: ${failCount} (TOTAL: ${passCount + failCount})`);
  console.log(`======================================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runFase31Suite().catch((err) => {
  console.error("Error fatal en suite Fase 3.1:", err);
  process.exit(1);
});
