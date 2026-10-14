import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { DEMO_EMPLEADOS, DEMO_USUARIOS } from "../../../shared/contracts/demo-data.js";

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
  assert.strictEqual(res.status, 200, `Login failed for ${username}: ${JSON.stringify(body)}`);
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

function puedeAutoservicio(usuario: any): boolean {
  return Boolean(
    usuario &&
      usuario.rol !== "SEGURIDAD" &&
      Boolean(usuario.empleado_id) &&
      (usuario.rol === "EMPLEADO" ||
        usuario.rol === "ADMINISTRADOR" ||
        usuario.rol === "TALENTO_HUMANO" ||
        usuario.rol === "SUPERVISOR_SEGURIDAD")
  );
}

function puedeGarita(usuario: any): boolean {
  return Boolean(usuario && (usuario.rol === "SEGURIDAD" || usuario.rol === "SUPERVISOR_SEGURIDAD"));
}

async function runTests() {
  console.log("=== INICIO DE SUITE DE VALIDACIÓN FASE 2D.2 (18 PRUEBAS REALES) ===");
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

  // 1. EMPLEADO -> ve Autoservicio
  let empLogin: LoginResult;
  await test(1, "EMPLEADO -> ve Autoservicio en navegación", async () => {
    empLogin = await loginUser("empleado", "PassSegura_2026!*");
    assert.strictEqual(empLogin.usuario.rol, "EMPLEADO");
    assert.strictEqual(empLogin.usuario.empleado_id, "33333333-3333-4333-8333-333333333305");
    assert.strictEqual(puedeAutoservicio(empLogin.usuario), true);
    assert.strictEqual(puedeGarita(empLogin.usuario), false);
  });

  // 2. EMPLEADO -> Autoservicio carga sin RESPUESTA_NO_JSON
  let empEstado: any;
  await test(2, "EMPLEADO -> Autoservicio carga con JSON 200 OK (sin RESPUESTA_NO_JSON)", async () => {
    const res = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "X-Session-Id": empLogin.sid,
        Cookie: `sid=${empLogin.sid}`,
        Accept: "application/json",
      },
    });
    const cType = res.headers.get("content-type") || "";
    assert.ok(cType.includes("application/json"), `Content-Type esperado JSON, recibido: ${cType}`);
    assert.strictEqual(res.status, 200);
    empEstado = await res.json();
    assert.strictEqual(empEstado.exito, true);
    assert.strictEqual(empEstado.datos.empleado_id, "33333333-3333-4333-8333-333333333305");
  });

  // 3. EMPLEADO -> obtiene horario del día
  await test(3, "EMPLEADO -> obtiene horario aplicable del día (TURNO_REGULAR_L_V)", async () => {
    assert.ok(empEstado.datos.horario_aplicable, "Debe tener horario aplicable");
    const h = empEstado.datos.horario_aplicable;
    assert.ok(h.hora_entrada || h.hora_entrada_programada, "Debe incluir hora de entrada");
    assert.ok(h.hora_salida || h.hora_salida_programada, "Debe incluir hora de salida");
    assert.strictEqual(h.tolerancia_minutos ?? h.tolerancia_entrada_minutos, 5);
  });

  // 4. EMPLEADO -> puede registrar ENTRADA
  await test(4, "EMPLEADO -> puede registrar ENTRADA por Autoservicio", async () => {
    const res = await fetch(`${BASE_URL}/api/autoservicio/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": empLogin.sid,
        Cookie: `sid=${empLogin.sid}`,
        "X-CSRF-Token": empLogin.csrf,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ tipo_marca: "ENTRADA" }),
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 201, `Status esperado 201, recibido ${res.status}: ${JSON.stringify(body)}`);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.marca.tipo_marca, "ENTRADA");
    assert.strictEqual(body.datos.marca.empleado_id, "33333333-3333-4333-8333-333333333305");
  });

  // 5. ADMINISTRADOR -> ve Autoservicio
  let adminLogin: LoginResult;
  await test(5, "ADMINISTRADOR -> ve Autoservicio en navegación", async () => {
    adminLogin = await loginUser("admin", "PassSegura_2026!*");
    assert.strictEqual(adminLogin.usuario.rol, "ADMINISTRADOR");
    assert.strictEqual(adminLogin.usuario.empleado_id, "33333333-3333-4333-8333-333333333301");
    assert.strictEqual(puedeAutoservicio(adminLogin.usuario), true);
  });

  // 6. ADMINISTRADOR -> Autoservicio corresponde a su propio empleado
  await test(6, "ADMINISTRADOR -> Autoservicio corresponde a su propio empleado (DEMO-1001)", async () => {
    const res = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "X-Session-Id": adminLogin.sid,
        Cookie: `sid=${adminLogin.sid}`,
        Accept: "application/json",
      },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.empleado_id, "33333333-3333-4333-8333-333333333301");
    assert.strictEqual(body.datos.empleado.cedula, "DEMO-1001");
  });

  // 7. TALENTO_HUMANO -> ve Autoservicio
  let thLogin: LoginResult;
  await test(7, "TALENTO_HUMANO -> ve Autoservicio en navegación", async () => {
    thLogin = await loginUser("talento_humano", "PassSegura_2026!*");
    assert.strictEqual(thLogin.usuario.rol, "TALENTO_HUMANO");
    assert.strictEqual(thLogin.usuario.empleado_id, "33333333-3333-4333-8333-333333333302");
    assert.strictEqual(puedeAutoservicio(thLogin.usuario), true);
  });

  // 8. TALENTO_HUMANO -> Autoservicio corresponde a su propio empleado
  await test(8, "TALENTO_HUMANO -> Autoservicio corresponde a su propio empleado (DEMO-1002)", async () => {
    const res = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "X-Session-Id": thLogin.sid,
        Cookie: `sid=${thLogin.sid}`,
        Accept: "application/json",
      },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.empleado_id, "33333333-3333-4333-8333-333333333302");
    assert.strictEqual(body.datos.empleado.cedula, "DEMO-1002");
  });

  // 9. SUPERVISOR_SEGURIDAD -> ve Garita + Autoservicio + RAG
  let supLogin: LoginResult;
  await test(9, "SUPERVISOR_SEGURIDAD -> ve Garita + Autoservicio + RAG", async () => {
    supLogin = await loginUser("supervisor_seg", "PassSegura_2026!*");
    assert.strictEqual(supLogin.usuario.rol, "SUPERVISOR_SEGURIDAD");
    assert.strictEqual(puedeGarita(supLogin.usuario), true);
    assert.strictEqual(puedeAutoservicio(supLogin.usuario), true);

    const ragRes = await fetch(`${BASE_URL}/api/rag/estado`, {
      headers: { "X-Session-Id": supLogin.sid, Cookie: `sid=${supLogin.sid}` },
    });
    assert.strictEqual(ragRes.status, 200);
  });

  // 10. SUPERVISOR_SEGURIDAD -> Autoservicio corresponde exclusivamente a sí mismo
  await test(10, "SUPERVISOR_SEGURIDAD -> Autoservicio corresponde exclusivamente a sí mismo (DEMO-1003)", async () => {
    const res = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "X-Session-Id": supLogin.sid,
        Cookie: `sid=${supLogin.sid}`,
        Accept: "application/json",
      },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.empleado_id, "33333333-3333-4333-8333-333333333303");
  });

  // 11. SEGURIDAD -> ve Garita + RAG
  let segLogin: LoginResult;
  await test(11, "SEGURIDAD -> ve Garita + RAG", async () => {
    segLogin = await loginUser("seguridad", "PassSegura_2026!*");
    assert.strictEqual(segLogin.usuario.rol, "SEGURIDAD");
    assert.strictEqual(puedeGarita(segLogin.usuario), true);

    const ragRes = await fetch(`${BASE_URL}/api/rag/estado`, {
      headers: { "X-Session-Id": segLogin.sid, Cookie: `sid=${segLogin.sid}` },
    });
    assert.strictEqual(ragRes.status, 200);
  });

  // 12. SEGURIDAD -> NO ve Autoservicio
  await test(12, "SEGURIDAD -> NO ve Autoservicio (empleado_id es null, rechazo 403)", async () => {
    assert.strictEqual(puedeAutoservicio(segLogin.usuario), false);

    const res = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "X-Session-Id": segLogin.sid,
        Cookie: `sid=${segLogin.sid}`,
        Accept: "application/json",
      },
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error.codigo, "USUARIO_SIN_EMPLEADO_VINCULADO");
  });

  // 13. SEGURIDAD -> puede buscar empleados existentes en Garita
  await test(13, "SEGURIDAD -> puede buscar empleado DEMO-1005 en Garita", async () => {
    const res = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
      headers: {
        "X-Session-Id": segLogin.sid,
        Cookie: `sid=${segLogin.sid}`,
        Accept: "application/json",
      },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.empleado.cedula, "DEMO-1005");
    assert.strictEqual(body.datos.empleado.nombre_completo, "Carlos Alvarado");
  });

  // 14. SEGURIDAD -> puede registrar marca de tercero desde Garita
  await test(14, "SEGURIDAD -> puede registrar marca de tercero desde Garita", async () => {
    // Oficial Carlos Garita (DEMO-1004)
    const res = await fetch(`${BASE_URL}/api/garita/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": segLogin.sid,
        Cookie: `sid=${segLogin.sid}`,
        "X-CSRF-Token": segLogin.csrf,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        empleado_id: "33333333-3333-4333-8333-333333333304",
        tipo_marca: "ENTRADA",
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 201);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.marca.origen_marca, "GARITA_LECTOR");
  });

  // 15. EMPLEADO -> no puede acceder a Garita
  await test(15, "EMPLEADO -> no puede acceder a Garita (403)", async () => {
    const res = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
      headers: {
        "X-Session-Id": empLogin.sid,
        Cookie: `sid=${empLogin.sid}`,
        Accept: "application/json",
      },
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error.codigo, "PERMISO_DENEGADO");
  });

  // 16. Autoservicio con empleado_id manipulado -> rechazado
  await test(16, "Autoservicio con empleado_id manipulado -> rechazado con 400 PARAMETRO_NO_PERMITIDO", async () => {
    const res = await fetch(`${BASE_URL}/api/autoservicio/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": adminLogin.sid,
        Cookie: `sid=${adminLogin.sid}`,
        "X-CSRF-Token": adminLogin.csrf,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        tipo_marca: "SALIDA",
        empleado_id: "33333333-3333-4333-8333-333333333305", // intento de marcar a Carlos Alvarado
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error.codigo, "PARAMETRO_NO_PERMITIDO");
  });

  // 17. Garita ya no muestra cédulas antiguas
  await test(17, "Garita ya no muestra CED_001, María Morales ni referencias obsoletas", async () => {
    const garitaFile = fs.readFileSync(path.resolve(process.cwd(), "src/components/GaritaView.tsx"), "utf8");
    assert.ok(!garitaFile.includes("CED_001"), "No debe incluir CED_001");
    assert.ok(!garitaFile.includes("María Morales"), "No debe incluir María Morales");
    assert.ok(!garitaFile.includes("CED_002"), "No debe incluir CED_002");
    assert.ok(!garitaFile.includes("Jorge Rodríguez"), "No debe incluir Jorge Rodríguez");
    assert.ok(garitaFile.includes("DEMO-1005"), "Debe incluir DEMO-1005");
  });

  // 18. Ninguna llamada /api/* devuelve HTML
  await test(18, "Cualquier endpoint /api/* desconocido o erróneo devuelve JSON, nunca HTML", async () => {
    const res404 = await fetch(`${BASE_URL}/api/ruta-inexistente-test`, {
      headers: { Accept: "text/html,application/json" },
    });
    const cType = res404.headers.get("content-type") || "";
    assert.ok(cType.includes("application/json"), `Esperado Content-Type JSON, recibido: ${cType}`);
    const body = (await res404.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error.codigo, "RECURSO_NO_ENCONTRADO");
  });

  console.log(`\n=== RESULTADO SUITE FASE 2D.2: ${passCount}/18 PASS, ${failCount} FAIL ===`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Error fatal en suite:", err);
  process.exit(1);
});
