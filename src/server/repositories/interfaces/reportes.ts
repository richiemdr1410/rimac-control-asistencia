export interface FiltrosReporte {
  fecha_desde?: string;
  fecha_hasta?: string;
  empleado_id?: string;
  subordinados_ids?: string[];
  departamento_id?: string;
  busqueda?: string;
  estado?: string;
  tipo_incidencia?: string;
  tipo_solicitud?: string;
  limite?: number;
  offset?: number;
}

export interface DashboardKpiDTO {
  colaboradores_activos: number;
  jornadas_registradas: number;
  jornadas_cerradas: number;
  jornadas_abiertas: number;
  tardias: number;
  ausencias: number;
  incidencias_abiertas: number;
  solicitudes_pendientes: number;
  correcciones_pendientes: number;
  minutos_tiempo_adicional_detectado: number;
  minutos_tiempo_adicional_pendiente: number;
  minutos_tiempo_adicional_aprobado: number;
  tendencia_asistencia: Array<{
    fecha: string;
    registradas: number;
    tardias: number;
    ausencias: number;
  }>;
  incidencias_por_tipo: Array<{
    tipo: string;
    cantidad: number;
  }>;
  tiempo_efectivo_por_dia: Array<{
    fecha: string;
    minutos_efectivos: number;
    minutos_adicional: number;
  }>;
}

export interface ReporteAsistenciaItem {
  empleado_id: string;
  empleado_nombre: string;
  empleado_cedula: string;
  departamento_nombre: string;
  puesto_nombre?: string;
  jornadas_programadas: number;
  jornadas_registradas: number;
  entradas_registradas: number;
  salidas_registradas: number;
  tardias: number;
  ausencias: number;
  salidas_omitidas: number;
  jornadas_regularizadas: number;
  minutos_efectivos_totales: number;
}

export interface ReporteHorasJornadasItem {
  id: string;
  fecha_jornada: string;
  empleado_id: string;
  empleado_nombre: string;
  empleado_cedula: string;
  departamento_nombre: string;
  horario_nombre?: string;
  hora_entrada_calculo: string | null;
  hora_salida_calculo: string | null;
  minutos_tiempo_total: number;
  minutos_total_descansos: number;
  minutos_desayuno: number;
  minutos_almuerzo: number;
  minutos_cafe: number;
  minutos_efectivos: number;
  minutos_tiempo_adicional: number;
  minutos_tiempo_adicional_aprobado: number;
  estado_tiempo_adicional: string | null;
  estado_jornada: string;
  es_salida_regularizada: boolean;
}

export interface ReporteIncidenciasItem {
  id: string;
  fecha_jornada: string;
  empleado_id: string;
  empleado_nombre: string;
  empleado_cedula: string;
  departamento_nombre: string;
  tipo_incidencia: string;
  minutos_afectados: number;
  estado: string;
  descripcion: string;
  resolucion_motivo: string | null;
  usuario_resolvio_nombre: string | null;
  fecha_resolucion: string | null;
  creado_en: string;
}

export interface ReporteSolicitudesItem {
  id: string;
  empleado_id: string;
  empleado_nombre: string;
  empleado_cedula: string;
  departamento_nombre: string;
  tipo_solicitud: string;
  fecha_inicio: string;
  fecha_fin: string;
  minutos_solicitados: number;
  motivo: string;
  estado: string;
  aprobador_nombre: string | null;
  fecha_resolucion: string | null;
  comentarios_resolucion: string | null;
  creado_en: string;
}

export interface ReporteFeriadosItem {
  feriado_id: string;
  fecha: string;
  descripcion: string;
  tipo_feriado: string;
  empleado_id: string | null;
  empleado_nombre: string | null;
  empleado_cedula: string | null;
  departamento_nombre: string | null;
  trabajo_en_feriado: boolean;
  hora_entrada_calculo: string | null;
  hora_salida_calculo: string | null;
  minutos_efectivos: number;
}

export interface ReporteCorreccionesItem {
  id: string;
  creado_en: string;
  empleado_id: string;
  empleado_nombre: string;
  empleado_cedula: string;
  departamento_nombre: string;
  marca_original_tipo: string;
  marca_original_timestamp: string;
  tipo_ajuste: string;
  timestamp_propuesto: string;
  tipo_marca_propuesto: string;
  motivo: string;
  estado: string;
  usuario_solicito_nombre: string | null;
  usuario_autorizo_nombre: string | null;
  fecha_resolucion: string | null;
}

export interface ReporteAuditoriaItem {
  id: string;
  timestamp_evento: string;
  actor_usuario_id: string | null;
  usuario_nombre: string | null;
  rol_actor: string | null;
  accion: string;
  entidad_tipo: string;
  entidad_id: string | null;
  motivo: string | null;
  ip_origen: string | null;
}

export interface ReporteJornadaDiariaItem {
  id: string;
  fecha_jornada: string;
  horario_nombre: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  minutos_tiempo_total: number;
  minutos_total_descansos: number;
  minutos_desayuno: number;
  minutos_almuerzo: number;
  minutos_cafe: number;
  minutos_efectivos: number;
  minutos_tiempo_adicional: number;
  minutos_tiempo_adicional_aprobado: number;
  estado_tiempo_adicional: string | null;
  estado_jornada: string;
  es_salida_regularizada: boolean;
}

export interface ReporteResumenHorasColaboradorItem {
  empleado_id: string;
  empleado_nombre: string;
  empleado_cedula: string;
  departamento_nombre: string;
  puesto_nombre?: string;
  jornadas_programadas: number;
  jornadas_registradas: number;
  minutos_programados: number;
  minutos_tiempo_total: number;
  minutos_desayuno: number;
  minutos_almuerzo: number;
  minutos_cafe: number;
  minutos_total_descansos: number;
  minutos_efectivos: number;
  minutos_tiempo_adicional: number;
  minutos_tiempo_adicional_aprobado: number;
  tardias: number;
  minutos_tardia: number;
  ausencias: number;
  jornadas_regularizadas: number;
  jornadas_detalle: ReporteJornadaDiariaItem[];
}

export interface ReporteResumenHorasResponse {
  items: ReporteResumenHorasColaboradorItem[];
  totales: {
    horas_programadas_minutos: number;
    horas_totales_minutos: number;
    pausas_acumuladas_minutos: number;
    horas_efectivas_minutos: number;
    tiempo_adicional_detectado_minutos: number;
    tiempo_adicional_aprobado_minutos: number;
  };
}

export interface IReportesRepository {
  obtenerKpisDashboard(filtros: FiltrosReporte): Promise<DashboardKpiDTO>;
  obtenerReporteAsistencia(filtros: FiltrosReporte): Promise<ReporteAsistenciaItem[]>;
  obtenerReporteHorasJornadas(filtros: FiltrosReporte): Promise<{
    items: ReporteHorasJornadasItem[];
    totales: {
      total_tiempo_minutos: number;
      total_efectivo_minutos: number;
      total_descansos_minutos: number;
      total_adicional_detectado: number;
      total_adicional_aprobado: number;
    };
  }>;
  obtenerResumenHorasColaborador(filtros: FiltrosReporte): Promise<ReporteResumenHorasResponse>;
  obtenerReporteIncidencias(filtros: FiltrosReporte): Promise<ReporteIncidenciasItem[]>;
  obtenerReporteSolicitudes(filtros: FiltrosReporte): Promise<ReporteSolicitudesItem[]>;
  obtenerReporteFeriados(filtros: FiltrosReporte): Promise<ReporteFeriadosItem[]>;
  obtenerReporteCorrecciones(filtros: FiltrosReporte): Promise<ReporteCorreccionesItem[]>;
  obtenerReporteAuditoria(filtros: FiltrosReporte): Promise<ReporteAuditoriaItem[]>;
}
