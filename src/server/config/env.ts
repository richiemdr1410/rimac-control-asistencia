import dotenv from "dotenv";

dotenv.config();

export type PersistenceAdapterType = "POSTGRESQL";

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  PERSISTENCE_ADAPTER: PersistenceAdapterType;
  DEFAULT_TIMEZONE: string;
  DATABASE_URL?: string;
  SESSION_TTL_HOURS: number;
  SESSION_IDLE_MINUTES: number;
}

function resolveEnvConfig(): EnvConfig {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const PORT = parseInt(process.env.PORT || "3000", 10);
  const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "America/Costa_Rica";
  const SESSION_TTL_HOURS = parseInt(process.env.SESSION_TTL_HOURS || "8", 10);
  const SESSION_IDLE_MINUTES = parseInt(process.env.SESSION_IDLE_MINUTES || "60", 10);

  // FASE 2E: PostgreSQL es el único proveedor de persistencia operativa.
  // Cualquier intento de configurar Firestore o un proveedor desconocido debe ser rechazado explícitamente.
  if (process.env.PERSISTENCE_PROVIDER && process.env.PERSISTENCE_PROVIDER.toLowerCase() !== "postgres") {
    throw new Error(
      `[Configuración Inválida] PERSISTENCE_PROVIDER "${process.env.PERSISTENCE_PROVIDER}" no está permitido. El único proveedor operativo soportado es "postgres". Firestore ha sido retirado definitivamente.`
    );
  }

  if (process.env.PERSISTENCE_ADAPTER && process.env.PERSISTENCE_ADAPTER.toUpperCase() !== "POSTGRESQL") {
    throw new Error(
      `[Configuración Inválida] PERSISTENCE_ADAPTER "${process.env.PERSISTENCE_ADAPTER}" no está permitido. El único adaptador operativo soportado es "POSTGRESQL". Firestore ha sido retirado definitivamente.`
    );
  }

  const PERSISTENCE_ADAPTER: PersistenceAdapterType = "POSTGRESQL";
  let DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL && (!process.env.SQL_HOST || !process.env.SQL_USER)) {
    throw new Error(
      `[Configuración Inválida] PERSISTENCE_ADAPTER es "POSTGRESQL", se requieren variables de conexión (DATABASE_URL o SQL_HOST/SQL_USER).`
    );
  }

  return {
    NODE_ENV,
    PORT,
    PERSISTENCE_ADAPTER,
    DEFAULT_TIMEZONE,
    DATABASE_URL,
    SESSION_TTL_HOURS,
    SESSION_IDLE_MINUTES,
  };
}

export const env: EnvConfig = resolveEnvConfig();
