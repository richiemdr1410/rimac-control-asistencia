import pg from "pg";
import { hashPassword } from "../server/auth/crypto.js";

const { Pool } = pg;

export async function seedPostgresDemo(): Promise<{ exito: boolean; mensaje: string; resumen: Record<string, number> }> {
  const host = process.env.SQL_HOST;
  const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
  const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;
  const database = process.env.SQL_DB_NAME;

  let pool: pg.Pool;
  if (host && user && database) {
    pool = new Pool({
      host,
      user,
      password,
      database,
      ssl: false,
      connectionTimeoutMillis: 10000,
    });
  } else if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    });
  } else {
    throw new Error("No hay credenciales configuradas para ejecutar el seed de PostgreSQL.");
  }

  const client = await pool.connect();
  const resumen: Record<string, number> = {};

  try {
    await client.query("BEGIN;");

    // 1. Departamentos
    const deptos = [
      { id: "11111111-1111-4111-8111-111111111101", codigo: "DTH", nombre: "Talento Humano" },
      { id: "11111111-1111-4111-8111-111111111102", codigo: "TI", nombre: "Tecnología de la Información" },
      { id: "11111111-1111-4111-8111-111111111103", codigo: "SEG", nombre: "Seguridad y Control Patrimonial" },
      { id: "11111111-1111-4111-8111-111111111104", codigo: "PROD", nombre: "Producción y Planta" },
    ];
    for (const d of deptos) {
      await client.query(
        `INSERT INTO departamentos (id, codigo, nombre) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (codigo) DO NOTHING;`,
        [d.id, d.codigo, d.nombre]
      );
    }
    resumen.departamentos = deptos.length;

    // 2. Puestos
    const puestos = [
      { id: "22222222-2222-4222-8222-222222222201", deptoId: deptos[1].id, codigo: "ADMIN_SIS", nombre: "Administrador de Sistemas" },
      { id: "22222222-2222-4222-8222-222222222202", deptoId: deptos[0].id, codigo: "ANALISTA_TH", nombre: "Analista de Talento Humano" },
      { id: "22222222-2222-4222-8222-222222222203", deptoId: deptos[2].id, codigo: "SUP_SEG", nombre: "Supervisor de Seguridad" },
      { id: "22222222-2222-4222-8222-222222222204", deptoId: deptos[2].id, codigo: "GUARDA_GARITA", nombre: "Oficial de Garita" },
      { id: "22222222-2222-4222-8222-222222222205", deptoId: deptos[3].id, codigo: "OP_PLANTA", nombre: "Operario de Producción" },
    ];
    for (const p of puestos) {
      await client.query(
        `INSERT INTO puestos (id, departamento_id, codigo, nombre) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (codigo) DO NOTHING;`,
        [p.id, p.deptoId, p.codigo, p.nombre]
      );
    }
    resumen.puestos = puestos.length;

    // 3. Empleados Ficticios
    const empleados = [
      { id: "33333333-3333-4333-8333-333333333301", cedula: "DEMO-1001", nombre: "Admin Demo Sistemas", correo: "admin.demo@rimac-ficticio.local", deptoId: deptos[1].id, puestoId: puestos[0].id },
      { id: "33333333-3333-4333-8333-333333333302", cedula: "DEMO-1002", nombre: "Lic. Andrea Humano", correo: "talento.demo@rimac-ficticio.local", deptoId: deptos[0].id, puestoId: puestos[1].id },
      { id: "33333333-3333-4333-8333-333333333303", cedula: "DEMO-1003", nombre: "Cap. Roberto Supervisor", correo: "supervisor.seg@rimac-ficticio.local", deptoId: deptos[2].id, puestoId: puestos[2].id },
      { id: "33333333-3333-4333-8333-333333333304", cedula: "DEMO-1004", nombre: "Oficial Carlos Garita", correo: "seguridad.demo@rimac-ficticio.local", deptoId: deptos[2].id, puestoId: puestos[3].id },
      { id: "33333333-3333-4333-8333-333333333305", cedula: "DEMO-1005", nombre: "Carlos Alvarado", correo: "carlos.alvarado@rimac.cr", deptoId: deptos[3].id, puestoId: puestos[4].id },
    ];
    for (const e of empleados) {
      await client.query(
        `INSERT INTO empleados (id, cedula, nombre_completo, correo_laboral, departamento_id, puesto_id) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT (cedula) DO UPDATE SET
           nombre_completo = EXCLUDED.nombre_completo,
           correo_laboral = EXCLUDED.correo_laboral,
           departamento_id = EXCLUDED.departamento_id,
           puesto_id = EXCLUDED.puesto_id;`,
        [e.id, e.cedula, e.nombre, e.correo, e.deptoId, e.puestoId]
      );
    }
    resumen.empleados = empleados.length;

    // 4. Usuarios Demo para los 5 roles
    // Soportar ambas claves para interoperabilidad de pruebas académicas
    const passHash = hashPassword("PassSegura_2026!*");

    const usuarios = [
      { id: "44444444-4444-4444-8444-444444444401", username: "admin", email: "admin@rimac.cr", nombre: "Admin Demo Sistemas", rol: "ADMINISTRADOR", empId: empleados[0].id, pass: passHash },
      { id: "44444444-4444-4444-8444-444444444402", username: "talento_humano", email: "talento.humano@rimac.cr", nombre: "Lic. Andrea Humano", rol: "TALENTO_HUMANO", empId: empleados[1].id, pass: passHash },
      { id: "44444444-4444-4444-8444-444444444403", username: "supervisor_seg", email: "supervisor.seguridad@rimac.cr", nombre: "Cap. Roberto Supervisor", rol: "SUPERVISOR_SEGURIDAD", empId: empleados[2].id, pass: passHash },
      { id: "44444444-4444-4444-8444-444444444404", username: "seguridad", email: "seguridad@rimac.cr", nombre: "Terminal Garita RIMAC", rol: "SEGURIDAD", empId: null, pass: passHash },
      { id: "44444444-4444-4444-8444-444444444405", username: "empleado", email: "carlos.alvarado@rimac.cr", nombre: "Carlos Alvarado", rol: "EMPLEADO", empId: empleados[4].id, pass: passHash },
    ];
    for (const u of usuarios) {
      await client.query(
        `INSERT INTO usuarios (id, username, email, nombre_completo, password_hash, rol, empleado_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         ON CONFLICT (username) DO UPDATE SET
           email = EXCLUDED.email,
           nombre_completo = EXCLUDED.nombre_completo,
           password_hash = EXCLUDED.password_hash,
           rol = EXCLUDED.rol,
           empleado_id = EXCLUDED.empleado_id;`,
        [u.id, u.username, u.email, u.nombre, u.pass, u.rol, u.empId]
      );
    }
    // Eliminar usuarios obsoletos con prefijo usr_ si existieran
    await client.query("DELETE FROM usuarios WHERE username LIKE 'usr_%';");
    resumen.usuarios = usuarios.length;

    // 5. Configuración del Sistema (Salida Omitida = 120 min)
    await client.query(
      `INSERT INTO configuraciones_sistema (clave, valor, tipo_dato, descripcion, actualizado_por_id) 
       VALUES ('MINUTOS_GRACIA_SALIDA_OMITIDA', '120', 'INTEGER', 'Minutos de espera tras hora de salida antes de declarar salida omitida', $1) 
       ON CONFLICT (clave) DO NOTHING;`,
      [usuarios[0].id]
    );
    resumen.configuraciones = 1;

    // 6. Horario Demo y Detalles de Horario
    const horarioId = "55555555-5555-4555-8555-555555555501";
    await client.query(
      `INSERT INTO horarios (id, codigo, nombre, tolerancia_entrada_minutos, minutos_semanales_referencia, minutos_desayuno_max, minutos_almuerzo_max, minutos_cafe_max) 
       VALUES ($1, 'TURNO_REGULAR_L_V', 'Turno Diurno Lunes a Viernes', 5, 2880, 15, 30, 15) 
       ON CONFLICT (codigo) DO NOTHING;`,
      [horarioId]
    );

    // Lunes a Viernes laborables (días 1 a 5: 07:00 a 16:30 = 9h30m con descansos)
    for (let dia = 1; dia <= 7; dia++) {
      const esLaborable = dia <= 5;
      await client.query(
        `INSERT INTO horario_detalles_dia (horario_id, dia_semana, es_laborable, hora_entrada, hora_salida, minutos_esperados) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT (horario_id, dia_semana) DO NOTHING;`,
        [
          horarioId,
          dia,
          esLaborable,
          esLaborable ? "07:00:00" : null,
          esLaborable ? "16:30:00" : null,
          esLaborable ? 570 : 0,
        ]
      );
    }
    resumen.horarios = 1;

    // 7. Asignación de Horario Vigente a Empleados Demo
    for (const emp of empleados) {
      await client.query(
        `INSERT INTO asignaciones_horario (id, empleado_id, horario_id, fecha_inicio, fecha_fin, usuario_asigno_id) 
         SELECT $1, $2, $3, '2026-01-01', NULL, $4
         WHERE NOT EXISTS (SELECT 1 FROM asignaciones_horario WHERE empleado_id = $2);`,
        [`66666666-6666-4666-8666-${emp.id.slice(-12)}`, emp.id, horarioId, usuarios[1].id]
      );
    }
    resumen.asignaciones_horario = empleados.length;

    // 8. Jefaturas Demo:
    // Andrea Humano supervisa a Carlos Alvarado
    // Roberto Supervisor supervisa a Oficial Carlos Garita
    // Admin Demo Sistemas supervisa a Andrea Humano (Relación Organizacional Demo Superior)
    await client.query(
      `INSERT INTO asignaciones_jefatura (id, jefatura_empleado_id, subordinado_empleado_id, fecha_inicio, fecha_fin, estado) 
       VALUES ('77777777-7777-4777-8777-777777777701', $1, $2, '2026-01-01', NULL, 'ACTIVA') 
       ON CONFLICT (id) DO NOTHING;`,
      [empleados[1].id, empleados[4].id]
    );
    await client.query(
      `INSERT INTO asignaciones_jefatura (id, jefatura_empleado_id, subordinado_empleado_id, fecha_inicio, fecha_fin, estado) 
       VALUES ('77777777-7777-4777-8777-777777777702', $1, $2, '2026-01-01', NULL, 'ACTIVA') 
       ON CONFLICT (id) DO NOTHING;`,
      [empleados[2].id, empleados[3].id]
    );
    await client.query(
      `INSERT INTO asignaciones_jefatura (id, jefatura_empleado_id, subordinado_empleado_id, fecha_inicio, fecha_fin, estado) 
       VALUES ('77777777-7777-4777-8777-777777777703', $1, $2, '2026-01-01', NULL, 'ACTIVA') 
       ON CONFLICT (id) DO NOTHING;`,
      [empleados[0].id, empleados[1].id]
    );
    resumen.asignaciones_jefatura = 3;

    // 9. Políticas de Solicitud (Fase 3: Flujos de Aprobación Configurables)
    const politicas = [
      { id: "88888888-8888-4888-8888-888888888811", tipo: "PERMISO", evidencia: false, niveles: 1, n1: "JEFATURA_DIRECTA", n2: null },
      { id: "88888888-8888-4888-8888-888888888803", tipo: "VACACIONES", evidencia: false, niveles: 2, n1: "JEFATURA_DIRECTA", n2: "TALENTO_HUMANO" },
      { id: "88888888-8888-4888-8888-888888888812", tipo: "JUSTIFICACION_AUSENCIA", evidencia: false, niveles: 2, n1: "JEFATURA_DIRECTA", n2: "TALENTO_HUMANO" },
      { id: "88888888-8888-4888-8888-888888888813", tipo: "JUSTIFICACION_TARDIA", evidencia: false, niveles: 1, n1: "JEFATURA_DIRECTA", n2: null },
      { id: "88888888-8888-4888-8888-888888888814", tipo: "JUSTIFICACION_MARCA_OMITIDA", evidencia: false, niveles: 1, n1: "JEFATURA_DIRECTA", n2: null },
      { id: "88888888-8888-4888-8888-888888888801", tipo: "PERMISO_CON_GOCE", evidencia: true, niveles: 2, n1: "JEFATURA_DIRECTA", n2: "TALENTO_HUMANO" },
      { id: "88888888-8888-4888-8888-888888888802", tipo: "PERMISO_SIN_GOCE", evidencia: false, niveles: 2, n1: "JEFATURA_DIRECTA", n2: "TALENTO_HUMANO" },
      { id: "88888888-8888-4888-8888-888888888804", tipo: "INCAPACIDAD", evidencia: true, niveles: 1, n1: "TALENTO_HUMANO", n2: null },
      { id: "88888888-8888-4888-8888-888888888805", tipo: "JUSTIFICACION_OMISION_MARCA", evidencia: false, niveles: 1, n1: "JEFATURA_DIRECTA", n2: null },
      { id: "88888888-8888-4888-8888-888888888806", tipo: "TIEMPO_EXTRAORDINARIO", evidencia: false, niveles: 2, n1: "JEFATURA_DIRECTA", n2: "TALENTO_HUMANO" },
    ];
    for (const pol of politicas) {
      await client.query(
        `INSERT INTO politicas_solicitud (id, tipo_solicitud, requiere_evidencia, niveles_aprobacion_requeridos, rol_aprobador_nivel_1, rol_aprobador_nivel_2) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT (tipo_solicitud) DO UPDATE SET
           niveles_aprobacion_requeridos = EXCLUDED.niveles_aprobacion_requeridos,
           rol_aprobador_nivel_1 = EXCLUDED.rol_aprobador_nivel_1,
           rol_aprobador_nivel_2 = EXCLUDED.rol_aprobador_nivel_2,
           activo = true;`,
        [pol.id, pol.tipo, pol.evidencia, pol.niveles, pol.n1, pol.n2]
      );
    }
    resumen.politicas_solicitud = politicas.length;

    // 10. Feriado Demo
    await client.query(
      `INSERT INTO feriados (id, fecha, descripcion, tipo_feriado) 
       VALUES ('99999999-9999-4999-8999-999999999901', '2026-10-12', 'Encuentro de Culturas', 'PAGO_OBLIGATORIO') 
       ON CONFLICT (fecha) DO NOTHING;`,
      []
    );
    resumen.feriados = 1;

    // 11. RAG Documento Base
    const ragDocId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await client.query(
      `INSERT INTO rag_documentos (id, codigo, titulo, version, total_paginas) 
       VALUES ($1, 'DTH-REG-001', 'Reglamento Interno de Trabajo RIMAC S.A.', '1.0', 38) 
       ON CONFLICT (codigo) DO NOTHING;`,
      [ragDocId]
    );

    await client.query(
      `INSERT INTO rag_chunks (id, documento_id, chunk_codigo, titulo_seccion, articulo, pagina, contenido) 
       VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', $1, 'DTH-REG-001-ART-09-P1', 'TITULO III - JORNADA Y DESCANSOS', 'ARTICULO 9', 7, 'Descansos autorizados: desayuno 15 min, almuerzo 30 min, cafe 15 min.') 
       ON CONFLICT (chunk_codigo) DO NOTHING;`,
      [ragDocId]
    );
    resumen.rag_documentos = 1;

    await client.query("COMMIT;");
    console.log("[Seed PostgreSQL] Seed ejecutado exitosamente de forma idempotente.");
    return { exito: true, mensaje: "Seed completado", resumen };
  } catch (err: any) {
    await client.query("ROLLBACK;");
    console.error("[Seed PostgreSQL] Error ejecutando seed:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  seedPostgresDemo()
    .then((r) => {
      console.log(JSON.stringify(r.resumen));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
