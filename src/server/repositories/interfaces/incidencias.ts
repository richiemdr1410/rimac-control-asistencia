export type TipoIncidencia =
  | "SALIDA_OMITIDA"
  | "ENTRADA_OMITIDA"
  | "SECUENCIA_ANORMAL"
  | "MARCA_DUPLICADA"
  | "PAUSA_SIN_CIERRE"
  | "DURACION_ANOMALA"
  | "INCONSISTENCIA_HORARIO"
  | "NUEVA_ENTRADA_CON_JORNADA_ABIERTA"
  | "EXCESO_DESAYUNO"
  | "EXCESO_ALMUERZO"
  | "EXCESO_CAFE"
  | "TIEMPO_ADICIONAL_PENDIENTE"
  | "AUSENCIA_INJUSTIFICADA";

export type EstadoIncidencia = "ABIERTA" | "JUSTIFICADA" | "REGULARIZADA" | "DESCARTADA";

export interface IncidenciaEntity {
  id: string;
  jornada_id: string;
  empleado_id: string;
  tipo_incidencia: TipoIncidencia;
  descripcion: string;
  minutos_afectados: number;
  estado: EstadoIncidencia;
  resolucion_motivo?: string | null;
  usuario_resolvio_id?: string | null;
  fecha_resolucion?: string | null;
  creado_en: string;
}

export interface IncidenciaDetalle extends IncidenciaEntity {
  empleado_nombre?: string;
  empleado_identificador?: string;
  departamento_nombre?: string;
  fecha_jornada?: string;
  hora_entrada_programada?: string;
  hora_salida_programada?: string;
  usuario_resolvio_nombre?: string;
}

export interface FiltrosIncidencias {
  empleado_id?: string;
  fecha?: string;
  tipo_incidencia?: TipoIncidencia;
  estado?: EstadoIncidencia;
  departamento_id?: string;
}

export interface IIncidenciasRepository {
  crear(incidencia: Omit<IncidenciaEntity, "id" | "creado_en">): Promise<IncidenciaEntity>;
  obtenerPorId(id: string): Promise<IncidenciaEntity | null>;
  obtenerDetallePorId(id: string): Promise<IncidenciaDetalle | null>;
  obtenerAbiertaPorJornadaYTipo(jornada_id: string, tipo: TipoIncidencia): Promise<IncidenciaEntity | null>;
  listarPorFiltros(filtros: FiltrosIncidencias): Promise<IncidenciaDetalle[]>;
  resolverIncidencia(
    id: string,
    estado: "JUSTIFICADA" | "REGULARIZADA" | "DESCARTADA",
    usuario_resolvio_id: string,
    motivo: string
  ): Promise<IncidenciaEntity>;
}
