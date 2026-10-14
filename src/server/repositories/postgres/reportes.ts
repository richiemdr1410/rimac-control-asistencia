import type {
  IReportesRepository,
  FiltrosReporte,
  DashboardKpiDTO,
  ReporteAsistenciaItem,
  ReporteHorasJornadasItem,
  ReporteIncidenciasItem,
  ReporteSolicitudesItem,
  ReporteFeriadosItem,
  ReporteCorreccionesItem,
  ReporteAuditoriaItem,
  ReporteResumenHorasColaboradorItem,
  ReporteResumenHorasResponse,
  ReporteJornadaDiariaItem,
} from "../interfaces/reportes.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresReportesRepository implements IReportesRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private buildEmpleadoScopeWhere(
    filtros: FiltrosReporte,
    prefixEmpleado: string = "e",
    params: any[] = []
  ): { sql: string; nextIndex: number } {
    let clauses: string[] = [];

    if (filtros.empleado_id) {
      params.push(filtros.empleado_id);
      clauses.push(`${prefixEmpleado}.id = $${params.length}`);
    } else if (filtros.subordinados_ids && filtros.subordinados_ids.length > 0) {
      params.push(filtros.subordinados_ids);
      clauses.push(`${prefixEmpleado}.id = ANY($${params.length})`);
    } else if (filtros.subordinados_ids && filtros.subordinados_ids.length === 0) {
      // Alcance de equipo pero sin subordinados
      clauses.push("1=0");
    }

    if (filtros.departamento_id) {
      params.push(filtros.departamento_id);
      clauses.push(`${prefixEmpleado}.departamento_id = $${params.length}`);
    }

    if (filtros.busqueda) {
      params.push(`%${filtros.busqueda.trim()}%`);
      clauses.push(`(${prefixEmpleado}.nombre_completo ILIKE $${params.length} OR ${prefixEmpleado}.cedula ILIKE $${params.length})`);
    }

    return {
      sql: clauses.length > 0 ? " AND " + clauses.join(" AND ") : "",
      nextIndex: params.length + 1,
    };
  }

  async obtenerKpisDashboard(filtros: FiltrosReporte): Promise<DashboardKpiDTO> {
    const params: any[] = [];
    const empScope = this.buildEmpleadoScopeWhere(filtros, "e", params);

    let fechaJornadaWhere = "";
    if (filtros.fecha_desde) {
      params.push(filtros.fecha_desde);
      fechaJornadaWhere += ` AND j.fecha_jornada >= $${params.length}`;
    }
    if (filtros.fecha_hasta) {
      params.push(filtros.fecha_hasta);
      fechaJornadaWhere += ` AND j.fecha_jornada <= $${params.length}`;
    }

    // 1. Colaboradores Activos en el alcance
    const qColab = `
      SELECT COUNT(DISTINCT e.id)::int as total
      FROM empleados e
      WHERE e.estado = 'ACTIVO' ${empScope.sql};
    `;
    const resColab = await this.pool.query(qColab, params.slice(0, empScope.nextIndex - 1));
    const colaboradores_activos = Number(resColab.rows[0]?.total || 0);

    // 2. Métricas de Jornadas y Horas
    const qJornadas = `
      SELECT 
        COUNT(j.id)::int as total_jornadas,
        COUNT(CASE WHEN j.estado_jornada IN ('CERRADA', 'REGULARIZADA') OR j.hora_salida_calculo IS NOT NULL THEN 1 END)::int as cerradas,
        COUNT(CASE WHEN (j.estado_jornada = 'ABIERTA' OR j.hora_salida_calculo IS NULL) AND j.estado_jornada != 'REGULARIZADA' THEN 1 END)::int as abiertas,
        COUNT(CASE WHEN COALESCE(j.minutos_tardanza, 0) > 0 THEN 1 END)::int as tardias,
        COALESCE(SUM(j.minutos_tiempo_adicional), 0)::int as ta_detectado,
        COALESCE(SUM(CASE WHEN j.estado_tiempo_adicional = 'PENDIENTE' OR (COALESCE(j.minutos_tiempo_adicional, 0) > 0 AND COALESCE(j.minutos_tiempo_adicional_aprobado, 0) = 0 AND j.estado_tiempo_adicional IS NULL) THEN j.minutos_tiempo_adicional ELSE 0 END), 0)::int as ta_pendiente,
        COALESCE(SUM(CASE WHEN j.estado_tiempo_adicional = 'APROBADO' OR COALESCE(j.minutos_tiempo_adicional_aprobado, 0) > 0 THEN COALESCE(j.minutos_tiempo_adicional_aprobado, j.minutos_tiempo_adicional) ELSE 0 END), 0)::int as ta_aprobado
      FROM jornadas j
      JOIN empleados e ON e.id = j.empleado_id
      WHERE 1=1 ${empScope.sql} ${fechaJornadaWhere};
    `;
    const resJornadas = await this.pool.query(qJornadas, params);
    const jRow = resJornadas.rows[0] || {};

    // 3. Ausencias e Incidencias Abiertas
    const pInc: any[] = [];
    const empScopeInc = this.buildEmpleadoScopeWhere(filtros, "e", pInc);
    let fechaIncWhere = "";
    if (filtros.fecha_desde) {
      pInc.push(filtros.fecha_desde);
      fechaIncWhere += ` AND j.fecha_jornada >= $${pInc.length}`;
    }
    if (filtros.fecha_hasta) {
      pInc.push(filtros.fecha_hasta);
      fechaIncWhere += ` AND j.fecha_jornada <= $${pInc.length}`;
    }

    const qIncidencias = `
      SELECT
        COUNT(CASE WHEN inc.tipo_incidencia IN ('AUSENCIA', 'AUSENCIA_INJUSTIFICADA') THEN 1 END)::int as ausencias,
        COUNT(CASE WHEN inc.estado IN ('DETECTADA', 'EN_REVISION') THEN 1 END)::int as incidencias_abiertas
      FROM incidencias inc
      JOIN empleados e ON e.id = inc.empleado_id
      LEFT JOIN jornadas j ON j.id = inc.jornada_id
      WHERE 1=1 ${empScopeInc.sql} ${fechaIncWhere};
    `;
    const resInc = await this.pool.query(qIncidencias, pInc);
    const incRow = resInc.rows[0] || {};

    // 4. Solicitudes pendientes
    const pSol: any[] = [];
    const empScopeSol = this.buildEmpleadoScopeWhere(filtros, "e", pSol);
    let fechaSolWhere = "";
    if (filtros.fecha_desde) {
      pSol.push(filtros.fecha_desde);
      fechaSolWhere += ` AND s.fecha_inicio >= $${pSol.length}`;
    }
    if (filtros.fecha_hasta) {
      pSol.push(filtros.fecha_hasta);
      fechaSolWhere += ` AND s.fecha_inicio <= $${pSol.length}`;
    }

    const qSol = `
      SELECT COUNT(s.id)::int as pendientes
      FROM solicitudes_justificacion s
      JOIN empleados e ON e.id = s.empleado_id
      WHERE s.estado IN ('PENDIENTE', 'APROBADA_NIVEL_1') ${empScopeSol.sql} ${fechaSolWhere};
    `;
    const resSol = await this.pool.query(qSol, pSol);
    const solicitudes_pendientes = Number(resSol.rows[0]?.pendientes || 0);

    // 5. Correcciones de marcas pendientes
    const pCorr: any[] = [];
    const empScopeCorr = this.buildEmpleadoScopeWhere(filtros, "e", pCorr);
    const qCorr = `
      SELECT COUNT(cm.id)::int as pendientes
      FROM correcciones_marcas cm
      JOIN marcas m ON m.id = cm.marca_original_id
      JOIN empleados e ON e.id = m.empleado_id
      WHERE cm.estado = 'PENDIENTE' ${empScopeCorr.sql};
    `;
    const resCorr = await this.pool.query(qCorr, pCorr);
    const correcciones_pendientes = Number(resCorr.rows[0]?.pendientes || 0);

    // 6. Serie: Tendencia de Asistencia por Fecha
    const qTendencia = `
      SELECT 
        j.fecha_jornada::text as fecha,
        COUNT(j.id)::int as registradas,
        COUNT(CASE WHEN COALESCE(j.minutos_tardanza, 0) > 0 THEN 1 END)::int as tardias,
        COALESCE(inc_sub.ausencias, 0)::int as ausencias
      FROM jornadas j
      JOIN empleados e ON e.id = j.empleado_id
      LEFT JOIN (
        SELECT j2.fecha_jornada, COUNT(i.id) as ausencias
        FROM incidencias i
        JOIN jornadas j2 ON j2.id = i.jornada_id
        JOIN empleados e2 ON e2.id = i.empleado_id
        WHERE i.tipo_incidencia IN ('AUSENCIA', 'AUSENCIA_INJUSTIFICADA')
        GROUP BY j2.fecha_jornada
      ) inc_sub ON inc_sub.fecha_jornada = j.fecha_jornada
      WHERE 1=1 ${empScope.sql} ${fechaJornadaWhere}
      GROUP BY j.fecha_jornada, inc_sub.ausencias
      ORDER BY j.fecha_jornada ASC
      LIMIT 30;
    `;
    const resTendencia = await this.pool.query(qTendencia, params);

    // 7. Serie: Incidencias por Tipo
    const qIncTipo = `
      SELECT 
        inc.tipo_incidencia as tipo,
        COUNT(inc.id)::int as cantidad
      FROM incidencias inc
      JOIN empleados e ON e.id = inc.empleado_id
      LEFT JOIN jornadas j ON j.id = inc.jornada_id
      WHERE 1=1 ${empScopeInc.sql} ${fechaIncWhere}
      GROUP BY inc.tipo_incidencia
      ORDER BY cantidad DESC;
    `;
    const resIncTipo = await this.pool.query(qIncTipo, pInc);

    // 8. Serie: Tiempo Efectivo por Día
    const qTiempoDia = `
      SELECT 
        j.fecha_jornada::text as fecha,
        COALESCE(SUM(j.minutos_efectivos), 0)::int as minutos_efectivos,
        COALESCE(SUM(j.minutos_tiempo_adicional), 0)::int as minutos_adicional
      FROM jornadas j
      JOIN empleados e ON e.id = j.empleado_id
      WHERE 1=1 ${empScope.sql} ${fechaJornadaWhere}
      GROUP BY j.fecha_jornada
      ORDER BY j.fecha_jornada ASC
      LIMIT 30;
    `;
    const resTiempoDia = await this.pool.query(qTiempoDia, params);

    return {
      colaboradores_activos,
      jornadas_registradas: Number(jRow.total_jornadas || 0),
      jornadas_cerradas: Number(jRow.cerradas || 0),
      jornadas_abiertas: Number(jRow.abiertas || 0),
      tardias: Number(jRow.tardias || 0),
      ausencias: Number(incRow.ausencias || 0),
      incidencias_abiertas: Number(incRow.incidencias_abiertas || 0),
      solicitudes_pendientes,
      correcciones_pendientes,
      minutos_tiempo_adicional_detectado: Number(jRow.ta_detectado || 0),
      minutos_tiempo_adicional_pendiente: Number(jRow.ta_pendiente || 0),
      minutos_tiempo_adicional_aprobado: Number(jRow.ta_aprobado || 0),
      tendencia_asistencia: resTendencia.rows.map((r) => ({
        fecha: r.fecha,
        registradas: Number(r.registradas || 0),
        tardias: Number(r.tardias || 0),
        ausencias: Number(r.ausencias || 0),
      })),
      incidencias_por_tipo: resIncTipo.rows.map((r) => ({
        tipo: r.tipo,
        cantidad: Number(r.cantidad || 0),
      })),
      tiempo_efectivo_por_dia: resTiempoDia.rows.map((r) => ({
        fecha: r.fecha,
        minutos_efectivos: Number(r.minutos_efectivos || 0),
        minutos_adicional: Number(r.minutos_adicional || 0),
      })),
    };
  }

  async obtenerReporteAsistencia(filtros: FiltrosReporte): Promise<ReporteAsistenciaItem[]> {
    const params: any[] = [];
    const empScope = this.buildEmpleadoScopeWhere(filtros, "e", params);

    let fechaWhere = "";
    if (filtros.fecha_desde) {
      params.push(filtros.fecha_desde);
      fechaWhere += ` AND j.fecha_jornada >= $${params.length}`;
    }
    if (filtros.fecha_hasta) {
      params.push(filtros.fecha_hasta);
      fechaWhere += ` AND j.fecha_jornada <= $${params.length}`;
    }

    const sql = `
      SELECT 
        e.id as empleado_id,
        e.nombre_completo as empleado_nombre,
        e.cedula as empleado_cedula,
        COALESCE(d.nombre, 'Sin Departamento') as departamento_nombre,
        COALESCE(p.nombre, 'General') as puesto_nombre,
        COUNT(j.id)::int as jornadas_registradas,
        COUNT(CASE WHEN j.hora_entrada_calculo IS NOT NULL THEN 1 END)::int as entradas_registradas,
        COUNT(CASE WHEN j.hora_salida_calculo IS NOT NULL THEN 1 END)::int as salidas_registradas,
        COUNT(CASE WHEN COALESCE(j.minutos_tardanza, 0) > 0 THEN 1 END)::int as tardias,
        COUNT(CASE WHEN inc_sub.ausencias > 0 THEN 1 END)::int as ausencias,
        COUNT(CASE WHEN j.origen_salida_calculo = 'REGULARIZADA' OR j.es_salida_regularizada = true THEN 1 END)::int as salidas_omitidas,
        COUNT(CASE WHEN j.es_salida_regularizada = true OR j.estado_jornada = 'REGULARIZADA' THEN 1 END)::int as jornadas_regularizadas,
        COALESCE(SUM(j.minutos_efectivos), 0)::int as minutos_efectivos_totales
      FROM empleados e
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      LEFT JOIN puestos p ON p.id = e.puesto_id
      LEFT JOIN jornadas j ON j.empleado_id = e.id ${fechaWhere}
      LEFT JOIN (
        SELECT i.empleado_id, i.jornada_id, COUNT(i.id) as ausencias
        FROM incidencias i
        WHERE i.tipo_incidencia IN ('AUSENCIA', 'AUSENCIA_INJUSTIFICADA')
        GROUP BY i.empleado_id, i.jornada_id
      ) inc_sub ON inc_sub.jornada_id = j.id AND inc_sub.empleado_id = e.id
      WHERE e.estado = 'ACTIVO' ${empScope.sql}
      GROUP BY e.id, e.nombre_completo, e.cedula, d.nombre, p.nombre
      ORDER BY e.nombre_completo ASC
      ${filtros.limite ? `LIMIT ${Number(filtros.limite)}` : ""}
      ${filtros.offset ? `OFFSET ${Number(filtros.offset)}` : ""};
    `;

    const res = await this.pool.query(sql, params);

    return res.rows.map((r) => {
      const reg = Number(r.jornadas_registradas || 0);
      return {
        empleado_id: r.empleado_id,
        empleado_nombre: r.empleado_nombre,
        empleado_cedula: r.empleado_cedula,
        departamento_nombre: r.departamento_nombre,
        puesto_nombre: r.puesto_nombre,
        jornadas_programadas: reg, // En el rango programadas de referencia
        jornadas_registradas: reg,
        entradas_registradas: Number(r.entradas_registradas || 0),
        salidas_registradas: Number(r.salidas_registradas || 0),
        tardias: Number(r.tardias || 0),
        ausencias: Number(r.ausencias || 0),
        salidas_omitidas: Number(r.salidas_omitidas || 0),
        jornadas_regularizadas: Number(r.jornadas_regularizadas || 0),
        minutos_efectivos_totales: Number(r.minutos_efectivos_totales || 0),
      };
    });
  }

  async obtenerReporteHorasJornadas(filtros: FiltrosReporte): Promise<{
    items: ReporteHorasJornadasItem[];
    totales: {
      total_tiempo_minutos: number;
      total_efectivo_minutos: number;
      total_descansos_minutos: number;
      total_adicional_detectado: number;
      total_adicional_aprobado: number;
    };
  }> {
    const params: any[] = [];
    const empScope = this.buildEmpleadoScopeWhere(filtros, "e", params);

    let whereSql = `WHERE 1=1 ${empScope.sql}`;
    if (filtros.fecha_desde) {
      params.push(filtros.fecha_desde);
      whereSql += ` AND j.fecha_jornada >= $${params.length}`;
    }
    if (filtros.fecha_hasta) {
      params.push(filtros.fecha_hasta);
      whereSql += ` AND j.fecha_jornada <= $${params.length}`;
    }
    if (filtros.estado) {
      params.push(filtros.estado);
      whereSql += ` AND j.estado_jornada = $${params.length}`;
    }

    const sql = `
      SELECT 
        j.id,
        j.fecha_jornada::text,
        j.empleado_id,
        e.nombre_completo as empleado_nombre,
        e.cedula as empleado_cedula,
        COALESCE(d.nombre, 'Sin Departamento') as departamento_nombre,
        h.nombre as horario_nombre,
        j.hora_entrada_calculo,
        j.hora_salida_calculo,
        COALESCE(j.minutos_tiempo_total, 0)::int as minutos_tiempo_total,
        COALESCE(j.minutos_total_descansos, 0)::int as minutos_total_descansos,
        COALESCE(j.minutos_desayuno, 0)::int as minutos_desayuno,
        COALESCE(j.minutos_almuerzo, 0)::int as minutos_almuerzo,
        COALESCE(j.minutos_cafe, 0)::int as minutos_cafe,
        COALESCE(j.minutos_efectivos, 0)::int as minutos_efectivos,
        COALESCE(j.minutos_tiempo_adicional, 0)::int as minutos_tiempo_adicional,
        COALESCE(j.minutos_tiempo_adicional_aprobado, 0)::int as minutos_tiempo_adicional_aprobado,
        j.estado_tiempo_adicional,
        j.estado_jornada,
        j.es_salida_regularizada
      FROM jornadas j
      JOIN empleados e ON e.id = j.empleado_id
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      LEFT JOIN horarios h ON h.id = j.horario_id_aplicado
      ${whereSql}
      ORDER BY j.fecha_jornada DESC, e.nombre_completo ASC
      ${filtros.limite ? `LIMIT ${Number(filtros.limite)}` : ""}
      ${filtros.offset ? `OFFSET ${Number(filtros.offset)}` : ""};
    `;

    const res = await this.pool.query(sql, params);

    let total_tiempo_minutos = 0;
    let total_efectivo_minutos = 0;
    let total_descansos_minutos = 0;
    let total_adicional_detectado = 0;
    let total_adicional_aprobado = 0;

    const items: ReporteHorasJornadasItem[] = res.rows.map((r) => {
      const tiempoTotal = Number(r.minutos_tiempo_total || 0);
      const efectivo = Number(r.minutos_efectivos || 0);
      const descansos = Number(r.minutos_total_descansos || 0);
      const taDetectado = Number(r.minutos_tiempo_adicional || 0);
      const taAprobado = Number(r.minutos_tiempo_adicional_aprobado || 0);

      total_tiempo_minutos += tiempoTotal;
      total_efectivo_minutos += efectivo;
      total_descansos_minutos += descansos;
      total_adicional_detectado += taDetectado;
      total_adicional_aprobado += taAprobado;

      return {
        id: r.id,
        fecha_jornada: r.fecha_jornada,
        empleado_id: r.empleado_id,
        empleado_nombre: r.empleado_nombre,
        empleado_cedula: r.empleado_cedula,
        departamento_nombre: r.departamento_nombre,
        horario_nombre: r.horario_nombre,
        hora_entrada_calculo: r.hora_entrada_calculo ? new Date(r.hora_entrada_calculo).toISOString() : null,
        hora_salida_calculo: r.hora_salida_calculo ? new Date(r.hora_salida_calculo).toISOString() : null,
        minutos_tiempo_total: tiempoTotal,
        minutos_total_descansos: descansos,
        minutos_desayuno: Number(r.minutos_desayuno || 0),
        minutos_almuerzo: Number(r.minutos_almuerzo || 0),
        minutos_cafe: Number(r.minutos_cafe || 0),
        minutos_efectivos: efectivo,
        minutos_tiempo_adicional: taDetectado,
        minutos_tiempo_adicional_aprobado: taAprobado,
        estado_tiempo_adicional: r.estado_tiempo_adicional,
        estado_jornada: r.estado_jornada,
        es_salida_regularizada: Boolean(r.es_salida_regularizada),
      };
    });

    return {
      items,
      totales: {
        total_tiempo_minutos,
        total_efectivo_minutos,
        total_descansos_minutos,
        total_adicional_detectado,
        total_adicional_aprobado,
      },
    };
  }

  async obtenerResumenHorasColaborador(filtros: FiltrosReporte): Promise<ReporteResumenHorasResponse> {
    const params: any[] = [];
    const empScope = this.buildEmpleadoScopeWhere(filtros, "e", params);

    const fDesde = filtros.fecha_desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const fHasta = filtros.fecha_hasta || new Date().toISOString().split("T")[0];

    // 1. Programación de días esperados por empleado
    // Días laborables en el rango según asignaciones_horario o por defecto Turno Regular L-V (570 min)
    const qProg = `
      WITH params_rango AS (
        SELECT $1::date as f_desde, $2::date as f_hasta
      ),
      dias_rango AS (
        SELECT generate_series(f_desde, f_hasta, '1 day'::interval)::date as dia
        FROM params_rango
      )
      SELECT 
        e.id as empleado_id,
        COUNT(d.dia)::int as jornadas_programadas,
        COALESCE(SUM(COALESCE(hd.minutos_esperados, 570)), 0)::int as minutos_programados
      FROM empleados e
      CROSS JOIN dias_rango d
      LEFT JOIN asignaciones_horario ah ON ah.empleado_id = e.id 
        AND ah.fecha_inicio <= d.dia 
        AND (ah.fecha_fin IS NULL OR ah.fecha_fin >= d.dia)
      LEFT JOIN horario_detalles_dia hd ON hd.horario_id = ah.horario_id 
        AND hd.dia_semana = EXTRACT(ISODOW FROM d.dia)::int
      WHERE e.estado = 'ACTIVO' 
        AND (hd.es_laborable IS TRUE OR (hd.es_laborable IS NULL AND EXTRACT(ISODOW FROM d.dia) BETWEEN 1 AND 5))
      GROUP BY e.id;
    `;
    const resProg = await this.pool.query(qProg, [fDesde, fHasta]);
    const mapaProg = new Map<string, { programadas: number; minutos: number }>();
    resProg.rows.forEach((r) => {
      mapaProg.set(r.empleado_id, {
        programadas: Number(r.jornadas_programadas || 0),
        minutos: Number(r.minutos_programados || 0),
      });
    });

    // 2. Colaboradores activos en el alcance
    const qColabs = `
      SELECT 
        e.id as empleado_id,
        e.nombre_completo as empleado_nombre,
        e.cedula as empleado_cedula,
        COALESCE(d.nombre, 'Sin Departamento') as departamento_nombre,
        COALESCE(p.nombre, 'General') as puesto_nombre
      FROM empleados e
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      LEFT JOIN puestos p ON p.id = e.puesto_id
      WHERE e.estado = 'ACTIVO' ${empScope.sql}
      ORDER BY e.nombre_completo ASC;
    `;
    const resColabs = await this.pool.query(qColabs, params);

    // 3. Jornadas registradas en el período
    const pJornadas: any[] = [fDesde, fHasta];
    let jScopeSql = "";
    if (filtros.empleado_id) {
      pJornadas.push(filtros.empleado_id);
      jScopeSql += ` AND j.empleado_id = $${pJornadas.length}`;
    } else if (filtros.subordinados_ids && filtros.subordinados_ids.length > 0) {
      pJornadas.push(filtros.subordinados_ids);
      jScopeSql += ` AND j.empleado_id = ANY($${pJornadas.length})`;
    } else if (filtros.subordinados_ids && filtros.subordinados_ids.length === 0) {
      jScopeSql += " AND 1=0";
    }

    const qJornadas = `
      SELECT 
        j.id,
        j.fecha_jornada::text as fecha_jornada,
        j.empleado_id,
        COALESCE(h.nombre, 'Turno Regular') as horario_nombre,
        j.hora_entrada_calculo,
        j.hora_salida_calculo,
        COALESCE(j.minutos_tiempo_total, 0)::int as minutos_tiempo_total,
        COALESCE(j.minutos_total_descansos, 0)::int as minutos_total_descansos,
        COALESCE(j.minutos_desayuno, 0)::int as minutos_desayuno,
        COALESCE(j.minutos_almuerzo, 0)::int as minutos_almuerzo,
        COALESCE(j.minutos_cafe, 0)::int as minutos_cafe,
        COALESCE(j.minutos_efectivos, 0)::int as minutos_efectivos,
        COALESCE(j.minutos_tiempo_adicional, 0)::int as minutos_tiempo_adicional,
        COALESCE(
          CASE 
            WHEN j.estado_tiempo_adicional = 'APROBADO' OR COALESCE(j.minutos_tiempo_adicional_aprobado, 0) > 0 
            THEN COALESCE(j.minutos_tiempo_adicional_aprobado, j.minutos_tiempo_adicional)
            ELSE 0 
          END, 0)::int as minutos_tiempo_adicional_aprobado,
        j.estado_tiempo_adicional,
        j.estado_jornada,
        j.es_salida_regularizada,
        COALESCE(j.minutos_tardanza, 0)::int as minutos_tardanza
      FROM jornadas j
      LEFT JOIN horarios h ON h.id = j.horario_id_aplicado
      WHERE j.fecha_jornada >= $1 AND j.fecha_jornada <= $2 ${jScopeSql}
      ORDER BY j.fecha_jornada DESC;
    `;
    const resJornadas = await this.pool.query(qJornadas, pJornadas);

    // Agrupar jornadas por empleado
    const mapaJornadas = new Map<string, any[]>();
    resJornadas.rows.forEach((j) => {
      if (!mapaJornadas.has(j.empleado_id)) {
        mapaJornadas.set(j.empleado_id, []);
      }
      mapaJornadas.get(j.empleado_id)!.push(j);
    });

    // 4. Ausencias en el período
    const pInc: any[] = [fDesde, fHasta];
    let incScopeSql = "";
    if (filtros.empleado_id) {
      pInc.push(filtros.empleado_id);
      incScopeSql += ` AND inc.empleado_id = $${pInc.length}`;
    } else if (filtros.subordinados_ids && filtros.subordinados_ids.length > 0) {
      pInc.push(filtros.subordinados_ids);
      incScopeSql += ` AND inc.empleado_id = ANY($${pInc.length})`;
    } else if (filtros.subordinados_ids && filtros.subordinados_ids.length === 0) {
      incScopeSql += " AND 1=0";
    }

    const qAusencias = `
      SELECT inc.empleado_id, COUNT(inc.id)::int as total_ausencias
      FROM incidencias inc
      LEFT JOIN jornadas j ON j.id = inc.jornada_id
      WHERE inc.tipo_incidencia IN ('AUSENCIA', 'AUSENCIA_INJUSTIFICADA')
        AND (j.fecha_jornada >= $1 AND j.fecha_jornada <= $2 OR (inc.creado_en::date >= $1 AND inc.creado_en::date <= $2))
        ${incScopeSql}
      GROUP BY inc.empleado_id;
    `;
    const resAusencias = await this.pool.query(qAusencias, pInc);
    const mapaAusencias = new Map<string, number>();
    resAusencias.rows.forEach((r) => {
      mapaAusencias.set(r.empleado_id, Number(r.total_ausencias || 0));
    });

    // 5. Consolidar items por colaborador
    let totalHorasProgramadas = 0;
    let totalHorasRegistradas = 0;
    let totalPausas = 0;
    let totalEfectivas = 0;
    let totalAdicionalDetectado = 0;
    let totalAdicionalAprobado = 0;

    const items: ReporteResumenHorasColaboradorItem[] = [];

    for (const emp of resColabs.rows) {
      const prog = mapaProg.get(emp.empleado_id) || { programadas: 0, minutos: 0 };
      const jornadasEmp = mapaJornadas.get(emp.empleado_id) || [];
      const ausencias = mapaAusencias.get(emp.empleado_id) || 0;

      let tiempoTotal = 0;
      let desayuno = 0;
      let almuerzo = 0;
      let cafe = 0;
      let pausas = 0;
      let efectivo = 0;
      let adicionalDetectado = 0;
      let adicionalAprobado = 0;
      let tardias = 0;
      let minutosTardia = 0;
      let regularizadas = 0;

      const jornadasDetalle: ReporteJornadaDiariaItem[] = [];

      for (const j of jornadasEmp) {
        tiempoTotal += j.minutos_tiempo_total;
        desayuno += j.minutos_desayuno;
        almuerzo += j.minutos_almuerzo;
        cafe += j.minutos_cafe;
        pausas += j.minutos_total_descansos;
        efectivo += j.minutos_efectivos;
        adicionalDetectado += j.minutos_tiempo_adicional;
        adicionalAprobado += j.minutos_tiempo_adicional_aprobado;

        if (j.minutos_tardanza > 0) {
          tardias += 1;
          minutosTardia += j.minutos_tardanza;
        }

        if (j.es_salida_regularizada || j.estado_jornada === 'REGULARIZADA') {
          regularizadas += 1;
        }

        jornadasDetalle.push({
          id: j.id,
          fecha_jornada: j.fecha_jornada,
          horario_nombre: j.horario_nombre,
          hora_entrada: j.hora_entrada_calculo ? new Date(j.hora_entrada_calculo).toISOString() : null,
          hora_salida: j.hora_salida_calculo ? new Date(j.hora_salida_calculo).toISOString() : null,
          minutos_tiempo_total: j.minutos_tiempo_total,
          minutos_total_descansos: j.minutos_total_descansos,
          minutos_desayuno: j.minutos_desayuno,
          minutos_almuerzo: j.minutos_almuerzo,
          minutos_cafe: j.minutos_cafe,
          minutos_efectivos: j.minutos_efectivos,
          minutos_tiempo_adicional: j.minutos_tiempo_adicional,
          minutos_tiempo_adicional_aprobado: j.minutos_tiempo_adicional_aprobado,
          estado_tiempo_adicional: j.estado_tiempo_adicional,
          estado_jornada: j.estado_jornada,
          es_salida_regularizada: Boolean(j.es_salida_regularizada),
        });
      }

      totalHorasProgramadas += prog.minutos;
      totalHorasRegistradas += tiempoTotal;
      totalPausas += pausas;
      totalEfectivas += efectivo;
      totalAdicionalDetectado += adicionalDetectado;
      totalAdicionalAprobado += adicionalAprobado;

      items.push({
        empleado_id: emp.empleado_id,
        empleado_nombre: emp.empleado_nombre,
        empleado_cedula: emp.empleado_cedula,
        departamento_nombre: emp.departamento_nombre,
        puesto_nombre: emp.puesto_nombre,
        jornadas_programadas: prog.programadas,
        jornadas_registradas: jornadasEmp.length,
        minutos_programados: prog.minutos,
        minutos_tiempo_total: tiempoTotal,
        minutos_desayuno: desayuno,
        minutos_almuerzo: almuerzo,
        minutos_cafe: cafe,
        minutos_total_descansos: pausas,
        minutos_efectivos: efectivo,
        minutos_tiempo_adicional: adicionalDetectado,
        minutos_tiempo_adicional_aprobado: adicionalAprobado,
        tardias,
        minutos_tardia: minutosTardia,
        ausencias,
        jornadas_regularizadas: regularizadas,
        jornadas_detalle: jornadasDetalle,
      });
    }

    return {
      items,
      totales: {
        horas_programadas_minutos: totalHorasProgramadas,
        horas_totales_minutos: totalHorasRegistradas,
        pausas_acumuladas_minutos: totalPausas,
        horas_efectivas_minutos: totalEfectivas,
        tiempo_adicional_detectado_minutos: totalAdicionalDetectado,
        tiempo_adicional_aprobado_minutos: totalAdicionalAprobado,
      },
    };
  }

  async obtenerReporteIncidencias(filtros: FiltrosReporte): Promise<ReporteIncidenciasItem[]> {
    const params: any[] = [];
    const empScope = this.buildEmpleadoScopeWhere(filtros, "e", params);

    let whereSql = `WHERE 1=1 ${empScope.sql}`;
    if (filtros.fecha_desde) {
      params.push(filtros.fecha_desde);
      whereSql += ` AND (j.fecha_jornada >= $${params.length} OR inc.creado_en >= $${params.length}::timestamptz)`;
    }
    if (filtros.fecha_hasta) {
      params.push(filtros.fecha_hasta);
      whereSql += ` AND (j.fecha_jornada <= $${params.length} OR inc.creado_en <= $${params.length}::timestamptz + interval '1 day')`;
    }
    if (filtros.tipo_incidencia) {
      params.push(filtros.tipo_incidencia);
      whereSql += ` AND inc.tipo_incidencia = $${params.length}`;
    }
    if (filtros.estado) {
      params.push(filtros.estado);
      whereSql += ` AND inc.estado = $${params.length}`;
    }

    const sql = `
      SELECT 
        inc.id,
        COALESCE(j.fecha_jornada::text, inc.creado_en::date::text) as fecha_jornada,
        inc.empleado_id,
        e.nombre_completo as empleado_nombre,
        e.cedula as empleado_cedula,
        COALESCE(d.nombre, 'Sin Departamento') as departamento_nombre,
        inc.tipo_incidencia,
        COALESCE(inc.minutos_afectados, 0)::int as minutos_afectados,
        inc.estado,
        inc.descripcion,
        inc.resolucion_motivo,
        u.nombre_completo as usuario_resolvio_nombre,
        inc.fecha_resolucion,
        inc.creado_en
      FROM incidencias inc
      JOIN empleados e ON e.id = inc.empleado_id
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      LEFT JOIN jornadas j ON j.id = inc.jornada_id
      LEFT JOIN usuarios u ON u.id = inc.usuario_resolvio_id
      ${whereSql}
      ORDER BY inc.creado_en DESC
      ${filtros.limite ? `LIMIT ${Number(filtros.limite)}` : ""}
      ${filtros.offset ? `OFFSET ${Number(filtros.offset)}` : ""};
    `;

    const res = await this.pool.query(sql, params);

    return res.rows.map((r) => ({
      id: r.id,
      fecha_jornada: r.fecha_jornada,
      empleado_id: r.empleado_id,
      empleado_nombre: r.empleado_nombre,
      empleado_cedula: r.empleado_cedula,
      departamento_nombre: r.departamento_nombre,
      tipo_incidencia: r.tipo_incidencia,
      minutos_afectados: Number(r.minutos_afectados || 0),
      estado: r.estado,
      descripcion: r.descripcion,
      resolucion_motivo: r.resolucion_motivo,
      usuario_resolvio_nombre: r.usuario_resolvio_nombre,
      fecha_resolucion: r.fecha_resolucion ? new Date(r.fecha_resolucion).toISOString() : null,
      creado_en: new Date(r.creado_en).toISOString(),
    }));
  }

  async obtenerReporteSolicitudes(filtros: FiltrosReporte): Promise<ReporteSolicitudesItem[]> {
    const params: any[] = [];
    const empScope = this.buildEmpleadoScopeWhere(filtros, "e", params);

    let whereSql = `WHERE 1=1 ${empScope.sql}`;
    if (filtros.fecha_desde) {
      params.push(filtros.fecha_desde);
      whereSql += ` AND s.fecha_inicio >= $${params.length}`;
    }
    if (filtros.fecha_hasta) {
      params.push(filtros.fecha_hasta);
      whereSql += ` AND s.fecha_inicio <= $${params.length}`;
    }
    if (filtros.tipo_solicitud) {
      params.push(filtros.tipo_solicitud);
      whereSql += ` AND s.tipo_solicitud = $${params.length}`;
    }
    if (filtros.estado) {
      params.push(filtros.estado);
      whereSql += ` AND s.estado = $${params.length}`;
    }

    const sql = `
      SELECT 
        s.id,
        s.empleado_id,
        e.nombre_completo as empleado_nombre,
        e.cedula as empleado_cedula,
        COALESCE(d.nombre, 'Sin Departamento') as departamento_nombre,
        s.tipo_solicitud,
        s.fecha_inicio::text as fecha_inicio,
        s.fecha_fin::text as fecha_fin,
        COALESCE(s.minutos_solicitados, 0)::int as minutos_solicitados,
        s.motivo,
        s.estado,
        u.nombre_completo as aprobador_nombre,
        sd.fecha_decision as fecha_resolucion,
        sd.comentarios as comentarios_resolucion,
        s.creado_en
      FROM solicitudes_justificacion s
      JOIN empleados e ON e.id = s.empleado_id
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      LEFT JOIN LATERAL (
        SELECT usuario_decisor_id, fecha_decision, comentarios
        FROM solicitud_decisiones
        WHERE solicitud_id = s.id
        ORDER BY nivel DESC, fecha_decision DESC
        LIMIT 1
      ) sd ON true
      LEFT JOIN usuarios u ON u.id = sd.usuario_decisor_id
      ${whereSql}
      ORDER BY s.creado_en DESC
      ${filtros.limite ? `LIMIT ${Number(filtros.limite)}` : ""}
      ${filtros.offset ? `OFFSET ${Number(filtros.offset)}` : ""};
    `;

    const res = await this.pool.query(sql, params);

    return res.rows.map((r) => ({
      id: r.id,
      empleado_id: r.empleado_id,
      empleado_nombre: r.empleado_nombre,
      empleado_cedula: r.empleado_cedula,
      departamento_nombre: r.departamento_nombre,
      tipo_solicitud: r.tipo_solicitud,
      fecha_inicio: r.fecha_inicio,
      fecha_fin: r.fecha_fin,
      minutos_solicitados: Number(r.minutos_solicitados || 0),
      motivo: r.motivo,
      estado: r.estado,
      aprobador_nombre: r.aprobador_nombre,
      fecha_resolucion: r.fecha_resolucion ? new Date(r.fecha_resolucion).toISOString() : null,
      comentarios_resolucion: r.comentarios_resolucion,
      creado_en: new Date(r.creado_en).toISOString(),
    }));
  }

  async obtenerReporteFeriados(filtros: FiltrosReporte): Promise<ReporteFeriadosItem[]> {
    const params: any[] = [];
    const empScope = this.buildEmpleadoScopeWhere(filtros, "e", params);

    let fechaWhere = "";
    if (filtros.fecha_desde) {
      params.push(filtros.fecha_desde);
      fechaWhere += ` AND f.fecha >= $${params.length}`;
    }
    if (filtros.fecha_hasta) {
      params.push(filtros.fecha_hasta);
      fechaWhere += ` AND f.fecha <= $${params.length}`;
    }

    const sql = `
      SELECT 
        f.id as feriado_id,
        f.fecha::text,
        f.descripcion,
        f.tipo_feriado,
        e.id as empleado_id,
        e.nombre_completo as empleado_nombre,
        e.cedula as empleado_cedula,
        COALESCE(d.nombre, 'Sin Departamento') as departamento_nombre,
        j.hora_entrada_calculo,
        j.hora_salida_calculo,
        COALESCE(j.minutos_efectivos, 0)::int as minutos_efectivos
      FROM feriados f
      LEFT JOIN jornadas j ON j.fecha_jornada = f.fecha
      LEFT JOIN empleados e ON e.id = j.empleado_id ${empScope.sql}
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      WHERE f.activo = true ${fechaWhere}
      ORDER BY f.fecha DESC, e.nombre_completo ASC;
    `;

    const res = await this.pool.query(sql, params);

    return res.rows.map((r) => ({
      feriado_id: r.feriado_id,
      fecha: r.fecha,
      descripcion: r.descripcion,
      tipo_feriado: r.tipo_feriado,
      empleado_id: r.empleado_id || null,
      empleado_nombre: r.empleado_nombre || null,
      empleado_cedula: r.empleado_cedula || null,
      departamento_nombre: r.departamento_nombre || null,
      trabajo_en_feriado: Boolean(r.empleado_id && r.hora_entrada_calculo),
      hora_entrada_calculo: r.hora_entrada_calculo ? new Date(r.hora_entrada_calculo).toISOString() : null,
      hora_salida_calculo: r.hora_salida_calculo ? new Date(r.hora_salida_calculo).toISOString() : null,
      minutos_efectivos: Number(r.minutos_efectivos || 0),
    }));
  }

  async obtenerReporteCorrecciones(filtros: FiltrosReporte): Promise<ReporteCorreccionesItem[]> {
    const params: any[] = [];
    const empScope = this.buildEmpleadoScopeWhere(filtros, "e", params);

    let whereSql = `WHERE 1=1 ${empScope.sql}`;
    if (filtros.fecha_desde) {
      params.push(filtros.fecha_desde);
      whereSql += ` AND cm.creado_en >= $${params.length}::timestamptz`;
    }
    if (filtros.fecha_hasta) {
      params.push(filtros.fecha_hasta);
      whereSql += ` AND cm.creado_en <= $${params.length}::timestamptz + interval '1 day'`;
    }
    if (filtros.estado) {
      params.push(filtros.estado);
      whereSql += ` AND cm.estado = $${params.length}`;
    }

    const sql = `
      SELECT 
        cm.id,
        cm.creado_en,
        e.id as empleado_id,
        e.nombre_completo as empleado_nombre,
        e.cedula as empleado_cedula,
        COALESCE(d.nombre, 'Sin Departamento') as departamento_nombre,
        COALESCE(m.tipo_marca, 'NO_REGISTRADA') as marca_original_tipo,
        m.timestamp_servidor as marca_original_timestamp,
        cm.tipo_ajuste,
        cm.timestamp_propuesto,
        COALESCE(cm.tipo_marca_propuesto, m.tipo_marca) as tipo_marca_propuesto,
        cm.motivo,
        cm.estado,
        us.nombre_completo as usuario_solicito_nombre,
        ua.nombre_completo as usuario_autorizo_nombre,
        cm.fecha_resolucion
      FROM correcciones_marcas cm
      LEFT JOIN marcas m ON m.id = cm.marca_original_id
      LEFT JOIN empleados e ON e.id = m.empleado_id
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      LEFT JOIN usuarios us ON us.id = cm.usuario_solicito_id
      LEFT JOIN usuarios ua ON ua.id = cm.usuario_autorizo_id
      ${whereSql}
      ORDER BY cm.creado_en DESC
      ${filtros.limite ? `LIMIT ${Number(filtros.limite)}` : ""}
      ${filtros.offset ? `OFFSET ${Number(filtros.offset)}` : ""};
    `;

    const res = await this.pool.query(sql, params);

    return res.rows.map((r) => ({
      id: r.id,
      creado_en: new Date(r.creado_en).toISOString(),
      empleado_id: r.empleado_id,
      empleado_nombre: r.empleado_nombre || "Colaborador",
      empleado_cedula: r.empleado_cedula || "-",
      departamento_nombre: r.departamento_nombre,
      marca_original_tipo: r.marca_original_tipo,
      marca_original_timestamp: r.marca_original_timestamp ? new Date(r.marca_original_timestamp).toISOString() : "-",
      tipo_ajuste: r.tipo_ajuste,
      timestamp_propuesto: r.timestamp_propuesto ? new Date(r.timestamp_propuesto).toISOString() : "-",
      tipo_marca_propuesto: r.tipo_marca_propuesto,
      motivo: r.motivo,
      estado: r.estado,
      usuario_solicito_nombre: r.usuario_solicito_nombre,
      usuario_autorizo_nombre: r.usuario_autorizo_nombre,
      fecha_resolucion: r.fecha_resolucion ? new Date(r.fecha_resolucion).toISOString() : null,
    }));
  }

  async obtenerReporteAuditoria(filtros: FiltrosReporte): Promise<ReporteAuditoriaItem[]> {
    const params: any[] = [];
    let whereSql = "WHERE 1=1";

    if (filtros.fecha_desde) {
      params.push(filtros.fecha_desde);
      whereSql += ` AND a.timestamp_evento >= $${params.length}::timestamptz`;
    }
    if (filtros.fecha_hasta) {
      params.push(filtros.fecha_hasta);
      whereSql += ` AND a.timestamp_evento <= $${params.length}::timestamptz + interval '1 day'`;
    }
    if (filtros.busqueda) {
      params.push(`%${filtros.busqueda.trim()}%`);
      whereSql += ` AND (a.accion ILIKE $${params.length} OR a.entidad_tipo ILIKE $${params.length} OR a.motivo ILIKE $${params.length})`;
    }

    const sql = `
      SELECT 
        a.id::text,
        a.timestamp_evento,
        a.actor_usuario_id,
        u.nombre_completo as usuario_nombre,
        a.rol_actor,
        a.accion,
        a.entidad_tipo,
        a.entidad_id,
        a.motivo,
        a.ip_origen::text
      FROM auditoria_eventos a
      LEFT JOIN usuarios u ON u.id = a.actor_usuario_id
      ${whereSql}
      ORDER BY a.timestamp_evento DESC
      ${filtros.limite ? `LIMIT ${Number(filtros.limite)}` : "LIMIT 100"}
      ${filtros.offset ? `OFFSET ${Number(filtros.offset)}` : ""};
    `;

    const res = await this.pool.query(sql, params);

    return res.rows.map((r) => ({
      id: r.id,
      timestamp_evento: new Date(r.timestamp_evento).toISOString(),
      actor_usuario_id: r.actor_usuario_id,
      usuario_nombre: r.usuario_nombre,
      rol_actor: r.rol_actor,
      accion: r.accion,
      entidad_tipo: r.entidad_tipo,
      entidad_id: r.entidad_id,
      motivo: r.motivo,
      ip_origen: r.ip_origen,
    }));
  }
}
