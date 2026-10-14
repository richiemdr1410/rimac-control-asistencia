import type {
  ISolicitudesRepository,
  SolicitudEntity,
  PoliticaSolicitudEntity,
  SolicitudDecisionEntity,
  SolicitudEvidenciaEntity,
  SolicitudConDetalle,
  EstadoSolicitud,
} from "../interfaces/solicitudes.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresSolicitudesRepository implements ISolicitudesRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private mapPolitica(row: any): PoliticaSolicitudEntity {
    return {
      id: row.id,
      tipo_solicitud: row.tipo_solicitud,
      requiere_evidencia: Boolean(row.requiere_evidencia),
      niveles_aprobacion_requeridos: Number(row.niveles_aprobacion_requeridos),
      rol_aprobador_nivel_1: row.rol_aprobador_nivel_1,
      rol_aprobador_nivel_2: row.rol_aprobador_nivel_2 || null,
      activo: Boolean(row.activo),
      creado_en: row.creado_en ? new Date(row.creado_en).toISOString() : undefined,
    };
  }

  private mapSolicitud(row: any): SolicitudEntity {
    return {
      id: row.id,
      empleado_id: row.empleado_id,
      politica_id: row.politica_id,
      tipo_solicitud: row.tipo_solicitud,
      fecha_inicio: typeof row.fecha_inicio === "string" ? row.fecha_inicio.slice(0, 10) : new Date(row.fecha_inicio).toISOString().slice(0, 10),
      fecha_fin: typeof row.fecha_fin === "string" ? row.fecha_fin.slice(0, 10) : new Date(row.fecha_fin).toISOString().slice(0, 10),
      fecha_hora_inicio: row.fecha_hora_inicio ? new Date(row.fecha_hora_inicio).toISOString() : null,
      fecha_hora_fin: row.fecha_hora_fin ? new Date(row.fecha_hora_fin).toISOString() : null,
      minutos_solicitados: Number(row.minutos_solicitados),
      motivo: row.motivo,
      estado: row.estado as EstadoSolicitud,
      creado_en: row.creado_en ? new Date(row.creado_en).toISOString() : undefined,
    };
  }

  async obtenerPolitica(tipo_solicitud: string): Promise<PoliticaSolicitudEntity | null> {
    const res = await this.pool.query(
      `SELECT id, tipo_solicitud, requiere_evidencia, niveles_aprobacion_requeridos,
              rol_aprobador_nivel_1, rol_aprobador_nivel_2, activo, creado_en
       FROM politicas_solicitud
       WHERE tipo_solicitud = $1 AND activo = true
       LIMIT 1;`,
      [tipo_solicitud]
    );
    if (res.rows.length === 0) return null;
    return this.mapPolitica(res.rows[0]);
  }

  async listarPoliticas(): Promise<PoliticaSolicitudEntity[]> {
    const res = await this.pool.query(
      `SELECT id, tipo_solicitud, requiere_evidencia, niveles_aprobacion_requeridos,
              rol_aprobador_nivel_1, rol_aprobador_nivel_2, activo, creado_en
       FROM politicas_solicitud
       WHERE activo = true
       ORDER BY tipo_solicitud ASC;`
    );
    return res.rows.map((r) => this.mapPolitica(r));
  }

  async crearSolicitud(
    solicitud: SolicitudEntity,
    evidencias?: SolicitudEvidenciaEntity[]
  ): Promise<SolicitudEntity> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const res = await client.query(
        `INSERT INTO solicitudes_justificacion (
          id, empleado_id, politica_id, tipo_solicitud,
          fecha_inicio, fecha_fin, fecha_hora_inicio, fecha_hora_fin,
          minutos_solicitados, motivo, estado, creado_en
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *;`,
        [
          solicitud.id,
          solicitud.empleado_id,
          solicitud.politica_id,
          solicitud.tipo_solicitud,
          solicitud.fecha_inicio.slice(0, 10),
          solicitud.fecha_fin.slice(0, 10),
          solicitud.fecha_hora_inicio || null,
          solicitud.fecha_hora_fin || null,
          solicitud.minutos_solicitados,
          solicitud.motivo,
          solicitud.estado,
          solicitud.creado_en || new Date().toISOString(),
        ]
      );

      if (evidencias && evidencias.length > 0) {
        for (const ev of evidencias) {
          await client.query(
            `INSERT INTO solicitud_evidencias (
              id, solicitud_id, nombre_archivo, tipo_mime,
              referencia_almacenamiento, hash_archivo, cargado_por_usuario_id, creado_en
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
            [
              ev.id,
              solicitud.id,
              ev.nombre_archivo,
              ev.tipo_mime,
              ev.referencia_almacenamiento,
              ev.hash_archivo,
              ev.cargado_por_usuario_id,
              ev.creado_en || new Date().toISOString(),
            ]
          );
        }
      }

      await client.query("COMMIT;");
      return this.mapSolicitud(res.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async obtenerSolicitudPorId(id: string): Promise<SolicitudConDetalle | null> {
    const res = await this.pool.query(
      `SELECT s.*, e.nombre_completo as empleado_nombre, e.cedula as empleado_cedula,
              d.nombre as departamento_nombre,
              p.tipo_solicitud as pol_tipo, p.requiere_evidencia as pol_evidencia,
              p.niveles_aprobacion_requeridos as pol_niveles,
              p.rol_aprobador_nivel_1 as pol_n1, p.rol_aprobador_nivel_2 as pol_n2
       FROM solicitudes_justificacion s
       JOIN empleados e ON s.empleado_id = e.id
       LEFT JOIN departamentos d ON e.departamento_id = d.id
       JOIN politicas_solicitud p ON s.politica_id = p.id
       WHERE s.id = $1
       LIMIT 1;`,
      [id]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    const base = this.mapSolicitud(row);

    const decisiones = await this.obtenerDecisiones(id);
    const evidencias = await this.obtenerEvidencias(id);

    return {
      ...base,
      empleado_nombre: row.empleado_nombre,
      empleado_cedula: row.empleado_cedula,
      departamento_nombre: row.departamento_nombre,
      politica: {
        id: row.politica_id,
        tipo_solicitud: row.pol_tipo,
        requiere_evidencia: Boolean(row.pol_evidencia),
        niveles_aprobacion_requeridos: Number(row.pol_niveles),
        rol_aprobador_nivel_1: row.pol_n1,
        rol_aprobador_nivel_2: row.pol_n2,
        activo: true,
      },
      decisiones,
      evidencias,
    };
  }

  async listarSolicitudesEmpleado(empleado_id: string): Promise<SolicitudConDetalle[]> {
    const res = await this.pool.query(
      `SELECT s.*, e.nombre_completo as empleado_nombre, e.cedula as empleado_cedula,
              p.tipo_solicitud as pol_tipo, p.niveles_aprobacion_requeridos as pol_niveles,
              p.rol_aprobador_nivel_1 as pol_n1, p.rol_aprobador_nivel_2 as pol_n2
       FROM solicitudes_justificacion s
       JOIN empleados e ON s.empleado_id = e.id
       JOIN politicas_solicitud p ON s.politica_id = p.id
       WHERE s.empleado_id = $1
       ORDER BY s.creado_en DESC;`,
      [empleado_id]
    );

    const lista: SolicitudConDetalle[] = [];
    for (const row of res.rows) {
      const base = this.mapSolicitud(row);
      const decisiones = await this.obtenerDecisiones(base.id);
      const evidencias = await this.obtenerEvidencias(base.id);
      lista.push({
        ...base,
        empleado_nombre: row.empleado_nombre,
        empleado_cedula: row.empleado_cedula,
        politica: {
          id: row.politica_id,
          tipo_solicitud: row.pol_tipo,
          requiere_evidencia: false,
          niveles_aprobacion_requeridos: Number(row.pol_niveles),
          rol_aprobador_nivel_1: row.pol_n1,
          rol_aprobador_nivel_2: row.pol_n2,
          activo: true,
        },
        decisiones,
        evidencias,
      });
    }
    return lista;
  }

  async listarSolicitudesPendientesParaRevisor(revisor: {
    rol: string;
    empleado_id?: string | null;
    subordinados_ids?: string[];
  }): Promise<SolicitudConDetalle[]> {
    const subIds = revisor.subordinados_ids || [];
    const esTH = revisor.rol === "TALENTO_HUMANO";
    const esAdmin = revisor.rol === "ADMINISTRADOR";

    // Filtros de estado base y exclusión estricta de solicitudes propias (Regla Fase 3.1: Prohibición de autoaprobación)
    const whereClauses: string[] = ["s.estado IN ('PENDIENTE', 'EN_REVISION')"];
    const params: any[] = [];

    if (revisor.empleado_id) {
      params.push(revisor.empleado_id);
      whereClauses.push(`s.empleado_id != $${params.length}`);
    }

    if (esAdmin) {
      // ADMINISTRADOR:
      // - Nivel 1 (PENDIENTE): subordinados directos de Admin o donde nivel 1 es TALENTO_HUMANO
      // - Nivel 2 (EN_REVISION): solicitudes en revisión (actúa como decisor alternativo de TH)
      if (subIds.length > 0) {
        params.push(subIds);
        const subIdx = params.length;
        whereClauses.push(`(
          (s.estado = 'PENDIENTE' AND (s.empleado_id = ANY($${subIdx}::uuid[]) OR p.rol_aprobador_nivel_1 = 'TALENTO_HUMANO'))
          OR (s.estado = 'EN_REVISION' AND (p.rol_aprobador_nivel_2 = 'TALENTO_HUMANO' OR p.rol_aprobador_nivel_2 = 'ADMINISTRADOR'))
        )`);
      } else {
        whereClauses.push(`(
          (s.estado = 'PENDIENTE' AND p.rol_aprobador_nivel_1 = 'TALENTO_HUMANO')
          OR (s.estado = 'EN_REVISION' AND (p.rol_aprobador_nivel_2 = 'TALENTO_HUMANO' OR p.rol_aprobador_nivel_2 = 'ADMINISTRADOR'))
        )`);
      }
    } else if (esTH) {
      // TALENTO_HUMANO:
      // - Nivel 1 (PENDIENTE): subordinados directos o si nivel 1 requiere TALENTO_HUMANO
      // - Nivel 2 (EN_REVISION): donde nivel 2 requiere TALENTO_HUMANO
      if (subIds.length > 0) {
        params.push(subIds);
        const subIdx = params.length;
        whereClauses.push(`(
          (s.estado = 'PENDIENTE' AND (s.empleado_id = ANY($${subIdx}::uuid[]) OR p.rol_aprobador_nivel_1 = 'TALENTO_HUMANO'))
          OR (s.estado = 'EN_REVISION' AND p.rol_aprobador_nivel_2 = 'TALENTO_HUMANO')
        )`);
      } else {
        whereClauses.push(`(
          (s.estado = 'PENDIENTE' AND p.rol_aprobador_nivel_1 = 'TALENTO_HUMANO')
          OR (s.estado = 'EN_REVISION' AND p.rol_aprobador_nivel_2 = 'TALENTO_HUMANO')
        )`);
      }
    } else if (subIds.length > 0) {
      // Jefatura directa (ej. SUPERVISOR_SEGURIDAD con subordinados): solo subordinados directos en paso PENDIENTE
      params.push(subIds);
      const subIdx = params.length;
      whereClauses.push(`s.empleado_id = ANY($${subIdx}::uuid[]) AND s.estado = 'PENDIENTE' AND p.rol_aprobador_nivel_1 = 'JEFATURA_DIRECTA'`);
    } else {
      // No tiene subordinados ni rol de gestión
      return [];
    }

    const query = `
      SELECT s.*, e.nombre_completo as empleado_nombre, e.cedula as empleado_cedula,
             d.nombre as departamento_nombre,
             p.tipo_solicitud as pol_tipo, p.niveles_aprobacion_requeridos as pol_niveles,
             p.rol_aprobador_nivel_1 as pol_n1, p.rol_aprobador_nivel_2 as pol_n2
      FROM solicitudes_justificacion s
      JOIN empleados e ON s.empleado_id = e.id
      LEFT JOIN departamentos d ON e.departamento_id = d.id
      JOIN politicas_solicitud p ON s.politica_id = p.id
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY s.creado_en DESC;
    `;

    const res = await this.pool.query(query, params);
    const lista: SolicitudConDetalle[] = [];

    for (const row of res.rows) {
      const base = this.mapSolicitud(row);
      const decisiones = await this.obtenerDecisiones(base.id);
      const evidencias = await this.obtenerEvidencias(base.id);
      lista.push({
        ...base,
        empleado_nombre: row.empleado_nombre,
        empleado_cedula: row.empleado_cedula,
        departamento_nombre: row.departamento_nombre,
        politica: {
          id: row.politica_id,
          tipo_solicitud: row.pol_tipo,
          requiere_evidencia: false,
          niveles_aprobacion_requeridos: Number(row.pol_niveles),
          rol_aprobador_nivel_1: row.pol_n1,
          rol_aprobador_nivel_2: row.pol_n2,
          activo: true,
        },
        decisiones,
        evidencias,
      });
    }

    return lista;
  }

  async registrarDecision(
    decision: SolicitudDecisionEntity,
    nuevoEstadoSolicitud: EstadoSolicitud
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Inserción append-only de la decisión
      await client.query(
        `INSERT INTO solicitud_decisiones (
          id, solicitud_id, nivel, rol_evaluador, usuario_decisor_id,
          decision, comentarios, fecha_decision
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          decision.id,
          decision.solicitud_id,
          decision.nivel,
          decision.rol_evaluador,
          decision.usuario_decisor_id,
          decision.decision,
          decision.comentarios || null,
          decision.fecha_decision || new Date().toISOString(),
        ]
      );

      // 2. Actualización de estado en solicitudes_justificacion
      await client.query(
        `UPDATE solicitudes_justificacion
         SET estado = $1
         WHERE id = $2;`,
        [nuevoEstadoSolicitud, decision.solicitud_id]
      );

      await client.query("COMMIT;");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async obtenerSolicitudesAprobadasEnRango(
    empleado_id: string,
    fecha_inicio: string,
    fecha_fin: string
  ): Promise<SolicitudConDetalle[]> {
    const res = await this.pool.query(
      `SELECT s.*, p.tipo_solicitud as pol_tipo
       FROM solicitudes_justificacion s
       JOIN politicas_solicitud p ON s.politica_id = p.id
       WHERE s.empleado_id = $1
         AND s.estado = 'APROBADA'
         AND s.fecha_inicio <= $3
         AND s.fecha_fin >= $2
       ORDER BY s.fecha_inicio ASC;`,
      [empleado_id, fecha_inicio.slice(0, 10), fecha_fin.slice(0, 10)]
    );

    return res.rows.map((r) => this.mapSolicitud(r));
  }

  private async obtenerDecisiones(solicitud_id: string): Promise<SolicitudDecisionEntity[]> {
    const res = await this.pool.query(
      `SELECT d.*, u.nombre_completo as decisor_nombre
       FROM solicitud_decisiones d
       LEFT JOIN usuarios u ON d.usuario_decisor_id = u.id
       WHERE d.solicitud_id = $1
       ORDER BY d.fecha_decision ASC;`,
      [solicitud_id]
    );

    return res.rows.map((r) => ({
      id: r.id,
      solicitud_id: r.solicitud_id,
      nivel: Number(r.nivel),
      rol_evaluador: r.rol_evaluador,
      usuario_decisor_id: r.usuario_decisor_id,
      decision: r.decision as "APROBADA" | "RECHAZADA",
      comentarios: r.comentarios,
      fecha_decision: new Date(r.fecha_decision).toISOString(),
      decisor_nombre: r.decisor_nombre,
    }));
  }

  private async obtenerEvidencias(solicitud_id: string): Promise<SolicitudEvidenciaEntity[]> {
    const res = await this.pool.query(
      `SELECT id, solicitud_id, nombre_archivo, tipo_mime, referencia_almacenamiento,
              hash_archivo, cargado_por_usuario_id, creado_en
       FROM solicitud_evidencias
       WHERE solicitud_id = $1
       ORDER BY creado_en ASC;`,
      [solicitud_id]
    );

    return res.rows.map((r) => ({
      id: r.id,
      solicitud_id: r.solicitud_id,
      nombre_archivo: r.nombre_archivo,
      tipo_mime: r.tipo_mime,
      referencia_almacenamiento: r.referencia_almacenamiento,
      hash_archivo: r.hash_archivo,
      cargado_por_usuario_id: r.cargado_por_usuario_id,
      creado_en: new Date(r.creado_en).toISOString(),
    }));
  }
}
