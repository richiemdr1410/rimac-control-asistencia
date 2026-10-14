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

async function runFase4aSuite() {
  console.log("================================================================================");
  console.log("=== SUITE DE PRUEBAS FASE 4A — INCIDENCIAS, SALIDAS OMITIDAS Y CORRECCIONES ===");
  console.log("================================================================================");

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

  // Iniciar sesión con usuarios canónicos
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");
  const supervisor = await loginUser("supervisor_seg", "PassSegura_2026!*");

  // Obtener un empleado para pruebas
  const empRes = await pool.query(`SELECT * FROM empleados WHERE id = $1 LIMIT 1;`, [empleado.usuario.empleado_id]);
  const empTest = empRes.rows[0];
  assert.ok(empTest, "Empleado de prueba debe existir");

  // Obtener un horario estándar (07:00 a 16:30)
  const horRes = await pool.query(`SELECT * FROM horarios LIMIT 1;`);
  const horTest = horRes.rows[0];

  // Generar fechas únicas en rango futuro para evitar colisiones con marcas inmutables
  const d1 = 10 + (Math.floor(Date.now() / 1000) % 15);
  const m1 = 1 + (Math.floor(Date.now() / 20000) % 11);
  const y1 = 2028 + (Math.floor(Date.now() / 300000) % 10);
  const fechaTest = `${y1}-${String(m1).padStart(2, "0")}-${String(d1).padStart(2, "0")}`;
  const fechaTest2 = `${y1}-${String(m1).padStart(2, "0")}-${String(d1 + 1).padStart(2, "0")}`;

  // Crear una jornada de prueba abierta con entrada a las 07:00 pero SIN salida
  const jIdRes = await pool.query(
    `INSERT INTO jornadas (
      empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
      hora_entrada_marcada, hora_entrada_calculo, origen_entrada_calculo,
      minutos_total_descansos, minutos_efectivos, minutos_tardanza, minutos_salida_anticipada,
      minutos_tiempo_adicional, minutos_justificados_comp, minutos_justificados_nocomp,
      cumplimiento_porcentaje
    ) VALUES (
      $1, $2, 'ABIERTA', $3, $4,
      $5, $5, 'MARCA_FISICA',
      0, 0, 0, 0, 0, 0, 0, 0
    ) RETURNING id;`,
    [
      empTest.id,
      fechaTest,
      horTest.id,
      JSON.stringify({
        horario_id_origen: horTest.id,
        hora_entrada_programada: "07:00",
        hora_salida_programada: "16:30",
        tolerancia_minutos: 5,
        minutos_esperados: 570,
        cruza_medianoche: false,
      }),
      `${fechaTest}T07:00:00-06:00`,
    ]
  );
  const jornadaId = jIdRes.rows[0].id;

  // Insertar la marca física original de entrada
  const mEntradaRes = await pool.query(
    `INSERT INTO marcas (
      empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id
    ) VALUES (
      $1, $2, 'ENTRADA', $3, 'GARITA', $4
    ) RETURNING id;`,
    [empTest.id, jornadaId, `${fechaTest}T07:00:00-06:00`, admin.usuario.id]
  );
  const marcaEntradaId = mEntradaRes.rows[0].id;

  let incidenciaSalidaId = "";

  // 1. Detectar salida omitida
  await test(1, "Detectar salida omitida cuando ha pasado la hora programada + margen", async () => {
    // Simular escaneo de detección pasadas las 16:30 + 120min de gracia (ej. 19:00)
    const res = await fetch(`${BASE_URL}/api/incidencias/detectar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": admin.csrf,
        Authorization: `Bearer ${admin.sid}`,
      },
      body: JSON.stringify({
        jornada_id: jornadaId,
        ahora_simulada: `${fechaTest}T19:00:00-06:00`,
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.exito, true);
    assert.ok(body.datos.length >= 1, "Debe registrar al menos una incidencia");
    const inc = body.datos.find((i: any) => i.tipo_incidencia === "SALIDA_OMITIDA");
    assert.ok(inc, "Debe existir incidencia SALIDA_OMITIDA");
    assert.strictEqual(inc.estado, "ABIERTA");
    incidenciaSalidaId = inc.id;
  });

  // 2. No generar incidencia duplicada
  await test(2, "No generar incidencia duplicada cuando se vuelve a evaluar la jornada", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/detectar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": admin.csrf,
        Authorization: `Bearer ${admin.sid}`,
      },
      body: JSON.stringify({
        jornada_id: jornadaId,
        ahora_simulada: `${fechaTest}T20:00:00-06:00`,
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);

    // Contar incidencias abiertas en la tabla
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM incidencias WHERE jornada_id = $1 AND tipo_incidencia = 'SALIDA_OMITIDA' AND estado = 'ABIERTA';`,
      [jornadaId]
    );
    assert.strictEqual(parseInt(countRes.rows[0].count, 10), 1, "No debe haber duplicados de la misma incidencia abierta");
  });

  // 3. Respetar margen configurable MINUTOS_GRACIA_SALIDA_OMITIDA
  await test(3, "Respetar margen configurable (antes de margen no debe detectar salida omitida)", async () => {
    // Jornada 2: a las 17:00 (solo 30 mins después de 16:30, menor a 120min de gracia)
    const jIdRes2 = await pool.query(
      `INSERT INTO jornadas (
        empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
        hora_entrada_marcada, hora_entrada_calculo, origen_entrada_calculo,
        minutos_total_descansos, minutos_efectivos, minutos_tardanza, minutos_salida_anticipada,
        minutos_tiempo_adicional, minutos_justificados_comp, minutos_justificados_nocomp,
        cumplimiento_porcentaje
      ) VALUES (
        $1, $2, 'ABIERTA', $3, $4,
        $5, $5, 'MARCA_FISICA',
        0, 0, 0, 0, 0, 0, 0, 0
      ) RETURNING id;`,
      [
        empTest.id,
        fechaTest2,
        horTest.id,
        JSON.stringify({
          horario_id_origen: horTest.id,
          hora_entrada_programada: "07:00",
          hora_salida_programada: "16:30",
          tolerancia_minutos: 5,
          minutos_esperados: 570,
          cruza_medianoche: false,
        }),
        `${fechaTest2}T07:00:00-06:00`,
      ]
    );
    const j2Id = jIdRes2.rows[0].id;
    await pool.query(
      `INSERT INTO marcas (
        empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id
      ) VALUES (
        $1, $2, 'ENTRADA', $3, 'GARITA', $4
      );`,
      [empTest.id, j2Id, `${fechaTest2}T07:00:00-06:00`, admin.usuario.id]
    );

    // Detección evaluada a las 17:00 (dentro de los 120 minutos de gracia)
    const res = await fetch(`${BASE_URL}/api/incidencias/detectar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": admin.csrf,
        Authorization: `Bearer ${admin.sid}`,
      },
      body: JSON.stringify({
        jornada_id: j2Id,
        ahora_simulada: `${fechaTest2}T17:00:00-06:00`,
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    const incSalida = body.datos.find((i: any) => i.tipo_incidencia === "SALIDA_OMITIDA");
    assert.strictEqual(incSalida, undefined, "No debe disparar SALIDA_OMITIDA antes de expirar el margen de gracia");
  });

  // 4. No insertar salida física ficticia en marcas
  await test(4, "No insertar salida física ficticia en la tabla marcas", async () => {
    const resMarcas = await pool.query(
      `SELECT * FROM marcas WHERE jornada_id = $1;`,
      [jornadaId]
    );
    assert.strictEqual(resMarcas.rows.length, 1, "Solo debe existir la marca de entrada física original");
    assert.strictEqual(resMarcas.rows[0].tipo_marca, "ENTRADA");
  });

  // 5. Solicitar regularización / Intentar autoaprobación (Segregación ABAC)
  await test(5, "Rechazar autoaprobación de regularización por el propio colaborador (HTTP 403)", async () => {
    // El empleado intenta regularizar su propia jornada
    const res = await fetch(`${BASE_URL}/api/incidencias/regularizar-salida`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({
        jornada_id: jornadaId,
        motivo: "Intento de auto-regularización",
      }),
    });
    // Debe ser rechazado (403 Prohibido)
    assert.strictEqual(res.status, 403, "Debe retornar HTTP 403 ante autoaprobación");
  });

  // 6. Rechazar regularización sin motivo
  await test(6, "Rechazar regularización sin motivo obligatorio (HTTP 400)", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/regularizar-salida`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({
        jornada_id: jornadaId,
        motivo: "   ",
      }),
    });
    assert.strictEqual(res.status, 400, "Debe requerir motivo no vacío");
  });

  // 7. Aprobar regularización autorizada por Talento Humano / Administrador
  await test(7, "Aprobar regularización autorizada por Talento Humano (ABAC)", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/regularizar-salida`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({
        jornada_id: jornadaId,
        motivo: "Colaborador completó su turno y se verificó con bitácora de portería.",
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.estado_jornada, "REGULARIZADA");
    assert.strictEqual(body.datos.es_salida_regularizada, true);
    assert.strictEqual(body.datos.origen_salida_calculo, "SALIDA_PROGRAMADA_REGULARIZADA");
  });

  // 8. Utilizar salida programada en cálculo
  await test(8, "Utilizar hora de salida programada para el cálculo oficial de la jornada", async () => {
    const jRes = await pool.query(`SELECT * FROM jornadas WHERE id = $1;`, [jornadaId]);
    const j = jRes.rows[0];
    assert.strictEqual(j.es_salida_regularizada, true);
    assert.strictEqual(j.origen_salida_calculo, "SALIDA_PROGRAMADA_REGULARIZADA");
    assert.ok(j.hora_salida_calculo !== null, "Hora de salida de cálculo debe estar poblada");
    // Minutos calculados deben coincidir con la jornada programada oficial (570 min)
    assert.strictEqual(j.minutos_efectivos, 570);
    assert.strictEqual(j.minutos_tiempo_adicional, 0, "No debe generar tiempo extraordinario automático");
  });

  // 9. Conservar marca física original
  await test(9, "Conservar marca física original intacta en base de datos", async () => {
    const resMarcas = await pool.query(`SELECT * FROM marcas WHERE jornada_id = $1;`, [jornadaId]);
    assert.strictEqual(resMarcas.rows.length, 1, "No se deben agregar marcas a la tabla física");
    assert.strictEqual(resMarcas.rows[0].id, marcaEntradaId);
    assert.strictEqual(resMarcas.rows[0].tipo_marca, "ENTRADA");
  });

  // 10. Solicitar corrección administrativa de una marca
  let correccionId = "";
  await test(10, "Solicitar corrección administrativa de una marca física", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/solicitar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({
        marca_original_id: marcaEntradaId,
        tipo_ajuste: "SUSTITUCION_TIMESTAMP",
        timestamp_propuesto: `${fechaTest}T06:58:00-06:00`,
        motivo: "Garita tenía fila y la marca física registró 07:00 cuando ingresé 06:58",
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.estado, "PENDIENTE");
    correccionId = body.datos.id;
  });

  // 11. Rechazar corrección sin motivo obligatorio
  await test(11, "Rechazar corrección sin motivo obligatorio (HTTP 400)", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/solicitar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({
        marca_original_id: marcaEntradaId,
        tipo_ajuste: "SUSTITUCION_TIMESTAMP",
        timestamp_propuesto: `${fechaTest}T06:58:00-06:00`,
        motivo: "   ",
      }),
    });
    assert.strictEqual(res.status, 400);
  });

  // 12. Impedir correcciones pendientes duplicadas sobre la misma marca física
  await test(12, "Impedir correcciones pendientes duplicadas sobre la misma marca física", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/solicitar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({
        marca_original_id: marcaEntradaId,
        tipo_ajuste: "SUSTITUCION_TIMESTAMP",
        timestamp_propuesto: `${fechaTest}T06:55:00-06:00`,
        motivo: "Segunda solicitud duplicada",
      }),
    });
    assert.ok(res.status === 409 || res.status === 400, `Debe rechazar solicitud duplicada pendiente: ${res.status}`);
  });

  // 13. Rechazar autoaprobación de corrección de marca (ABAC)
  await test(13, "Rechazar autoaprobación de corrección por el propio colaborador (HTTP 403)", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/${correccionId}/decidir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({ decision: "APROBAR" }),
    });
    assert.strictEqual(res.status, 403, "Debe rechazar con 403 ante autoaprobación");
  });

  // 14. Aprobar corrección por autoridad competente (Talento Humano)
  await test(14, "Aprobar corrección administrativa por autoridad competente (Talento Humano)", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/${correccionId}/decidir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({ decision: "APROBAR" }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.estado, "APROBADA");
  });

  // 15. Impedir modificación o anulación de corrección resuelta
  await test(15, "Impedir modificación o decisión sobre una corrección ya resuelta", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/${correccionId}/decidir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": admin.csrf,
        Authorization: `Bearer ${admin.sid}`,
      },
      body: JSON.stringify({ decision: "RECHAZAR" }),
    });
    assert.strictEqual(res.status, 400, "Debe impedir cambiar el estado de una corrección ya resuelta");
  });

  // 16. Recalcular jornada correctamente conservando el evento físico original
  await test(16, "Recalcular jornada determinísticamente con el valor corregido", async () => {
    // Consultar marcas activas de la jornada
    const marcasActivasRes = await fetch(`${BASE_URL}/api/incidencias/jornadas/${jornadaId}/marcas`, {
      headers: {
        Authorization: `Bearer ${th.sid}`,
      },
    });
    const body = (await marcasActivasRes.json()) as any;
    assert.strictEqual(marcasActivasRes.status, 200);

    // En marcas físicas debe seguir estando la hora original (07:00)
    const original = body.datos.marcas_fisicas[0];
    assert.strictEqual(new Date(original.timestamp_servidor).getUTCHours(), 13); // 07:00 CR es 13:00 UTC

    // En marcas activas de cálculo debe reflejar la sustitución aprobada (06:58)
    const activa = body.datos.marcas_activas_calculo[0];
    assert.strictEqual(new Date(activa.timestamp_servidor).getUTCMinutes(), 58);
  });

  // 17. Validar permisos RBAC
  await test(17, "Validar permisos RBAC: usuario sin permiso es rechazado con HTTP 403", async () => {
    // Crear usuario temporal o usar rol SEGURIDAD que no tiene JORNADAS_REGULARIZAR
    const seguridad = await loginUser("seguridad", "PassSegura_2026!*");
    const res = await fetch(`${BASE_URL}/api/incidencias/regularizar-salida`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": seguridad.csrf,
        Authorization: `Bearer ${seguridad.sid}`,
      },
      body: JSON.stringify({
        jornada_id: jornadaId,
        motivo: "Intento no autorizado",
      }),
    });
    assert.strictEqual(res.status, 403, "Debe rechazar con 403 si el rol no tiene el permiso RBAC");
  });

  // 18. Validar alcance ABAC
  await test(18, "Validar alcance ABAC: Supervisor solo aprueba con asignación de jefatura válida (403 para empleado ajeno)", async () => {
    // Crear jornada para empleado ajeno no subordinado (Lic. Andrea Humano)
    const empAjenoId = "33333333-3333-4333-8333-333333333302";
    const jAjenaRes = await pool.query(
      `INSERT INTO jornadas (
        empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
        hora_entrada_marcada, hora_entrada_calculo, origen_entrada_calculo,
        minutos_total_descansos, minutos_efectivos, minutos_tardanza, minutos_salida_anticipada,
        minutos_tiempo_adicional, minutos_justificados_comp, minutos_justificados_nocomp,
        cumplimiento_porcentaje
      ) VALUES (
        $1, $2, 'ABIERTA', $3, $4,
        $5, $5, 'MARCA_FISICA',
        0, 0, 0, 0, 0, 0, 0, 0
      ) RETURNING id;`,
      [
        empAjenoId,
        fechaTest2,
        horTest.id,
        JSON.stringify({
          horario_id_origen: horTest.id,
          hora_entrada_programada: "07:00",
          hora_salida_programada: "16:30",
          tolerancia_minutos: 5,
          minutos_esperados: 570,
          cruza_medianoche: false,
        }),
        `${fechaTest2}T07:00:00-06:00`,
      ]
    );
    const jAjenaId = jAjenaRes.rows[0].id;
    await pool.query(
      `INSERT INTO marcas (
        empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id
      ) VALUES (
        $1, $2, 'ENTRADA', $3, 'GARITA', $4
      );`,
      [empAjenoId, jAjenaId, `${fechaTest2}T07:00:00-06:00`, admin.usuario.id]
    );

    // Supervisor intenta regularizar la jornada de Andrea Humano (quien no es su subordinada)
    const res = await fetch(`${BASE_URL}/api/incidencias/regularizar-salida`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": supervisor.csrf,
        Authorization: `Bearer ${supervisor.sid}`,
      },
      body: JSON.stringify({
        jornada_id: jAjenaId,
        motivo: "Intento de supervisor sin asignación formal",
      }),
    });
    // Debe ser estrictamente 403
    assert.strictEqual(res.status, 403, "Debe rechazar con 403 si el supervisor no es la jefatura activa");
  });

  // 19. Verificar auditoría inmutable
  await test(19, "Verificar auditoría inmutable de eventos clave registrados en la suite", async () => {
    const eventosAuditoria = await pool.query(
      `SELECT accion FROM auditoria_eventos
       WHERE accion IN (
         'DETECTAR_INCIDENCIA',
         'APROBAR_REGULARIZACION_SALIDA',
         'SOLICITAR_CORRECCION_MARCA',
         'APROBAR_CORRECCION_MARCA'
       )
       ORDER BY timestamp_evento DESC
       LIMIT 10;`
    );

    const tipos = eventosAuditoria.rows.map((r) => r.accion);
    assert.ok(tipos.includes("DETECTAR_INCIDENCIA"), "Auditoría debe contener DETECTAR_INCIDENCIA");
    assert.ok(tipos.includes("APROBAR_REGULARIZACION_SALIDA"), "Auditoría debe contener APROBAR_REGULARIZACION_SALIDA");
    assert.ok(tipos.includes("SOLICITAR_CORRECCION_MARCA"), "Auditoría debe contener SOLICITAR_CORRECCION_MARCA");
    assert.ok(tipos.includes("APROBAR_CORRECCION_MARCA"), "Auditoría debe contener APROBAR_CORRECCION_MARCA");
  });

  // 20. Resolver incidencia manualmente
  await test(20, "Resolver incidencia laboral manualmente (JUSTIFICADA)", async () => {
    // Crear incidencia de prueba y resolverla
    const incTestRes = await pool.query(
      `INSERT INTO incidencias (
        jornada_id, empleado_id, tipo_incidencia, descripcion, minutos_afectados, estado
      ) VALUES ($1, $2, 'PAUSA_SIN_CIERRE', 'Prueba de resolución', 15, 'ABIERTA')
      RETURNING id;`,
      [jornadaId, empTest.id]
    );
    const incId = incTestRes.rows[0].id;

    const res = await fetch(`${BASE_URL}/api/incidencias/${incId}/resolver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({
        estado: "JUSTIFICADA",
        motivo: "Colaborador presentó constancia médica de la clínica interna",
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.estado, "JUSTIFICADA");
  });

  console.log("================================================================================");
  console.log(`=== RESUMEN FASE 4A: ${passCount} PASADAS | ${failCount} FALLIDAS ===`);
  console.log("================================================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase4aSuite().catch((err) => {
  console.error("Error fatal en suite de pruebas Fase 4A:", err);
  process.exit(1);
});
