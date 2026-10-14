import type {
  IJefaturasRepository,
  AsignacionJefaturaDetalle,
} from "../interfaces/jefaturas.js";
import type { AsignacionJefaturaEntity } from "../../types.js";
import { getPool } from "../../../../db/index.js";
import { randomUUID } from "node:crypto";
import type pg from "pg";

export class PostgresJefaturasRepository implements IJefaturasRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  async guardarAsignacion(asignacion: AsignacionJefaturaEntity): Promise<void> {
    await this.pool.query(
      `INSERT INTO asignaciones_jefatura (
        id, jefatura_empleado_id, subordinado_empleado_id, fecha_inicio, fecha_fin, estado, creado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        jefatura_empleado_id = EXCLUDED.jefatura_empleado_id,
        subordinado_empleado_id = EXCLUDED.subordinado_empleado_id,
        fecha_inicio = EXCLUDED.fecha_inicio,
        fecha_fin = EXCLUDED.fecha_fin,
        estado = EXCLUDED.estado;`,
      [
        asignacion.id,
        asignacion.jefatura_empleado_id,
        asignacion.subordinado_empleado_id,
        asignacion.fecha_inicio,
        asignacion.fecha_fin || null,
        asignacion.estado || "ACTIVA",
        asignacion.creado_en || new Date().toISOString(),
      ]
    );
  }

  async esJefaturaValidaEnFecha(
    jefatura_empleado_id: string,
    subordinado_empleado_id: string,
    fecha_jornada: string
  ): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM asignaciones_jefatura
       WHERE jefatura_empleado_id = $1
         AND subordinado_empleado_id = $2
         AND estado = 'ACTIVA'
         AND fecha_inicio <= $3
         AND (fecha_fin IS NULL OR fecha_fin >= $3)
       LIMIT 1;`,
      [jefatura_empleado_id, subordinado_empleado_id, fecha_jornada]
    );
    return res.rows.length > 0;
  }

  async obtenerSubordinadosIds(jefatura_empleado_id: string): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT subordinado_empleado_id FROM asignaciones_jefatura
       WHERE jefatura_empleado_id = $1
         AND estado = 'ACTIVA'
         AND fecha_inicio <= CURRENT_DATE
         AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE);`,
      [jefatura_empleado_id]
    );
    return res.rows.map((r: any) => r.subordinado_empleado_id);
  }

  async listarTodasVigentes(): Promise<AsignacionJefaturaDetalle[]> {
    const res = await this.pool.query(
      `SELECT aj.id, aj.jefatura_empleado_id, aj.subordinado_empleado_id, aj.fecha_inicio, aj.fecha_fin, aj.estado, aj.creado_en,
              jefe.nombre_completo as jefatura_nombre, jefe.cedula as jefatura_cedula,
              sub.nombre_completo as subordinado_nombre, sub.cedula as subordinado_cedula
       FROM asignaciones_jefatura aj
       JOIN empleados jefe ON jefe.id = aj.jefatura_empleado_id
       JOIN empleados sub ON sub.id = aj.subordinado_empleado_id
       WHERE aj.estado = 'ACTIVA'
         AND aj.fecha_inicio <= CURRENT_DATE
         AND (aj.fecha_fin IS NULL OR aj.fecha_fin >= CURRENT_DATE)
       ORDER BY jefe.nombre_completo ASC, sub.nombre_completo ASC;`
    );

    return res.rows.map((r) => ({
      id: r.id,
      jefatura_empleado_id: r.jefatura_empleado_id,
      jefatura_nombre: r.jefatura_nombre,
      jefatura_cedula: r.jefatura_cedula,
      subordinado_empleado_id: r.subordinado_empleado_id,
      subordinado_nombre: r.subordinado_nombre,
      subordinado_cedula: r.subordinado_cedula,
      fecha_inicio: r.fecha_inicio instanceof Date ? r.fecha_inicio.toISOString().split("T")[0] : String(r.fecha_inicio),
      fecha_fin: r.fecha_fin ? (r.fecha_fin instanceof Date ? r.fecha_fin.toISOString().split("T")[0] : String(r.fecha_fin)) : null,
      estado: r.estado,
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    }));
  }

  async obtenerHistorialPorSubordinado(subordinado_empleado_id: string): Promise<AsignacionJefaturaDetalle[]> {
    const res = await this.pool.query(
      `SELECT aj.id, aj.jefatura_empleado_id, aj.subordinado_empleado_id, aj.fecha_inicio, aj.fecha_fin, aj.estado, aj.creado_en,
              jefe.nombre_completo as jefatura_nombre, jefe.cedula as jefatura_cedula,
              sub.nombre_completo as subordinado_nombre, sub.cedula as subordinado_cedula
       FROM asignaciones_jefatura aj
       JOIN empleados jefe ON jefe.id = aj.jefatura_empleado_id
       JOIN empleados sub ON sub.id = aj.subordinado_empleado_id
       WHERE aj.subordinado_empleado_id = $1
       ORDER BY aj.fecha_inicio DESC, aj.creado_en DESC;`,
      [subordinado_empleado_id]
    );

    return res.rows.map((r) => ({
      id: r.id,
      jefatura_empleado_id: r.jefatura_empleado_id,
      jefatura_nombre: r.jefatura_nombre,
      jefatura_cedula: r.jefatura_cedula,
      subordinado_empleado_id: r.subordinado_empleado_id,
      subordinado_nombre: r.subordinado_nombre,
      subordinado_cedula: r.subordinado_cedula,
      fecha_inicio: r.fecha_inicio instanceof Date ? r.fecha_inicio.toISOString().split("T")[0] : String(r.fecha_inicio),
      fecha_fin: r.fecha_fin ? (r.fecha_fin instanceof Date ? r.fecha_fin.toISOString().split("T")[0] : String(r.fecha_fin)) : null,
      estado: r.estado,
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    }));
  }

  async obtenerJefaturaVigente(
    subordinado_empleado_id: string,
    fecha: string = new Date().toISOString().split("T")[0]
  ): Promise<AsignacionJefaturaDetalle | null> {
    const res = await this.pool.query(
      `SELECT aj.id, aj.jefatura_empleado_id, aj.subordinado_empleado_id, aj.fecha_inicio, aj.fecha_fin, aj.estado, aj.creado_en,
              jefe.nombre_completo as jefatura_nombre, jefe.cedula as jefatura_cedula,
              sub.nombre_completo as subordinado_nombre, sub.cedula as subordinado_cedula
       FROM asignaciones_jefatura aj
       JOIN empleados jefe ON jefe.id = aj.jefatura_empleado_id
       JOIN empleados sub ON sub.id = aj.subordinado_empleado_id
       WHERE aj.subordinado_empleado_id = $1
         AND aj.estado = 'ACTIVA'
         AND aj.fecha_inicio <= $2
         AND (aj.fecha_fin IS NULL OR aj.fecha_fin >= $2)
       ORDER BY aj.fecha_inicio DESC
       LIMIT 1;`,
      [subordinado_empleado_id, fecha]
    );

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      jefatura_empleado_id: r.jefatura_empleado_id,
      jefatura_nombre: r.jefatura_nombre,
      jefatura_cedula: r.jefatura_cedula,
      subordinado_empleado_id: r.subordinado_empleado_id,
      subordinado_nombre: r.subordinado_nombre,
      subordinado_cedula: r.subordinado_cedula,
      fecha_inicio: r.fecha_inicio instanceof Date ? r.fecha_inicio.toISOString().split("T")[0] : String(r.fecha_inicio),
      fecha_fin: r.fecha_fin ? (r.fecha_fin instanceof Date ? r.fecha_fin.toISOString().split("T")[0] : String(r.fecha_fin)) : null,
      estado: r.estado,
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async asignarJefaturaDirecta(params: {
    subordinado_empleado_id: string;
    jefatura_empleado_id: string;
    fecha_inicio: string;
    fecha_fin?: string;
  }): Promise<AsignacionJefaturaDetalle> {
    const { subordinado_empleado_id, jefatura_empleado_id, fecha_inicio, fecha_fin } = params;

    // 1. Prohibición de autojefatura
    if (subordinado_empleado_id === jefatura_empleado_id) {
      const err = new Error("Un colaborador no puede ser asignado como su propia jefatura directa.");
      (err as any).statusCode = 400;
      (err as any).codigo = "AUTOJEFATURA_NO_PERMITIDA";
      throw err;
    }

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN;");

      // 2. Validar que ambos empleados existan y estén activos
      const resEmps = await client.query(
        `SELECT id, estado FROM empleados WHERE id IN ($1, $2);`,
        [subordinado_empleado_id, jefatura_empleado_id]
      );

      if (resEmps.rows.length < 2) {
        const err = new Error("Uno o ambos colaboradores indicados no existen en el sistema.");
        (err as any).statusCode = 404;
        (err as any).codigo = "COLABORADOR_NO_ENCONTRADO";
        throw err;
      }

      for (const row of resEmps.rows) {
        if (row.estado !== "ACTIVO") {
          const err = new Error(
            `El colaborador con ID '${row.id}' no se encuentra en estado ACTIVO y no puede participar en relaciones de jefatura.`
          );
          (err as any).statusCode = 400;
          (err as any).codigo = "EMPLEADO_NO_ACTIVO";
          throw err;
        }
      }

      // 3. Detección de ciclos jerárquicos (A -> B -> A o profundidad N)
      // Comprobar si `subordinado_empleado_id` ya es superior de `jefatura_empleado_id`
      const resCiclo = await client.query(
        `WITH RECURSIVE cadena_jefes AS (
           SELECT jefatura_empleado_id, subordinado_empleado_id, 1 as nivel
           FROM asignaciones_jefatura
           WHERE subordinado_empleado_id = $1
             AND estado = 'ACTIVA'
             AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
           UNION ALL
           SELECT aj.jefatura_empleado_id, aj.subordinado_empleado_id, cj.nivel + 1
           FROM asignaciones_jefatura aj
           JOIN cadena_jefes cj ON aj.subordinado_empleado_id = cj.jefatura_empleado_id
           WHERE aj.estado = 'ACTIVA'
             AND (aj.fecha_fin IS NULL OR aj.fecha_fin >= CURRENT_DATE)
             AND cj.nivel < 20
         )
         SELECT 1 FROM cadena_jefes WHERE jefatura_empleado_id = $2 LIMIT 1;`,
        [jefatura_empleado_id, subordinado_empleado_id]
      );

      if (resCiclo.rows.length > 0) {
        const err = new Error(
          "Ciclo jerárquico detectado: El colaborador subordinado propuesto ya es superior en la cadena de mando de la jefatura indicada (prohibida relación circular A→B→A)."
        );
        (err as any).statusCode = 409;
        (err as any).codigo = "CICLO_JERARQUICO_DETECTADO";
        throw err;
      }

      // 4. Cerrar vigencia de la jefatura directa anterior
      // Ajustar fecha_fin de la asignación anterior abierta al día anterior a fecha_inicio
      await client.query(
        `UPDATE asignaciones_jefatura 
         SET fecha_fin = CASE 
               WHEN (DATE($1) - INTERVAL '1 day')::date >= fecha_inicio THEN (DATE($1) - INTERVAL '1 day')::date
               ELSE fecha_inicio
             END,
             estado = 'INACTIVA'
         WHERE subordinado_empleado_id = $2 
           AND estado = 'ACTIVA' 
           AND (fecha_fin IS NULL OR fecha_fin >= $1);`,
        [fecha_inicio, subordinado_empleado_id]
      );

      // 5. Insertar nueva asignación
      const nuevoId = randomUUID();
      await client.query(
        `INSERT INTO asignaciones_jefatura (
          id, jefatura_empleado_id, subordinado_empleado_id, fecha_inicio, fecha_fin, estado
        ) VALUES ($1, $2, $3, $4, $5, 'ACTIVA');`,
        [nuevoId, jefatura_empleado_id, subordinado_empleado_id, fecha_inicio, fecha_fin || null]
      );

      await client.query("COMMIT;");

      const resultado = await this.obtenerJefaturaVigente(subordinado_empleado_id, fecha_inicio);
      return resultado!;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async finalizarAsignacionJefatura(id: string, fecha_fin?: string): Promise<AsignacionJefaturaDetalle> {
    const res = await this.pool.query(
      `SELECT * FROM asignaciones_jefatura WHERE id = $1 LIMIT 1;`,
      [id]
    );

    if (res.rows.length === 0) {
      const err = new Error("Asignación de jefatura no encontrada.");
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    const asig = res.rows[0];
    const fechaInicioStr = asig.fecha_inicio instanceof Date ? asig.fecha_inicio.toISOString().split("T")[0] : String(asig.fecha_inicio);
    const fechaFinEfectiva = fecha_fin && fecha_fin >= fechaInicioStr 
      ? fecha_fin 
      : (fechaInicioStr > new Date().toISOString().split("T")[0] ? fechaInicioStr : new Date().toISOString().split("T")[0]);

    await this.pool.query(
      `UPDATE asignaciones_jefatura
       SET fecha_fin = $1, estado = 'INACTIVA'
       WHERE id = $2;`,
      [fechaFinEfectiva, id]
    );

    const detalleRes = await this.pool.query(
      `SELECT aj.id, aj.jefatura_empleado_id, aj.subordinado_empleado_id, aj.fecha_inicio, aj.fecha_fin, aj.estado, aj.creado_en,
              jefe.nombre_completo as jefatura_nombre, jefe.cedula as jefatura_cedula,
              sub.nombre_completo as subordinado_nombre, sub.cedula as subordinado_cedula
       FROM asignaciones_jefatura aj
       JOIN empleados jefe ON jefe.id = aj.jefatura_empleado_id
       JOIN empleados sub ON sub.id = aj.subordinado_empleado_id
       WHERE aj.id = $1;`,
      [id]
    );

    const r = detalleRes.rows[0];
    return {
      id: r.id,
      jefatura_empleado_id: r.jefatura_empleado_id,
      jefatura_nombre: r.jefatura_nombre,
      jefatura_cedula: r.jefatura_cedula,
      subordinado_empleado_id: r.subordinado_empleado_id,
      subordinado_nombre: r.subordinado_nombre,
      subordinado_cedula: r.subordinado_cedula,
      fecha_inicio: r.fecha_inicio instanceof Date ? r.fecha_inicio.toISOString().split("T")[0] : String(r.fecha_inicio),
      fecha_fin: r.fecha_fin ? (r.fecha_fin instanceof Date ? r.fecha_fin.toISOString().split("T")[0] : String(r.fecha_fin)) : null,
      estado: r.estado,
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async eliminarAsignacionJefatura(id: string): Promise<void> {
    const res = await this.pool.query(
      `SELECT * FROM asignaciones_jefatura WHERE id = $1 LIMIT 1;`,
      [id]
    );

    if (res.rows.length === 0) {
      const err = new Error("Asignación de jefatura no encontrada.");
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    const asig = res.rows[0];

    // 1. Validar si existieron decisiones operativas vinculadas entre esta jefatura y subordinado
    const resDecisiones = await this.pool.query(
      `SELECT COUNT(*)::int as total
       FROM solicitud_decisiones sd
       JOIN solicitudes_justificacion sj ON sj.id = sd.solicitud_id
       JOIN usuarios u ON u.id = sd.usuario_decisor_id
       WHERE sj.empleado_id = $1 AND u.empleado_id = $2;`,
      [asig.subordinado_empleado_id, asig.jefatura_empleado_id]
    );
    const totalDecisiones = resDecisiones.rows[0]?.total || 0;

    // 2. Validar si la relación ya tiene relevancia histórica (ya cerrada o con fecha fin pasada)
    const hoyStr = new Date().toISOString().split("T")[0];
    const fechaFinStr = asig.fecha_fin ? (asig.fecha_fin instanceof Date ? asig.fecha_fin.toISOString().split("T")[0] : String(asig.fecha_fin)) : null;
    const esHistorico = asig.estado !== "ACTIVA" || (fechaFinStr !== null && fechaFinStr < hoyStr);

    if (totalDecisiones > 0 || esHistorico) {
      const err = new Error(
        "La asignación de jefatura posee relevancia histórica o decisiones operativas vinculadas y no puede eliminarse. Debe utilizar 'Finalizar asignación' para cerrar su vigencia conservando el historial."
      );
      (err as any).statusCode = 409;
      (err as any).codigo = "JEFATURA_CON_HISTORICO";
      throw err;
    }

    await this.pool.query(`DELETE FROM asignaciones_jefatura WHERE id = $1;`, [id]);
  }
}
