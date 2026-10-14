export interface PoliticaSolicitudEntity {
  id: string;
  tipo_solicitud: string;
  requiere_evidencia: boolean;
  niveles_aprobacion_requeridos: number;
  rol_aprobador_nivel_1: string;
  rol_aprobador_nivel_2?: string | null;
  activo: boolean;
  creado_en?: string;
}

export type EstadoSolicitud = "PENDIENTE" | "EN_REVISION" | "APROBADA" | "RECHAZADA";

export interface SolicitudEntity {
  id: string;
  empleado_id: string;
  politica_id: string;
  tipo_solicitud: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
  fecha_hora_inicio?: string | null; // ISO timestamp con zona horaria
  fecha_hora_fin?: string | null; // ISO timestamp con zona horaria
  minutos_solicitados: number;
  motivo: string;
  estado: EstadoSolicitud;
  creado_en?: string;
}

export interface SolicitudDecisionEntity {
  id: string;
  solicitud_id: string;
  nivel: number;
  rol_evaluador: string;
  usuario_decisor_id: string;
  decision: "APROBADA" | "RECHAZADA";
  comentarios?: string | null;
  fecha_decision?: string;
  decisor_nombre?: string;
}

export interface SolicitudEvidenciaEntity {
  id: string;
  solicitud_id: string;
  nombre_archivo: string;
  tipo_mime: string;
  referencia_almacenamiento: string;
  hash_archivo: string;
  cargado_por_usuario_id: string;
  creado_en?: string;
}

export interface SolicitudConDetalle extends SolicitudEntity {
  empleado_nombre?: string;
  empleado_cedula?: string;
  departamento_nombre?: string;
  politica?: PoliticaSolicitudEntity;
  decisiones?: SolicitudDecisionEntity[];
  evidencias?: SolicitudEvidenciaEntity[];
}

export interface ISolicitudesRepository {
  obtenerPolitica(tipo_solicitud: string): Promise<PoliticaSolicitudEntity | null>;
  listarPoliticas(): Promise<PoliticaSolicitudEntity[]>;
  crearSolicitud(solicitud: SolicitudEntity, evidencias?: SolicitudEvidenciaEntity[]): Promise<SolicitudEntity>;
  obtenerSolicitudPorId(id: string): Promise<SolicitudConDetalle | null>;
  listarSolicitudesEmpleado(empleado_id: string): Promise<SolicitudConDetalle[]>;
  listarSolicitudesPendientesParaRevisor(revisor: {
    rol: string;
    empleado_id?: string | null;
    subordinados_ids?: string[];
  }): Promise<SolicitudConDetalle[]>;
  registrarDecision(decision: SolicitudDecisionEntity, nuevoEstadoSolicitud: EstadoSolicitud): Promise<void>;
  obtenerSolicitudesAprobadasEnRango(
    empleado_id: string,
    fecha_inicio: string,
    fecha_fin: string
  ): Promise<SolicitudConDetalle[]>;
}
