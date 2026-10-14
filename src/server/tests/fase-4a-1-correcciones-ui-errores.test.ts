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

async function runFase4a1Suite() {
  console.log("==========================================================================================");
  console.log("=== SUITE DE PRUEBAS FASE 4A.1 — SELECCIÓN DE MARCAS, IDENTIFICADORES Y AUTOAPROBACIÓN ===");
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

  // Iniciar sesiones con usuarios del sistema
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");

  // Obtener empleados de prueba
  const empRes = await pool.query(`SELECT * FROM empleados WHERE id = $1 LIMIT 1;`, [empleado.usuario.empleado_id]);
  const empTest = empRes.rows[0];
  assert.ok(empTest, "Empleado de prueba debe existir");

  const empThRes = await pool.query(`SELECT * FROM empleados WHERE id = $1 LIMIT 1;`, [th.usuario.empleado_id]);
  const empTh = empThRes.rows[0];
  assert.ok(empTh, "Empleado de Talento Humano debe existir");

  const empAdminRes = await pool.query(`SELECT * FROM empleados WHERE id = $1 LIMIT 1;`, [admin.usuario.empleado_id]);
  const empAdmin = empAdminRes.rows[0];
  assert.ok(empAdmin, "Empleado de Administrador debe existir");

  // Obtener horario de referencia
  const horRes = await pool.query(`SELECT * FROM horarios LIMIT 1;`);
  const horTest = horRes.rows[0];

  // Fechas únicas para la suite 4A.1
  const dBase = 12 + (Math.floor(Date.now() / 1000) % 14);
  const mBase = 1 + (Math.floor(Date.now() / 25000) % 11);
  const yBase = 2029 + (Math.floor(Date.now() / 400000) % 5);
  const fechaTest1 = `${yBase}-${String(mBase).padStart(2, "0")}-${String(dBase).padStart(2, "0")}`;
  const fechaTest2 = `${yBase}-${String(mBase).padStart(2, "0")}-${String(dBase + 1).padStart(2, "0")}`;
  const fechaTestTh = `${yBase}-${String(mBase).padStart(2, "0")}-${String(dBase + 2).padStart(2, "0")}`;
  const fechaVacia = `2035-12-31`;

  // Limpiar posibles jornadas de pruebas previas en las mismas fechas
  await pool.query(
    `DELETE FROM correcciones_marcas WHERE marca_original_id IN (
      SELECT m.id FROM marcas m JOIN jornadas j ON m.jornada_id = j.id WHERE j.fecha_jornada IN ($1, $2, $3)
    );`,
    [fechaTest1, fechaTest2, fechaTestTh]
  );
  await pool.query(
    `DELETE FROM incidencias WHERE jornada_id IN (
      SELECT id FROM jornadas WHERE fecha_jornada IN ($1, $2, $3)
    );`,
    [fechaTest1, fechaTest2, fechaTestTh]
  );
  await pool.query(
    `DELETE FROM marcas WHERE jornada_id IN (
      SELECT id FROM jornadas WHERE fecha_jornada IN ($1, $2, $3)
    );`,
    [fechaTest1, fechaTest2, fechaTestTh]
  );
  await pool.query(
    `DELETE FROM jornadas WHERE fecha_jornada IN ($1, $2, $3);`,
    [fechaTest1, fechaTest2, fechaTestTh]
  );

  // 1. Crear una jornada para el colaborador con marcas físicas reales
  const jRes = await pool.query(
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
      fechaTest1,
      horTest.id,
      JSON.stringify({
        horario_id_origen: horTest.id,
        hora_entrada_programada: "07:00",
        hora_salida_programada: "16:30",
        tolerancia_minutos: 5,
        minutos_esperados: 570,
        cruza_medianoche: false,
      }),
      `${fechaTest1}T07:02:00-06:00`,
    ]
  );
  const jornada1Id = jRes.rows[0].id;

  // Insertar dos marcas físicas en la jornada: ENTRADA y SALIDA
  const m1Res = await pool.query(
    `INSERT INTO marcas (
      empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id
    ) VALUES (
      $1, $2, 'ENTRADA', $3, 'GARITA', $4
    ) RETURNING id;`,
    [empTest.id, jornada1Id, `${fechaTest1}T07:02:00-06:00`, admin.usuario.id]
  );
  const marcaEntradaId = m1Res.rows[0].id;

  const m2Res = await pool.query(
    `INSERT INTO marcas (
      empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id
    ) VALUES (
      $1, $2, 'SALIDA', $3, 'GARITA', $4
    ) RETURNING id;`,
    [empTest.id, jornada1Id, `${fechaTest1}T16:35:00-06:00`, admin.usuario.id]
  );
  const marcaSalidaId = m2Res.rows[0].id;

  // Insertar una tercera marca en fechaTest2 para anulación lógica
  const j2Res = await pool.query(
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
      `${fechaTest2}T07:05:00-06:00`,
    ]
  );
  const jornada2Id = j2Res.rows[0].id;

  const m3Res = await pool.query(
    `INSERT INTO marcas (
      empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id
    ) VALUES (
      $1, $2, 'ENTRADA', $3, 'GARITA', $4
    ) RETURNING id;`,
    [empTest.id, jornada2Id, `${fechaTest2}T07:05:00-06:00`, admin.usuario.id]
  );
  const marcaAnularId = m3Res.rows[0].id;

  // --- PRUEBA 1 ---
  await test(1, "El colaborador consulta únicamente sus propias marcas obteniendo UUIDs reales", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/marcas-por-fecha?fecha=${fechaTest1}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${empleado.sid}`,
      },
    });

    assert.strictEqual(res.status, 200, `Respuesta esperada 200: ${res.status}`);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, true);
    assert.ok(Array.isArray(data.datos.marcas));
    assert.strictEqual(data.datos.marcas.length, 2);

    const ids = data.datos.marcas.map((m: any) => m.id);
    assert.ok(ids.includes(marcaEntradaId), "Debe incluir el UUID real de la marca de entrada");
    assert.ok(ids.includes(marcaSalidaId), "Debe incluir el UUID real de la marca de salida");

    // Verificar formato UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.ok(uuidRegex.test(data.datos.marcas[0].id), "El ID retornado debe ser un UUID válido");
  });

  // --- PRUEBA 2 ---
  await test(2, "Usuario no autorizado (EMPLEADO) no puede consultar marcas ajenas (HTTP 403 ALCANCE_NO_AUTORIZADO)", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/marcas-por-fecha?fecha=${fechaTest1}&empleado_id=${empTh.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${empleado.sid}`,
      },
    });

    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, false);
    assert.strictEqual(data.codigo, "ALCANCE_NO_AUTORIZADO");
  });

  // --- PRUEBA 3 ---
  await test(3, "UUID inválido (AAA) en marcas-por-fecha devuelve HTTP 400 IDENTIFICADOR_INVALIDO sin error SQL", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/marcas-por-fecha?fecha=${fechaTest1}&empleado_id=AAA`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${th.sid}`,
      },
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, false);
    assert.strictEqual(data.codigo, "IDENTIFICADOR_INVALIDO");
    assert.strictEqual(data.mensaje, "Seleccione un registro válido");
    assert.ok(!JSON.stringify(data).toLowerCase().includes("syntax"), "No debe exponer error de sintaxis SQL");
  });

  // --- PRUEBA 4 ---
  await test(4, "Estado informativo cuando no existen marcas para la fecha seleccionada", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/marcas-por-fecha?fecha=${fechaVacia}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${empleado.sid}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, true);
    assert.strictEqual(data.datos.marcas.length, 0);
    assert.ok(data.datos.mensaje_informativo, "Debe incluir mensaje informativo");
    assert.ok(data.datos.mensaje_informativo.includes("No existen marcas físicas registradas"));
  });

  // --- PRUEBA 5 ---
  await test(5, "Solicitar corrección con UUID inválido (AAA) devuelve HTTP 400 IDENTIFICADOR_INVALIDO sin error SQL", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/solicitar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({
        marca_original_id: "AAA",
        tipo_ajuste: "SUSTITUCION_TIMESTAMP",
        timestamp_propuesto: `${fechaTest1}T07:00:00-06:00`,
        motivo: "Prueba con UUID sintético inválido",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, false);
    assert.strictEqual(data.codigo, "IDENTIFICADOR_INVALIDO");
    assert.strictEqual(data.mensaje, "Seleccione una marca válida para continuar");
    assert.ok(!JSON.stringify(data).toLowerCase().includes("invalid input syntax"), "No debe exponer error SQL PostgreSQL");
  });

  // --- PRUEBA 6 ---
  await test(6, "Solicitar corrección con marca inexistente devuelve HTTP 404 MARCA_NO_ENCONTRADA", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/solicitar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({
        marca_original_id: "00000000-0000-0000-0000-000000000000",
        tipo_ajuste: "SUSTITUCION_TIMESTAMP",
        timestamp_propuesto: `${fechaTest1}T07:00:00-06:00`,
        motivo: "Marca inexistente pero con UUID bien formado",
      }),
    });

    assert.strictEqual(res.status, 404);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, false);
    assert.strictEqual(data.codigo, "MARCA_NO_ENCONTRADA");
    assert.strictEqual(data.mensaje, "La marca seleccionada no existe");
  });

  // --- PRUEBA 7 ---
  await test(7, "Solicitar corrección sin motivo obligatorio devuelve HTTP 400 MOTIVO_REQUERIDO", async () => {
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
        timestamp_propuesto: `${fechaTest1}T07:00:00-06:00`,
        motivo: "   ",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, false);
    assert.strictEqual(data.codigo, "MOTIVO_REQUERIDO");
  });

  let correccion1Id = "";

  // --- PRUEBA 8 ---
  await test(8, "Corrección de fecha/hora (SUSTITUCION_TIMESTAMP) funciona correctamente", async () => {
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
        timestamp_propuesto: `${fechaTest1}T07:00:00-06:00`,
        motivo: "Se ajusta la hora por falla temporal en el lector biométrico",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, true);
    assert.strictEqual(data.datos.estado, "PENDIENTE");
    correccion1Id = data.datos.id;
  });

  // --- PRUEBA 9 ---
  await test(9, "Impedir corrección duplicada sobre la misma marca física (HTTP 409 CORRECCION_PENDIENTE_EXISTENTE)", async () => {
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
        timestamp_propuesto: `${fechaTest1}T06:55:00-06:00`,
        motivo: "Segundo intento duplicado sobre la misma marca",
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, false);
    assert.strictEqual(data.codigo, "CORRECCION_PENDIENTE_EXISTENTE");
    assert.strictEqual(data.mensaje, "Ya existe una corrección pendiente para esta marca");
  });

  // --- PRUEBA 10 ---
  await test(10, "Corrección de tipo (SUSTITUCION_TIPO) funciona correctamente", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/solicitar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({
        marca_original_id: marcaSalidaId,
        tipo_ajuste: "SUSTITUCION_TIPO",
        tipo_marca_propuesto: "FIN_ALMUERZO",
        motivo: "Se marcó SALIDA en lugar de FIN_ALMUERZO por confusión de botón",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, true);
    assert.strictEqual(data.datos.tipo_marca_propuesto, "FIN_ALMUERZO");
  });

  // --- PRUEBA 11 ---
  await test(11, "Anulación lógica (ANULACION_LOGICA) no requiere nueva fecha/hora y se registra exitosamente", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/correcciones/solicitar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({
        marca_original_id: marcaAnularId,
        tipo_ajuste: "ANULACION_LOGICA",
        motivo: "Marca errónea registrada por duplicidad de prueba",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, true);
    assert.strictEqual(data.datos.tipo_ajuste, "ANULACION_LOGICA");
    assert.strictEqual(data.datos.timestamp_propuesto, null);
    assert.strictEqual(data.datos.tipo_marca_propuesto, null);
  });

  // Crear una incidencia sobre la jornada de TALENTO HUMANO para validar autoaprobación
  const jThRes = await pool.query(
    `INSERT INTO jornadas (
      empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
      hora_entrada_marcada, hora_entrada_calculo, origen_entrada_calculo,
      minutos_total_descansos, minutos_efectivos, minutos_tardanza, minutos_salida_anticipada,
      minutos_tiempo_adicional, minutos_justificados_comp, minutos_justificados_nocomp,
      cumplimiento_porcentaje
    ) VALUES (
      $1, $2, 'ABIERTA', $3, $4,
      $5, $5, 'MARCA_FISICA',
      0, 0, 15, 0, 0, 0, 0, 0
    ) RETURNING id;`,
    [
      empTh.id,
      fechaTestTh,
      horTest.id,
      JSON.stringify({
        horario_id_origen: horTest.id,
        hora_entrada_programada: "07:00",
        hora_salida_programada: "16:30",
        tolerancia_minutos: 5,
        minutos_esperados: 570,
        cruza_medianoche: false,
      }),
      `${fechaTestTh}T07:15:00-06:00`,
    ]
  );
  const jornadaThId = jThRes.rows[0].id;

  const incThRes = await pool.query(
    `INSERT INTO incidencias (
      jornada_id, empleado_id, tipo_incidencia, descripcion, minutos_afectados, estado
    ) VALUES (
      $1, $2, 'SECUENCIA_ANORMAL', 'Tardía y secuencia irregular detectada para TH', 15, 'ABIERTA'
    ) RETURNING id;`,
    [jornadaThId, empTh.id]
  );
  const incidenciaThId = incThRes.rows[0].id;

  // --- PRUEBA 12 ---
  await test(12, "Prohibición estricta de autoaprobación para Talento Humano en incidencia propia (HTTP 403 AUTOAPROBACION_NO_PERMITIDA)", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/${incidenciaThId}/resolver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({
        estado: "JUSTIFICADA",
        motivo: "Intento de auto-justificación por el propio usuario de Talento Humano",
      }),
    });

    assert.strictEqual(res.status, 403, `Debe responder HTTP 403 Forbidden: ${res.status}`);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, false);
    assert.strictEqual(data.codigo, "AUTOAPROBACION_NO_PERMITIDA");
    assert.strictEqual(data.titulo, "No puede resolver su propia incidencia");
    assert.ok(
      data.mensaje.includes("No es posible aprobar o justificar una incidencia correspondiente a su propia jornada"),
      "Mensaje de autoaprobación canónico debe coincidir"
    );

    // Verificar que la incidencia en base de datos SIGUE ABIERTA
    const chk = await pool.query(`SELECT estado FROM incidencias WHERE id = $1;`, [incidenciaThId]);
    assert.strictEqual(chk.rows[0].estado, "ABIERTA", "El estado no debe haber sido modificado");
  });

  // --- PRUEBA 13 ---
  await test(13, "Prohibición estricta de autoaprobación para Administrador en incidencia propia", async () => {
    // Crear incidencia para Administrador
    const jAdmRes = await pool.query(
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
        empAdmin.id,
        fechaTestTh,
        horTest.id,
        JSON.stringify({
          horario_id_origen: horTest.id,
          hora_entrada_programada: "07:00",
          hora_salida_programada: "16:30",
          tolerancia_minutos: 5,
          minutos_esperados: 570,
          cruza_medianoche: false,
        }),
        `${fechaTestTh}T07:00:00-06:00`,
      ]
    );
    const jAdmId = jAdmRes.rows[0].id;

    const incAdmRes = await pool.query(
      `INSERT INTO incidencias (
        jornada_id, empleado_id, tipo_incidencia, descripcion, minutos_afectados, estado
      ) VALUES (
        $1, $2, 'PAUSA_SIN_CIERRE', 'Almuerzo sin cierre detectado para Admin', 30, 'ABIERTA'
      ) RETURNING id;`,
      [jAdmId, empAdmin.id]
    );
    const incAdmId = incAdmRes.rows[0].id;

    const res = await fetch(`${BASE_URL}/api/incidencias/${incAdmId}/resolver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": admin.csrf,
        Authorization: `Bearer ${admin.sid}`,
      },
      body: JSON.stringify({
        estado: "JUSTIFICADA",
        motivo: "Intento de autoaprobación de administrador",
      }),
    });

    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as any;
    assert.strictEqual(data.codigo, "AUTOAPROBACION_NO_PERMITIDA");
    assert.strictEqual(data.titulo, "No puede resolver su propia incidencia");
  });

  // --- PRUEBA 14 ---
  await test(14, "Talento Humano no puede auto-regularizar la salida de su propia jornada", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/regularizar-salida`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({
        jornada_id: jornadaThId,
        motivo: "Intento de auto-regularización por TH",
      }),
    });

    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as any;
    assert.strictEqual(data.codigo, "AUTOAPROBACION_NO_PERMITIDA");
    assert.strictEqual(data.titulo, "No puede resolver su propia incidencia");
  });

  // --- PRUEBA 15 ---
  await test(15, "Talento Humano resuelve legítimamente incidencia de un tercero autorizado", async () => {
    // Crear incidencia abierta de prueba para empTest
    const incTerceroRes = await pool.query(
      `INSERT INTO incidencias (
        jornada_id, empleado_id, tipo_incidencia, descripcion, minutos_afectados, estado
      ) VALUES (
        $1, $2, 'INCONSISTENCIA_HORARIO', 'Inconsistencia justificada para colaborador', 10, 'ABIERTA'
      ) RETURNING id;`,
      [jornada1Id, empTest.id]
    );
    const incTerceroId = incTerceroRes.rows[0].id;

    const res = await fetch(`${BASE_URL}/api/incidencias/${incTerceroId}/resolver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({
        estado: "JUSTIFICADA",
        motivo: "Comprobante médico verificado por Recursos Humanos",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.exito, true);
    assert.strictEqual(data.datos.estado, "JUSTIFICADA");
  });

  // --- PRUEBA 16 ---
  await test(16, "Resolver incidencia con UUID inválido (AAA) devuelve HTTP 400 IDENTIFICADOR_INVALIDO", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/AAA/resolver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({
        estado: "JUSTIFICADA",
        motivo: "Prueba con id sintético inválido",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.strictEqual(data.codigo, "IDENTIFICADOR_INVALIDO");
    assert.strictEqual(data.mensaje, "Seleccione un registro válido");
    assert.ok(!JSON.stringify(data).toLowerCase().includes("syntax"), "No debe exponer error SQL");
  });

  // --- PRUEBA 17 ---
  await test(17, "Regularizar salida con UUID inválido (AAA) devuelve HTTP 400 IDENTIFICADOR_INVALIDO", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias/regularizar-salida`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({
        jornada_id: "AAA",
        motivo: "Prueba jornada_id inválido",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.strictEqual(data.codigo, "IDENTIFICADOR_INVALIDO");
    assert.strictEqual(data.mensaje, "Seleccione un registro válido");
    assert.ok(!JSON.stringify(data).toLowerCase().includes("syntax"), "No debe exponer error SQL");
  });

  // --- PRUEBA 18 ---
  await test(18, "Visibilidad por rol: EMPLEADO consulta incidencias propias pero no puede escanear ni resolver", async () => {
    // 1. EMPLEADO consulta sus propias incidencias -> Debe responder HTTP 200
    const resList = await fetch(`${BASE_URL}/api/incidencias`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${empleado.sid}`,
      },
    });
    assert.strictEqual(resList.status, 200, "EMPLEADO debe tener acceso a ver sus incidencias");
    const dataList = (await resList.json()) as any;
    assert.strictEqual(dataList.exito, true);

    // 2. EMPLEADO intenta ejecutar escaneo de detección -> Debe responder HTTP 403 PERMISO_DENEGADO
    const resScan = await fetch(`${BASE_URL}/api/incidencias/detectar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resScan.status, 403, "EMPLEADO no debe tener permiso para escanear");
    const dataScan = (await resScan.json()) as any;
    assert.strictEqual(dataScan.codigo, "PERMISO_DENEGADO");

    // 3. EMPLEADO intenta resolver una incidencia -> Debe responder HTTP 403 PERMISO_DENEGADO
    const resRes = await fetch(`${BASE_URL}/api/incidencias/${incidenciaThId}/resolver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": empleado.csrf,
        Authorization: `Bearer ${empleado.sid}`,
      },
      body: JSON.stringify({
        estado: "JUSTIFICADA",
        motivo: "Intento no autorizado",
      }),
    });
    assert.strictEqual(resRes.status, 403, "EMPLEADO no debe tener permiso para resolver incidencias");
  });

  // --- PRUEBA 19 ---
  await test(19, "Consulta de incidencias con empleado_id inválido devuelve HTTP 400 IDENTIFICADOR_INVALIDO", async () => {
    const res = await fetch(`${BASE_URL}/api/incidencias?empleado_id=AAA`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${th.sid}`,
      },
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.strictEqual(data.codigo, "IDENTIFICADOR_INVALIDO");
    assert.strictEqual(data.mensaje, "Seleccione un registro válido");
  });

  // --- PRUEBA 20 ---
  await test(20, "Inmutabilidad de marcas físicas: La marca física original permanece intacta en BD", async () => {
    const marcaPre = await pool.query(`SELECT * FROM marcas WHERE id = $1;`, [marcaEntradaId]);
    assert.ok(marcaPre.rows.length === 1);
    const rowPre = marcaPre.rows[0];

    // Aprobar la corrección por Talento Humano
    const resAprobar = await fetch(`${BASE_URL}/api/incidencias/correcciones/${correccion1Id}/decidir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": th.csrf,
        Authorization: `Bearer ${th.sid}`,
      },
      body: JSON.stringify({ decision: "APROBAR" }),
    });

    assert.strictEqual(resAprobar.status, 200);

    // Verificar que la marca física sigue exactamente igual
    const marcaPost = await pool.query(`SELECT * FROM marcas WHERE id = $1;`, [marcaEntradaId]);
    const rowPost = marcaPost.rows[0];

    assert.strictEqual(rowPost.id, rowPre.id);
    assert.strictEqual(rowPost.tipo_marca, rowPre.tipo_marca);
    assert.strictEqual(
      new Date(rowPost.timestamp_servidor).toISOString(),
      new Date(rowPre.timestamp_servidor).toISOString(),
      "El timestamp_servidor de la marca física NUNCA debe ser alterado"
    );
  });

  console.log("==========================================================================================");
  console.log(`=== RESUMEN FASE 4A.1: ${passCount} PASADAS | ${failCount} FALLIDAS ===`);
  console.log("==========================================================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase4a1Suite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fallo catastrófico en suite Fase 4A.1:", err);
    process.exit(1);
  });
