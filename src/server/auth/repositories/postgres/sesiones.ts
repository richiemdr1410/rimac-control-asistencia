import type { ISesionesRepository } from "../interfaces/sesiones.js";
import type { SesionEntity, RolUsuario } from "../../types.js";
import { getPool } from "../../../../db/index.js";
import type pg from "pg";

export class PostgresSesionesRepository implements ISesionesRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private mapRowToEntity(row: any): SesionEntity {
    return {
      id: row.id,
      usuario_id: row.usuario_id,
      rol: row.rol as RolUsuario,
      empleado_id: row.empleado_id || undefined,
      csrf_token: row.csrf_token,
      creado_en: row.creado_en instanceof Date ? row.creado_en.toISOString() : String(row.creado_en),
      ultimo_acceso_en: row.ultimo_acceso_en instanceof Date ? row.ultimo_acceso_en.toISOString() : String(row.ultimo_acceso_en),
      expira_en: row.expira_en instanceof Date ? row.expira_en.toISOString() : String(row.expira_en),
      revocada: Boolean(row.revocada),
      ip_origen: row.ip_origen || undefined,
      user_agent: row.user_agent || undefined,
    };
  }

  async crear(sesion: SesionEntity): Promise<void> {
    await this.pool.query(
      `INSERT INTO sesiones (
        id, usuario_id, csrf_token, creado_en, ultimo_acceso_en, expira_en, revocada, ip_origen, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        ultimo_acceso_en = EXCLUDED.ultimo_acceso_en,
        expira_en = EXCLUDED.expira_en,
        revocada = EXCLUDED.revocada;`,
      [
        sesion.id,
        sesion.usuario_id,
        sesion.csrf_token,
        sesion.creado_en || new Date().toISOString(),
        sesion.ultimo_acceso_en || new Date().toISOString(),
        sesion.expira_en,
        sesion.revocada || false,
        sesion.ip_origen || null,
        sesion.user_agent || null,
      ]
    );
  }

  async obtenerPorId(id: string): Promise<SesionEntity | null> {
    const res = await this.pool.query(
      `SELECT s.*, u.rol, u.empleado_id
       FROM sesiones s
       JOIN usuarios u ON s.usuario_id = u.id
       WHERE s.id = $1
       LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async actualizarUltimoAcceso(id: string, timestamp: string): Promise<void> {
    await this.pool.query(
      `UPDATE sesiones SET ultimo_acceso_en = $1 WHERE id = $2;`,
      [timestamp, id]
    );
  }

  async revocar(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE sesiones SET revocada = TRUE WHERE id = $1;`,
      [id]
    );
  }

  async revocarPorUsuario(usuario_id: string): Promise<void> {
    await this.pool.query(
      `UPDATE sesiones SET revocada = TRUE WHERE usuario_id = $1 AND revocada = FALSE;`,
      [usuario_id]
    );
  }
}
