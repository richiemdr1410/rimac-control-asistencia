import assert from "node:assert";

const BASE_URL = "http://127.0.0.1:3000";

async function loginUser(username: string, pass: string) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador: username, password: pass }),
  });
  const body = (await res.json()) as any;
  assert.strictEqual(res.status, 200);
  const rawCookie = res.headers.get("set-cookie") || "";
  const match = rawCookie.match(/sid=([^;]+)/);
  return {
    sid: match ? match[1] : body.datos.sesion_id,
    csrf: body.datos.token_csrf || body.datos.csrf_token,
    usuario: body.datos.usuario,
  };
}

async function testCicloCompleto() {
  console.log("=== INICIO PRUEBA CICLO COMPLETO DE JORNADA EMPLEADO ===");

  // Iniciar sesión con empleado (Carlos Alvarado)
  const emp = await loginUser("empleado", "PassSegura_2026!*");

  // Secuencia de marcas completa ordenada con timestamps crecientes
  const secuencia = [
    { tipo: "ENTRADA", simTime: "2026-10-05T07:00:00.000-06:00" },
    { tipo: "INICIO_DESAYUNO", simTime: "2026-10-05T09:00:00.000-06:00" },
    { tipo: "FIN_DESAYUNO", simTime: "2026-10-05T09:15:00.000-06:00" },
    { tipo: "INICIO_ALMUERZO", simTime: "2026-10-05T12:00:00.000-06:00" },
    { tipo: "FIN_ALMUERZO", simTime: "2026-10-05T12:30:00.000-06:00" },
    { tipo: "INICIO_CAFE", simTime: "2026-10-05T15:00:00.000-06:00" },
    { tipo: "FIN_CAFE", simTime: "2026-10-05T15:15:00.000-06:00" },
    { tipo: "SALIDA", simTime: "2026-10-05T16:30:00.000-06:00" },
  ];

  for (const paso of secuencia) {
    // 1. Consultar estado y verificar que el paso sea una acción válida
    const estRes = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "X-Session-Id": emp.sid,
        Cookie: `sid=${emp.sid}`,
        Accept: "application/json",
      },
    });
    const est = (await estRes.json()) as any;
    assert.strictEqual(estRes.status, 200);
    assert.ok(
      est.datos.acciones_validas.includes(paso.tipo),
      `Acción ${paso.tipo} debe estar en acciones_validas: [${est.datos.acciones_validas.join(", ")}]`
    );

    // 2. Registrar marca
    const regRes = await fetch(`${BASE_URL}/api/autoservicio/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": emp.sid,
        Cookie: `sid=${emp.sid}`,
        "X-CSRF-Token": emp.csrf,
        "Idempotency-Key": crypto.randomUUID(),
        "X-Test-Simulated-Timestamp": paso.simTime,
      },
      body: JSON.stringify({ tipo_marca: paso.tipo }),
    });

    const reg = (await regRes.json()) as any;
    assert.strictEqual(regRes.status, 201, `Error registrando ${paso.tipo}: ${JSON.stringify(reg)}`);
    assert.strictEqual(reg.datos.marca.tipo_marca, paso.tipo);
    console.log(`[PASS] Marca registrada con éxito: ${paso.tipo} -> Estado Jornada: ${reg.datos.jornada.estado_jornada}`);
  }

  // Verificación final: jornada cerrada normal
  const finalRes = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
    headers: {
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      Accept: "application/json",
    },
  });
  const finalEst = (await finalRes.json()) as any;
  assert.strictEqual(finalEst.datos.ultima_marca.tipo_marca, "SALIDA");
  console.log("=== CICLO COMPLETO COMPLETADO CON ÉXITO (ENTRADA -> PAUSAS -> SALIDA) ===");
}

testCicloCompleto().catch((err) => {
  console.error("Fallo en ciclo completo:", err);
  process.exit(1);
});
