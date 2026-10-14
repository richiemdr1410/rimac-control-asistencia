import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

export async function runMigrations(): Promise<{ success: boolean; applied: string[]; error?: string }> {
  // Conectar con el usuario administrador si está disponible, o el usuario estándar
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
    throw new Error("No hay credenciales configuradas para ejecutar migraciones.");
  }

  const client = await pool.connect();
  const applied: string[] = [];

  try {
    // 1. Crear tabla de control de migraciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Leer directorio de migraciones
    const migrationsDir = path.resolve(process.cwd(), "src/db/migrations");
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Directorio de migraciones no encontrado: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const res = await client.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
      if (res.rowCount === 0) {
        console.log(`[Migrator] Aplicando migración: ${file}...`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

        await client.query("BEGIN;");
        try {
          await client.query(sql);
          await client.query("INSERT INTO _migrations (name) VALUES ($1);", [file]);
          await client.query("COMMIT;");
          applied.push(file);
          console.log(`[Migrator] Migración aplicada exitosamente: ${file}`);
        } catch (migrationErr) {
          await client.query("ROLLBACK;");
          throw migrationErr;
        }
      } else {
        console.log(`[Migrator] Migración ya aplicada previamente: ${file}`);
      }
    }

    return { success: true, applied };
  } catch (err: any) {
    console.error("[Migrator] Error ejecutando migraciones:", err.message);
    return { success: false, applied, error: err.message };
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecución directa si se invoca por CLI
if (process.argv[1] && process.argv[1].endsWith("migrator.ts")) {
  runMigrations()
    .then((res) => {
      if (res.success) {
        console.log("[Migrator] Proceso de migración finalizado exitosamente.");
        process.exit(0);
      } else {
        console.error("[Migrator] Falló el proceso de migración.");
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("[Migrator] Error fatal:", err);
      process.exit(1);
    });
}
