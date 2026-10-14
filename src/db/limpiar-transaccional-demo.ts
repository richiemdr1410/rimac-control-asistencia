import pg from "pg";

const { Pool } = pg;

export async function limpiarDatosTransaccionalesDemo(): Promise<{ exito: boolean; mensaje: string }> {
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
    throw new Error("No hay credenciales para limpiar datos transaccionales.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // 1. Limpieza de tablas transaccionales de pruebas
    await client.query(`
      TRUNCATE TABLE 
        correcciones_marcas,
        marcas, 
        jornadas, 
        idempotencia_solicitudes, 
        sesiones,
        solicitud_decisiones,
        solicitud_evidencias,
        solicitudes_justificacion,
        incidencias,
        auditoria_eventos
      CASCADE;
    `);

    // 2. Limpieza de asignaciones de horarios y empleados sintéticos de pruebas
    await client.query(`
      DELETE FROM asignaciones_horario WHERE empleado_id NOT IN (
        '33333333-3333-4333-8333-333333333301',
        '33333333-3333-4333-8333-333333333302',
        '33333333-3333-4333-8333-333333333303',
        '33333333-3333-4333-8333-333333333304',
        '33333333-3333-4333-8333-333333333305'
      );
    `);

    await client.query(`
      DELETE FROM empleados WHERE id NOT IN (
        '33333333-3333-4333-8333-333333333301',
        '33333333-3333-4333-8333-333333333302',
        '33333333-3333-4333-8333-333333333303',
        '33333333-3333-4333-8333-333333333304',
        '33333333-3333-4333-8333-333333333305'
      );
    `);

    // 3. Eliminar usuarios obsoletos
    await client.query("DELETE FROM usuarios WHERE username LIKE 'usr_%' OR username LIKE 'auto_%';");

    // 4. Actualizar los 5 usuarios canónicos
    await client.query(`
      UPDATE usuarios SET 
        nombre_completo = 'Terminal Garita RIMAC',
        email = 'seguridad@rimac.cr',
        empleado_id = NULL
      WHERE username = 'seguridad';

      UPDATE usuarios SET 
        nombre_completo = 'Cap. Roberto Supervisor',
        email = 'supervisor.seguridad@rimac.cr',
        empleado_id = '33333333-3333-4333-8333-333333333303'
      WHERE username = 'supervisor_seg';

      UPDATE usuarios SET 
        nombre_completo = 'Carlos Alvarado',
        email = 'carlos.alvarado@rimac.cr',
        empleado_id = '33333333-3333-4333-8333-333333333305'
      WHERE username = 'empleado';

      UPDATE usuarios SET 
        nombre_completo = 'Lic. Andrea Humano',
        email = 'talento.humano@rimac.cr',
        empleado_id = '33333333-3333-4333-8333-333333333302'
      WHERE username = 'talento_humano';

      UPDATE usuarios SET 
        nombre_completo = 'Admin Demo Sistemas',
        email = 'admin@rimac.cr',
        empleado_id = '33333333-3333-4333-8333-333333333301'
      WHERE username = 'admin';

      UPDATE empleados SET 
        nombre_completo = 'Carlos Alvarado',
        correo_laboral = 'carlos.alvarado@rimac.cr'
      WHERE cedula = 'DEMO-1005';
    `);

    await client.query("COMMIT;");
    return { exito: true, mensaje: "Limpieza transaccional completada con éxito." };
  } catch (err: any) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
