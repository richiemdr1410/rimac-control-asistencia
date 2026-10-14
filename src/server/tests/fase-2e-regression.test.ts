import assert from "node:assert";
import crypto from "node:crypto";

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

async function runRegressionSuite() {
  console.log("=== INICIO DE SUITE DE REGRESIÓN FASE 2E (POSTGRESQL EXCLUSIVO / FIRESTORE DENY-ALL) ===");

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

  // 1. Health check PostgreSQL
  await test(1, "/api/health reporta PostgreSQL CONECTADO y metadatos de postgres", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.estado, "OK");
    assert.strictEqual(body.datos.servidor, "OPERATIVO");
    assert.strictEqual(body.datos.persistencia.adaptador, "POSTGRESQL");
    assert.strictEqual(body.datos.persistencia.persistenceProvider, "postgres");
    assert.strictEqual(body.datos.persistencia.estado, "CONECTADO");
  });

  // 2. Login de los 5 perfiles DEMO
  let empLogin: LoginResult;
  let adminLogin: LoginResult;
  let thLogin: LoginResult;
  let supLogin: LoginResult;
  let segLogin: LoginResult;

  await test(2, "Login exitoso de los 5 perfiles DEMO", async () => {
    empLogin = await loginUser("empleado", "PassSegura_2026!*");
    assert.strictEqual(empLogin.usuario.rol, "EMPLEADO");
    assert.strictEqual(empLogin.usuario.empleado_id, "33333333-3333-4333-8333-333333333305");

    adminLogin = await loginUser("admin", "PassSegura_2026!*");
    assert.strictEqual(adminLogin.usuario.rol, "ADMINISTRADOR");
    assert.strictEqual(adminLogin.usuario.empleado_id, "33333333-3333-4333-8333-333333333301");

    thLogin = await loginUser("talento_humano", "PassSegura_2026!*");
    assert.strictEqual(thLogin.usuario.rol, "TALENTO_HUMANO");
    assert.strictEqual(thLogin.usuario.empleado_id, "33333333-3333-4333-8333-333333333302");

    supLogin = await loginUser("supervisor_seg", "PassSegura_2026!*");
    assert.strictEqual(supLogin.usuario.rol, "SUPERVISOR_SEGURIDAD");
    assert.strictEqual(supLogin.usuario.empleado_id, "33333333-3333-4333-8333-333333333303");

    segLogin = await loginUser("seguridad", "PassSegura_2026!*");
    assert.strictEqual(segLogin.usuario.rol, "SEGURIDAD");
    assert.ok(!segLogin.usuario.empleado_id, "seguridad no debe tener empleado_id asignado");
  });

  // 3. Autoservicio EMPLEADO
  await test(3, "Autoservicio EMPLEADO carga 200 OK con horario asignado", async () => {
    const res = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "X-Session-Id": empLogin.sid,
        Cookie: `sid=${empLogin.sid}`,
        Accept: "application/json",
      },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.empleado_id, "33333333-3333-4333-8333-333333333305");
    assert.ok(body.datos.horario_aplicable, "Debe tener horario aplicable asignado");
  });

  // 4. Autoservicio ADMINISTRADOR opera sobre sí mismo
  await test(4, "Autoservicio ADMINISTRADOR opera sobre DEMO-1001", async () => {
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
  });

  // 5. Autoservicio TALENTO_HUMANO opera sobre sí mismo
  await test(5, "Autoservicio TALENTO_HUMANO opera sobre DEMO-1002", async () => {
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
  });

  // 6. Autoservicio SUPERVISOR_SEGURIDAD opera sobre sí mismo
  await test(6, "Autoservicio SUPERVISOR_SEGURIDAD opera sobre DEMO-1003", async () => {
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

  // 7. SEGURIDAD rechazada en Autoservicio (403 USUARIO_SIN_EMPLEADO_VINCULADO)
  await test(7, "SEGURIDAD no tiene Autoservicio (rechazo 403)", async () => {
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

  // 8. Garita SEGURIDAD busca empleado
  await test(8, "SEGURIDAD busca DEMO-1005 en Garita exitosamente", async () => {
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

  // 9. Garita SUPERVISOR_SEGURIDAD busca empleado
  await test(9, "SUPERVISOR_SEGURIDAD busca DEMO-1005 en Garita exitosamente", async () => {
    const res = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=DEMO-1005`, {
      headers: {
        "X-Session-Id": supLogin.sid,
        Cookie: `sid=${supLogin.sid}`,
        Accept: "application/json",
      },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.empleado.cedula, "DEMO-1005");
  });

  // 10. EMPLEADO intentando Garita -> 403
  await test(10, "EMPLEADO no tiene acceso a Garita (403 PERMISO_DENEGADO)", async () => {
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

  // 11. Autoservicio rechaza manipulación de empleado_id (400 PARAMETRO_NO_PERMITIDO)
  await test(11, "Autoservicio rechaza empleado_id en body (400 PARAMETRO_NO_PERMITIDO)", async () => {
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
        tipo_marca: "ENTRADA",
        empleado_id: "33333333-3333-4333-8333-333333333305",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error.codigo, "PARAMETRO_NO_PERMITIDO");
  });

  // 12. Consulta RAG con los 5 perfiles (fundamentada en PostgreSQL rag_chunks)
  const perfiles = [
    { nombre: "EMPLEADO", sesion: empLogin },
    { nombre: "ADMINISTRADOR", sesion: adminLogin },
    { nombre: "TALENTO_HUMANO", sesion: thLogin },
    { nombre: "SUPERVISOR_SEGURIDAD", sesion: supLogin },
    { nombre: "SEGURIDAD", sesion: segLogin },
  ];

  for (let i = 0; i < perfiles.length; i++) {
    const p = perfiles[i];
    await test(12 + i, `Consulta RAG autorizada para perfil ${p.nombre}`, async () => {
      const res = await fetch(`${BASE_URL}/api/rag/consultar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": p.sesion.sid,
          Cookie: `sid=${p.sesion.sid}`,
          "X-CSRF-Token": p.sesion.csrf,
        },
        body: JSON.stringify({
          pregunta: "¿Cuál es el tiempo de tolerancia para marcas de entrada?",
        }),
      });

      assert.strictEqual(res.status, 200, `RAG falló con status ${res.status}`);
      const body = (await res.json()) as any;
      assert.strictEqual(body.exito, true);
      assert.ok(body.datos.respuesta, "Debe incluir respuesta generada");
      assert.ok(Array.isArray(body.datos.fuentes), "Debe incluir fuentes documentales");
    });
  }

  // 17. Endpoint desconocido devuelve envelope JSON estandarizado, nunca HTML
  await test(17, "Endpoint /api/* no existente responde 404 JSON, nunca HTML", async () => {
    const res = await fetch(`${BASE_URL}/api/ruta-fantasma-404`);
    const cType = res.headers.get("content-type") || "";
    assert.ok(cType.includes("application/json"), `Esperado application/json, recibido: ${cType}`);
    assert.strictEqual(res.status, 404);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error.codigo, "RECURSO_NO_ENCONTRADO");
  });

  console.log(`\n=== RESULTADO SUITE FASE 2E: ${passCount}/${passCount + failCount} PASS, ${failCount} FAIL ===`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error("Error fatal en suite de regresión 2E:", err);
  process.exit(1);
});
