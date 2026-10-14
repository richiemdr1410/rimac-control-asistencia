import type { IAuditoriaRepository, AuditoriaEventoEntity } from "../interfaces/auditoria.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresAuditoriaRepository implements IAuditoriaRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  async registrarEvento(evento: AuditoriaEventoEntity): Promise<void> {
    await this.pool.query(
      `INSERT INTO auditoria_eventos (
        actor_usuario_id, rol_actor, accion, entidad_tipo, entidad_id,
        timestamp_evento, motivo, valor_anterior, valor_nuevo, ip_origen, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
      [
        evento.actor_usuario_id,
        evento.rol_actor,
        evento.accion,
        evento.entidad_tipo,
        evento.entidad_id,
        evento.timestamp_evento || new Date().toISOString(),
        evento.motivo || null,
        evento.valor_anterior ? JSON.stringify(evento.valor_anterior) : null,
        evento.valor_nuevo ? JSON.stringify(evento.valor_nuevo) : null,
        evento.ip_origen || null,
        evento.user_agent || null,
      ]
    );
  }

  async listarEventos(filtros?: { entidad_tipo?: string; entidad_id?: string; limit?: number }): Promise<AuditoriaEventoEntity[]> {
    let query = `SELECT id, actor_usuario_id, rol_actor, accion, entidad_tipo, entidad_id, timestamp_evento, motivo, valor_anterior, valor_nuevo, ip_origen, user_agent FROM auditoria_eventos`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (filtros?.entidad_tipo) {
      params.push(filtros.entidad_tipo);
      conditions.push(`entidad_tipo = $${params.length}`);
    }
    if (filtros?.entidad_id) {
      params.push(filtros.entidad_id);
      conditions.push(`entidad_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(" AND ");
    }
    query += ` ORDER BY timestamp_evento DESC LIMIT ${filtros?.limit || 100};`;

    const res = await this.pool.query(query, params);
    return res.rows.map((r) => ({
      id: Number(r.id),
      actor_usuario_id: r.actor_usuario_id,
      rol_actor: r.rol_actor,
      accion: r.accion,
      entidad_tipo: r.entidad_tipo,
      entidad_id: r.entidad_id,
      timestamp_evento: new Date(r.timestamp_evento).toISOString(),
      motivo: r.motivo,
      valor_anterior: r.valor_anterior,
      valor_nuevo: r.valor_nuevo,
      ip_origen: r.ip_origen,
      user_agent: r.user_agent,
    }));
  }
}
