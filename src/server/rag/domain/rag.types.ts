/**
 * Tipos de Dominio para el Subsistema GenAI + RAG Documental
 * Regulado por DTH-REG-001 — Reglamento Interno de Trabajo RIMAC S.A.
 */

export type EstadoRespuestaRag =
  | "RESPUESTA_FUNDAMENTADA"
  | "EVIDENCIA_INSUFICIENTE"
  | "FUERA_DE_ALCANCE"
  | "CONFLICTO_DOCUMENTAL"
  | "SOLICITUD_TRANSACCIONAL_RECHAZADA"
  | "REQUIERE_REVISION_HUMANA";

export interface MetadatosFragmento {
  documento: string;          // "Reglamento Interno de Trabajo RIMAC S.A."
  codigo_documento: string;   // "DTH-REG-001"
  version: string;            // "1"
  titulo: string;             // "TITULO III - JORNADA Y HORARIO DE TRABAJO"
  articulo: string;           // "ARTICULO 9" o "ARTICULO 9 (Descansos)"
  pagina: number;             // Número de página (1 a 38)
  chunk_id: string;           // "DTH-REG-001-ART-09-P1"
}

export interface FragmentoDocumento extends MetadatosFragmento {
  contenido: string;
  embedding?: number[];       // Vector 3072 dims generado por gemini-embedding-2-preview
}

export interface ResultadoBusquedaFragmento {
  fragmento: FragmentoDocumento;
  similitud: number;          // Similitud de coseno (0 a 1)
}

export interface FuenteCitada {
  documento: string;
  codigo: string;
  titulo: string;
  articulo: string;
  pagina: number | string;
  fragmento_id: string;
  texto_extracto?: string;
}

export interface ConsumoTokensRag {
  modelo_generativo: string;
  modelo_embeddings: string;
  tokens_entrada?: number;
  tokens_salida?: number;
  tokens_totales?: number;
  tamano_contexto_caracteres: number;
  chunks_recuperados: number;
}

export interface DiscrepanciaDetectada {
  parametro: string;
  valor_documental: string;
  valor_configurado: string;
  explicacion: string;
  requiere_supervision_humana: boolean;
}

export interface RespuestaRagDatos {
  respuesta: string;
  estado: EstadoRespuestaRag;
  fuentes: FuenteCitada[];
  discrepancia?: DiscrepanciaDetectada;
  metricas?: ConsumoTokensRag;
}

export type EstadoProcesamientoDocumento = "RECIBIDO" | "PROCESANDO" | "LISTO" | "ERROR";

export interface RagDocumentoEntity {
  id: string;
  codigo: string;
  titulo: string;
  version: string;
  descripcion?: string | null;
  fecha_vigencia?: string | null;
  estado_procesamiento: EstadoProcesamientoDocumento;
  error_mensaje?: string | null;
  hash_archivo?: string | null;
  nombre_archivo_original?: string | null;
  ruta_almacenamiento?: string | null;
  tamano_bytes?: number | null;
  mime_type?: string | null;
  total_paginas: number;
  total_fragmentos: number;
  creado_por_id?: string | null;
  creado_por_nombre?: string | null;
  activo: boolean;
  activado_en?: string | null;
  activado_por_id?: string | null;
  activado_por_nombre?: string | null;
  creado_en: string;
  actualizado_en: string;
  archivo_disponible?: boolean;
}

export interface IGenAiProvider {
  generarEmbedding(texto: string): Promise<number[]>;
  generarRespuesta(params: {
    systemPrompt: string;
    promptUsuario: string;
    temperatura?: number;
  }): Promise<{
    texto: string;
    tokensEntrada?: number;
    tokensSalida?: number;
    tokensTotales?: number;
  }>;
}

export interface IRagRepository {
  guardarFragmentos(fragmentos: FragmentoDocumento[]): Promise<number>;
  guardarFragmentosDeDocumento(documentoId: string, fragmentos: FragmentoDocumento[]): Promise<number>;
  limpiarFragmentosDeDocumento(documentoId: string): Promise<void>;
  listarFragmentos(soloActivos?: boolean): Promise<FragmentoDocumento[]>;
  contarFragmentos(soloActivos?: boolean): Promise<number>;
  buscarSimilares(vectorConsulta: number[], topK: number): Promise<ResultadoBusquedaFragmento[]>;

  // Gestión de Documentos
  listarDocumentos(filtros?: { codigo?: string; soloActivos?: boolean }): Promise<RagDocumentoEntity[]>;
  obtenerDocumentoPorId(id: string): Promise<RagDocumentoEntity | null>;
  obtenerDocumentoPorCodigoYVersion(codigo: string, version: string): Promise<RagDocumentoEntity | null>;
  crearDocumento(doc: Omit<RagDocumentoEntity, "id" | "creado_en" | "actualizado_en">): Promise<RagDocumentoEntity>;
  actualizarDocumento(id: string, parcial: Partial<RagDocumentoEntity>): Promise<RagDocumentoEntity>;
  activarDocumentoTransaccional(id: string, usuarioId: string): Promise<RagDocumentoEntity>;
  desactivarDocumento(id: string, usuarioId: string): Promise<RagDocumentoEntity>;
  eliminarDocumentoTransaccional(id: string): Promise<boolean>;
  archivoOriginalCompartido(rutaAlmacenamiento: string, documentoIdExcluir: string): Promise<boolean>;
}
