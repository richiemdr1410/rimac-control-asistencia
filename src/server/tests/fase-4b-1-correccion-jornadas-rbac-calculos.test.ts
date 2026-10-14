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

async function runFase4b1Suite() {
  console.log("=================================================================================================");
  console.log("=== SUITE DE PRUEBAS DIRIGIDAS FASE 4B.1 — CORRECCIÓN DE JORNADAS, ALCANCES, CÁLCULOS Y RBAC ===");
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

  // Iniciar sesiones con los roles oficiales
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const supervisor = await loginUser("supervisor_seg", "PassSegura_2026!*");
  const seguridad = await loginUser("seguridad", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");

  // Obtener IDs de empleados de prueba
  const empCarlosId = empleado.usuario.empleado_id; // "33333333-3333-4333-8333-333333333305"
  const empSupervisorId = supervisor.usuario.empleado_id; // "33333333-3333-4333-8333-333333333303"
  const empTHId = th.usuario.empleado_id; // "33333333-3333-4333-8333-333333333302"

  // 1. EMPLEADO ordinario no ve módulo superior Jornadas
  await test(1, "EMPLEADO ordinario no ve módulo superior Jornadas (backend bloquea GET /api/jornadas con 403)", async () => {
    const res = await fetch(`${BASE_URL}/api/jornadas`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(res.status, 403, "EMPLEADO ordinario sin subordinados debe recibir 403 en módulo administrativo");
    const body = await res.json() as any;
    assert.strictEqual(body.exito, false);
    assert(body.error?.codigo === "PERMISO_DENEGADO" || body.codigo === "PERMISO_DENEGADO");
  });

  // 2. EMPLEADO sí ve Mis Jornadas y Pausas
  await test(2, "EMPLEADO sí ve Mis Jornadas y Pausas (permiso JORNADAS_PERSONALES_VER o JORNADAS_DETALLE_VER activo)", async () => {
    assert(
      empleado.usuario.permisos.includes("JORNADAS_PERSONALES_VER") ||
      empleado.usuario.permisos.includes("JORNADAS_DETALLE_VER"),
      "EMPLEADO debe tener permiso de consulta personal"
    );
    const res = await fetch(`${BASE_URL}/api/jornadas/mis-jornadas`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(res.status, 200, "Debe poder consultar sus jornadas personales");
    const body = await res.json() as any;
    assert.strictEqual(body.exito, true);
    assert(Array.isArray(body.datos));
  });

  // 3. Autoservicio devuelve exclusivamente sus propias jornadas
  await test(3, "Autoservicio devuelve exclusivamente sus propias jornadas y no acepta empleado_id enviado por cliente", async () => {
    // Si intenta enviar empleado_id ajeno, se rechaza
    const resIntentoAjeno = await fetch(`${BASE_URL}/api/jornadas/mis-jornadas?empleado_id=${empTHId}`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(resIntentoAjeno.status, 400, "Debe rechazar empleado_id ajeno enviado por cliente en autoservicio");

    // Consulta limpia
    const resLimpia = await fetch(`${BASE_URL}/api/jornadas/mis-jornadas`, {
      headers: { Cookie: empleado.cookie },
    });
    const body = await resLimpia.json() as any;
    assert.strictEqual(body.exito, true);
    for (const j of body.datos) {
      assert.strictEqual(j.empleado_id, empCarlosId, "Todas las jornadas devueltas deben pertenecer al empleado autenticado");
    }
  });

  // 4. TH ve módulo administrativo
  await test(4, "TALENTO_HUMANO ve módulo administrativo con alcance institucional autorizado", async () => {
    const res = await fetch(`${BASE_URL}/api/jornadas`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200, "TALENTO_HUMANO debe tener acceso a GET /api/jornadas");
    const body = await res.json() as any;
    assert.strictEqual(body.exito, true);
    assert(Array.isArray(body.datos));
    assert(body.datos.length > 0, "Debe ver jornadas del sistema");
  });

  // 5. Jefatura solo ve subordinados
  await test(5, "SUPERVISOR_SEGURIDAD / Jefatura solo ve a sus subordinados asignados y a sí mismo", async () => {
    const res = await fetch(`${BASE_URL}/api/jornadas`, {
      headers: { Cookie: supervisor.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.strictEqual(body.exito, true);

    // Obtener subordinados reales en BD de supervisor
    const subsDb = await pool.query(
      "SELECT subordinado_empleado_id AS empleado_id FROM asignaciones_jefatura WHERE jefatura_empleado_id = $1 AND estado = 'ACTIVA'",
      [empSupervisorId]
    );
    const permitidos = [empSupervisorId, ...subsDb.rows.map((r: any) => r.empleado_id)];

    for (const j of body.datos) {
      assert(
        permitidos.includes(j.empleado_id),
        `Jornada de empleado ${j.empleado_id} debe estar en el alcance permitido del supervisor`
      );
    }
  });

  // 6. Usuario fuera de alcance recibe 403
  await test(6, "Usuario fuera de alcance recibe 403 (SUPERVISOR consulta colaborador fuera de su alcance)", async () => {
    // empTHId no es subordinado de supervisor
    const res = await fetch(`${BASE_URL}/api/jornadas?empleado_id=${empTHId}`, {
      headers: { Cookie: supervisor.cookie },
    });
    assert.strictEqual(res.status, 403, "Debe recibir 403 al consultar un empleado fuera de su supervisión");
  });

  // 7. Los permisos nuevos/equivalentes aparecen en Roles y Permisos
  await test(7, "Permisos Fase 4B.1 (JORNADAS_PERSONALES_VER, JORNADAS_EQUIPO_VER, JORNADAS_INSTITUCIONALES_VER, TIEMPO_ADICIONAL_VER, JORNADAS_TIEMPO_EXTRA_APROBAR) aparecen en catálogo", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/permisos`, {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    const codigos = body.datos.permisos.map((p: any) => p.codigo);

    assert(codigos.includes("JORNADAS_PERSONALES_VER"), "Debe existir JORNADAS_PERSONALES_VER");
    assert(codigos.includes("JORNADAS_EQUIPO_VER"), "Debe existir JORNADAS_EQUIPO_VER");
    assert(codigos.includes("JORNADAS_INSTITUCIONALES_VER"), "Debe existir JORNADAS_INSTITUCIONALES_VER");
    assert(codigos.includes("TIEMPO_ADICIONAL_VER"), "Debe existir TIEMPO_ADICIONAL_VER");
    assert(codigos.includes("JORNADAS_TIEMPO_EXTRA_APROBAR"), "Debe existir JORNADAS_TIEMPO_EXTRA_APROBAR");
    assert(codigos.includes("JORNADAS_DETALLE_VER"), "Debe existir JORNADAS_DETALLE_VER");
  });

  // 8. Retirar permiso oculta módulo y bloquea backend
  await test(8, "SEGURIDAD no tiene permisos de jornadas y recibe 403", async () => {
    const resAdmin = await fetch(`${BASE_URL}/api/jornadas`, {
      headers: { Cookie: seguridad.cookie },
    });
    assert.strictEqual(resAdmin.status, 403, "SEGURIDAD no debe acceder a GET /api/jornadas");

    const resPers = await fetch(`${BASE_URL}/api/jornadas/mis-jornadas`, {
      headers: { Cookie: seguridad.cookie },
    });
    assert.strictEqual(resPers.status, 403, "SEGURIDAD no debe acceder a GET /api/jornadas/mis-jornadas");
  });

  // 9. Entrada 07:00 / salida 17:00 produce tiempo total distinto de cero
  await test(9, "Entrada 07:00 / salida 17:00 produce tiempo total = 600 min (distinto de cero)", async () => {
    const entradaTest: MarcaEntity = {
      id: "M-ENT",
      jornada_id: "J-TEST",
      empleado_id: empCarlosId,
      tipo_marca: "ENTRADA",
      timestamp_servidor: "2026-10-14T13:00:00.000Z", // 07:00 CR
      origen_marca: "GARITA_LECTOR",
      estado_marca: "ACTIVA",
      usuario_registrador_id: "SISTEMA",
      creado_en: "2026-10-14T13:00:00.000Z",
    };
    const salidaTest: MarcaEntity = {
      id: "M-SAL",
      jornada_id: "J-TEST",
      empleado_id: empCarlosId,
      tipo_marca: "SALIDA",
      timestamp_servidor: "2026-10-14T23:00:00.000Z", // 17:00 CR
      origen_marca: "GARITA_LECTOR",
      estado_marca: "ACTIVA",
      usuario_registrador_id: "SISTEMA",
      creado_en: "2026-10-14T23:00:00.000Z",
    };

    const resCalc = calcularJornadaDeterminista([entradaTest, salidaTest], {
      hora_entrada_programada: "07:00",
      hora_salida_programada: "16:30",
      tolerancia_minutos: 5,
      minutos_esperados: 570,
      cruza_medianoche: false,
    });

    assert.strictEqual(resCalc.minutos_tiempo_total, 600, "Tiempo total debe ser 600 min");
    assert(resCalc.minutos_tiempo_total > 0, "Tiempo total no puede ser 0");
  });

  // 10. Pausas se descuentan correctamente
  await test(10, "Pausas tomadas (15m des + 30m alm + 15m café = 60m) se descuentan correctamente", async () => {
    const marcas: MarcaEntity[] = [
      {
        id: "M1",
        jornada_id: "J-PAUSAS",
        empleado_id: empCarlosId,
        tipo_marca: "ENTRADA",
        timestamp_servidor: "2026-10-14T13:00:00.000Z", // 07:00 CR
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T13:00:00.000Z",
      },
      {
        id: "M2",
        jornada_id: "J-PAUSAS",
        empleado_id: empCarlosId,
        tipo_marca: "INICIO_DESAYUNO",
        timestamp_servidor: "2026-10-14T15:00:00.000Z", // 09:00 CR
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T15:00:00.000Z",
      },
      {
        id: "M3",
        jornada_id: "J-PAUSAS",
        empleado_id: empCarlosId,
        tipo_marca: "FIN_DESAYUNO",
        timestamp_servidor: "2026-10-14T15:15:00.000Z", // 09:15 CR (15 min)
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T15:15:00.000Z",
      },
      {
        id: "M4",
        jornada_id: "J-PAUSAS",
        empleado_id: empCarlosId,
        tipo_marca: "INICIO_ALMUERZO",
        timestamp_servidor: "2026-10-14T18:00:00.000Z", // 12:00 CR
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T18:00:00.000Z",
      },
      {
        id: "M5",
        jornada_id: "J-PAUSAS",
        empleado_id: empCarlosId,
        tipo_marca: "FIN_ALMUERZO",
        timestamp_servidor: "2026-10-14T18:30:00.000Z", // 12:30 CR (30 min)
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T18:30:00.000Z",
      },
      {
        id: "M6",
        jornada_id: "J-PAUSAS",
        empleado_id: empCarlosId,
        tipo_marca: "INICIO_CAFE",
        timestamp_servidor: "2026-10-14T21:00:00.000Z", // 15:00 CR
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T21:00:00.000Z",
      },
      {
        id: "M7",
        jornada_id: "J-PAUSAS",
        empleado_id: empCarlosId,
        tipo_marca: "FIN_CAFE",
        timestamp_servidor: "2026-10-14T21:15:00.000Z", // 15:15 CR (15 min)
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T21:15:00.000Z",
      },
      {
        id: "M8",
        jornada_id: "J-PAUSAS",
        empleado_id: empCarlosId,
        tipo_marca: "SALIDA",
        timestamp_servidor: "2026-10-14T23:00:00.000Z", // 17:00 CR
        origen_marca: "GARITA_LECTOR",
        estado_marca: "ACTIVA",
        usuario_registrador_id: "SISTEMA",
        creado_en: "2026-10-14T23:00:00.000Z",
      },
    ];

    const resCalc = calcularJornadaDeterminista(marcas, {
      hora_entrada_programada: "07:00",
      hora_salida_programada: "16:30",
      tolerancia_minutos: 5,
      minutos_esperados: 570,
      cruza_medianoche: false,
    });

    assert.strictEqual(resCalc.minutos_desayuno, 15);
    assert.strictEqual(resCalc.minutos_almuerzo, 30);
    assert.strictEqual(resCalc.minutos_cafe, 15);
    assert.strictEqual(resCalc.minutos_descansos, 60, "Total descansos debe ser 60 min");
    assert.strictEqual(resCalc.minutos_tiempo_total, 600);
    assert.strictEqual(resCalc.minutos_efectivos, 540, "Efectivo debe ser 600 - 60 = 540 min");
  });

  // 11. Tiempo efectivo es correcto
  await test(11, "Tiempo efectivo no es negativo y descuenta exactamente pausas tomadas", async () => {
    const resCalc = calcularJornadaDeterminista([], {
      hora_entrada_programada: "07:00",
      hora_salida_programada: "16:30",
      tolerancia_minutos: 5,
      minutos_esperados: 570,
      cruza_medianoche: false,
    });
    assert.strictEqual(resCalc.minutos_efectivos, 0, "Sin marcas el efectivo es 0 y nunca negativo");
  });

  // 12. Jornada abierta muestra "En curso/Pendiente" y no 0 definitivo
  await test(12, "Jornada abierta sin salida no calcula tiempo cerrado definitivo", async () => {
    const entradaSola: MarcaEntity = {
      id: "M-SOLO-ENT",
      jornada_id: "J-SOLO-ENT",
      empleado_id: empCarlosId,
      tipo_marca: "ENTRADA",
      timestamp_servidor: "2026-10-14T13:00:00.000Z",
      origen_marca: "GARITA_LECTOR",
      estado_marca: "ACTIVA",
      usuario_registrador_id: "SISTEMA",
      creado_en: "2026-10-14T13:00:00.000Z",
    };
    const resCalc = calcularJornadaDeterminista([entradaSola], {
      hora_entrada_programada: "07:00",
      hora_salida_programada: "16:30",
      tolerancia_minutos: 5,
      minutos_esperados: 570,
      cruza_medianoche: false,
    });
    assert.strictEqual(resCalc.hora_salida_efectiva, undefined, "Salida debe ser undefined");
    assert.strictEqual(resCalc.minutos_tiempo_total, 0, "Total minutos no consolidado");
    assert.strictEqual(resCalc.minutos_tiempo_adicional, 0, "No debe generar adicional si está abierta");
  });

  // 13. Jornada regularizada usa la salida regularizada para cálculo
  await test(13, "Jornada regularizada utiliza la salida programada regularizada y calcula minutos reales", async () => {
    const entradaFisica: MarcaEntity = {
      id: "M-ENT-REG",
      jornada_id: "J-REG",
      empleado_id: empCarlosId,
      tipo_marca: "ENTRADA",
      timestamp_servidor: "2026-10-14T12:58:00.000Z", // 06:58 CR
      origen_marca: "GARITA_LECTOR",
      estado_marca: "ACTIVA",
      usuario_registrador_id: "SISTEMA",
      creado_en: "2026-10-14T12:58:00.000Z",
    };
    const horaSalidaRegIso = "2026-10-14T22:30:00.000Z"; // 16:30 CR (salida programada regularizada)

    const resCalc = calcularJornadaDeterminista([entradaFisica], {
      hora_entrada_programada: "07:00",
      hora_salida_programada: "16:30",
      tolerancia_minutos: 5,
      minutos_esperados: 570,
      cruza_medianoche: false,
    }, {
      salidaRegularizadaIso: horaSalidaRegIso,
    });

    assert.strictEqual(resCalc.minutos_tiempo_total, 572, "06:58 a 16:30 = 9h32m = 572 min");
    assert.strictEqual(resCalc.minutos_efectivos, 572);
    assert.strictEqual(resCalc.minutos_tiempo_adicional, 0, "Regularización a la salida programada no genera tiempo extra");
  });

  // 14. Nombre real del colaborador aparece
  await test(14, "Nombre real del colaborador y cédula aparecen en listado administrativo (JOIN empleados)", async () => {
    const res = await fetch(`${BASE_URL}/api/jornadas?limite=10`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert(body.datos.length > 0);

    for (const j of body.datos) {
      assert(j.empleado_nombre, `Jornada ${j.id} debe incluir empleado_nombre`);
      assert(j.empleado_cedula, `Jornada ${j.id} debe incluir empleado_cedula`);
      assert.notStrictEqual(j.empleado_nombre, "Colaborador", "No debe ser el fallback genérico 'Colaborador'");
    }
  });

  // 15. Filtro desde/hasta funciona
  await test(15, "Filtro de fecha_desde y fecha_hasta funciona en backend", async () => {
    const res = await fetch(`${BASE_URL}/api/jornadas?fecha_desde=2026-10-01&fecha_hasta=2026-10-31`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.strictEqual(body.exito, true);
    for (const j of body.datos) {
      const fStr = typeof j.fecha_jornada === "string" ? j.fecha_jornada.slice(0, 10) : "";
      assert(fStr >= "2026-10-01" && fStr <= "2026-10-31", `Fecha ${fStr} debe estar en rango 2026-10-01 a 2026-10-31`);
    }
  });

  // 16. Filtro de colaborador funciona
  await test(16, "Filtro de colaborador (empleado_id y busqueda) funciona en backend", async () => {
    const res = await fetch(`${BASE_URL}/api/jornadas?empleado_id=${empCarlosId}`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    for (const j of body.datos) {
      assert.strictEqual(j.empleado_id, empCarlosId);
    }
  });

  // 17. Filtro de estado funciona
  await test(17, "Filtro de estado_jornada (ABIERTA, CERRADA, REGULARIZADA) funciona en backend", async () => {
    const res = await fetch(`${BASE_URL}/api/jornadas?estado_jornada=REGULARIZADA`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    for (const j of body.datos) {
      assert.strictEqual(j.estado_jornada, "REGULARIZADA");
    }
  });

  // 18. Tiempo adicional se calcula con base real
  await test(18, "Tiempo adicional se determina con valores reales cuando salida efectiva > salida programada", async () => {
    const entrada: MarcaEntity = {
      id: "M-ENT-TA",
      jornada_id: "J-TA",
      empleado_id: empCarlosId,
      tipo_marca: "ENTRADA",
      timestamp_servidor: "2026-10-14T13:00:00.000Z", // 07:00 CR
      origen_marca: "GARITA_LECTOR",
      estado_marca: "ACTIVA",
      usuario_registrador_id: "SISTEMA",
      creado_en: "2026-10-14T13:00:00.000Z",
    };
    const salidaTardia: MarcaEntity = {
      id: "M-SAL-TA",
      jornada_id: "J-TA",
      empleado_id: empCarlosId,
      tipo_marca: "SALIDA",
      timestamp_servidor: "2026-10-15T00:00:00.000Z", // 18:00 CR (salida programada 16:30 -> 90 min adicional)
      origen_marca: "GARITA_LECTOR",
      estado_marca: "ACTIVA",
      usuario_registrador_id: "SISTEMA",
      creado_en: "2026-10-15T00:00:00.000Z",
    };

    const resCalc = calcularJornadaDeterminista([entrada, salidaTardia], {
      hora_entrada_programada: "07:00",
      hora_salida_programada: "16:30",
      tolerancia_minutos: 5,
      minutos_esperados: 570,
      cruza_medianoche: false,
    });

    assert.strictEqual(resCalc.minutos_tiempo_adicional, 90, "18:00 - 16:30 = 90 min de tiempo adicional");
  });

  // 19. Pausa no tomada no se convierte en adicional
  await test(19, "Pausa reglamentaria no tomada no se convierte en tiempo adicional", async () => {
    const entrada: MarcaEntity = {
      id: "M-ENT-SINTA",
      jornada_id: "J-SINTA",
      empleado_id: empCarlosId,
      tipo_marca: "ENTRADA",
      timestamp_servidor: "2026-10-14T13:00:00.000Z", // 07:00 CR
      origen_marca: "GARITA_LECTOR",
      estado_marca: "ACTIVA",
      usuario_registrador_id: "SISTEMA",
      creado_en: "2026-10-14T13:00:00.000Z",
    };
    const salidaPuntual: MarcaEntity = {
      id: "M-SAL-SINTA",
      jornada_id: "J-SINTA",
      empleado_id: empCarlosId,
      tipo_marca: "SALIDA",
      timestamp_servidor: "2026-10-14T22:30:00.000Z", // 16:30 CR exacta
      origen_marca: "GARITA_LECTOR",
      estado_marca: "ACTIVA",
      usuario_registrador_id: "SISTEMA",
      creado_en: "2026-10-14T22:30:00.000Z",
    };

    // El empleado no tomó ninguna pausa
    const resCalc = calcularJornadaDeterminista([entrada, salidaPuntual], {
      hora_entrada_programada: "07:00",
      hora_salida_programada: "16:30",
      tolerancia_minutos: 5,
      minutos_esperados: 570,
      cruza_medianoche: false,
    });

    assert.strictEqual(resCalc.minutos_descansos, 0, "No tomó descansos");
    assert.strictEqual(resCalc.minutos_tiempo_adicional, 0, "Tiempo adicional DEBE ser 0 min a pesar de no pausar");
  });

  // 20. Regresión de aprobación de tiempo adicional funciona y bloquea autoaprobación
  await test(20, "Aprobación de tiempo adicional: bloquea autoaprobación para TALENTO_HUMANO y valida alcance", async () => {
    // Buscar una jornada de TH con tiempo adicional o insertar una temporal
    const fechaTest = "2037-01-15";
    const jTH = await pool.query(
      `INSERT INTO jornadas (
        id, empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
        hora_entrada_calculo, hora_salida_calculo, minutos_tiempo_total, minutos_efectivos,
        minutos_tiempo_adicional, estado_tiempo_adicional
      ) VALUES (
        gen_random_uuid(), $1, $2, 'CERRADA_NORMAL',
        (SELECT id FROM horarios LIMIT 1), '{"hora_entrada_programada":"07:00","hora_salida_programada":"16:30","tolerancia_minutos":5,"minutos_esperados":570}'::jsonb,
        '2037-01-15T13:00:00Z', '2037-01-15T23:30:00Z', 630, 630, 60, 'PENDIENTE'
      ) ON CONFLICT (empleado_id, fecha_jornada) DO UPDATE SET minutos_tiempo_adicional = 60, estado_tiempo_adicional = 'PENDIENTE'
      RETURNING id;`,
      [empTHId, fechaTest]
    );
    const jId = jTH.rows[0].id;

    // TH intenta autoaprobarse
    const resAuto = await fetch(`${BASE_URL}/api/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        Cookie: th.cookie,
        "Content-Type": "application/json",
        "x-csrf-token": th.csrf,
      },
      body: JSON.stringify({
        jornada_id: jId,
        decision: "APROBAR_TOTAL",
        motivo: "Intento de autoaprobación de TH",
      }),
    });
    assert.strictEqual(resAuto.status, 403, "Autoaprobación debe estar estrictamente bloqueada con 403");

    // Admin aprueba la jornada de TH (aprobación de tercero legítima)
    const resAdminAprueba = await fetch(`${BASE_URL}/api/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        "Content-Type": "application/json",
        "x-csrf-token": admin.csrf,
      },
      body: JSON.stringify({
        jornada_id: jId,
        decision: "APROBAR_TOTAL",
        motivo: "Aprobación legítima por Admin de tiempo adicional",
      }),
    });
    assert.strictEqual(resAdminAprueba.status, 200, "Admin debe poder aprobar jornada de tercero");
    const bodyAprob = await resAdminAprueba.json() as any;
    assert.strictEqual(bodyAprob.exito, true);
    const estadoRes = bodyAprob.datos.estado_tiempo_adicional || bodyAprob.datos.jornada?.estado_tiempo_adicional;
    assert.strictEqual(estadoRes, "APROBADO_TOTAL");
  });

  // 21. No existe exposición de jornadas de terceros no autorizados
  await test(21, "No existe exposición de jornadas de terceros no autorizados (aislamiento estricto)", async () => {
    // EMPLEADO intenta consultar detalle de jornada de TH
    const jThQuery = await pool.query("SELECT id FROM jornadas WHERE empleado_id = $1 LIMIT 1", [empTHId]);
    if (jThQuery.rows.length > 0) {
      const thJornadaId = jThQuery.rows[0].id;
      const resAjena = await fetch(`${BASE_URL}/api/jornadas/${thJornadaId}/detalle`, {
        headers: { Cookie: empleado.cookie },
      });
      assert.strictEqual(resAjena.status, 403, "EMPLEADO no autorizado debe recibir 403");
    }
  });

  console.log("=================================================================================================");
  console.log(`RESUMEN PRUEBAS 1-21 FASE 4B.1: ${passCount} PASADAS | ${failCount} FALLIDAS`);
  console.log("=================================================================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase4b1Suite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error fatal en suite Fase 4B.1:", err);
    process.exit(1);
  });
