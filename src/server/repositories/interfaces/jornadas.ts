export type EstadoJornada =
  | "ABIERTA"
  | "CERRADA_NORMAL"
  | "REGISTRO_INCOMPLETO"
  | "AUSENCIA_INJUSTIFICADA"
  | "JUSTIFICADA_TOTAL";

export interface SnapshotHorario {
  horario_id_origen: string;
  hora_entrada_programada: string; // "HH:mm"
  hora_salida_programada: string;  // "HH:mm"
  tolerancia_minutos: number;
  minutos_esperados: number;
  cruza_medianoche: boolean;
}

export type EstadoTiempoAdicional =
  | "NO_APLICA"
  | "PENDIENTE"
  | "APROBADO_TOTAL"
  | "APROBADO_PARCIAL"
  | "RECHAZADO";

export interface ResultadosDerivadosJornada {
  hora_entrada_efectiva?: string; // ISO 8601
  hora_salida_efectiva?: string;  // ISO 8601
  minutos_desayuno?: number;
  minutos_almuerzo?: number;
  minutos_cafe?: number;
  minutos_descansos: number;
  minutos_tiempo_total?: number;
  minutos_efectivos: number;
  minutos_justificados_comp: number;
  minutos_justificados_nocomp: number;
  minutos_tardanza: number;
  minutos_salida_anticipada: number;
  minutos_tiempo_adicional?: number;
  minutos_tiempo_adicional_aprobado?: number;
  estado_tiempo_adicional?: EstadoTiempoAdicional;
  cumplimiento_porcentaje: number;
}

export interface JornadaEntity {
  id: string; // UUIDv4
  empleado_id: string;
  fecha_jornada: string; // YYYY-MM-DD
  estado_jornada: EstadoJornada;
  snapshot_horario: SnapshotHorario;
  resultados_derivados: ResultadosDerivadosJornada;
  hora_entrada_marcada?: string | null;
  hora_entrada_calculo?: string | null;
  origen_entrada_calculo?: string;
  hora_salida_marcada?: string | null;
  hora_salida_calculo?: string | null;
  origen_salida_calculo?: string;
  es_salida_regularizada?: boolean;
  usuario_regularizo_id?: string | null;
  fecha_regularizacion?: string | null;
  minutos_tiempo_adicional_aprobado?: number;
  estado_tiempo_adicional?: EstadoTiempoAdicional;
  usuario_aprobo_ta_id?: string | null;
  fecha_resolucion_ta?: string | null;
  motivo_resolucion_ta?: string | null;
  es_feriado?: boolean;
  creado_en: string;
  actualizado_en: string;
  empleado_nombre?: string;
  empleado_cedula?: string;
  departamento_nombre?: string;
  departamento_id?: string;
  minutos_tiempo_total?: number;
  minutos_efectivos?: number;
  minutos_desayuno?: number;
  minutos_almuerzo?: number;
  minutos_cafe?: number;
  minutos_total_descansos?: number;
  minutos_tardanza?: number;
  minutos_salida_anticipada?: number;
  minutos_tiempo_adicional?: number;
  cumplimiento_porcentaje?: number;
}

export interface FiltrosListarJornadas {
  empleado_id?: string;
  subordinados_ids?: string[];
  fecha?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  estado_jornada?: string;
  departamento_id?: string;
  busqueda?: string;
  limite?: number;
  offset?: number;
}

export interface IJornadasRepository {
  obtenerPorId(id: string): Promise<JornadaEntity | null>;
  obtenerJornadaAbierta(empleado_id: string, fechaMax?: string): Promise<JornadaEntity | null>;
  obtenerPorEmpleadoYFecha(empleado_id: string, fecha_jornada: string): Promise<JornadaEntity | null>;
  obtenerTodasJornadasAbiertas(): Promise<JornadaEntity[]>;
  listarJornadas(filtros?: FiltrosListarJornadas): Promise<JornadaEntity[]>;
  listarJornadasConTiempoAdicional(filtros?: {
    estado?: string;
    empleado_id?: string;
    subordinados_ids?: string[];
  }): Promise<any[]>;
  crearJornada(jornada: JornadaEntity): Promise<void>;
  actualizarJornada(jornada: JornadaEntity): Promise<void>;
  aprobarTiempoAdicional(
    jornadaId: string,
    datos: {
      decision: "APROBAR_TOTAL" | "APROBAR_PARCIAL" | "RECHAZAR";
      minutos_aprobados: number;
      usuario_id: string;
      motivo: string;
    }
  ): Promise<JornadaEntity>;
  actualizarRegularizacionSalida(
    jornadaId: string,
    horaSalidaCalculoIso: string,
    usuarioRegularizoId: string,
    resultados: ResultadosDerivadosJornada,
    nuevoEstado: EstadoJornada
  ): Promise<void>;
}
