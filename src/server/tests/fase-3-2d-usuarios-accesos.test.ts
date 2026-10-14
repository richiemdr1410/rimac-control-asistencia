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

async function runFase32dSuite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.2D ===");
  console.log("=== ADMINISTRACIÓN DE USUARIOS Y ACCESOS ===");

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

  const pool = getPool();
  // Asegurar que los usuarios canónicos se encuentren en estado ACTIVO al iniciar la suite
  await pool.query(`UPDATE usuarios SET estado = 'ACTIVO' WHERE username IN ('admin', 'talento_humano', 'supervisor_seg', 'seguridad', 'empleado');`);
  await pool.query(`UPDATE empleados SET estado = 'ACTIVO' WHERE id IN (SELECT empleado_id FROM usuarios WHERE empleado_id IS NOT NULL AND username IN ('admin', 'talento_humano', 'supervisor_seg', 'empleado'));`);

  const ts = Date.now();
  const uniq = (p: string, len = 15) => `${p}${Math.random().toString(36).substring(2, 7)}`.substring(0, len).toUpperCase();

  // Actores
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const seguridad = await loginUser("seguridad", "PassSegura_2026!*");

  // Crear departamento y puesto para pruebas
  const deptoRes = await fetch(`${BASE_URL}/api/departamentos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": admin.sid,
      "x-csrf-token": admin.csrf,
      Cookie: admin.cookie,
    },
    body: JSON.stringify({
      codigo: uniq("DU_"),
      nombre: `Depto QA Usuarios ${ts}`,
    }),
  });
  const depto = ((await deptoRes.json()) as any).datos;

  const puestoRes = await fetch(`${BASE_URL}/api/puestos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": admin.sid,
      "x-csrf-token": admin.csrf,
      Cookie: admin.cookie,
    },
    body: JSON.stringify({
      departamento_id: depto.id,
      codigo: uniq("PU_"),
      nombre: `Puesto QA Usuarios ${ts}`,
    }),
  });
  const puesto = ((await puestoRes.json()) as any).datos;

  // Crear empleados para pruebas
  const empRes1 = await fetch(`${BASE_URL}/api/empleados`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": admin.sid,
      "x-csrf-token": admin.csrf,
      Cookie: admin.cookie,
    },
    body: JSON.stringify({
      cedula: `CED-${ts}-01`,
      nombre_completo: `Colaborador QA Alpha ${ts}`,
      correo_laboral: `colab.alpha.${ts}@rimac.cr`,
      telefono: "8888-0001",
      departamento_id: depto.id,
      puesto_id: puesto.id,
    }),
  });
  const empleado1 = ((await empRes1.json()) as any).datos;

  const empRes2 = await fetch(`${BASE_URL}/api/empleados`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": admin.sid,
      "x-csrf-token": admin.csrf,
      Cookie: admin.cookie,
    },
    body: JSON.stringify({
      cedula: `CED-${ts}-02`,
      nombre_completo: `Colaborador QA Beta ${ts}`,
      correo_laboral: `colab.beta.${ts}@rimac.cr`,
      telefono: "8888-0002",
      departamento_id: depto.id,
      puesto_id: puesto.id,
    }),
  });
  const empleado2 = ((await empRes2.json()) as any).datos;

  let nuevoUsuarioId = "";
  const usernameTest = `qa_user_${Math.random().toString(36).substring(2, 7)}`;
  const passwordInicial = "PassSegura_2026!*";

  // 1. Administrador consulta usuarios
  await test(1, "Administrador consulta usuarios con HTTP 200 y listado de cuentas", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/usuarios`, {
      headers: {
        "x-session-id": admin.sid,
        Cookie: admin.cookie,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos));
    assert.ok(body.datos.length > 0);
  });

  // 2. TH no puede administrar usuarios sin permiso (HTTP 403)
  await test(2, "TH no puede administrar usuarios sin permiso (HTTP 403)", async () => {
    const resGet = await fetch(`${BASE_URL}/api/admin/usuarios`, {
      headers: {
        "x-session-id": th.sid,
        Cookie: th.cookie,
      },
    });
    assert.strictEqual(resGet.status, 403, `Esperado 403 para TH en GET pero obtuvo ${resGet.status}`);

    const resPost = await fetch(`${BASE_URL}/api/admin/usuarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({ username: "intento_th" }),
    });
    assert.strictEqual(resPost.status, 403, `Esperado 403 para TH en POST pero obtuvo ${resPost.status}`);
  });

  // 3. Crear usuario vinculado a empleado
  await test(3, "Crear usuario vinculado a empleado activo", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/usuarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        username: usernameTest,
        email: `${usernameTest}@rimac.cr`,
        nombre_completo: empleado1.nombre_completo,
        rol: "EMPLEADO",
        password: passwordInicial,
        empleado_id: empleado1.id,
        estado: "ACTIVO",
      }),
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 201, `Error creando usuario: ${JSON.stringify(body)}`);
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.username, usernameTest);
    assert.strictEqual(body.datos.empleado_id, empleado1.id);
    assert.strictEqual(body.datos.rol, "EMPLEADO");
    nuevoUsuarioId = body.datos.id;
  });

  // 4. Rechazar username duplicado
  await test(4, "Rechazar username duplicado con HTTP 409 (USERNAME_DUPLICADO)", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/usuarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        username: usernameTest,
        email: `otro_${usernameTest}@rimac.cr`,
        nombre_completo: empleado2.nombre_completo,
        rol: "EMPLEADO",
        password: passwordInicial,
        empleado_id: empleado2.id,
      }),
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 409);
    assert.strictEqual(body.codigo, "USERNAME_DUPLICADO");
  });

  // 5. Rechazar segundo usuario personal incompatible para el mismo empleado
  await test(5, "Rechazar segundo usuario para el mismo colaborador con HTTP 409 (EMPLEADO_YA_TIENE_USUARIO)", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/usuarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        username: `otro_${usernameTest}`,
        email: `otro_${usernameTest}@rimac.cr`,
        nombre_completo: empleado1.nombre_completo,
        rol: "EMPLEADO",
        password: passwordInicial,
        empleado_id: empleado1.id, // Mismo empleado1 que ya tiene cuenta
      }),
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 409);
    assert.strictEqual(body.codigo, "EMPLEADO_YA_TIENE_USUARIO");
  });

  // 6. Rechazar rol inexistente
  await test(6, "Rechazar rol inexistente con HTTP 400 (ROL_INVALIDO)", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/usuarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        username: `inv_rol_${usernameTest}`,
        email: `inv_${usernameTest}@rimac.cr`,
        nombre_completo: empleado2.nombre_completo,
        rol: "SUPER_ADMIN", // No canónico
        password: passwordInicial,
        empleado_id: empleado2.id,
      }),
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.codigo, "ROL_INVALIDO");
  });

  // 7. Usuario nuevo puede autenticarse
  let sesionNuevoUsuario: LoginResult | null = null;
  await test(7, "Usuario nuevo puede autenticarse con sus credenciales creadas", async () => {
    sesionNuevoUsuario = await loginUser(usernameTest, passwordInicial);
    assert.strictEqual(sesionNuevoUsuario.usuario.username, usernameTest);
    assert.strictEqual(sesionNuevoUsuario.usuario.rol, "EMPLEADO");
  });

  // 8. Permisos corresponden al rol
  await test(8, "Permisos del nuevo usuario corresponden a su rol canónico EMPLEADO", async () => {
    assert.ok(sesionNuevoUsuario!.usuario.permisos);
    assert.ok(
      sesionNuevoUsuario!.usuario.permisos.includes("AUTOSERVICIO_MARCAJE") ||
        sesionNuevoUsuario!.usuario.permisos.includes("AUTOSERVICIO_MARCAR")
    );
    assert.strictEqual(sesionNuevoUsuario!.usuario.permisos.includes("USUARIOS_ADMINISTRAR"), false);
  });

  // 9. Cambio de rol actualiza permisos
  await test(9, "Cambio de rol (EMPLEADO -> TALENTO_HUMANO) actualiza registro de usuario", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/usuarios/${nuevoUsuarioId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        rol: "TALENTO_HUMANO",
      }),
    });

    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.datos.rol, "TALENTO_HUMANO");
  });

  // 10. Sesión antigua no conserva privilegios revocados
  await test(10, "Sesión previa del usuario queda invalidada tras cambio de rol", async () => {
    const resAutoservicio = await fetch(`${BASE_URL}/api/auth/perfil`, {
      headers: {
        "x-session-id": sesionNuevoUsuario!.sid,
        Cookie: sesionNuevoUsuario!.cookie,
      },
    });
    // Debe devolver 401 porque la sesión fue revocada al cambiar de rol
    assert.strictEqual(resAutoservicio.status, 401);
  });

  // 11. Desactivar usuario impide login
  await test(11, "Desactivar usuario a INACTIVO impide nuevos inicios de sesión (HTTP 403 USUARIO_BLOQUEADO)", async () => {
    const resEstado = await fetch(`${BASE_URL}/api/admin/usuarios/${nuevoUsuarioId}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        estado: "INACTIVO",
        motivo: "Suspensión administrativa QA",
      }),
    });
    assert.strictEqual(resEstado.status, 200);

    const resLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: usernameTest, password: passwordInicial }),
    });
    const bodyLogin = (await resLogin.json()) as any;
    assert.strictEqual(resLogin.status, 403);
    assert.ok(bodyLogin.codigo === "USUARIO_INACTIVO" || bodyLogin.codigo === "USUARIO_BLOQUEADO");
  });

  // 12. Desactivar revoca sesiones
  await test(12, "Desactivar usuario revoca todas sus sesiones activas de inmediato", async () => {
    // Iniciar sesión temporal reactivándolo brevemente
    await fetch(`${BASE_URL}/api/admin/usuarios/${nuevoUsuarioId}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ estado: "ACTIVO" }),
    });

    const tempSession = await loginUser(usernameTest, passwordInicial);

    // Desactivar de nuevo
    await fetch(`${BASE_URL}/api/admin/usuarios/${nuevoUsuarioId}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ estado: "INACTIVO" }),
    });

    // Intentar usar la sesión previa
    const resPerfil = await fetch(`${BASE_URL}/api/auth/perfil`, {
      headers: {
        "x-session-id": tempSession.sid,
        Cookie: tempSession.cookie,
      },
    });
    assert.strictEqual(resPerfil.status, 401);
  });

  // 13. Reactivar permite login
  await test(13, "Reactivar cuenta (ACTIVO) permite iniciar sesión nuevamente con éxito", async () => {
    const resActivar = await fetch(`${BASE_URL}/api/admin/usuarios/${nuevoUsuarioId}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ estado: "ACTIVO" }),
    });
    assert.strictEqual(resActivar.status, 200);

    const reLogin = await loginUser(usernameTest, passwordInicial);
    assert.strictEqual(reLogin.usuario.username, usernameTest);
  });

  // 14. Restablecer contraseña invalida contraseña anterior
  const passwordNueva = "NuevaPassSegura_2026!*";
  await test(14, "Restablecer contraseña invalida la contraseña anterior y permite login con la nueva", async () => {
    const resReset = await fetch(`${BASE_URL}/api/admin/usuarios/${nuevoUsuarioId}/restablecer-contrasena`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        nueva_contrasena: passwordNueva,
      }),
    });
    assert.strictEqual(resReset.status, 200);

    // Login con contraseña anterior debe fallar
    const resVieja = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: usernameTest, password: passwordInicial }),
    });
    assert.strictEqual(resVieja.status, 401);

    // Login con nueva contraseña debe triunfar
    const resNueva = await loginUser(usernameTest, passwordNueva);
    assert.strictEqual(resNueva.usuario.username, usernameTest);
  });

  // 15. Hash no se expone
  await test(15, "Hashes de contraseña nunca se exponen en APIs de administración", async () => {
    const resList = await fetch(`${BASE_URL}/api/admin/usuarios`, {
      headers: { "x-session-id": admin.sid, Cookie: admin.cookie },
    });
    const bodyList = (await resList.json()) as any;
    for (const u of bodyList.datos) {
      assert.strictEqual((u as any).password_hash, undefined);
      assert.strictEqual((u as any).password, undefined);
    }

    const resSingle = await fetch(`${BASE_URL}/api/admin/usuarios/${nuevoUsuarioId}`, {
      headers: { "x-session-id": admin.sid, Cookie: admin.cookie },
    });
    const bodySingle = (await resSingle.json()) as any;
    assert.strictEqual((bodySingle.datos as any).password_hash, undefined);
    assert.strictEqual((bodySingle.datos as any).password, undefined);
  });

  // 16. No se registran contraseñas en auditoría
  await test(16, "No se registran contraseñas ni hashes en registros de auditoría", async () => {
    const auditRes = await pool.query(
      `SELECT * FROM auditoria_eventos WHERE entidad_tipo = 'usuarios' AND entidad_id = $1;`,
      [nuevoUsuarioId]
    );
    assert.ok(auditRes.rows.length > 0);
    for (const row of auditRes.rows) {
      const vAnt = JSON.stringify(row.valor_anterior || {});
      const vNue = JSON.stringify(row.valor_nuevo || {});
      const mot = String(row.motivo || "");
      assert.strictEqual(vAnt.includes(passwordInicial), false);
      assert.strictEqual(vAnt.includes(passwordNueva), false);
      assert.strictEqual(vNue.includes(passwordInicial), false);
      assert.strictEqual(vNue.includes(passwordNueva), false);
      assert.strictEqual(mot.includes(passwordInicial), false);
      assert.strictEqual(mot.includes(passwordNueva), false);
    }
  });

  // 17. No se puede desactivar al último administrador funcional
  await test(17, "Protección: No se puede desactivar al último administrador funcional (HTTP 409 ULTIMO_ADMINISTRADOR_PROTEGIDO)", async () => {
    // admin es el único admin principal activo
    const res = await fetch(`${BASE_URL}/api/admin/usuarios/${admin.usuario.id}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        estado: "INACTIVO",
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 409);
    assert.strictEqual(body.codigo, "ULTIMO_ADMINISTRADOR_PROTEGIDO");
  });

  // 18. No se puede quitar el rol ADMINISTRADOR al último administrador funcional
  await test(18, "Protección: No se puede quitar rol ADMINISTRADOR al último administrador activo (HTTP 409)", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/usuarios/${admin.usuario.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        rol: "EMPLEADO",
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 409);
    assert.strictEqual(body.codigo, "ULTIMO_ADMINISTRADOR_PROTEGIDO");
  });

  // 19. SEGURIDAD genérico conserva operación de Garita
  await test(19, "Cuenta genérica SEGURIDAD conserva acceso y operaciones en Garita", async () => {
    const resGarita = await fetch(`${BASE_URL}/api/garita/empleados/buscar?identificador=${empleado1.cedula}`, {
      headers: {
        "x-session-id": seguridad.sid,
        Cookie: seguridad.cookie,
      },
    });
    assert.strictEqual(resGarita.status, 200);
    const body = (await resGarita.json()) as any;
    assert.strictEqual(body.exito, true);
  });

  // 20. SEGURIDAD genérico continúa sin Autoservicio
  await test(20, "Cuenta genérica SEGURIDAD no puede acceder ni marcar en Autoservicio", async () => {
    const resAuto = await fetch(`${BASE_URL}/api/autoservicio/marcar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": seguridad.sid,
        "x-csrf-token": seguridad.csrf,
        Cookie: seguridad.cookie,
      },
      body: JSON.stringify({ tipo: "ENTRADA" }),
    });
    // Debe ser rechazado porque no posee empleado vinculado ni permiso
    assert.strictEqual(resAuto.status === 400 || resAuto.status === 403, true);
  });

  // 21. Usuario personal conserva acceso a Autoservicio cuando corresponda
  await test(21, "Usuario personal con empleado vinculado puede consultar su estado de autoservicio", async () => {
    const usrPersonal = await loginUser("empleado", "PassSegura_2026!*");
    const resAuto = await fetch(`${BASE_URL}/api/autoservicio/estado`, {
      headers: {
        "x-session-id": usrPersonal.sid,
        Cookie: usrPersonal.cookie,
      },
    });
    assert.strictEqual(resAuto.status, 200);
    const body = (await resAuto.json()) as any;
    assert.strictEqual(body.exito, true);
  });

  // 22. Eliminar usuario físicamente no está disponible (HTTP 405)
  await test(22, "Eliminación física de usuario no está disponible (HTTP 405 ELIMINACION_NO_PERMITIDA)", async () => {
    const resDel = await fetch(`${BASE_URL}/api/admin/usuarios/${nuevoUsuarioId}`, {
      method: "DELETE",
      headers: {
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
    });
    const body = (await resDel.json()) as any;
    assert.strictEqual(resDel.status, 405);
    assert.strictEqual(body.codigo, "ELIMINACION_NO_PERMITIDA");
  });

  // 23. Eventos administrativos quedan auditados
  await test(23, "Eventos de administración de usuarios quedan auditados en PostgreSQL", async () => {
    const eventosRes = await pool.query(
      `SELECT accion FROM auditoria_eventos 
       WHERE entidad_tipo = 'usuarios' AND entidad_id = $1;`,
      [nuevoUsuarioId]
    );
    const acciones = eventosRes.rows.map((r) => r.accion);
    assert.ok(acciones.includes("CREAR_USUARIO"));
    assert.ok(acciones.includes("CAMBIAR_ROL_USUARIO"));
    assert.ok(acciones.includes("DESACTIVAR_USUARIO"));
    assert.ok(acciones.includes("ACTIVAR_USUARIO"));
    assert.ok(acciones.includes("RESTABLECER_CONTRASENA"));
  });

  // 24. PostgreSQL continúa siendo la única persistencia operativa
  await test(24, "PostgreSQL continúa siendo la única persistencia operativa conectada", async () => {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthBody = (await healthRes.json()) as any;
    assert.strictEqual(healthBody.datos.persistencia.adaptador, "POSTGRESQL");
    assert.strictEqual(healthBody.datos.persistencia.estado, "CONECTADO");
  });

  // 25. No se introduce sexto rol
  await test(25, "El catálogo de roles RBAC se mantiene estricto en los 5 canónicos", async () => {
    const rolesRes = await pool.query(`SELECT DISTINCT rol FROM roles_permisos ORDER BY rol ASC;`);
    const rolesEncontrados = rolesRes.rows.map((r) => r.rol);
    const rolesEsperados = [
      "ADMINISTRADOR",
      "EMPLEADO",
      "SEGURIDAD",
      "SUPERVISOR_SEGURIDAD",
      "TALENTO_HUMANO",
    ];
    assert.deepStrictEqual(rolesEncontrados.sort(), rolesEsperados.sort());
    assert.strictEqual(rolesEncontrados.length, 5);
  });

  console.log("======================================================");
  console.log(`RESUMEN FASE 3.2D: PASS: ${passCount} / FAIL: ${failCount} (TOTAL: ${passCount + failCount})`);
  console.log("======================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase32dSuite().catch((err) => {
  console.error("Error fatal en suite Fase 3.2D:", err);
  process.exit(1);
});
