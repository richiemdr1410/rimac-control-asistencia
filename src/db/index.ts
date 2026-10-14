import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

let activePool: any = null;
let activeDb: any = null;

export interface PoolConfigOptions {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  connectionString?: string;
  ssl?: boolean;
}

export function createPostgresPool(customConfig?: PoolConfigOptions): pg.Pool {
  if (customConfig && (customConfig.connectionString || customConfig.host)) {
    return new Pool({
      ...customConfig,
      max: 10,
      connectionTimeoutMillis: 10000,
    });
  }

  // 1. Configuración provista por Google AI Studio Cloud SQL (Variables del sistema)
  if (process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME) {
    return new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      ssl: false,
      max: 10,
      connectionTimeoutMillis: 10000,
    });
  }

  // 2. Configuración estándar mediante DATABASE_URL (Entorno on-premise RIMAC o pruebas)
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10000,
    });
  }

  throw new Error(
    "No se encontraron variables de conexión para PostgreSQL (SQL_HOST/SQL_USER o DATABASE_URL)."
  );
}

export function getPool(): pg.Pool {
  if (activePool) return activePool;
  activePool = createPostgresPool();

  activePool.on("error", (err: Error) => {
    console.error("Error inesperado en cliente inactivo del pool de PostgreSQL:", err.message);
  });

  return activePool;
}

export const pool = new Proxy({} as any, {
  get(_target, prop) {
    return getPool()[prop];
  },
});

export const db = new Proxy({} as any, {
  get(_target, prop) {
    if (!activeDb) {
      activeDb = drizzle(getPool(), { schema });
    }
    return activeDb[prop];
  },
});

export function setTestPool(testPool: any): void {
  activePool = testPool;
  activeDb = drizzle(activePool, { schema });
}

export function resetPool(): void {
  activePool = null;
  activeDb = null;
}

export async function checkDatabaseHealth(): Promise<{ conectado: boolean; latenciaMs?: number; error?: string }> {
  const inicio = Date.now();
  try {
    const currentPool = getPool();
    const client = await currentPool.connect();
    try {
      await client.query("SELECT 1");
      const latenciaMs = Date.now() - inicio;
      return { conectado: true, latenciaMs };
    } finally {
      if (typeof client.release === "function") {
        client.release();
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { conectado: false, error: errorMsg };
  }
}
