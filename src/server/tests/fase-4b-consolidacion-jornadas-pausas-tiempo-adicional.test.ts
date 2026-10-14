import assert from "node:assert";
import { getPool } from "../../db/index.js";
import { calcularJornadaDeterminista } from "../services/calculo-jornada.js";
import type { MarcaEntity } from "../repositories/interfaces/marcas.js";

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

async function runFase4bSuite() {
  console.log("=================================================================================================");
  console.log("=== SUITE DE PRUEBAS FASE 4B — CONSOLIDACIÓN DE JORNADAS, PAUSAS Y TIEMPO ADICIONAL ===");
  console.log("=================================================================================================");

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

  // Iniciar sesiones
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const supervisor = await loginUser("supervisor_seg", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");
  const seguridad = await loginUser("seguridad", "PassSegura_2026!*");

  const testBaseDate = new Date();
  const getUniqueDate = (offsetDays: number) => {
    const d = new Date(testBaseDate.getTime() + (offsetDays + Math.floor(Math.random() * 1000) + 200) * 86400000);
    return d.toISOString().split("T")[0];
  };

  // 1. REGLA DE CÁLCULO DE JORNADA (Ejemplo del pliego RIMAC)
  await test(1, "Regla oficial de cálculo: Tiempo total = Salida - Entrada; Tiempo efectivo = Total - Pausas reales", async () => {
    // Ejemplo pliego:
    // Entrada: 07:30
    // Desayuno: 09:00 - 09:15 (15 min)
    // Almuerzo: 12:00 - 12:30 (30 min)
    // Café: 15:00 - 15:15 (15 min)
    // Salida: 17:00
    const marcasTest: MarcaEntity[] = [
      {
        id: "m-1",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-1",
        tipo_marca: "ENTRADA",
        timestamp_servidor: "2026-10-14T07:30:00-06:00",
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T07:30:00-06:00",
      },
      {
        id: "m-2",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-1",
        tipo_marca: "INICIO_DESAYUNO",
        timestamp_servidor: "2026-10-14T09:00:00-06:00",
        origen_marca: "AUTOSERVICIO",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T09:00:00-06:00",
      },
      {
        id: "m-3",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-1",
        tipo_marca: "FIN_DESAYUNO",
        timestamp_servidor: "2026-10-14T09:15:00-06:00",
        origen_marca: "AUTOSERVICIO",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T09:15:00-06:00",
      },
      {
        id: "m-4",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-1",
        tipo_marca: "INICIO_ALMUERZO",
        timestamp_servidor: "2026-10-14T12:00:00-06:00",
        origen_marca: "AUTOSERVICIO",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T12:00:00-06:00",
      },
      {
        id: "m-5",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-1",
        tipo_marca: "FIN_ALMUERZO",
        timestamp_servidor: "2026-10-14T12:30:00-06:00",
        origen_marca: "AUTOSERVICIO",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T12:30:00-06:00",
      },
      {
        id: "m-6",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-1",
        tipo_marca: "INICIO_CAFE",
        timestamp_servidor: "2026-10-14T15:00:00-06:00",
        origen_marca: "AUTOSERVICIO",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T15:00:00-06:00",
      },
      {
        id: "m-7",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-1",
        tipo_marca: "FIN_CAFE",
        timestamp_servidor: "2026-10-14T15:15:00-06:00",
        origen_marca: "AUTOSERVICIO",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T15:15:00-06:00",
      },
      {
        id: "m-8",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-1",
        tipo_marca: "SALIDA",
        timestamp_servidor: "2026-10-14T17:00:00-06:00",
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T17:00:00-06:00",
      },
    ];

    const snapshot = {
      hora_entrada_programada: "07:30",
      hora_salida_programada: "17:00",
      tolerancia_minutos: 5,
      minutos_esperados: 510,
      cruza_medianoche: false,
    };

    const resCalc = calcularJornadaDeterminista(marcasTest, snapshot);

    // Salida 17:00 - Entrada 07:30 = 9h 30m = 570 min
    assert.strictEqual(resCalc.minutos_tiempo_total, 570, "Tiempo total debe ser 570 min");
    // Pausas reales: 15 + 30 + 15 = 60 min
    assert.strictEqual(resCalc.minutos_desayuno, 15);
    assert.strictEqual(resCalc.minutos_almuerzo, 30);
    assert.strictEqual(resCalc.minutos_cafe, 15);
    assert.strictEqual(resCalc.minutos_descansos, 60);
    // Tiempo efectivo = 570 - 60 = 510 min
    assert.strictEqual(resCalc.minutos_efectivos, 510);
    // Tiempo adicional = 0 (salió a la hora programada 17:00)
    assert.strictEqual(resCalc.minutos_tiempo_adicional, 0);
  });

  // 2. REGLA CRÍTICA DE PAUSAS OMITIDAS
  await test(2, "Regla crítica: Si el empleado no toma desayuno o café, ese tiempo NO se convierte en tiempo extraordinario ni se suma a tiempo adicional", async () => {
    // Mismo horario pero el colaborador no tomó desayuno ni café (solo almuerzo de 30 min)
    const marcasSinPausas: MarcaEntity[] = [
      {
        id: "m-10",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-2",
        tipo_marca: "ENTRADA",
        timestamp_servidor: "2026-10-14T07:30:00-06:00",
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T07:30:00-06:00",
      },
      {
        id: "m-11",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-2",
        tipo_marca: "INICIO_ALMUERZO",
        timestamp_servidor: "2026-10-14T12:00:00-06:00",
        origen_marca: "AUTOSERVICIO",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T12:00:00-06:00",
      },
      {
        id: "m-12",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-2",
        tipo_marca: "FIN_ALMUERZO",
        timestamp_servidor: "2026-10-14T12:30:00-06:00",
        origen_marca: "AUTOSERVICIO",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T12:30:00-06:00",
      },
      {
        id: "m-13",
        empleado_id: empleado.usuario.empleado_id,
        jornada_id: "j-2",
        tipo_marca: "SALIDA",
        timestamp_servidor: "2026-10-14T17:00:00-06:00",
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T17:00:00-06:00",
      },
    ];

    const snapshot = {
      hora_entrada_programada: "07:30",
      hora_salida_programada: "17:00",
      tolerancia_minutos: 5,
      minutos_esperados: 510,
      cruza_medianoche: false,
    };

    const resCalc = calcularJornadaDeterminista(marcasSinPausas, snapshot);

    // Pausas reales registradas = 30 min (desayuno y café son 0)
    assert.strictEqual(resCalc.minutos_desayuno, 0);
    assert.strictEqual(resCalc.minutos_cafe, 0);
    assert.strictEqual(resCalc.minutos_almuerzo, 30);
    assert.strictEqual(resCalc.minutos_descansos, 30);
    assert.strictEqual(resCalc.minutos_tiempo_total, 570);
    assert.strictEqual(resCalc.minutos_efectivos, 540);
    // El tiempo adicional reconocido DEBE SER 0 (no se convierte en horas extras automáticas)
    assert.strictEqual(resCalc.minutos_tiempo_adicional, 0);
  });

  // 3. DETECCIÓN DE PAUSAS ANÓMALAS SIN BORRAR MARCAS
  await test(3, "Detección de pausas anómalas (sin cierre, cierre sin inicio, múltiples inicios, superpuestas)", async () => {
    const fechaAnomalia = getUniqueDate(1);
    const empId = empleado.usuario.empleado_id;

    const resJ = await pool.query(
      `INSERT INTO jornadas (
        empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
        hora_entrada_marcada, hora_entrada_calculo, origen_entrada_calculo
      ) VALUES (
        $1, $2, 'ABIERTA', (SELECT id FROM horarios LIMIT 1), $3,
        $4, $4, 'MARCA_FISICA'
      ) RETURNING id;`,
      [
        empId,
        fechaAnomalia,
        JSON.stringify({
          hora_entrada_programada: "07:00",
          hora_salida_programada: "16:30",
          tolerancia_minutos: 5,
          minutos_esperados: 480,
          cruza_medianoche: false,
        }),
        `${fechaAnomalia}T07:00:00-06:00`,
      ]
    );
    const jId = resJ.rows[0].id;

    // Insertar entrada
    await pool.query(
      `INSERT INTO marcas (empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
       VALUES ($1, $2, 'ENTRADA', $3, 'GARITA', $4);`,
      [empId, jId, `${fechaAnomalia}T07:00:00-06:00`, admin.usuario.id]
    );

    // Insertar múltiples desayunos (anomalía de secuencia)
    await pool.query(
      `INSERT INTO marcas (empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
       VALUES ($1, $2, 'INICIO_DESAYUNO', $3, 'COMEDOR', $4);`,
      [empId, jId, `${fechaAnomalia}T08:00:00-06:00`, admin.usuario.id]
    );
    await pool.query(
      `INSERT INTO marcas (empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
       VALUES ($1, $2, 'FIN_DESAYUNO', $3, 'COMEDOR', $4);`,
      [empId, jId, `${fechaAnomalia}T08:15:00-06:00`, admin.usuario.id]
    );
    await pool.query(
      `INSERT INTO marcas (empleado_id, jornada_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
       VALUES ($1, $2, 'INICIO_DESAYUNO', $3, 'COMEDOR', $4);`,
      [empId, jId, `${fechaAnomalia}T09:30:00-06:00`, admin.usuario.id]
    );

    // Ejecutar detección en endpoint oficial
    const resDet = await fetch(`${BASE_URL}/api/incidencias/detectar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: admin.cookie,
        "x-csrf-token": admin.csrf,
      },
      body: JSON.stringify({
        jornada_id: jId,
        ahora_simulada: `${fechaAnomalia}T12:00:00-06:00`,
      }),
    });
    assert.strictEqual(resDet.status, 200);
    const bodyDet = (await resDet.json()) as any;
    assert.strictEqual(bodyDet.exito, true);

    const tipos = bodyDet.datos.map((d: any) => d.tipo_incidencia);
    assert(tipos.includes("SECUENCIA_ANORMAL") || tipos.includes("PAUSA_SIN_CIERRE"), "Debe detectar anomalía en las pausas");

    // Marcas físicas originales se conservan intactas
    const qMarcas = await pool.query("SELECT COUNT(*) FROM marcas WHERE jornada_id = $1", [jId]);
    assert.strictEqual(parseInt(qMarcas.rows[0].count, 10), 4, "No debe borrar marcas físicas");
  });

  // 4. TIEMPO ADICIONAL DETECTADO VS EFECTIVO (Diferenciación y Estado Pendiente)
  let jornadaConTAId: string = "";
  await test(4, "Detección de tiempo adicional: jornada que excede horario programado queda PENDIENTE con minutos detectados", async () => {
    const fechaTest = getUniqueDate(2);
    const empId = empleado.usuario.empleado_id;

    const resJ = await pool.query(
      `INSERT INTO jornadas (
        empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
        hora_entrada_calculo, hora_salida_calculo,
        minutos_tiempo_total, minutos_desayuno, minutos_almuerzo, minutos_cafe,
        minutos_tiempo_adicional, minutos_tiempo_adicional_aprobado, estado_tiempo_adicional,
        minutos_efectivos
      ) VALUES (
        $1, $2, 'CERRADA_NORMAL', (SELECT id FROM horarios LIMIT 1), $3,
        $4, $5,
        660, 15, 30, 15,
        90, 0, 'PENDIENTE',
        600
      ) RETURNING id;`,
      [
        empId,
        fechaTest,
        JSON.stringify({
          hora_entrada_programada: "07:00",
          hora_salida_programada: "16:30",
          tolerancia_minutos: 5,
          minutos_esperados: 510,
          cruza_medianoche: false,
        }),
        `${fechaTest}T07:00:00-06:00`,
        `${fechaTest}T18:00:00-06:00`,
      ]
    );

    jornadaConTAId = resJ.rows[0].id;
    assert(jornadaConTAId, "Debe existir ID de jornada con tiempo adicional");

    // Verificar consulta desde endpoint GET /api/jornadas/tiempo-adicional/pendientes
    const resGetTA = await fetch(`${BASE_URL}/api/jornadas/tiempo-adicional/pendientes?estado=PENDIENTE`, {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(resGetTA.status, 200);
    const bodyTA = (await resGetTA.json()) as any;
    assert.strictEqual(bodyTA.exito, true);
    const itemEncontrado = bodyTA.datos.find((x: any) => x.id === jornadaConTAId);
    assert(itemEncontrado, "La jornada creada debe listarse en tiempo adicional pendiente");
    assert.strictEqual(itemEncontrado.minutos_tiempo_adicional, 90);
    assert.strictEqual(itemEncontrado.minutos_tiempo_adicional_aprobado, 0);
    assert.strictEqual(itemEncontrado.estado_tiempo_adicional, "PENDIENTE");
  });

  // 5. RBAC: EMPLEADO NO PUEDE APROBAR TIEMPO ADICIONAL (403)
  await test(5, "RBAC: EMPLEADO no posee permiso JORNADAS_TIEMPO_EXTRA_APROBAR y recibe 403 al intentar resolver", async () => {
    const resAprobar = await fetch(`${BASE_URL}/api/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empleado.cookie,
        "x-csrf-token": empleado.csrf,
      },
      body: JSON.stringify({
        jornada_id: jornadaConTAId,
        decision: "APROBAR_TOTAL",
        motivo: "Intento no autorizado por empleado",
      }),
    });

    assert.strictEqual(resAprobar.status, 403, "EMPLEADO debe recibir 403 por falta de permiso");
    const body = (await resAprobar.json()) as any;
    assert.strictEqual(body.codigo, "PERMISO_DENEGADO");
  });

  // 6. PROHIBICIÓN ESTRICTA DE AUTOAPROBACIÓN EN TIEMPO ADICIONAL (TALENTO HUMANO Y ADMIN)
  let jTHId = "";
  await test(6, "Autoaprobación prohibida: TALENTO_HUMANO no puede resolver tiempo adicional de su propia jornada (HTTP 403 AUTOAPROBACION_NO_PERMITIDA)", async () => {
    const thEmpId = th.usuario.empleado_id;
    const fechaTH = getUniqueDate(3);

    const resJTH = await pool.query(
      `INSERT INTO jornadas (
        empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
        hora_entrada_calculo, hora_salida_calculo,
        minutos_tiempo_total, minutos_desayuno, minutos_almuerzo, minutos_cafe,
        minutos_tiempo_adicional, minutos_tiempo_adicional_aprobado, estado_tiempo_adicional,
        minutos_efectivos
      ) VALUES (
        $1, $2, 'CERRADA_NORMAL', (SELECT id FROM horarios LIMIT 1), $3,
        $4, $5,
        660, 15, 30, 15,
        90, 0, 'PENDIENTE',
        600
      ) RETURNING id;`,
      [
        thEmpId,
        fechaTH,
        JSON.stringify({
          hora_entrada_programada: "07:00",
          hora_salida_programada: "16:30",
          tolerancia_minutos: 5,
          minutos_esperados: 510,
          cruza_medianoche: false,
        }),
        `${fechaTH}T07:00:00-06:00`,
        `${fechaTH}T18:00:00-06:00`,
      ]
    );
    jTHId = resJTH.rows[0].id;

    // TH intenta resolver su propia jornada
    const resAuto = await fetch(`${BASE_URL}/api/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: th.cookie,
        "x-csrf-token": th.csrf,
      },
      body: JSON.stringify({
        jornada_id: jTHId,
        decision: "APROBAR_TOTAL",
        motivo: "Autoaprobación prohibida",
      }),
    });

    assert.strictEqual(resAuto.status, 403, "Autoaprobación debe responder HTTP 403");
    const bodyAuto = (await resAuto.json()) as any;
    assert.strictEqual(bodyAuto.codigo, "AUTOAPROBACION_NO_PERMITIDA");
    assert.strictEqual(bodyAuto.titulo, "No puede resolver su propia jornada");
  });

  // 7. ABAC: SUPERVISOR NO PUEDE APROBAR TIEMPO ADICIONAL DE EMPLEADO FUERA DE SU ALCANCE (403)
  await test(7, "ABAC: SUPERVISOR_SEGURIDAD solo puede resolver tiempo adicional de colaboradores bajo su jerarquía activa", async () => {
    // Intentar resolver jornada de TH (TH no es subordinado del supervisor de seguridad)
    const resABAC = await fetch(`${BASE_URL}/api/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: supervisor.cookie,
        "x-csrf-token": supervisor.csrf,
      },
      body: JSON.stringify({
        jornada_id: jTHId,
        decision: "APROBAR_TOTAL",
        motivo: "Supervisor intenta resolver jornada ajena",
      }),
    });

    assert.strictEqual(resABAC.status, 403, "Debe rechazar con 403 por falta de asignación de jefatura");
    const body = (await resABAC.json()) as any;
    assert.strictEqual(body.codigo, "PERMISO_DENEGADO");
  });

  // 8. RESOLUCIÓN VÁLIDA PARCIAL: APROBAR_PARCIAL
  await test(8, "Aprobación parcial de tiempo adicional (APROBAR_PARCIAL): guarda exactamente los minutos concedidos", async () => {
    // Talento Humano resuelve la jornada del empleado normal (90 min detectados -> aprueba 45 min)
    const resAprobarParcial = await fetch(`${BASE_URL}/api/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: th.cookie,
        "x-csrf-token": th.csrf,
      },
      body: JSON.stringify({
        jornada_id: jornadaConTAId,
        decision: "APROBAR_PARCIAL",
        minutos_aprobados: 45,
        motivo: "Autorizado únicamente 45 minutos por reunión extraordinaria",
      }),
    });

    assert.strictEqual(resAprobarParcial.status, 200, "Debe responder 200 OK");
    const body = (await resAprobarParcial.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.estado_tiempo_adicional, "APROBADO_PARCIAL");
    assert.strictEqual(body.datos.minutos_tiempo_adicional_aprobado, 45);

    // Verificar en BD y auditoría
    const qBD = await pool.query("SELECT estado_tiempo_adicional, minutos_tiempo_adicional_aprobado, motivo_resolucion_ta FROM jornadas WHERE id = $1", [jornadaConTAId]);
    assert.strictEqual(qBD.rows[0].estado_tiempo_adicional, "APROBADO_PARCIAL");
    assert.strictEqual(qBD.rows[0].minutos_tiempo_adicional_aprobado, 45);

    const qAud = await pool.query("SELECT accion, motivo FROM auditoria_eventos WHERE entidad_id = $1 ORDER BY timestamp_evento DESC LIMIT 1", [jornadaConTAId]);
    assert.strictEqual(qAud.rows[0].accion, "APROBAR_TIEMPO_ADICIONAL");
    assert(qAud.rows[0].motivo.includes("APROBAR_PARCIAL"));
  });

  // 9. RESOLUCIÓN VÁLIDA RECHAZO: RECHAZAR
  await test(9, "Rechazo de tiempo adicional (RECHAZAR): minutos aprobados quedan en 0 y estado RECHAZADO", async () => {
    // Creamos otra jornada para probar RECHAZAR
    const fechaRechazo = getUniqueDate(4);
    const empId = empleado.usuario.empleado_id;

    const resJ = await pool.query(
      `INSERT INTO jornadas (
        empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
        hora_entrada_calculo, hora_salida_calculo,
        minutos_tiempo_total, minutos_desayuno, minutos_almuerzo, minutos_cafe,
        minutos_tiempo_adicional, minutos_tiempo_adicional_aprobado, estado_tiempo_adicional,
        minutos_efectivos
      ) VALUES (
        $1, $2, 'CERRADA_NORMAL', (SELECT id FROM horarios LIMIT 1), $3,
        $4, $5,
        630, 15, 30, 15,
        60, 0, 'PENDIENTE',
        570
      ) RETURNING id;`,
      [
        empId,
        fechaRechazo,
        JSON.stringify({
          hora_entrada_programada: "07:00",
          hora_salida_programada: "16:30",
          tolerancia_minutos: 5,
          minutos_esperados: 510,
          cruza_medianoche: false,
        }),
        `${fechaRechazo}T07:00:00-06:00`,
        `${fechaRechazo}T17:30:00-06:00`,
      ]
    );
    const jRechazoId = resJ.rows[0].id;

    const resRechazo = await fetch(`${BASE_URL}/api/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: th.cookie,
        "x-csrf-token": th.csrf,
      },
      body: JSON.stringify({
        jornada_id: jRechazoId,
        decision: "RECHAZAR",
        motivo: "Permanencia no justificada después de turno",
      }),
    });

    assert.strictEqual(resRechazo.status, 200);
    const bodyRechazo = (await resRechazo.json()) as any;
    assert.strictEqual(bodyRechazo.datos.estado_tiempo_adicional, "RECHAZADO");
    assert.strictEqual(bodyRechazo.datos.minutos_tiempo_adicional_aprobado, 0);

    const qBD = await pool.query("SELECT estado_tiempo_adicional, minutos_tiempo_adicional_aprobado FROM jornadas WHERE id = $1", [jRechazoId]);
    assert.strictEqual(qBD.rows[0].estado_tiempo_adicional, "RECHAZADO");
    assert.strictEqual(qBD.rows[0].minutos_tiempo_adicional_aprobado, 0);
  });

  // 10. SEGURIDAD CUENTA OPERACIONAL DENEGADA
  await test(10, "Cuenta operacional SEGURIDAD no tiene acceso a consultar ni aprobar jornadas", async () => {
    const resJornadas = await fetch(`${BASE_URL}/api/jornadas`, {
      headers: { Cookie: seguridad.cookie },
    });
    assert.strictEqual(resJornadas.status, 403, "SEGURIDAD debe recibir 403 en /api/jornadas");

    const resAprobar = await fetch(`${BASE_URL}/api/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: seguridad.cookie,
        "x-csrf-token": seguridad.csrf,
      },
      body: JSON.stringify({
        jornada_id: jornadaConTAId,
        decision: "APROBAR_TOTAL",
        motivo: "Operador de garita intenta aprobar",
      }),
    });
    assert.strictEqual(resAprobar.status, 403, "SEGURIDAD debe recibir 403 en aprobar tiempo adicional");
  });

  // 11. DETALLE DE JORNADA CON MARCAS ACTIVAS
  await test(11, "GET /api/jornadas/:id/detalle devuelve desglose exhaustivo y valida alcance", async () => {
    // EMPLEADO consulta su propia jornada
    const resDetallePropia = await fetch(`${BASE_URL}/api/jornadas/${jornadaConTAId}/detalle`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(resDetallePropia.status, 200);
    const body = (await resDetallePropia.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.jornada.id, jornadaConTAId);

    // EMPLEADO intenta consultar jornada de TALENTO_HUMANO -> 403
    const resDetalleAjena = await fetch(`${BASE_URL}/api/jornadas/${jTHId}/detalle`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(resDetalleAjena.status, 403, "EMPLEADO no puede consultar detalle de jornada ajena");
  });

  // 12. MATRIZ DE ROLES Y PERMISOS FASE 4B
  await test(12, "Roles y Permisos: Catálogo y Matriz contienen JORNADAS_DETALLE_VER, TIEMPO_ADICIONAL_VER y JORNADAS_TIEMPO_EXTRA_APROBAR", async () => {
    const resCatalogo = await fetch(`${BASE_URL}/api/admin/permisos`, {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(resCatalogo.status, 200);
    const bodyCat = (await resCatalogo.json()) as any;
    const codigosCat = bodyCat.datos.permisos.map((p: any) => p.codigo);
    assert(codigosCat.includes("JORNADAS_DETALLE_VER"), "Debe existir JORNADAS_DETALLE_VER");
    assert(codigosCat.includes("TIEMPO_ADICIONAL_VER"), "Debe existir TIEMPO_ADICIONAL_VER");
    assert(codigosCat.includes("JORNADAS_TIEMPO_EXTRA_APROBAR"), "Debe existir JORNADAS_TIEMPO_EXTRA_APROBAR");

    const resMatriz = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(resMatriz.status, 200);
    const bodyMatriz = (await resMatriz.json()) as any;
    const asignaciones = bodyMatriz.datos.asignaciones;

    // EMPLEADO tiene consulta propia pero no aprobar
    assert(asignaciones.EMPLEADO.includes("JORNADAS_DETALLE_VER"));
    assert(asignaciones.EMPLEADO.includes("TIEMPO_ADICIONAL_VER"));
    assert(!asignaciones.EMPLEADO.includes("JORNADAS_TIEMPO_EXTRA_APROBAR"));

    // TALENTO_HUMANO tiene los 3
    assert(asignaciones.TALENTO_HUMANO.includes("JORNADAS_DETALLE_VER"));
    assert(asignaciones.TALENTO_HUMANO.includes("TIEMPO_ADICIONAL_VER"));
    assert(asignaciones.TALENTO_HUMANO.includes("JORNADAS_TIEMPO_EXTRA_APROBAR"));
  });

  console.log("=================================================================================================");
  console.log(`RESUMEN FASE 4B: ${passCount} PASADAS | ${failCount} FALLIDAS`);
  console.log("=================================================================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase4bSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error fatal en suite Fase 4B:", err);
    process.exit(1);
  });
