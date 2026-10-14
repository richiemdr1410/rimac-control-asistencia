import assert from "node:assert";
import { getPool } from "../../db/index.js";

const BASE_URL = "http://127.0.0.1:3000";

async function loginUser(username: string, pass: string) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador: username, password: pass }),
  });
  const body = (await res.json()) as any;
  assert.strictEqual(res.status, 200, "Login debe ser exitoso");
  const rawCookie = res.headers.get("set-cookie") || "";
  const match = rawCookie.match(/sid=([^;]+)/);
  return {
    sid: match ? match[1] : body.datos.sesion_id,
    csrf: body.datos.token_csrf || body.datos.csrf_token,
    usuario: body.datos.usuario,
  };
}

async function testAutoservicioRefrescoSalida() {
  console.log("=== INICIO PRUEBAS DIRIGIDAS: REFRESCO ATÓMICO Y CIERRE DE SALIDA ===");
  const pool = getPool();

  // 1. Iniciar sesión con empleado (Carlos Alvarado)
  const emp = await loginUser("empleado", "PassSegura_2026!*");
  const empleadoId = emp.usuario.empleado_id;
  assert.ok(empleadoId, "Empleado debe tener ID vinculado");

  // Encontrar dinámicamente una fecha laborable (Lunes a Viernes) sin jornadas previas
  const fechasUsadasRes = await pool.query(
    "SELECT DISTINCT fecha_jornada FROM jornadas WHERE empleado_id = $1",
    [empleadoId]
  );
  const fechasUsadas = new Set(
    fechasUsadasRes.rows.map((r: any) =>
      r.fecha_jornada instanceof Date
        ? r.fecha_jornada.toISOString().split("T")[0]
        : String(r.fecha_jornada).split("T")[0]
    )
  );

  let testFecha = "2026-10-28";
  for (let d = 22; d <= 31; d++) {
    const cand = `2026-10-${String(d).padStart(2, "0")}`;
    const dt = new Date(`${cand}T12:00:00Z`);
    const dayOfWeek = dt.getUTCDay(); // 1=Mon ... 5=Fri
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && !fechasUsadas.has(cand)) {
      testFecha = cand;
      break;
    }
  }

  const simEntrada = `${testFecha}T07:00:00.000-06:00`;
  const simSalida = `${testFecha}T16:30:00.000-06:00`;
  console.log(`Usando fecha de prueba limpia y laborable: ${testFecha}`);

  console.log("PRUEBA 1 & 2: Empleado inicia jornada y consulta estado ABIERTA");
  const resEntrada = await fetch(`${BASE_URL}/api/autoservicio/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "X-CSRF-Token": emp.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "X-Test-Simulated-Timestamp": simEntrada,
    },
    body: JSON.stringify({ tipo_marca: "ENTRADA" }),
  });
  const dataEntrada = (await resEntrada.json()) as any;
  assert.strictEqual(resEntrada.status, 201, `Error registrando entrada: ${JSON.stringify(dataEntrada)}`);
  assert.strictEqual(dataEntrada.datos.marca.tipo_marca, "ENTRADA");
  assert.strictEqual(dataEntrada.datos.jornada.estado_jornada, "ABIERTA");

  // Consulta de estado tras Entrada
  const resEstadoAbierto = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
    headers: {
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "X-Test-Simulated-Timestamp": simEntrada,
    },
  });
  const estadoAbierto = (await resEstadoAbierto.json()) as any;
  assert.strictEqual(resEstadoAbierto.status, 200);
  assert.ok(estadoAbierto.datos.jornada_abierta, "jornada_abierta debe existir");
  assert.strictEqual(estadoAbierto.datos.jornada_abierta.estado_jornada, "ABIERTA");
  assert.strictEqual(estadoAbierto.datos.ultima_marca.tipo_marca, "ENTRADA");
  assert.ok(estadoAbierto.datos.acciones_validas.includes("SALIDA"), "Acción SALIDA debe estar disponible");
  console.log("[PASS] 1 & 2: Jornada abierta correctamente con acciones válidas disponibles.");

  console.log("PRUEBA 3, 4 & 5: Registrar SALIDA y verificar persistencia en PostgreSQL");
  const resSalida = await fetch(`${BASE_URL}/api/autoservicio/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "X-CSRF-Token": emp.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "X-Test-Simulated-Timestamp": simSalida,
    },
    body: JSON.stringify({ tipo_marca: "SALIDA" }),
  });
  const dataSalida = (await resSalida.json()) as any;
  assert.strictEqual(resSalida.status, 201, `Error registrando salida: ${JSON.stringify(dataSalida)}`);
  assert.strictEqual(dataSalida.datos.marca.tipo_marca, "SALIDA");
  assert.strictEqual(dataSalida.datos.jornada.estado_jornada, "CERRADA_NORMAL");

  // Verificación directa en base de datos PostgreSQL
  const dbJornada = await pool.query("SELECT * FROM jornadas WHERE empleado_id = $1 AND fecha_jornada = $2", [
    empleadoId,
    testFecha,
  ]);
  assert.strictEqual(dbJornada.rows.length, 1, "Debe existir exactamente 1 jornada para la fecha");
  assert.strictEqual(dbJornada.rows[0].estado_jornada, "CERRADA_NORMAL", "Jornada en DB debe ser CERRADA_NORMAL");

  const dbMarcas = await pool.query(
    "SELECT * FROM marcas WHERE jornada_id = $1 ORDER BY timestamp_servidor ASC",
    [dbJornada.rows[0].id]
  );
  assert.strictEqual(dbMarcas.rows.length, 2, "Deben existir 2 marcas físicas (ENTRADA y SALIDA)");
  assert.strictEqual(dbMarcas.rows[1].tipo_marca, "SALIDA", "La segunda marca física debe ser SALIDA");
  console.log("[PASS] 3, 4 & 5: Marca SALIDA guardada físicamente y jornada en DB pasó a CERRADA_NORMAL.");

  console.log("PRUEBA 6, 7, 8, 9 & 10: /api/autoservicio/estado devuelve estado cerrado inmediatamente");
  const resEstadoCerrado = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
    headers: {
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "X-Test-Simulated-Timestamp": simSalida,
    },
  });
  const estadoCerrado = (await resEstadoCerrado.json()) as any;
  assert.strictEqual(resEstadoCerrado.status, 200);
  assert.strictEqual(estadoCerrado.datos.jornada_abierta, null, "jornada_abierta debe ser null inmediatamente tras SALIDA");
  assert.ok(estadoCerrado.datos.jornada_actual, "jornada_actual debe contener la jornada de hoy");
  assert.strictEqual(estadoCerrado.datos.jornada_actual.estado_jornada, "CERRADA_NORMAL");
  assert.strictEqual(estadoCerrado.datos.ultima_marca.tipo_marca, "SALIDA", "Última marca debe ser SALIDA");
  assert.strictEqual(estadoCerrado.datos.acciones_validas.length, 0, "No debe haber acciones válidas tras cierre (pausas y salida desaparecen)");
  console.log("[PASS] 6-10: Estado cerrado devuelto atómicamente, sin jornada abierta y sin botones de pausas/salida.");

  console.log("PRUEBA 11: Intentar segunda salida desde API es rechazado con error controlado (JORNADA_YA_CERRADA)");
  const resSegundaSalida = await fetch(`${BASE_URL}/api/autoservicio/marcas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "X-CSRF-Token": emp.csrf,
      "Idempotency-Key": crypto.randomUUID(),
      "X-Test-Simulated-Timestamp": `${testFecha}T17:05:00.000-06:00`,
    },
    body: JSON.stringify({ tipo_marca: "SALIDA" }),
  });
  const dataSegundaSalida = (await resSegundaSalida.json()) as any;
  assert.strictEqual(resSegundaSalida.status, 409, "Segunda salida debe ser rechazada con HTTP 409");
  assert.strictEqual(dataSegundaSalida.codigo, "JORNADA_YA_CERRADA", "Código debe ser JORNADA_YA_CERRADA");
  console.log("[PASS] 11: Segunda salida rechazada exitosamente con 409 JORNADA_YA_CERRADA.");

  console.log("PRUEBA 12: No se crearon jornadas duplicadas en PostgreSQL");
  const countJornadas = await pool.query(
    "SELECT count(*) as total FROM jornadas WHERE empleado_id = $1 AND fecha_jornada = $2",
    [empleadoId, testFecha]
  );
  assert.strictEqual(Number(countJornadas.rows[0].total), 1, "Solo debe existir 1 jornada (UNIQUE empleado_id, fecha_jornada)");

  const countMarcasSalida = await pool.query(
    "SELECT count(*) as total FROM marcas WHERE jornada_id = $1 AND tipo_marca = 'SALIDA'",
    [dbJornada.rows[0].id]
  );
  assert.strictEqual(Number(countMarcasSalida.rows[0].total), 1, "Solo debe existir 1 marca SALIDA física");
  console.log("[PASS] 12: Integridad validada, sin duplicados en jornadas ni marcas.");

  console.log("PRUEBA 13: Refrescar navegador conserva el mismo estado correcto");
  const resRefresco = await fetch(`${BASE_URL}/api/autoservicio/estado?_t=${Date.now()}`, {
    headers: {
      "X-Session-Id": emp.sid,
      Cookie: `sid=${emp.sid}`,
      "X-Test-Simulated-Timestamp": simSalida,
    },
  });
  const estadoRefresco = (await resRefresco.json()) as any;
  assert.strictEqual(estadoRefresco.datos.jornada_abierta, null);
  assert.strictEqual(estadoRefresco.datos.jornada_actual.estado_jornada, "CERRADA_NORMAL");
  assert.strictEqual(estadoRefresco.datos.ultima_marca.tipo_marca, "SALIDA");
  assert.strictEqual(estadoRefresco.datos.acciones_validas.length, 0);
  console.log("[PASS] 13: Refresco posterior conserva estado cerrado sin inconsistencias.");

  console.log("=== TODAS LAS PRUEBAS DIRIGIDAS DE AUTOSERVICIO COMPLETADAS CON ÉXITO ===");
}

testAutoservicioRefrescoSalida()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error en prueba dirigida:", err);
    process.exit(1);
  });
