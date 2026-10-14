import assert from "node:assert";

const BASE_URL = "http://127.0.0.1:3000";

async function loginUser(username: string, pass: string) {
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

import { getPool } from "../../db/index.js";

async function findUnusedWeekday(empleadoId: string, startDateStr: string = "2026-11-30"): Promise<string> {
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

async function runHotfixTests() {
  console.log("===============================================================");
  console.log("EJECUTANDO SUITE DIRIGIDA: HOTFIX SINCRONIZACIÓN GARITA & RAG");
  console.log("===============================================================");

  // 1. Logins requeridos
  const seg = await loginUser("seguridad", "PassSegura_2026!*");
  const emp = await loginUser("empleado", "PassSegura_2026!*");
  const admin = await loginUser("admin", "PassSegura_2026!*");

  console.log("✓ Logins exitosos (seguridad, empleado, admin)");

  // 2. Validar GET /api/rag/estado
  console.log("\n--- VALIDACIÓN 1: GET /api/rag/estado ---");
  const ragEstadoRes = await fetch(`${BASE_URL}/api/rag/estado`, {
    headers: {
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
    },
  });
  assert.strictEqual(ragEstadoRes.status, 200);
  const ragEstado = await ragEstadoRes.json();
  assert.strictEqual(ragEstado.exito, true);
  assert.ok(ragEstado.datos.documentos_activos_total >= 1, "Debe haber al menos 1 documento activo");
  assert.ok(ragEstado.datos.fragmentos_indexados >= 25, "Debe haber al menos 25 fragmentos indexados");
  assert.ok(Array.isArray(ragEstado.datos.documentos), "Debe incluir array de documentos");
  assert.ok(ragEstado.datos.documentos.length >= 1);
  console.log(`✓ RAG Estado: ${ragEstado.datos.documentos_activos_total} docs activos, ${ragEstado.datos.fragmentos_indexados} fragmentos`);

  // 3. Validar citas reales de documentos en POST /api/rag/consultar
  console.log("\n--- VALIDACIÓN 2: Citas documentales en RAG ---");
  const acosoRes = await fetch(`${BASE_URL}/api/rag/consultar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
    },
    body: JSON.stringify({ pregunta: "¿Cuál es el procedimiento ante acoso laboral u hostigamiento sexual?" }),
  });
  assert.strictEqual(acosoRes.status, 200);
  const acosoBody = await acosoRes.json();
  assert.strictEqual(acosoBody.exito, true);
  assert.ok(acosoBody.datos.fuentes.length > 0, "Debe recuperar fuentes");
  const codigosAcoso = acosoBody.datos.fuentes.map((f: any) => f.codigo);
  assert.ok(
    codigosAcoso.includes("DTH-REG-001"),
    `La consulta de acoso debe citar DTH-REG-001 (obtenido: ${codigosAcoso.join(", ")})`
  );
  console.log(`✓ Consulta acoso cita correctamente ${codigosAcoso.join(", ")}`);

  // 4. Validar Cache-Control en Garita y Autoservicio
  console.log("\n--- VALIDACIÓN 3: Headers Cache-Control no-store ---");
  const garitaBuscarHeaders = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
    headers: {
      "X-Session-Id": seg.sid,
      Cookie: `sid=${seg.sid}`,
    },
  });
  const ccGarita = garitaBuscarHeaders.headers.get("cache-control") || "";
  assert.ok(ccGarita.includes("no-store"), `Cache-Control de garita debe tener no-store (obtenido: ${ccGarita})`);

  const autoEstadoHeaders = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
    headers: {
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
    },
  });
  const ccAuto = autoEstadoHeaders.headers.get("cache-control") || "";
  assert.ok(ccAuto.includes("no-store"), `Cache-Control de autoservicio debe tener no-store (obtenido: ${ccAuto})`);
  console.log("✓ Headers Cache-Control no-store confirmados en Garita y Autoservicio");

  // 5. Validar ciclo de sincronización Garita <-> Autoservicio en fecha de prueba aislada
  console.log("\n--- VALIDACIÓN 4: Sincronización cruzada Garita <-> Autoservicio ---");
  const empIdCarlos = "33333333-3333-4333-8333-333333333305"; // DEMO-1005
  const testFecha = await findUnusedWeekday(empIdCarlos, "2026-11-30");
  console.log(`Usando fecha aislada: ${testFecha}`);

  // 5.1 Estado inicial en Garita para la fecha
  const simT0 = `${testFecha}T07:00:00.000-06:00`;
  const g0Res = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
    headers: {
      "X-Session-Id": seg.sid,
      Cookie: `sid=${seg.sid}`,
      "x-test-simulated-timestamp": simT0,
    },
  });
  const g0 = await g0Res.json();
  assert.ok(g0.datos.acciones_validas.includes("ENTRADA"), "Debe permitir ENTRADA al inicio");

  // 5.2 Registrar ENTRADA desde Garita
  const postEntradaRes = await fetch(`${BASE_URL}/api/garita/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": seg.sid,
      Cookie: `sid=${seg.sid}`,
      "x-csrf-token": seg.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "x-test-simulated-timestamp": simT0,
    },
    body: JSON.stringify({
      empleado_id: empIdCarlos,
      tipo_marca: "ENTRADA",
    }),
  });
  assert.strictEqual(postEntradaRes.status, 201);
  console.log("✓ Paso 1: ENTRADA registrada en Garita");

  // 5.3 Consultar en Autoservicio: Debe reflejar inmediatamente JORNADA ABIERTA y última marca ENTRADA
  const auto1Res = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
    headers: {
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "x-test-simulated-timestamp": `${testFecha}T07:05:00.000-06:00`,
    },
  });
  const auto1 = await auto1Res.json();
  assert.strictEqual(auto1.datos.jornada_actual.estado_jornada, "ABIERTA");
  assert.strictEqual(auto1.datos.ultima_marca.tipo_marca, "ENTRADA");
  assert.ok(auto1.datos.acciones_validas.includes("INICIO_CAFE"));
  console.log("✓ Paso 2: Autoservicio refleja inmediatamente ENTRADA y JORNADA ABIERTA");

  // 5.4 Registrar INICIO_CAFE desde Autoservicio (Caso A del enunciado)
  const simCafe = `${testFecha}T09:30:00.000-06:00`;
  const postCafeRes = await fetch(`${BASE_URL}/api/autoservicio/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "x-csrf-token": emp.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "x-test-simulated-timestamp": simCafe,
    },
    body: JSON.stringify({ tipo_marca: "INICIO_CAFE" }),
  });
  assert.strictEqual(postCafeRes.status, 201);
  console.log("✓ Paso 3: INICIO_CAFE registrado en Autoservicio");

  // 5.5 Consultar en Garita: Debe mostrar ÚNICAMENTE 'FIN_CAFE' (Caso A cumplido)
  const gCafeRes = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
    headers: {
      "X-Session-Id": seg.sid,
      Cookie: `sid=${seg.sid}`,
      "x-test-simulated-timestamp": `${testFecha}T09:35:00.000-06:00`,
    },
  });
  const gCafe = await gCafeRes.json();
  assert.strictEqual(gCafe.datos.ultima_marca.tipo_marca, "INICIO_CAFE");
  assert.deepStrictEqual(
    gCafe.datos.acciones_validas,
    ["FIN_CAFE"],
    `Garita debe permitir únicamente FIN_CAFE durante pausa de café (obtenido: ${gCafe.datos.acciones_validas.join(", ")})`
  );
  console.log("✓ Paso 4 (Caso A): Garita refleja pausa activa y muestra ÚNICAMENTE 'FIN_CAFE'");

  // 5.6 Registrar FIN_CAFE desde Garita (Caso B)
  const simFinCafe = `${testFecha}T09:45:00.000-06:00`;
  const postFinCafeRes = await fetch(`${BASE_URL}/api/garita/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": seg.sid,
      Cookie: `sid=${seg.sid}`,
      "x-csrf-token": seg.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "x-test-simulated-timestamp": simFinCafe,
    },
    body: JSON.stringify({
      empleado_id: empIdCarlos,
      tipo_marca: "FIN_CAFE",
    }),
  });
  assert.strictEqual(postFinCafeRes.status, 201);
  console.log("✓ Paso 5: FIN_CAFE registrado desde Garita");

  // 5.7 Consultar en Autoservicio: Debe reflejar FIN_CAFE y permitir SALIDA
  const autoFinCafeRes = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
    headers: {
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "x-test-simulated-timestamp": `${testFecha}T10:00:00.000-06:00`,
    },
  });
  const autoFinCafe = await autoFinCafeRes.json();
  assert.strictEqual(autoFinCafe.datos.ultima_marca.tipo_marca, "FIN_CAFE");
  assert.ok(autoFinCafe.datos.acciones_validas.includes("SALIDA"));
  console.log("✓ Paso 6 (Caso B): Autoservicio refleja FIN_CAFE y permite SALIDA");

  // 5.8 Registrar SALIDA desde Garita (Caso C)
  const simSalida = `${testFecha}T16:00:00.000-06:00`;
  const postSalidaRes = await fetch(`${BASE_URL}/api/garita/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": seg.sid,
      Cookie: `sid=${seg.sid}`,
      "x-csrf-token": seg.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "x-test-simulated-timestamp": simSalida,
    },
    body: JSON.stringify({
      empleado_id: empIdCarlos,
      tipo_marca: "SALIDA",
    }),
  });
  assert.strictEqual(postSalidaRes.status, 201);
  const salidaBody = await postSalidaRes.json();
  assert.strictEqual(salidaBody.datos.jornada.estado_jornada, "CERRADA_NORMAL");
  console.log("✓ Paso 7 (Caso C): SALIDA registrada en Garita, jornada pasa a CERRADA_NORMAL");

  // 5.9 Consultar Autoservicio: Debe mostrar jornada CERRADA_NORMAL, última marca SALIDA, acciones=[]
  const autoCerradaRes = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
    headers: {
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "x-test-simulated-timestamp": `${testFecha}T16:05:00.000-06:00`,
    },
  });
  const autoCerrada = await autoCerradaRes.json();
  assert.strictEqual(autoCerrada.datos.jornada_actual.estado_jornada, "CERRADA_NORMAL");
  assert.strictEqual(autoCerrada.datos.ultima_marca.tipo_marca, "SALIDA");
  assert.deepStrictEqual(autoCerrada.datos.acciones_validas, [], "No deben quedar acciones operativas");
  console.log("✓ Paso 8: Autoservicio refleja jornada cerrada por salida de Garita sin acciones operativas");

  // 5.10 Consultar Garita de nuevo: Debe mostrar jornada CERRADA_NORMAL, última marca SALIDA, acciones=[] (Caso D)
  const gCerradaRes = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
    headers: {
      "X-Session-Id": seg.sid,
      Cookie: `sid=${seg.sid}`,
      "x-test-simulated-timestamp": `${testFecha}T16:10:00.000-06:00`,
    },
  });
  const gCerrada = await gCerradaRes.json();
  assert.strictEqual(gCerrada.datos.jornada_actual.estado_jornada, "CERRADA_NORMAL");
  assert.strictEqual(gCerrada.datos.jornada_abierta, null);
  assert.strictEqual(gCerrada.datos.ultima_marca.tipo_marca, "SALIDA");
  assert.deepStrictEqual(gCerrada.datos.acciones_validas, [], "No deben quedar acciones operativas en Garita");
  console.log("✓ Paso 9 (Caso D): Garita refleja jornada cerrada, última marca SALIDA y acciones=[]");

  // 5.11 Protección Backend: Intentar registrar segunda SALIDA o marca sobre jornada cerrada debe ser rechazada
  const intentoSegundaSalida = await fetch(`${BASE_URL}/api/garita/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": seg.sid,
      Cookie: `sid=${seg.sid}`,
      "x-csrf-token": seg.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "x-test-simulated-timestamp": `${testFecha}T16:15:00.000-06:00`,
    },
    body: JSON.stringify({
      empleado_id: empIdCarlos,
      tipo_marca: "SALIDA",
    }),
  });
  assert.ok(
    intentoSegundaSalida.status >= 400,
    `Segunda salida debe ser rechazada con código 4xx (obtenido: ${intentoSegundaSalida.status})`
  );
  const errBody = await intentoSegundaSalida.json();
  console.log(`✓ Paso 10: Intento de segunda salida rechazado correctamente (${intentoSegundaSalida.status} ${errBody.codigo})`);

  // 5.12 Salida desde Autoservicio y consulta desde Garita (Caso D bidireccional)
  console.log("\n--- VALIDACIÓN 5: Salida desde Autoservicio -> Consulta en Garita ---");
  const testFecha2 = await findUnusedWeekday(empIdCarlos, "2026-12-07");
  console.log(`Usando segunda fecha aislada: ${testFecha2}`);
  // Registrar ENTRADA desde Autoservicio
  await fetch(`${BASE_URL}/api/autoservicio/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "x-csrf-token": emp.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "x-test-simulated-timestamp": `${testFecha2}T07:00:00.000-06:00`,
    },
    body: JSON.stringify({ tipo_marca: "ENTRADA" }),
  });
  // Registrar SALIDA desde Autoservicio
  const salidaAutoRes = await fetch(`${BASE_URL}/api/autoservicio/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "x-csrf-token": emp.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "x-test-simulated-timestamp": `${testFecha2}T16:00:00.000-06:00`,
    },
    body: JSON.stringify({ tipo_marca: "SALIDA" }),
  });
  assert.strictEqual(salidaAutoRes.status, 201);
  const salidaAutoBody = await salidaAutoRes.json();
  assert.strictEqual(salidaAutoBody.datos.jornada.estado_jornada, "CERRADA_NORMAL");

  // Consultar en Garita: Debe mostrar CERRADA_NORMAL, última marca SALIDA, acciones=[]
  const garitaAutoRes = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
    headers: {
      "X-Session-Id": seg.sid,
      Cookie: `sid=${seg.sid}`,
      "x-test-simulated-timestamp": `${testFecha2}T16:05:00.000-06:00`,
    },
  });
  const garitaAuto = await garitaAutoRes.json();
  assert.strictEqual(garitaAuto.datos.jornada_actual.estado_jornada, "CERRADA_NORMAL");
  assert.strictEqual(garitaAuto.datos.jornada_abierta, null);
  assert.strictEqual(garitaAuto.datos.ultima_marca.tipo_marca, "SALIDA");
  assert.deepStrictEqual(garitaAuto.datos.acciones_validas, [], "Garita no debe tener acciones tras cierre en Autoservicio");
  console.log("✓ Paso 11: Salida registrada en Autoservicio se refleja inmediatamente cerrada en Garita sin acciones operativas");

  console.log("\n===============================================================");
  console.log("TODAS LAS VALIDACIONES DEL HOTFIX PASARON SATISFACTORIAMENTE!");
  console.log("===============================================================");
}

runHotfixTests().then(() => process.exit(0)).catch((err) => {
  console.error("ERROR EN PRUEBAS DIRIGIDAS:", err);
  process.exit(1);
});
