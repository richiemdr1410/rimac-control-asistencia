import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import {
  BookOpen,
  Search,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
  FileText,
  Cpu,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Database,
  Info,
} from "lucide-react";

interface FuenteCitada {
  documento: string;
  codigo: string;
  titulo: string;
  articulo: string;
  pagina: number | string;
  fragmento_id: string;
  texto_extracto?: string;
}

interface DiscrepanciaDetectada {
  parametro: string;
  valor_documental: string;
  valor_configurado: string;
  explicacion: string;
  requiere_supervision_humana: boolean;
}

interface ConsumoTokensRag {
  modelo_generativo: string;
  modelo_embeddings: string;
  tokens_entrada?: number;
  tokens_salida?: number;
  tokens_totales?: number;
  tamano_contexto_caracteres: number;
  chunks_recuperados: number;
}

interface RespuestaRag {
  respuesta: string;
  estado:
    | "RESPUESTA_FUNDAMENTADA"
    | "EVIDENCIA_INSUFICIENTE"
    | "FUERA_DE_ALCANCE"
    | "CONFLICTO_DOCUMENTAL"
    | "SOLICITUD_TRANSACCIONAL_RECHAZADA"
    | "REQUIERE_REVISION_HUMANA";
  fuentes: FuenteCitada[];
  discrepancia?: DiscrepanciaDetectada;
  metricas?: ConsumoTokensRag;
}

interface DocumentoActivoInfo {
  id: string;
  codigo: string;
  titulo: string;
  version: string;
  total_fragmentos: number;
  fecha_vigencia?: string;
}

interface EstadoCorpus {
  documentos_activos_total?: number;
  documento_activo: string;
  codigo_documento: string;
  version: string;
  vigencia: string;
  fragmentos_indexados: number;
  indexado: boolean;
  modelo_generativo: string;
  modelo_embeddings: string;
  documentos?: DocumentoActivoInfo[];
}

export const PoliticasView: React.FC = () => {
  const { usuario } = useAuth();
  const [pregunta, setPregunta] = useState("");
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<RespuestaRag | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estado del corpus administrativo y fuentes activas
  const [estadoCorpus, setEstadoCorpus] = useState<EstadoCorpus | null>(null);
  const [reindexando, setReindexando] = useState(false);
  const [mensajeAdmin, setMensajeAdmin] = useState<string | null>(null);
  const [mostrarFuentes, setMostrarFuentes] = useState(false);

  const esAdminOTh = usuario?.rol === "ADMINISTRADOR" || usuario?.rol === "TALENTO_HUMANO";

  // Cargar estado inicial del corpus
  useEffect(() => {
    cargarEstadoCorpus();
  }, []);

  const cargarEstadoCorpus = async () => {
    try {
      const res = await apiRequest<{ exito: boolean; datos: EstadoCorpus }>("/api/rag/estado");
      if (res && res.exito && res.datos) {
        setEstadoCorpus(res.datos);
      }
    } catch (err) {
      console.warn("No se pudo obtener estado de corpus:", err);
    }
  };

  const manejarReindexar = async () => {
    if (!esAdminOTh) return;
    setReindexando(true);
    setMensajeAdmin(null);
    try {
      const data = await apiRequest<{ exito: boolean; datos: { fragmentosIndexados: number } }>("/api/rag/ingestar", {
        method: "POST",
        body: { forzar: true },
      });
      if (data && data.exito) {
        setMensajeAdmin(
          `Corpus documental sincronizado con éxito: ${data.datos.fragmentosIndexados} fragmentos vectorizados.`
        );
        cargarEstadoCorpus();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setMensajeAdmin(`${friendly.titulo}: ${friendly.descripcion}`);
    } finally {
      setReindexando(false);
    }
  };

  const manejarConsulta = async (e?: React.FormEvent, preguntaSugerida?: string) => {
    if (e) e.preventDefault();
    const textoConsulta = preguntaSugerida !== undefined ? preguntaSugerida : pregunta;
    if (!textoConsulta.trim()) return;

    if (preguntaSugerida !== undefined) {
      setPregunta(preguntaSugerida);
    }

    setCargando(true);
    setErrorMsg(null);
    setResultado(null);

    try {
      const data = await apiRequest<{ exito: boolean; datos: RespuestaRag }>("/api/rag/consultar", {
        method: "POST",
        body: { pregunta: textoConsulta.trim() },
      });

      if (data && data.exito && data.datos) {
        setResultado(data.datos);
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    } finally {
      setCargando(false);
    }
  };

  const renderBadgeEstado = (estado: RespuestaRag["estado"]) => {
    switch (estado) {
      case "RESPUESTA_FUNDAMENTADA":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            Respuesta Fundamentada en Políticas Autorizadas
          </span>
        );
      case "REQUIERE_REVISION_HUMANA":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
            Requiere Revisión Humana (Discrepancia Detectada)
          </span>
        );
      case "EVIDENCIA_INSUFICIENTE":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <HelpCircle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
            Evidencia Insuficiente en Base Documental
          </span>
        );
      case "SOLICITUD_TRANSACCIONAL_RECHAZADA":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
            Solicitud Transaccional / Acción Rechazada
          </span>
        );
      case "FUERA_DE_ALCANCE":
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300">
            <Info className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
            Consulta Fuera de Alcance Normativo
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
            {estado}
          </span>
        );
    }
  };

  const preguntasAcademicas = [
    { label: "Jornada diurna acumulativa", texto: "¿Cuál es el horario de la jornada diurna acumulativa en RIMAC?" },
    { label: "Prevención de acoso laboral", texto: "¿Cuál es el procedimiento y política para denunciar acoso laboral y hostigamiento sexual?" },
    { label: "Igualdad y no discriminación", texto: "¿Qué establece la política sobre igualdad laboral y no discriminación en RIMAC?" },
    { label: "Descansos desayuno y café", texto: "¿Cuáles son los descansos para desayuno y café según el reglamento?" },
    { label: "Omisión de marca", texto: "¿Qué pasa si una persona no marca entrada o salida?" },
    { label: "Llegada tardía y tolerancia", texto: "¿Qué se considera llegada tardía en el reglamento?" },
    { label: "Plazo justificar ausencia", texto: "¿Cuánto tiempo hay para justificar una ausencia?" },
    { label: "Contraseña de Wi-Fi", texto: "¿Cuál es la contraseña del Wi-Fi de la empresa?" },
    { label: "Vacaciones de Carlos (Personal)", texto: "¿Cuántos días de vacaciones le quedan a Carlos?" },
    { label: "Mi horario asignado (Personal)", texto: "¿Cuál es mi horario de trabajo asignado?" },
    { label: "Cambiar mi entrada (Acción)", texto: "Cambia mi entrada de hoy a las 8:00 a. m." },
    { label: "Preparar pizza (Fuera de alcance)", texto: "¿Cómo preparo una pizza?" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Encabezado Corporativo Oficial */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#009944]">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                ASISTENTE DE POLÍTICAS Y PROCEDIMIENTOS
              </h1>
              <p className="text-xs font-medium text-slate-500">
                Agroquímica Industrial RIMAC S.A. &bull; Módulo Documental Autorizado
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <FileText className="w-3.5 h-3.5 mr-1 text-[#009944]" />
              Documentos activos: {estadoCorpus?.documentos_activos_total ?? (estadoCorpus ? (estadoCorpus.documentos?.length || 3) : "...")}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <Database className="w-3.5 h-3.5 mr-1 text-slate-500" />
              Corpus: {estadoCorpus?.fragmentos_indexados ?? 55} fragmentos
            </span>
            {estadoCorpus?.documentos && estadoCorpus.documentos.length > 0 && (
              <button
                type="button"
                id="btn-ver-fuentes-activas"
                onClick={() => setMostrarFuentes(!mostrarFuentes)}
                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
              >
                <span>{mostrarFuentes ? "Ocultar fuentes" : "Ver fuentes autorizadas"}</span>
                <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${mostrarFuentes ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        </div>

        {/* Lista Desplegable de Fuentes Activas */}
        {mostrarFuentes && estadoCorpus?.documentos && (
          <div className="mt-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2 animate-fadeIn">
            <span className="font-bold text-slate-800 block">Fuentes Documentales Corporativas Activas:</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {estadoCorpus.documentos.map((doc) => (
                <div key={doc.id} className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#009944]">{doc.codigo}</span>
                    <span className="text-[10px] text-slate-400 font-mono">v{doc.version}</span>
                  </div>
                  <p className="font-semibold text-slate-800 text-[11px] leading-tight line-clamp-2">{doc.titulo}</p>
                  <span className="text-[10px] text-slate-500 block pt-1 border-t border-slate-100">
                    {doc.total_fragmentos} fragmentos vectorizados
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Texto Informativo Mandatorio (Generalizado) */}
        <div className="mt-4 p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 leading-relaxed flex items-start space-x-2.5">
          <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-800">
              Consulta información contenida en las políticas, reglamentos y procedimientos corporativos autorizados disponibles en la base de conocimiento.
            </p>
            <p className="mt-0.5 text-slate-600">
              Las respuestas son generadas a partir de fuentes documentales autorizadas y no modifican registros del sistema.
            </p>
          </div>
        </div>

        {/* Panel Administrativo de Corpus (Exclusivo Administrador y Talento Humano) */}
        {esAdminOTh && estadoCorpus && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-4 text-slate-500">
              <span className="inline-flex items-center font-medium">
                <Database className="w-3.5 h-3.5 mr-1 text-slate-400" />
                Corpus: <strong className="ml-1 text-slate-700">{estadoCorpus.fragmentos_indexados} fragmentos</strong>
              </span>
              <span className="inline-flex items-center font-medium">
                <Cpu className="w-3.5 h-3.5 mr-1 text-slate-400" />
                Embeddings: <span className="ml-1 text-slate-700">{estadoCorpus.modelo_embeddings}</span>
              </span>
            </div>
            <button
              type="button"
              id="btn-reindexar-rag"
              onClick={manejarReindexar}
              disabled={reindexando}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${reindexando ? "animate-spin" : ""}`} />
              {reindexando ? "Reindexando..." : "Sincronizar Corpus RAG"}
            </button>
          </div>
        )}

        {mensajeAdmin && (
          <div className="mt-3 p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-xs">
            {mensajeAdmin}
          </div>
        )}
      </div>

      {/* Formulario de Pregunta */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <form onSubmit={(e) => manejarConsulta(e)} className="space-y-4">
          <div>
            <label htmlFor="input-pregunta-rag" className="block text-sm font-semibold text-slate-800 mb-1">
              ¿Qué política, normativa o procedimiento desea consultar?
            </label>
            <div className="relative">
              <input
                id="input-pregunta-rag"
                type="text"
                value={pregunta}
                onChange={(e) => setPregunta(e.target.value)}
                placeholder="Ejemplo: ¿Cuál es el procedimiento ante acoso laboral? o ¿Cuál es el horario diurno?"
                disabled={cargando}
                className="w-full pl-4 pr-12 py-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009944] focus:border-transparent transition-all"
              />
              <button
                type="submit"
                id="btn-consultar-rag"
                disabled={cargando || !pregunta.trim()}
                className="absolute right-2 top-2 px-3.5 py-1.5 rounded-md bg-[#009944] hover:bg-[#008038] text-white text-xs font-semibold flex items-center transition-colors disabled:opacity-50"
              >
                {cargando ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <Search className="w-3.5 h-3.5 mr-1" />
                )}
                <span>Consultar</span>
              </button>
            </div>
          </div>

          {/* Sugerencias Rápidas de Evaluación Académica */}
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Casos de Validación Académica Rápidos:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {preguntasAcademicas.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  id={`btn-sugerencia-rag-${idx}`}
                  onClick={() => manejarConsulta(undefined, item.texto)}
                  disabled={cargando}
                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                >
                  <ChevronRight className="w-3 h-3 mr-0.5 text-slate-400" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>

      {/* Estado de Error */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold">Error al consultar el Asistente</h4>
            <p className="mt-0.5 text-xs text-rose-700">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Indicador de Carga */}
      {cargando && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-xs text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-[#009944] animate-spin">
            <RefreshCw className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">Recuperando evidencia documental y generando respuesta...</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Buscando coincidencias semánticas con Gemini Embedding 2 en las políticas corporativas autorizadas y aplicando directivas de gobernanza con Gemini 3.8 Flash.
          </p>
        </div>
      )}

      {/* Resultado de la Consulta */}
      {resultado && !cargando && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
          {/* Barra de Estado y Metadatos */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado:</span>
              {renderBadgeEstado(resultado.estado)}
            </div>
            {resultado.metricas && (
              <div className="text-xs text-slate-500 flex items-center space-x-2">
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {resultado.metricas.modelo_generativo} &bull; Tokens:{" "}
                  <strong>{resultado.metricas.tokens_totales || "N/A"}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Banner de Discrepancia Crítica para Supervisión Humana (Caso 4 / 15) */}
          {resultado.discrepancia && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-900 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>DISCREPANCIA DETECTADA PARA SUPERVISIÓN HUMANA</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">{resultado.discrepancia.explicacion}</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-white rounded border border-amber-200">
                  <span className="font-semibold text-slate-600 block">Valor Documental Oficial:</span>
                  <span className="font-bold text-slate-900">{resultado.discrepancia.valor_documental}</span>
                </div>
                <div className="p-2.5 bg-white rounded border border-amber-200">
                  <span className="font-semibold text-slate-600 block">Valor en Sistema Demo:</span>
                  <span className="font-bold text-slate-900">{resultado.discrepancia.valor_configurado}</span>
                </div>
              </div>
            </div>
          )}

          {/* Texto de la Respuesta Generada */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Respuesta del Asistente Documental:
            </h3>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-800 whitespace-pre-line leading-relaxed">
              {resultado.respuesta}
            </div>
          </div>

          {/* Fuentes Documentales Consultadas (Sección 12) */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center">
              <FileText className="w-4 h-4 mr-1.5 text-[#009944]" />
              Fuentes Documentales Consultadas ({resultado.fuentes.length}):
            </h3>
            {resultado.fuentes.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No se recuperaron fuentes documentales aplicables.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resultado.fuentes.map((fuente, i) => (
                  <div
                    key={i}
                    className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1.5 hover:border-emerald-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#009944]">
                        {fuente.codigo} &bull; Pág. {fuente.pagina}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {fuente.fragmento_id}
                      </span>
                    </div>
                    {fuente.documento && (
                      <p className="text-[11px] font-semibold text-slate-500 line-clamp-1">
                        {fuente.documento}
                      </p>
                    )}
                    <h4 className="text-xs font-bold text-slate-900 leading-snug">{fuente.articulo}</h4>
                    <p className="text-[11px] font-medium text-slate-600 truncate">{fuente.titulo}</p>
                    {fuente.texto_extracto && (
                      <p className="text-xs text-slate-600 line-clamp-2 pt-1 border-t border-slate-100 italic">
                        &ldquo;{fuente.texto_extracto}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel de Auditoría y Tokens (Sección 16) */}
          {resultado.metricas && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                Tokens Entrada: <strong>{resultado.metricas.tokens_entrada ?? "N/A"}</strong> | Salida:{" "}
                <strong>{resultado.metricas.tokens_salida ?? "N/A"}</strong> | Total:{" "}
                <strong>{resultado.metricas.tokens_totales ?? "N/A"}</strong>
              </span>
              <span>
                Fragmentos Semánticos: <strong>{resultado.metricas.chunks_recuperados}</strong> | Tamaño Contexto:{" "}
                <strong>{resultado.metricas.tamano_contexto_caracteres} caracteres</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
