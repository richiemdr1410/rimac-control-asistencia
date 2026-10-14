import { createHash } from "node:crypto";
import type {
  IIdempotenciaRepository,
  RegistroIdempotenciaEntity,
} from "../interfaces/idempotencia.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresIdempotenciaRepository implements IIdempotenciaRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  calcularIdDocumento(
    usuario_id: string,
    ruta_endpoint: string,
    idempotency_key: string
  ): string {
    const raw = `${usuario_id}:::${ruta_endpoint}:::${idempotency_key.trim().toLowerCase()}`;
    return createHash("sha256").update(raw).digest("hex");
  }

  async obtener(
    usuario_id: string,
    ruta_endpoint: string,
    idempotency_key: string
  ): Promise<RegistroIdempotenciaEntity | null> {
    const docId = this.calcularIdDocumento(usuario_id, ruta_endpoint, idempotency_key);
    const res = await this.pool.query(
      `SELECT * FROM idempotencia_solicitudes WHERE id = $1 LIMIT 1;`,
      [docId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    return {
      id: row.id,
      usuario_id: row.usuario_id,
      ruta_endpoint: row.ruta_endpoint,
      idempotency_key: row.idempotency_key,
      payload_hash: row.payload_hash,
      status_code: row.status_code,
      response_body: typeof row.response_body === "string" ? JSON.parse(row.response_body) : row.response_body,
      creado_en: row.creado_en instanceof Date ? row.creado_en.toISOString() : String(row.creado_en),
    };
  }

  async guardar(registro: RegistroIdempotenciaEntity): Promise<void> {
    await this.pool.query(
      `INSERT INTO idempotencia_solicitudes (
        id, usuario_id, ruta_endpoint, idempotency_key, payload_hash, status_code, response_body, creado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING;`,
      [
        registro.id,
        registro.usuario_id,
        registro.ruta_endpoint,
        registro.idempotency_key,
        registro.payload_hash,
        registro.status_code,
        JSON.stringify(registro.response_body),
        registro.creado_en || new Date().toISOString(),
      ]
    );
  }
}
