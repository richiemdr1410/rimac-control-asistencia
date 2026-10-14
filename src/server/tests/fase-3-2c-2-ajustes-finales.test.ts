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

async function runFase32c2Suite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.2C.2 ===");
  console.log("=== AJUSTES FINALES DE COLABORADORES Y HORARIOS DE 7 DÍAS ===");

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
  const ts = Date.now();
  const uniq = (p: string, len = 15) => `${p}${Math.random().toString(36).substring(2, 7)}`.substring(0, len).toUpperCase();

  // Actores autenticados
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");

  // Departamentos y puestos de prueba
  const deptoRes1 = await fetch(`${BASE_URL}/api/departamentos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": th.sid,
      "x-csrf-token": th.csrf,
      Cookie: th.cookie,
    },
    body: JSON.stringify({
      codigo: uniq("D1_"),
      nombre: `Depto QA Primario ${ts}`,
    }),
  });
  const depto1 = ((await deptoRes1.json()) as any).datos;

  const puestoRes1 = await fetch(`${BASE_URL}/api/puestos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": th.sid,
      "x-csrf-token": th.csrf,
      Cookie: th.cookie,
    },
    body: JSON.stringify({
      departamento_id: depto1.id,
      codigo: uniq("P1_"),
      nombre: `Puesto QA Primario ${ts}`,
    }),
  });
  const puesto1 = ((await puestoRes1.json()) as any).datos;

  const deptoRes2 = await fetch(`${BASE_URL}/api/departamentos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": th.sid,
      "x-csrf-token": th.csrf,
      Cookie: th.cookie,
    },
    body: JSON.stringify({
      codigo: uniq("D2_"),
      nombre: `Depto QA Secundario ${ts}`,
    }),
  });
  const depto2 = ((await deptoRes2.json()) as any).datos;

  const puestoRes2 = await fetch(`${BASE_URL}/api/puestos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": th.sid,
      "x-csrf-token": th.csrf,
      Cookie: th.cookie,
    },
    body: JSON.stringify({
      departamento_id: depto2.id,
      codigo: uniq("P2_"),
      nombre: `Puesto QA Secundario ${ts}`,
    }),
  });
  const puesto2 = ((await puestoRes2.json()) as any).datos;

  // Crear colaborador base para pruebas de edición
  const cedulaOriginal = uniq("CED", 20);
  const empRes = await fetch(`${BASE_URL}/api/empleados`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": th.sid,
      "x-csrf-token": th.csrf,
      Cookie: th.cookie,
    },
    body: JSON.stringify({
      cedula: cedulaOriginal,
      nombre_completo: `Colaborador Original ${ts}`,
      correo_laboral: `colab.orig.${ts}@rimac.cr`,
      telefono: "2222-0001",
      departamento_id: depto1.id,
      puesto_id: puesto1.id,
    }),
  });
  let colab = ((await empRes.json()) as any).datos;

  // 1. Modificación de datos de un colaborador
  await test(1, "Modificación de datos de un colaborador (nombre, correo laboral y teléfono)", async () => {
    const nuevoNombre = `Colaborador Editado ${ts}`;
    const nuevoCorreo = `colab.editado.${ts}@rimac.cr`;
    const nuevoTelefono = "8888-9999";

    const res = await fetch(`${BASE_URL}/api/empleados/${colab.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        nombre_completo: nuevoNombre,
        correo_laboral: nuevoCorreo,
        telefono: nuevoTelefono,
        departamento_id: colab.departamento_id,
        puesto_id: colab.puesto_id,
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.nombre_completo, nuevoNombre);
    assert.strictEqual(body.datos.correo_laboral, nuevoCorreo);
    assert.strictEqual(body.datos.telefono, nuevoTelefono);
    // Cédula debe mantenerse inmutable
    assert.strictEqual(body.datos.cedula, cedulaOriginal);
    colab = body.datos;
  });

  // 2. Cambio de departamento y puesto coherente
  await test(2, "Cambio de departamento y puesto coherente", async () => {
    const res = await fetch(`${BASE_URL}/api/empleados/${colab.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        nombre_completo: colab.nombre_completo,
        departamento_id: depto2.id,
        puesto_id: puesto2.id,
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.departamento_id, depto2.id);
    assert.strictEqual(body.datos.puesto_id, puesto2.id);
    colab = body.datos;
  });

  // 3. Rechazo de puesto incompatible
  await test(3, "Rechazo de puesto incompatible con HTTP 400 y código PUESTO_DEPARTAMENTO_INCONSISTENTE", async () => {
    // Intentar asignar depto2 pero puesto1 (que pertenece a depto1)
    const res = await fetch(`${BASE_URL}/api/empleados/${colab.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        nombre_completo: colab.nombre_completo,
        departamento_id: depto2.id,
        puesto_id: puesto1.id,
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    const cod = body.error?.codigo || body.codigo;
    assert.strictEqual(cod, "PUESTO_DEPARTAMENTO_INCONSISTENTE");
  });

  // 4. Usuario sin permiso no puede editar colaboradores
  await test(4, "Usuario sin permiso (EMPLEADO) no puede editar colaboradores (HTTP 403)", async () => {
    const res = await fetch(`${BASE_URL}/api/empleados/${colab.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": empleado.sid,
        "x-csrf-token": empleado.csrf,
        Cookie: empleado.cookie,
      },
      body: JSON.stringify({
        nombre_completo: "Intento No Autorizado",
      }),
    });

    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, false);
    const cod = body.error?.codigo || body.codigo;
    assert.strictEqual(cod, "PERMISO_DENEGADO");
  });

  // 5. Sábado laborable
  let horarioSabLab: any = null;
  await test(5, "Crear y verificar horario con sábado laborable", async () => {
    const res = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: uniq("HSAB_", 15),
        nombre: `Horario Sábado Laborable ${ts}`,
        tolerancia_entrada_minutos: 10,
        detalles_dia: [
          { dia_semana: 1, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 2, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 3, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 4, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 5, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 6, es_laborable: true, hora_entrada: "08:00", hora_salida: "12:00", minutos_esperados: 240, cruza_medianoche: false },
          { dia_semana: 7, es_laborable: false, minutos_esperados: 0, cruza_medianoche: false },
        ],
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    horarioSabLab = body.datos;

    const sabado = horarioSabLab.detalles_dia.find((d: any) => d.dia_semana === 6);
    assert.ok(sabado, "Debe existir detalle de sábado");
    assert.strictEqual(sabado.es_laborable, true);
    assert.strictEqual(sabado.hora_entrada, "08:00");
    assert.strictEqual(sabado.hora_salida, "12:00");
    assert.strictEqual(sabado.minutos_esperados, 240);
  });

  // 6. Domingo laborable
  let horarioDomLab: any = null;
  await test(6, "Crear y verificar horario con domingo laborable", async () => {
    const res = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: uniq("HDOM_", 15),
        nombre: `Horario Domingo Laborable ${ts}`,
        tolerancia_entrada_minutos: 15,
        detalles_dia: [
          { dia_semana: 1, es_laborable: false, minutos_esperados: 0, cruza_medianoche: false },
          { dia_semana: 2, es_laborable: true, hora_entrada: "07:00", hora_salida: "15:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 3, es_laborable: true, hora_entrada: "07:00", hora_salida: "15:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 4, es_laborable: true, hora_entrada: "07:00", hora_salida: "15:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 5, es_laborable: true, hora_entrada: "07:00", hora_salida: "15:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 6, es_laborable: false, minutos_esperados: 0, cruza_medianoche: false },
          { dia_semana: 7, es_laborable: true, hora_entrada: "09:00", hora_salida: "18:00", minutos_esperados: 480, cruza_medianoche: false },
        ],
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    horarioDomLab = body.datos;

    const domingo = horarioDomLab.detalles_dia.find((d: any) => d.dia_semana === 7);
    assert.ok(domingo, "Debe existir detalle de domingo");
    assert.strictEqual(domingo.es_laborable, true);
    assert.strictEqual(domingo.hora_entrada, "09:00");
    assert.strictEqual(domingo.hora_salida, "18:00");
  });

  // 7. Sábado y domingo no laborables
  await test(7, "Horario estándar con sábado y domingo no laborables (días de descanso)", async () => {
    const res = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: uniq("HSTD_", 15),
        nombre: `Horario Tradicional L-V ${ts}`,
        tolerancia_entrada_minutos: 15,
        detalles_dia: [
          { dia_semana: 1, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 2, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 3, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 4, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 5, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", minutos_esperados: 480, cruza_medianoche: false },
          { dia_semana: 6, es_laborable: false, minutos_esperados: 0, cruza_medianoche: false },
          { dia_semana: 7, es_laborable: false, minutos_esperados: 0, cruza_medianoche: false },
        ],
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    const sab = body.datos.detalles_dia.find((d: any) => d.dia_semana === 6);
    const dom = body.datos.detalles_dia.find((d: any) => d.dia_semana === 7);
    assert.strictEqual(sab.es_laborable, false);
    assert.strictEqual(dom.es_laborable, false);
  });

  // 8. Turno nocturno que cruza medianoche
  let horarioNocturno: any = null;
  await test(8, "Turno nocturno que cruza medianoche (cruza_medianoche = true)", async () => {
    const res = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: uniq("HNOCT_", 15),
        nombre: `Horario Nocturno Cruza Noche ${ts}`,
        tolerancia_entrada_minutos: 15,
        detalles_dia: [
          { dia_semana: 1, es_laborable: true, hora_entrada: "22:00", hora_salida: "06:00", minutos_esperados: 480, cruza_medianoche: true },
          { dia_semana: 2, es_laborable: true, hora_entrada: "22:00", hora_salida: "06:00", minutos_esperados: 480, cruza_medianoche: true },
          { dia_semana: 3, es_laborable: true, hora_entrada: "22:00", hora_salida: "06:00", minutos_esperados: 480, cruza_medianoche: true },
          { dia_semana: 4, es_laborable: true, hora_entrada: "22:00", hora_salida: "06:00", minutos_esperados: 480, cruza_medianoche: true },
          { dia_semana: 5, es_laborable: true, hora_entrada: "22:00", hora_salida: "06:00", minutos_esperados: 480, cruza_medianoche: true },
          { dia_semana: 6, es_laborable: false, minutos_esperados: 0, cruza_medianoche: false },
          { dia_semana: 7, es_laborable: false, minutos_esperados: 0, cruza_medianoche: false },
        ],
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    horarioNocturno = body.datos;

    const lunesNoct = horarioNocturno.detalles_dia.find((d: any) => d.dia_semana === 1);
    assert.strictEqual(lunesNoct.es_laborable, true);
    assert.strictEqual(lunesNoct.cruza_medianoche, true);
    assert.strictEqual(lunesNoct.hora_entrada, "22:00");
    assert.strictEqual(lunesNoct.hora_salida, "06:00");
  });

  // 9. Edición de horario sin alterar jornadas históricas
  await test(9, "Edición de horario actualiza su configuración sin alterar jornadas históricas", async () => {
    // Tomamos horarioSabLab y le actualizamos el nombre y tolerancia
    const nuevoNombreH = `Horario Sábado Actualizado ${ts}`;
    const res = await fetch(`${BASE_URL}/api/horarios/${horarioSabLab.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        nombre: nuevoNombreH,
        tolerancia_entrada_minutos: 20,
        detalles_dia: horarioSabLab.detalles_dia,
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.nombre, nuevoNombreH);
    assert.strictEqual(body.datos.tolerancia_entrada_minutos, 20);

    // Verificar en la BD que la tabla jornadas no sufrió alteraciones indebidas
    const checkJornadas = await pool.query(`SELECT count(*) as total FROM jornadas;`);
    assert.ok(checkJornadas.rows.length >= 1, "La tabla jornadas debe permanecer íntegra");
  });

  // 10. Auditoría de modificaciones
  await test(10, "Auditoría de modificaciones registra eventos ACTUALIZAR_EMPLEADO y ACTUALIZAR_HORARIO", async () => {
    const resAuditEmp = await pool.query(
      `SELECT accion, entidad_tipo, actor_usuario_id 
       FROM auditoria_eventos 
       WHERE accion = 'ACTUALIZAR_EMPLEADO' AND entidad_id = $1
       ORDER BY timestamp_evento DESC LIMIT 1;`,
      [colab.id]
    );
    assert.strictEqual(resAuditEmp.rows.length, 1, "Debe existir registro de auditoría ACTUALIZAR_EMPLEADO");
    assert.strictEqual(resAuditEmp.rows[0].accion, "ACTUALIZAR_EMPLEADO");

    const resAuditHor = await pool.query(
      `SELECT accion, entidad_tipo, actor_usuario_id 
       FROM auditoria_eventos 
       WHERE accion = 'ACTUALIZAR_HORARIO' AND entidad_id = $1
       ORDER BY timestamp_evento DESC LIMIT 1;`,
      [horarioSabLab.id]
    );
    assert.strictEqual(resAuditHor.rows.length, 1, "Debe existir registro de auditoría ACTUALIZAR_HORARIO");
    assert.strictEqual(resAuditHor.rows[0].accion, "ACTUALIZAR_HORARIO");
  });

  console.log("======================================================");
  console.log(`RESUMEN FASE 3.2C.2: PASS: ${passCount} / FAIL: ${failCount} (TOTAL: 10)`);
  console.log("======================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase32c2Suite().catch((err) => {
  console.error("Error fatal en suite Fase 3.2C.2:", err);
  process.exit(1);
});
