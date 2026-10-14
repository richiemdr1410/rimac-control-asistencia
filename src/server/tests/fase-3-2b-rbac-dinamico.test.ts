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

async function runFase32bSuite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.2B ===");
  console.log("=== MOTOR RBAC CONFIGURABLE, ROLES Y PERMISOS ===");

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

  // Cargar usuarios de prueba
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");
  const seguridad = await loginUser("seguridad", "PassSegura_2026!*");

  // 1. ADMINISTRADOR lista catálogo de permisos
  await test(1, "ADMINISTRADOR lista catálogo de permisos (GET /api/admin/permisos)", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/permisos`, {
      headers: {
        "x-session-id": admin.sid,
        Cookie: admin.cookie,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos.permisos));
    assert.ok(body.datos.permisos.length >= 24, `Se esperaban al menos 24 permisos, obtenidos: ${body.datos.permisos.length}`);
    assert.ok(body.datos.agrupados["Autoservicio"]);
    assert.ok(body.datos.agrupados["Garita"]);
    assert.ok(body.datos.agrupados["Seguridad"]);
  });

  // 2. ADMINISTRADOR lista matriz de roles-permisos
  await test(2, "ADMINISTRADOR lista matriz de roles-permisos (GET /api/admin/roles-permisos)", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: {
        "x-session-id": admin.sid,
        Cookie: admin.cookie,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.roles.length, 5);
    assert.ok(body.datos.asignaciones.ADMINISTRADOR.includes("ROLES_PERMISOS_ADMINISTRAR"));
    assert.ok(body.datos.asignaciones.TALENTO_HUMANO.includes("FERIADOS_VER"));
    assert.ok(body.datos.asignaciones.EMPLEADO.includes("AUTOSERVICIO_MARCAJE"));
  });

  // 3. EMPLEADO no autorizado no puede acceder a /api/admin/* (403 PERMISO_DENEGADO)
  await test(3, "EMPLEADO recibe 403 PERMISO_DENEGADO al acceder a /api/admin/permisos", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/permisos`, {
      headers: {
        "x-session-id": empleado.sid,
        Cookie: empleado.cookie,
      },
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.exito, false);
    const errCodigo = body.error?.codigo || body.codigo;
    assert.strictEqual(errCodigo, "PERMISO_DENEGADO");
  });

  // 4. SEGURIDAD no autorizado no puede acceder a /api/admin/* (403 PERMISO_DENEGADO)
  await test(4, "SEGURIDAD recibe 403 PERMISO_DENEGADO al acceder a /api/admin/roles-permisos", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: {
        "x-session-id": seguridad.sid,
        Cookie: seguridad.cookie,
      },
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.exito, false);
    const errCodigo = body.error?.codigo || body.codigo;
    assert.strictEqual(errCodigo, "PERMISO_DENEGADO");
  });

  // 5. Petición sin autenticación a /api/admin/* es rechazada con 401 NO_AUTENTICADO
  await test(5, "Petición no autenticada a /api/admin/permisos responde 401 NO_AUTENTICADO", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/permisos`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.exito, false);
    const errCodigo = body.error?.codigo || body.codigo;
    assert.strictEqual(errCodigo, "NO_AUTENTICADO");
  });

  // 6. Dinamismo de permisos: Revocar FERIADOS_VER a TALENTO_HUMANO y verificar rechazo 403
  await test(6, "Revocación dinámica: Administrador revoca FERIADOS_VER a TALENTO_HUMANO -> rechazo 403", async () => {
    // 1. Obtener lista actual de permisos de TALENTO_HUMANO
    const resMatriz = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: { "x-session-id": admin.sid, Cookie: admin.cookie },
    });
    const matriz = await resMatriz.json();
    const permisosTHOriginales: string[] = matriz.datos.asignaciones.TALENTO_HUMANO;

    // Verificar que inicialmente TALENTO_HUMANO puede consultar feriados
    const resInicial = await fetch(`${BASE_URL}/api/feriados`, {
      headers: { "x-session-id": th.sid, Cookie: th.cookie },
    });
    assert.strictEqual(resInicial.status, 200, "TALENTO_HUMANO debería poder consultar feriados inicialmente");

    // 2. Revocar FERIADOS_VER
    const permisosSinFeriados = permisosTHOriginales.filter((p) => p !== "FERIADOS_VER");
    const resPut = await fetch(`${BASE_URL}/api/admin/roles-permisos/TALENTO_HUMANO`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ permisos_activos: permisosSinFeriados }),
    });
    assert.strictEqual(resPut.status, 200);

    // 3. Probar inmediatamente con TALENTO_HUMANO (sin reiniciar servidor) -> Debe recibir 403
    const resPostRevocacion = await fetch(`${BASE_URL}/api/feriados`, {
      headers: { "x-session-id": th.sid, Cookie: th.cookie },
    });
    assert.strictEqual(resPostRevocacion.status, 403);
    const bodyRevocado = await resPostRevocacion.json();
    const errCodigo = bodyRevocado.error?.codigo || bodyRevocado.codigo;
    assert.strictEqual(errCodigo, "PERMISO_DENEGADO");
  });

  // 7. Reactivación dinámica e invalidación de caché: Reactivar FERIADOS_VER y verificar 200
  await test(7, "Reactivación dinámica: Administrador reactiva FERIADOS_VER a TALENTO_HUMANO -> responde 200", async () => {
    // 1. Obtener lista actual y reincorporar FERIADOS_VER
    const resMatriz = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: { "x-session-id": admin.sid, Cookie: admin.cookie },
    });
    const matriz = await resMatriz.json();
    const permisosActuales: string[] = matriz.datos.asignaciones.TALENTO_HUMANO;
    const permisosConFeriados = Array.from(new Set([...permisosActuales, "FERIADOS_VER"]));

    const resPut = await fetch(`${BASE_URL}/api/admin/roles-permisos/TALENTO_HUMANO`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ permisos_activos: permisosConFeriados }),
    });
    assert.strictEqual(resPut.status, 200);

    // 2. TALENTO_HUMANO vuelve a consultar feriados -> Debe responder 200 de inmediato
    const resReactivado = await fetch(`${BASE_URL}/api/feriados`, {
      headers: { "x-session-id": th.sid, Cookie: th.cookie },
    });
    assert.strictEqual(resReactivado.status, 200);
    const bodyFeriados = await resReactivado.json();
    assert.strictEqual(bodyFeriados.exito, true);
  });

  // 8. Protección de permisos críticos: Intento de revocar ROLES_PERMISOS_ADMINISTRAR a ADMINISTRADOR
  await test(8, "Protección de permisos críticos: Revocar ROLES_PERMISOS_ADMINISTRAR a ADMINISTRADOR es rechazado con 409", async () => {
    const resMatriz = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: { "x-session-id": admin.sid, Cookie: admin.cookie },
    });
    const matriz = await resMatriz.json();
    const permisosAdminOriginales: string[] = matriz.datos.asignaciones.ADMINISTRADOR;

    const permisosSinGobernanza = permisosAdminOriginales.filter((p) => p !== "ROLES_PERMISOS_ADMINISTRAR");

    const resPut = await fetch(`${BASE_URL}/api/admin/roles-permisos/ADMINISTRADOR`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ permisos_activos: permisosSinGobernanza }),
    });

    assert.strictEqual(resPut.status, 409);
    const body = await resPut.json();
    assert.strictEqual(body.exito, false);
    const errCodigo = body.error?.codigo || body.codigo;
    assert.strictEqual(errCodigo, "PERMISO_CRITICO_PROTEGIDO");
  });

  // 9. Protección de permisos críticos: Intento de revocar USUARIOS_ADMINISTRAR a ADMINISTRADOR
  await test(9, "Protección de permisos críticos: Revocar USUARIOS_ADMINISTRAR a ADMINISTRADOR es rechazado con 409", async () => {
    const resMatriz = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: { "x-session-id": admin.sid, Cookie: admin.cookie },
    });
    const matriz = await resMatriz.json();
    const permisosAdminOriginales: string[] = matriz.datos.asignaciones.ADMINISTRADOR;

    const permisosSinUsuarios = permisosAdminOriginales.filter((p) => p !== "USUARIOS_ADMINISTRAR");

    const resPut = await fetch(`${BASE_URL}/api/admin/roles-permisos/ADMINISTRADOR`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ permisos_activos: permisosSinUsuarios }),
    });

    assert.strictEqual(resPut.status, 409);
    const body = await resPut.json();
    assert.strictEqual(body.exito, false);
    const errCodigo = body.error?.codigo || body.codigo;
    assert.strictEqual(errCodigo, "PERMISO_CRITICO_PROTEGIDO");
  });

  // 10. Prohibición de roles no canónicos
  await test(10, "Intento de modificar permisos para un rol no canónico responde 400 ROL_INVALIDO", async () => {
    const resPut = await fetch(`${BASE_URL}/api/admin/roles-permisos/JEFATURA`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ permisos_activos: ["AUTOSERVICIO_MARCAJE"] }),
    });

    assert.strictEqual(resPut.status, 400);
    const body = await resPut.json();
    assert.strictEqual(body.exito, false);
    const errCodigo = body.error?.codigo || body.codigo;
    assert.strictEqual(errCodigo, "ROL_INVALIDO");
  });

  // 11. Validación de permisos inexistentes en catálogo
  await test(11, "Intento de asignar código de permiso inexistente responde 400 PERMISO_INEXISTENTE", async () => {
    const resPut = await fetch(`${BASE_URL}/api/admin/roles-permisos/SEGURIDAD`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ permisos_activos: ["GARITA_OPERAR", "PERMISO_FANTASMA_INVENTADO"] }),
    });

    assert.strictEqual(resPut.status, 400);
    const body = await resPut.json();
    assert.strictEqual(body.exito, false);
    const errCodigo = body.error?.codigo || body.codigo;
    assert.strictEqual(errCodigo, "PERMISO_INEXISTENTE");
  });

  // 12. Auditoría inmutable de cambios en matriz
  await test(12, "Modificaciones en roles_permisos generan eventos en auditoria_eventos", async () => {
    const pool = getPool();
    const resAudit = await pool.query(
      `SELECT accion, entidad_tipo, entidad_id, motivo 
       FROM auditoria_eventos 
       WHERE accion = 'MODIFICAR_MATRIZ_PERMISOS' 
       ORDER BY timestamp_evento DESC 
       LIMIT 5;`
    );

    assert.ok(resAudit.rows.length > 0, "Debe haber registros de auditoría para MODIFICAR_MATRIZ_PERMISOS");
    const ultimo = resAudit.rows[0];
    assert.strictEqual(ultimo.accion, "MODIFICAR_MATRIZ_PERMISOS");
    assert.strictEqual(ultimo.entidad_tipo, "roles_permisos");
  });

  console.log("======================================================");
  console.log(`RESUMEN FASE 3.2B: PASS: ${passCount} / FAIL: ${failCount} (TOTAL: ${passCount + failCount})`);
  console.log("======================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase32bSuite().catch((err) => {
  console.error("Error fatal ejecutando suite 3.2B:", err);
  process.exit(1);
});
