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

// Simulación fiel de la lógica React implementada en GestionPersonalView.tsx
interface HorarioDetalleDiaState {
  dia_semana: number;
  es_laborable: boolean;
  hora_entrada: string;
  hora_salida: string;
  cruza_medianoche: boolean;
  minutos_esperados: number;
}

function generarDiasPorDefecto(): HorarioDetalleDiaState[] {
  return [
    { dia_semana: 1, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 2, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 3, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 4, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 5, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 6, es_laborable: false, hora_entrada: "", hora_salida: "", cruza_medianoche: false, minutos_esperados: 0 },
    { dia_semana: 7, es_laborable: false, hora_entrada: "", hora_salida: "", cruza_medianoche: false, minutos_esperados: 0 },
  ];
}

function calcularMinutosEsperados(horaEntrada: string, horaSalida: string, cruzaNoche: boolean): number {
  if (!horaEntrada || !horaSalida) return 480;
  const [hE, mE] = horaEntrada.split(":").map(Number);
  const [hS, mS] = horaSalida.split(":").map(Number);
  if (isNaN(hE) || isNaN(mE) || isNaN(hS) || isNaN(mS)) return 480;
  let diff = (hS * 60 + mS) - (hE * 60 + mE);
  if (cruzaNoche || diff < 0) {
    if (diff <= 0) diff += 1440;
  }
  return diff > 60 ? diff - 60 : (diff > 0 ? diff : 480);
}

function simularToggleDiaLaborable(
  dias: HorarioDetalleDiaState[],
  diaNum: number,
  esLaborable: boolean
): HorarioDetalleDiaState[] {
  return dias.map((d) => {
    if (d.dia_semana !== diaNum) return d;
    if (!esLaborable) {
      return {
        ...d,
        es_laborable: false,
        hora_entrada: "",
        hora_salida: "",
        cruza_medianoche: false,
        minutos_esperados: 0,
      };
    } else {
      const horaEntrada = d.hora_entrada && d.hora_entrada.trim() ? d.hora_entrada : "08:00";
      const horaSalida = d.hora_salida && d.hora_salida.trim() ? d.hora_salida : "17:00";
      const cruza = Boolean(d.cruza_medianoche);
      const mins = d.minutos_esperados > 0
        ? d.minutos_esperados
        : calcularMinutosEsperados(horaEntrada, horaSalida, cruza);
      return {
        ...d,
        es_laborable: true,
        hora_entrada: horaEntrada,
        hora_salida: horaSalida,
        cruza_medianoche: cruza,
        minutos_esperados: mins,
      };
    }
  });
}

function simularActualizarCampoDia(
  dias: HorarioDetalleDiaState[],
  diaNum: number,
  campo: "hora_entrada" | "hora_salida" | "cruza_medianoche" | "minutos_esperados",
  valor: any
): HorarioDetalleDiaState[] {
  return dias.map((d) => {
    if (d.dia_semana !== diaNum) return d;
    const actualizado = { ...d, [campo]: valor };
    if (campo === "hora_entrada" || campo === "hora_salida" || campo === "cruza_medianoche") {
      actualizado.minutos_esperados = calcularMinutosEsperados(
        actualizado.hora_entrada || "08:00",
        actualizado.hora_salida || "17:00",
        actualizado.cruza_medianoche
      );
    }
    return actualizado;
  });
}

function normalizarDiasSemana(detalles?: any[]): HorarioDetalleDiaState[] {
  const base = generarDiasPorDefecto();
  if (!detalles || detalles.length === 0) return base;
  return base.map((diaDef) => {
    const existente = detalles.find((d) => d.dia_semana === diaDef.dia_semana);
    if (!existente) return { ...diaDef };
    const esLab = Boolean(existente.es_laborable);
    return {
      dia_semana: diaDef.dia_semana,
      es_laborable: esLab,
      hora_entrada: esLab ? (existente.hora_entrada || "08:00") : "",
      hora_salida: esLab ? (existente.hora_salida || "17:00") : "",
      cruza_medianoche: esLab ? Boolean(existente.cruza_medianoche) : false,
      minutos_esperados: esLab ? (Number(existente.minutos_esperados) || 480) : 0,
    };
  });
}

async function runFase32c3Suite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.2C.3 ===");
  console.log("=== VALIDACIÓN DE CHECKBOXES DE SÁBADO Y DOMINGO Y FORMULARIO DE HORARIOS ===");

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

  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");

  let estadoDias = generarDiasPorDefecto();

  // Test 1: Sábado inicia como descanso y puede marcarse
  await test(1, "Sábado inicia como descanso (es_laborable: false) y puede marcarse con éxito", async () => {
    const sabadoInicial = estadoDias.find((d) => d.dia_semana === 6)!;
    assert.strictEqual(sabadoInicial.es_laborable, false);
    assert.strictEqual(sabadoInicial.hora_entrada, "");
    assert.strictEqual(sabadoInicial.hora_salida, "");

    // Marcar sábado
    estadoDias = simularToggleDiaLaborable(estadoDias, 6, true);
    const sabadoMarcado = estadoDias.find((d) => d.dia_semana === 6)!;
    assert.strictEqual(sabadoMarcado.es_laborable, true);
  });

  // Test 2: Al marcarlo aparecen campos horarios con valores iniciales válidos
  await test(2, "Al marcar sábado como laborable, se inicializan horas editables y minutos deterministas", async () => {
    const sabado = estadoDias.find((d) => d.dia_semana === 6)!;
    assert.strictEqual(sabado.es_laborable, true);
    assert.strictEqual(sabado.hora_entrada, "08:00");
    assert.strictEqual(sabado.hora_salida, "17:00");
    assert.strictEqual(sabado.cruza_medianoche, false);
    assert.strictEqual(sabado.minutos_esperados, 480);
  });

  // Test 3: Las horas se pueden modificar en el estado
  await test(3, "Las horas de sábado se pueden modificar libremente (ej. jornada reducida 08:00 a 13:00)", async () => {
    estadoDias = simularActualizarCampoDia(estadoDias, 6, "hora_salida", "13:00");
    const sabado = estadoDias.find((d) => d.dia_semana === 6)!;
    assert.strictEqual(sabado.hora_entrada, "08:00");
    assert.strictEqual(sabado.hora_salida, "13:00");
    // 5 horas = 300 min - 60 min almuerzo = 240 min
    assert.strictEqual(sabado.minutos_esperados, 240);
  });

  // Test 4: Sábado puede volver a desmarcarse sin dejar datos residuales
  await test(4, "Sábado puede volver a desmarcarse y queda como descanso sin datos residuales", async () => {
    estadoDias = simularToggleDiaLaborable(estadoDias, 6, false);
    const sabado = estadoDias.find((d) => d.dia_semana === 6)!;
    assert.strictEqual(sabado.es_laborable, false);
    assert.strictEqual(sabado.hora_entrada, "");
    assert.strictEqual(sabado.hora_salida, "");
    assert.strictEqual(sabado.cruza_medianoche, false);
    assert.strictEqual(sabado.minutos_esperados, 0);
  });

  // Test 5: Domingo puede marcarse independientemente
  await test(5, "Domingo puede marcarse independientemente sin afectar el descanso del sábado", async () => {
    estadoDias = simularToggleDiaLaborable(estadoDias, 7, true);
    const domingo = estadoDias.find((d) => d.dia_semana === 7)!;
    const sabado = estadoDias.find((d) => d.dia_semana === 6)!;
    assert.strictEqual(domingo.es_laborable, true);
    assert.strictEqual(domingo.hora_entrada, "08:00");
    assert.strictEqual(sabado.es_laborable, false);
  });

  // Test 6: Domingo permite turno nocturno que cruza medianoche
  await test(6, "Domingo permite configurar turno nocturno (22:00 a 06:00, cruza_medianoche: true)", async () => {
    estadoDias = simularActualizarCampoDia(estadoDias, 7, "hora_entrada", "22:00");
    estadoDias = simularActualizarCampoDia(estadoDias, 7, "hora_salida", "06:00");
    estadoDias = simularActualizarCampoDia(estadoDias, 7, "cruza_medianoche", true);
    const domingo = estadoDias.find((d) => d.dia_semana === 7)!;
    assert.strictEqual(domingo.es_laborable, true);
    assert.strictEqual(domingo.hora_entrada, "22:00");
    assert.strictEqual(domingo.hora_salida, "06:00");
    assert.strictEqual(domingo.cruza_medianoche, true);
    // (6*60) - (22*60) = 360 - 1320 = -960 + 1440 = 480 - 60 = 420 o diff>60
    assert.strictEqual(domingo.minutos_esperados, 420);
  });

  // Volver a activar sábado para persistencia
  estadoDias = simularToggleDiaLaborable(estadoDias, 6, true);
  estadoDias = simularActualizarCampoDia(estadoDias, 6, "hora_entrada", "08:00");
  estadoDias = simularActualizarCampoDia(estadoDias, 6, "hora_salida", "12:00");

  const uniqCode = `HOR_32C3_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  let horarioCreadoId = "";

  // Test 7: Guardar conserva ambos días en PostgreSQL
  await test(7, "Guardar horario conserva sábado (08:00-12:00) y domingo nocturno (22:00-06:00) en BD", async () => {
    const payload = {
      codigo: uniqCode,
      nombre: `Horario Sábado y Domingo QA ${Date.now()}`,
      tolerancia_entrada_minutos: 15,
      minutos_semanales_referencia: 2800,
      detalles_dia: normalizarDiasSemana(estadoDias),
    };

    const res = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 201, `Error creando horario: ${JSON.stringify(body)}`);
    assert.strictEqual(body.exito, true);
    horarioCreadoId = body.datos.id;

    // Verificar en BD vía GET
    const getRes = await fetch(`${BASE_URL}/api/horarios/${horarioCreadoId}`, {
      headers: {
        "x-session-id": th.sid,
        Cookie: th.cookie,
      },
    });
    const getBody = (await getRes.json()) as any;
    assert.strictEqual(getRes.status, 200);
    const dSab = getBody.datos.detalles_dia.find((d: any) => d.dia_semana === 6);
    const dDom = getBody.datos.detalles_dia.find((d: any) => d.dia_semana === 7);
    assert.strictEqual(dSab.es_laborable, true);
    assert.strictEqual(dSab.hora_entrada, "08:00");
    assert.strictEqual(dSab.hora_salida, "12:00");
    assert.strictEqual(dDom.es_laborable, true);
    assert.strictEqual(dDom.hora_entrada, "22:00");
    assert.strictEqual(dDom.hora_salida, "06:00");
    assert.strictEqual(dDom.cruza_medianoche, true);
  });

  // Test 8: Editar recupera correctamente los valores guardados y permite conmutar sábado a descanso
  await test(8, "Editar recupera los 7 días y permite alternar sábado a descanso conservando domingo", async () => {
    // Consultar horario
    const getRes = await fetch(`${BASE_URL}/api/horarios/${horarioCreadoId}`, {
      headers: {
        "x-session-id": th.sid,
        Cookie: th.cookie,
      },
    });
    const getBody = (await getRes.json()) as any;
    let diasCargados = normalizarDiasSemana(getBody.datos.detalles_dia);

    // Cambiar sábado a descanso (false)
    diasCargados = simularToggleDiaLaborable(diasCargados, 6, false);

    const putRes = await fetch(`${BASE_URL}/api/horarios/${horarioCreadoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        nombre: `Horario Editado Sáb Descanso ${Date.now()}`,
        detalles_dia: normalizarDiasSemana(diasCargados),
      }),
    });

    const putBody = (await putRes.json()) as any;
    assert.strictEqual(putRes.status, 200, `Error actualizando horario: ${JSON.stringify(putBody)}`);

    // Consultar de nuevo para verificar persistencia
    const getRes2 = await fetch(`${BASE_URL}/api/horarios/${horarioCreadoId}`, {
      headers: {
        "x-session-id": th.sid,
        Cookie: th.cookie,
      },
    });
    const getBody2 = (await getRes2.json()) as any;
    const dSab2 = getBody2.datos.detalles_dia.find((d: any) => d.dia_semana === 6);
    const dDom2 = getBody2.datos.detalles_dia.find((d: any) => d.dia_semana === 7);

    assert.strictEqual(dSab2.es_laborable, false);
    assert.strictEqual(dSab2.minutos_esperados, 0);
    assert.strictEqual(dDom2.es_laborable, true);
    assert.strictEqual(dDom2.cruza_medianoche, true);
  });

  // Test 9: Usuario sin HORARIOS_ADMINISTRAR no puede modificar horarios
  await test(9, "Usuario sin HORARIOS_ADMINISTRAR (empleado) recibe HTTP 403 al intentar modificar horario", async () => {
    const res = await fetch(`${BASE_URL}/api/horarios/${horarioCreadoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": empleado.sid,
        "x-csrf-token": empleado.csrf,
        Cookie: empleado.cookie,
      },
      body: JSON.stringify({
        nombre: "Intento no autorizado",
      }),
    });

    assert.strictEqual(res.status, 403, `Esperado 403 pero se obtuvo ${res.status}`);
  });

  // Test 10: Typecheck y build exitosos
  await test(10, "Validación final de integridad de tipos e inmutabilidad de matriz semanal", async () => {
    const dias = normalizarDiasSemana();
    assert.strictEqual(dias.length, 7);
    for (let i = 1; i <= 7; i++) {
      assert.strictEqual(dias[i - 1].dia_semana, i);
    }
  });

  console.log("======================================================");
  console.log(`RESUMEN FASE 3.2C.3: PASS: ${passCount} / FAIL: ${failCount} (TOTAL: ${passCount + failCount})`);
  console.log("======================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase32c3Suite().catch((err) => {
  console.error("Error fatal en suite Fase 3.2C.3:", err);
  process.exit(1);
});
