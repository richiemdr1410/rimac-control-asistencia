import type { TipoMarca } from "./marcas.js";

export type TipoAjusteMarca = "ANULACION_LOGICA" | "SUSTITUCION_TIMESTAMP" | "SUSTITUCION_TIPO";

export type EstadoCorreccionMarca = "PENDIENTE" | "APROBADA" | "RECHAZADA";

export interface CorreccionMarcaEntity {
  id: string;
  marca_original_id: string;
  tipo_ajuste: TipoAjusteMarca;
  timestamp_propuesto?: string | null;
  tipo_marca_propuesto?: TipoMarca | null;
  motivo: string;
  usuario_solicito_id: string;
  usuario_autorizo_id?: string | null;
  estado: EstadoCorreccionMarca;
  fecha_resolucion?: string | null;
  creado_en: string;
}

export interface CorreccionMarcaDetalle extends CorreccionMarcaEntity {
  marca_original_tipo: TipoMarca;
  marca_original_timestamp: string;
  empleado_id: string;
  empleado_nombre: string;
  empleado_identificador: string;
  jornada_id: string;
  fecha_jornada: string;
  usuario_solicito_nombre: string;
  usuario_autorizo_nombre?: string;
}

export interface FiltrosCorrecciones {
  empleado_id?: string;
  estado?: EstadoCorreccionMarca;
  fecha?: string;
}

export interface ICorreccionesMarcasRepository {
  crear(correccion: Omit<CorreccionMarcaEntity, "id" | "creado_en" | "estado" | "usuario_autorizo_id" | "fecha_resolucion">): Promise<CorreccionMarcaEntity>;
  obtenerPorId(id: string): Promise<CorreccionMarcaEntity | null>;
  obtenerDetallePorId(id: string): Promise<CorreccionMarcaDetalle | null>;
  obtenerPendientePorMarcaId(marca_original_id: string): Promise<CorreccionMarcaEntity | null>;
  listar(filtros?: FiltrosCorrecciones): Promise<CorreccionMarcaDetalle[]>;
  decidirCorreccion(
    id: string,
    estado: "APROBADA" | "RECHAZADA",
    usuario_autorizo_id: string
  ): Promise<CorreccionMarcaEntity>;
}
