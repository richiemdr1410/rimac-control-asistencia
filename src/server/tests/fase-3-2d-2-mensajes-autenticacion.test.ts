import assert from "node:assert";
import { getPool } from "../../db/index.js";
import { getFriendlyErrorMessage, AppApiError } from "../../services/api.js";
import { hashPassword } from "../auth/crypto.js";

const BASE_URL = "http://127.0.0.1:3000";

async function runFase32d2Suite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.2D.2 ===");
  console.log("=== CORRECCIÓN DE MENSAJES DE AUTENTICACIÓN ===");

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

  // Asegurar entorno y estado base de usuarios canónicos
  await pool.query(`UPDATE usuarios SET estado = 'ACTIVO' WHERE username IN ('admin', 'talento_humano', 'supervisor_seg', 'seguridad', 'empleado');`);
  await pool.query(`UPDATE empleados SET estado = 'ACTIVO' WHERE id IN (SELECT empleado_id FROM usuarios WHERE empleado_id IS NOT NULL AND username IN ('admin', 'talento_humano', 'supervisor_seg', 'empleado'));`);

  const passValidaComun = "PassSegura_2026!*";
  const passHashComun = hashPassword(passValidaComun);

  // Crear o asegurar usuarios de prueba específicos para la suite:
  // 1. Usuario inactivo de prueba
  const userInactivoNombre = "qa_user_inactivo_32d2";
  await pool.query(`
    INSERT INTO usuarios (id, username, email, nombre_completo, password_hash, rol, estado)
    VALUES ('aaaaaaaa-1111-4111-8111-111111111101', $1, 'inactivo_32d2@rimac.cr', 'Usuario Inactivo QA', $2, 'EMPLEADO', 'INACTIVO')
    ON CONFLICT (username) DO UPDATE SET estado = 'INACTIVO', password_hash = $2;
  `, [userInactivoNombre, passHashComun]);

  // 2. Usuario bloqueado de prueba
  const userBloqueadoNombre = "qa_user_bloqueado_32d2";
  await pool.query(`
    INSERT INTO usuarios (id, username, email, nombre_completo, password_hash, rol, estado)
    VALUES ('aaaaaaaa-2222-4222-8222-222222222202', $1, 'bloqueado_32d2@rimac.cr', 'Usuario Bloqueado QA', $2, 'EMPLEADO', 'BLOQUEADO')
    ON CONFLICT (username) DO UPDATE SET estado = 'BLOQUEADO', password_hash = $2;
  `, [userBloqueadoNombre, passHashComun]);

  // 3. Usuario activo vinculado a empleado inactivo
  // Crear empleado inactivo
  const empInactivoId = "bbbbbbbb-3333-4333-8333-333333333303";
  await pool.query(`
    INSERT INTO empleados (id, cedula, nombre_completo, correo_laboral, estado, departamento_id, puesto_id)
    VALUES ($1, '909990888', 'Colaborador Inactivo Laboral', 'emp_inact_32d2@rimac.cr', 'INACTIVO', '11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222201')
    ON CONFLICT (id) DO UPDATE SET estado = 'INACTIVO';
  `, [empInactivoId]);

  const userEmpInactivoNombre = "qa_user_emp_inactivo_32d2";
  await pool.query(`
    INSERT INTO usuarios (id, username, email, nombre_completo, password_hash, rol, estado, empleado_id)
    VALUES ('aaaaaaaa-3333-4333-8333-333333333303', $1, 'emp_inactivo_32d2@rimac.cr', 'Usuario Emp Inactivo QA', $2, 'EMPLEADO', 'ACTIVO', $3)
    ON CONFLICT (username) DO UPDATE SET estado = 'ACTIVO', empleado_id = $3, password_hash = $2;
  `, [userEmpInactivoNombre, passHashComun, empInactivoId]);

  // =========================================================================
  // PRUEBAS DIRIGIDAS (SECCIÓN 5)
  // =========================================================================

  // 1. Usuario inexistente
  await test(1, "1. Usuario inexistente devuelve HTTP 401 controlado con mensaje 'Usuario o contraseña incorrectos.'", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: "usuario_que_no_existe_999", contrasena: "CualquierPass!123" }),
    });

    assert.strictEqual(res.status, 401);
    const contentType = res.headers.get("content-type") || "";
    assert.ok(contentType.includes("application/json"), "Debe devolver application/json");
    const json = (await res.json()) as any;
    assert.strictEqual(json.exito, false);
    assert.strictEqual(json.codigo, "CREDENCIALES_INVALIDAS");
    assert.strictEqual(json.mensaje, "Usuario o contraseña incorrectos.");
    assert.strictEqual(json.error.codigo, "CREDENCIALES_INVALIDAS");
    assert.strictEqual(json.error.mensaje, "Usuario o contraseña incorrectos.");
  });

  // 2. Contraseña incorrecta
  await test(2, "2. Contraseña incorrecta para usuario existente devuelve HTTP 401 con 'Usuario o contraseña incorrectos.'", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: "admin", contrasena: "PasswordEquivocada999!" }),
    });

    assert.strictEqual(res.status, 401);
    const json = (await res.json()) as any;
    assert.strictEqual(json.exito, false);
    assert.strictEqual(json.codigo, "CREDENCIALES_INVALIDAS");
    assert.strictEqual(json.mensaje, "Usuario o contraseña incorrectos.");
    assert.strictEqual(json.error.codigo, "CREDENCIALES_INVALIDAS");
  });

  // 3. Usuario inactivo
  await test(3, "3. Usuario INACTIVO con credenciales válidas devuelve HTTP 403 con mensaje de cuenta inactiva", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: userInactivoNombre, contrasena: passValidaComun }),
    });

    assert.strictEqual(res.status, 403);
    const contentType = res.headers.get("content-type") || "";
    assert.ok(contentType.includes("application/json"), "Debe ser JSON");
    const json = (await res.json()) as any;
    assert.strictEqual(json.exito, false);
    assert.strictEqual(json.codigo, "USUARIO_INACTIVO");
    assert.strictEqual(json.mensaje, "Su cuenta se encuentra inactiva. Comuníquese con Recursos Humanos o el Departamento de TI.");
    assert.strictEqual(json.error.codigo, "USUARIO_INACTIVO");
    assert.strictEqual(json.error.mensaje, "Su cuenta se encuentra inactiva. Comuníquese con Recursos Humanos o el Departamento de TI.");
  });

  // 4. Usuario bloqueado
  await test(4, "4. Usuario BLOQUEADO con credenciales válidas devuelve HTTP 403 con mensaje de cuenta bloqueada", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: userBloqueadoNombre, contrasena: passValidaComun }),
    });

    assert.strictEqual(res.status, 403);
    const contentType = res.headers.get("content-type") || "";
    assert.ok(contentType.includes("application/json"), "Debe ser JSON");
    const json = (await res.json()) as any;
    assert.strictEqual(json.exito, false);
    assert.strictEqual(json.codigo, "USUARIO_BLOQUEADO");
    assert.strictEqual(json.mensaje, "Su cuenta se encuentra bloqueada. Comuníquese con el Departamento de TI.");
    assert.strictEqual(json.error.codigo, "USUARIO_BLOQUEADO");
    assert.strictEqual(json.error.mensaje, "Su cuenta se encuentra bloqueada. Comuníquese con el Departamento de TI.");
  });

  // 5. Empleado inactivo
  await test(5, "5. Empleado INACTIVO vinculado devuelve HTTP 403 con mensaje de expediente laboral inactivo", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: userEmpInactivoNombre, contrasena: passValidaComun }),
    });

    assert.strictEqual(res.status, 403);
    const json = (await res.json()) as any;
    assert.strictEqual(json.exito, false);
    assert.strictEqual(json.codigo, "EMPLEADO_INACTIVO");
    assert.strictEqual(json.mensaje, "Su acceso está deshabilitado porque su expediente laboral se encuentra inactivo. Comuníquese con Recursos Humanos.");
    assert.strictEqual(json.error.codigo, "EMPLEADO_INACTIVO");
    assert.strictEqual(json.error.mensaje, "Su acceso está deshabilitado porque su expediente laboral se encuentra inactivo. Comuníquese con Recursos Humanos.");
  });

  // 6. Usuario activo con credenciales válidas
  await test(6, "6. Usuario activo con credenciales válidas se autentica con HTTP 200 y emite sesión", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: "admin", contrasena: passValidaComun }),
    });

    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as any;
    assert.strictEqual(json.exito, true);
    assert.ok(json.datos.sesion_id, "Debe retornar sesion_id");
    assert.ok(json.datos.token_csrf, "Debe retornar token_csrf");
    assert.strictEqual(json.datos.usuario.username, "admin");
    assert.strictEqual(json.datos.usuario.rol, "ADMINISTRADOR");
  });

  // 7. Respuestas JSON para errores controlados
  await test(7, "7. Respuestas JSON para errores controlados de autenticación no contienen HTML ni layouts", async () => {
    const endpoints = [
      { body: { identificador: "invalido", contrasena: "erronea" }, statusEsperado: 401 },
      { body: { identificador: userInactivoNombre, contrasena: passValidaComun }, statusEsperado: 403 },
      { body: { identificador: userBloqueadoNombre, contrasena: passValidaComun }, statusEsperado: 403 },
      { body: { identificador: userEmpInactivoNombre, contrasena: passValidaComun }, statusEsperado: 403 },
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ep.body),
      });

      assert.strictEqual(res.status, ep.statusEsperado);
      const ct = res.headers.get("content-type") || "";
      assert.ok(ct.includes("application/json"), `Content-Type debe ser JSON, recibido: ${ct}`);
      const text = await res.text();
      assert.ok(!text.includes("<!DOCTYPE"), "No debe contener HTML ni doctype");
      assert.ok(!text.includes("<html"), "No debe contener etiquetas HTML");
      const parsed = JSON.parse(text);
      assert.strictEqual(parsed.exito, false);
      assert.ok(parsed.codigo, "Debe tener campo codigo");
      assert.ok(parsed.mensaje, "Debe tener campo mensaje");
    }
  });

  // 8. Mensajes visibles correctamente en el formulario (getFriendlyErrorMessage)
  await test(8, "8. getFriendlyErrorMessage traduce explícitamente los códigos requeridos para el formulario", async () => {
    // A. Credenciales inválidas
    const msgCred = getFriendlyErrorMessage(new AppApiError({
      status: 401,
      codigo: "CREDENCIALES_INVALIDAS",
      mensaje: "Usuario o contraseña incorrectos.",
    }));
    assert.strictEqual(msgCred.descripcion, "Usuario o contraseña incorrectos.");
    assert.strictEqual(msgCred.titulo, "Credenciales inválidas");

    // B. Cuenta inactiva
    const msgInact = getFriendlyErrorMessage(new AppApiError({
      status: 403,
      codigo: "USUARIO_INACTIVO",
      mensaje: "Su cuenta se encuentra inactiva. Comuníquese con Recursos Humanos o el Departamento de TI.",
    }));
    assert.strictEqual(msgInact.descripcion, "Su cuenta se encuentra inactiva. Comuníquese con Recursos Humanos o el Departamento de TI.");
    assert.strictEqual(msgInact.titulo, "Cuenta inactiva");

    // C. Cuenta bloqueada
    const msgBloq = getFriendlyErrorMessage(new AppApiError({
      status: 403,
      codigo: "USUARIO_BLOQUEADO",
      mensaje: "Su cuenta se encuentra bloqueada. Comuníquese con el Departamento de TI.",
    }));
    assert.strictEqual(msgBloq.descripcion, "Su cuenta se encuentra bloqueada. Comuníquese con el Departamento de TI.");
    assert.strictEqual(msgBloq.titulo, "Cuenta bloqueada");

    // D. Empleado inactivo
    const msgEmpInact = getFriendlyErrorMessage(new AppApiError({
      status: 403,
      codigo: "EMPLEADO_INACTIVO",
      mensaje: "Su acceso está deshabilitado porque su expediente laboral se encuentra inactivo. Comuníquese con Recursos Humanos.",
    }));
    assert.strictEqual(msgEmpInact.descripcion, "Su acceso está deshabilitado porque su expediente laboral se encuentra inactivo. Comuníquese con Recursos Humanos.");
    assert.strictEqual(msgEmpInact.titulo, "Empleado inactivo");

    // E. Servicio realmente no disponible (500, 502, 503, red)
    const msgServ = getFriendlyErrorMessage(new AppApiError({
      status: 503,
      codigo: "SERVICIO_NO_DISPONIBLE",
      mensaje: "No fue posible conectar con el sistema. Inténtelo nuevamente o comuníquese con el Departamento de TI.",
    }));
    assert.strictEqual(msgServ.descripcion, "No fue posible conectar con el sistema. Inténtelo nuevamente o comuníquese con el Departamento de TI.");
    assert.strictEqual(msgServ.titulo, "Servicio no disponible");

    // F. Compatibilidad: objeto con código y status (duck typing sin instanceof rígido)
    const duckTypingInact = getFriendlyErrorMessage({
      status: 403,
      codigo: "USUARIO_INACTIVO",
      mensaje: "Su cuenta se encuentra inactiva.",
    });
    assert.strictEqual(duckTypingInact.descripcion, "Su cuenta se encuentra inactiva. Comuníquese con Recursos Humanos o el Departamento de TI.");

    // G. VERIFICAR QUE UN HTTP 403 CONTROLADO NUNCA SEA INTERPRETADO COMO SERVICIO NO DISPONIBLE
    assert.notStrictEqual(msgInact.titulo, "Servicio no disponible");
    assert.notStrictEqual(msgBloq.titulo, "Servicio no disponible");
    assert.notStrictEqual(msgEmpInact.titulo, "Servicio no disponible");
  });

  // 9. No exposición de detalles internos
  await test(9, "9. No exposición de detalles técnicos, trazas, SQL ni variables internas en respuestas de error", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: userInactivoNombre, contrasena: passValidaComun }),
    });

    const json = (await res.json()) as any;
    const jsonStr = JSON.stringify(json).toLowerCase();

    assert.ok(!jsonStr.includes("select "), "No debe exponer SQL SELECT");
    assert.ok(!jsonStr.includes("insert "), "No debe exponer SQL INSERT");
    assert.ok(!jsonStr.includes("update "), "No debe exponer SQL UPDATE");
    assert.ok(!jsonStr.includes("postgres"), "No debe exponer referencias internas a PostgreSQL");
    assert.ok(!jsonStr.includes("stack"), "No debe exponer trazas de stack");
    assert.ok(!jsonStr.includes("password_hash"), "No debe exponer password_hash");
    assert.ok(!jsonStr.includes("dummy_salt"), "No debe exponer dummy_salt");
    assert.ok(!json.error?.stack, "No debe contener campo stack");
  });

  // 10. Cuenta operacional SEGURIDAD continúa autenticándose correctamente
  await test(10, "10. Cuenta operacional SEGURIDAD continúa autenticándose correctamente", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: "seguridad", contrasena: passValidaComun }),
    });

    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as any;
    assert.strictEqual(json.exito, true);
    assert.strictEqual(json.datos.usuario.username, "seguridad");
    assert.strictEqual(json.datos.usuario.rol, "SEGURIDAD");
    assert.ok(!json.datos.usuario.empleado_id);
    assert.ok(json.datos.sesion_id);
  });

  // 11. Mitigación contra enumeración de usuarios (contraseña errónea no revela si la cuenta está inactiva o bloqueada)
  await test(11, "11. Seguridad: Contraseña errónea en cuenta inactiva o bloqueada no revela su estado (devuelve CREDENCIALES_INVALIDAS)", async () => {
    const resInactivoPassFalsa = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: userInactivoNombre, contrasena: "PasswordCompletamenteFalsa999!" }),
    });

    assert.strictEqual(resInactivoPassFalsa.status, 401);
    const jsonInact = (await resInactivoPassFalsa.json()) as any;
    assert.strictEqual(jsonInact.codigo, "CREDENCIALES_INVALIDAS");
    assert.strictEqual(jsonInact.mensaje, "Usuario o contraseña incorrectos.");

    const resBloqPassFalsa = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: userBloqueadoNombre, contrasena: "PasswordCompletamenteFalsa999!" }),
    });

    assert.strictEqual(resBloqPassFalsa.status, 401);
    const jsonBloq = (await resBloqPassFalsa.json()) as any;
    assert.strictEqual(jsonBloq.codigo, "CREDENCIALES_INVALIDAS");
    assert.strictEqual(jsonBloq.mensaje, "Usuario o contraseña incorrectos.");
  });

  // 12. Limpieza de usuarios de prueba creados
  await test(12, "12. Limpieza de registros auxiliares de prueba y consistencia del estado en DB", async () => {
    await pool.query(`DELETE FROM usuarios WHERE username IN ($1, $2, $3);`, [userInactivoNombre, userBloqueadoNombre, userEmpInactivoNombre]);
    await pool.query(`DELETE FROM empleados WHERE id = $1;`, [empInactivoId]);
    await pool.query(`UPDATE usuarios SET estado = 'ACTIVO' WHERE username IN ('admin', 'talento_humano', 'supervisor_seg', 'seguridad', 'empleado');`);
    assert.ok(true);
  });

  console.log("======================================================");
  console.log(`RESUMEN FASE 3.2D.2: PASS: ${passCount} / FAIL: ${failCount} (TOTAL: ${passCount + failCount})`);
  console.log("======================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase32d2Suite().catch((err) => {
  console.error("Error fatal ejecutando suite FASE 3.2D.2:", err);
  process.exit(1);
});
