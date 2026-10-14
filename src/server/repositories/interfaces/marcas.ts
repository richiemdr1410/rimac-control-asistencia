export type TipoMarca =
  | "ENTRADA"
  | "SALIDA"
  | "INICIO_DESAYUNO"
  | "FIN_DESAYUNO"
  | "INICIO_ALMUERZO"
  | "FIN_ALMUERZO"
  | "INICIO_CAFE"
  | "FIN_CAFE";

export type OrigenMarca =
  | "GARITA_LECTOR"
  | "AUTOSERVICIO"
  | "INSERCION_MANUAL_EXTEMPORANEA"
  | "CORRECCION_ADMINISTRATIVA";

export type EstadoMarca =
  | "ACTIVA"
  | "SUPERSEDIDA"
  | "ANULADA_ADMINISTRATIVAMENTE";

export interface MarcaEntity {
  id: string; // UUIDv4
  jornada_id: string;
  empleado_id: string;
  tipo_marca: TipoMarca;
  timestamp_servidor: string; // ISO 8601
  origen_marca: OrigenMarca;
  estado_marca: EstadoMarca;
  usuario_registrador_id: string;
  creado_en: string;
}

export interface IMarcasRepository {
  crearMarca(marca: MarcaEntity): Promise<void>;
  obtenerPorId(id: string): Promise<MarcaEntity | null>;
  listarMarcasActivasJornada(jornada_id: string): Promise<MarcaEntity[]>;
  obtenerUltimaMarcaEmpleado(empleado_id: string, timestampMax?: string): Promise<MarcaEntity | null>;
}
