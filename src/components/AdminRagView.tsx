import React, { useState, useEffect, useId } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listarDocumentosRagAdmin,
  cargarDocumentoRagPdf,
  activarDocumentoRag,
  desactivarDocumentoRag,
  descargarDocumentoRagOriginal,
  eliminarDocumentoRag,
  asociarArchivoOriginalRag,
  type RagDocumentoDto,
  getFriendlyErrorMessage,
} from "../services/api";
import {
  BookOpen,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Download,
  Power,
  PowerOff,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Info,
  Calendar,
  Layers,
  Database,
  Hash,
  UserCheck,
  FileCheck,
  Trash2,
  Paperclip,
} from "lucide-react";

export const AdminRagView: React.FC = () => {
  const { tienePermiso } = useAuth();
  const fileInputId = useId();

  // Estados de datos
  const [documentos, setDocumentos] = useState<RagDocumentoDto[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState<string>("");
  const [filtroSoloActivos, setFiltroSoloActivos] = useState<boolean>(false);

  // Modal de carga / nueva versión
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [subiendo, setSubiendo] = useState<boolean>(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [codigoDoc, setCodigoDoc] = useState<string>("");
  const [tituloDoc, setTituloDoc] = useState<string>("");
  const [versionDoc, setVersionDoc] = useState<string>("");
  const [descripcionDoc, setDescripcionDoc] = useState<string>("");
  const [fechaVigenciaDoc, setFechaVigenciaDoc] = useState<string>("");
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);

  // Modal de detalles de indexación
  const [docDetalle, setDocDetalle] = useState<RagDocumentoDto | null>(null);

  // Estado para confirmación de activación
  const [docParaActivar, setDocParaActivar] = useState<RagDocumentoDto | null>(null);
  const [activando, setActivando] = useState<boolean>(false);

  // Estado para confirmación de desactivación (sin window.confirm)
  const [docParaDesactivar, setDocParaDesactivar] = useState<RagDocumentoDto | null>(null);
  const [desactivando, setDesactivando] = useState<boolean>(false);

  // Estado para eliminación controlada
  const [docParaEliminar, setDocParaEliminar] = useState<RagDocumentoDto | null>(null);
  const [motivoEliminacion, setMotivoEliminacion] = useState<string>("");
  const [eliminando, setEliminando] = useState<boolean>(false);
  const [errorEliminacion, setErrorEliminacion] = useState<string | null>(null);

  // Estado para asociar archivo original legado
  const [docParaAsociar, setDocParaAsociar] = useState<RagDocumentoDto | null>(null);
  const [archivoAsociar, setArchivoAsociar] = useState<File | null>(null);
  const [asociando, setAsociando] = useState<boolean>(false);
  const [errorAsociacion, setErrorAsociacion] = useState<string | null>(null);

  // Descarga en curso
  const [descargandoId, setDescargandoId] = useState<string | null>(null);

  const puedeAdministrar = tienePermiso("RAG_DOCUMENTOS_ADMINISTRAR");

  useEffect(() => {
    if (puedeAdministrar) {
      cargarDocumentos();
    }
  }, [puedeAdministrar]);

  const cargarDocumentos = async () => {
    setCargando(true);
    setErrorGlobal(null);
    try {
      const data = await listarDocumentosRagAdmin();
      setDocumentos(data);
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorGlobal(friendly.descripcion);
    } finally {
      setCargando(false);
    }
  };

  const abrirModalNuevo = () => {
    setArchivoSeleccionado(null);
    setCodigoDoc("");
    setTituloDoc("");
    setVersionDoc("1.0");
    setDescripcionDoc("");
    setFechaVigenciaDoc("");
    setErrorFormulario(null);
    setModalAbierto(true);
  };

  const abrirModalNuevaVersion = (doc: RagDocumentoDto) => {
    setArchivoSeleccionado(null);
    setCodigoDoc(doc.codigo);
    setTituloDoc(doc.titulo);
    // Sugerir versión subsecuente
    const numVer = parseFloat(doc.version);
    const sugerida = !isNaN(numVer) ? (numVer + 1.0).toFixed(1) : `${doc.version}.1`;
    setVersionDoc(sugerida);
    setDescripcionDoc(doc.descripcion || "");
    const fechaNorm = doc.fecha_vigencia ? String(doc.fecha_vigencia).trim().slice(0, 10) : "";
    setFechaVigenciaDoc(fechaNorm);
    setErrorFormulario(null);
    setModalAbierto(true);
  };

  const validarArchivo = (file: File): string | null => {
    if (!file) return "Debe seleccionar un archivo PDF.";
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return "El archivo seleccionado debe tener extensión .pdf";
    }
    if (file.type && file.type !== "application/pdf") {
      return "El tipo MIME del archivo no corresponde a application/pdf.";
    }
    if (file.size === 0) {
      return "El archivo seleccionado está vacío (0 bytes).";
    }
    const maxBytes = 15 * 1024 * 1024; // 15MB
    if (file.size > maxBytes) {
      return "El archivo supera el tamaño máximo permitido de 15 MB.";
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorFormulario(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const err = validarArchivo(file);
      if (err) {
        setErrorFormulario(err);
        setArchivoSeleccionado(null);
        e.target.value = "";
        return;
      }
      setArchivoSeleccionado(file);
    }
  };

  const handleCargarPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorFormulario(null);

    if (!archivoSeleccionado) {
      setErrorFormulario("Debe seleccionar un archivo PDF válido.");
      return;
    }

    const errArchivo = validarArchivo(archivoSeleccionado);
    if (errArchivo) {
      setErrorFormulario(errArchivo);
      return;
    }

    if (!codigoDoc.trim()) {
      setErrorFormulario("El código documental es obligatorio (ej. DTH-REG-001).");
      return;
    }

    if (!tituloDoc.trim()) {
      setErrorFormulario("El título del documento es obligatorio.");
      return;
    }

    if (!versionDoc.trim()) {
      setErrorFormulario("La versión del documento es obligatoria (ej. 1.0, 2.0).");
      return;
    }

    setSubiendo(true);
    try {
      const formData = new FormData();
      formData.append("archivo", archivoSeleccionado);
      formData.append("codigo", codigoDoc.trim().toUpperCase());
      formData.append("titulo", tituloDoc.trim());
      formData.append("version", versionDoc.trim());
      if (descripcionDoc.trim()) {
        formData.append("descripcion", descripcionDoc.trim());
      }
      if (fechaVigenciaDoc.trim()) {
        formData.append("fecha_vigencia", fechaVigenciaDoc.trim());
      }

      const res = await cargarDocumentoRagPdf(formData);
      setMensajeExito(
        `Documento '${res.datos.codigo}' v${res.datos.version} procesado e indexado exitosamente (${res.datos.total_fragmentos} fragmentos). Permanece inactivo hasta su aprobación.`
      );
      setModalAbierto(false);
      await cargarDocumentos();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorFormulario(friendly.descripcion);
    } finally {
      setSubiendo(false);
    }
  };

  const confirmarActivar = (doc: RagDocumentoDto) => {
    setDocParaActivar(doc);
  };

  const ejecutarActivacion = async () => {
    if (!docParaActivar) return;
    setActivando(true);
    setErrorGlobal(null);
    try {
      const res = await activarDocumentoRag(docParaActivar.id);
      setMensajeExito(
        `Documento '${res.datos.codigo}' v${res.datos.version} activado. Ahora está activo en las consultas del Asistente RAG.`
      );
      setDocParaActivar(null);
      await cargarDocumentos();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorGlobal(friendly.descripcion);
    } finally {
      setActivando(false);
    }
  };

  const confirmarDesactivar = (doc: RagDocumentoDto) => {
    setDocParaDesactivar(doc);
  };

  const ejecutarDesactivacion = async (docTarget?: RagDocumentoDto) => {
    const target = docTarget || docParaDesactivar;
    if (!target) return;
    setDesactivando(true);
    setErrorGlobal(null);
    try {
      const res = await desactivarDocumentoRag(target.id);
      setMensajeExito(
        `Documento '${res.datos.codigo}' v${res.datos.version} desactivado exitosamente. Excluido de consultas RAG.`
      );
      setDocParaDesactivar(null);
      await cargarDocumentos();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorGlobal(friendly.descripcion);
    } finally {
      setDesactivando(false);
    }
  };

  const confirmarEliminar = (doc: RagDocumentoDto) => {
    if (doc.activo) {
      setErrorGlobal(`No es posible eliminar el documento '${doc.codigo}' v${doc.version} porque se encuentra actualmente ACTIVO en consultas RAG. Debe desactivarlo primero.`);
      return;
    }
    setDocParaEliminar(doc);
    setMotivoEliminacion("");
    setErrorEliminacion(null);
  };

  const ejecutarEliminacion = async () => {
    if (!docParaEliminar) return;
    if (!motivoEliminacion.trim()) {
      setErrorEliminacion("Debe indicar un motivo o justificación para eliminar esta versión.");
      return;
    }
    setEliminando(true);
    setErrorEliminacion(null);
    try {
      const res = await eliminarDocumentoRag(docParaEliminar.id, motivoEliminacion.trim());
      setMensajeExito(res.mensaje || `Versión '${docParaEliminar.codigo}' v${docParaEliminar.version} eliminada exitosamente.`);
      setDocParaEliminar(null);
      await cargarDocumentos();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorEliminacion(friendly.descripcion);
    } finally {
      setEliminando(false);
    }
  };

  const abrirModalAsociar = (doc: RagDocumentoDto) => {
    setDocParaAsociar(doc);
    setArchivoAsociar(null);
    setErrorAsociacion(null);
  };

  const ejecutarAsociacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docParaAsociar) return;
    if (!archivoAsociar) {
      setErrorAsociacion("Debe seleccionar un archivo PDF.");
      return;
    }
    const errArchivo = validarArchivo(archivoAsociar);
    if (errArchivo) {
      setErrorAsociacion(errArchivo);
      return;
    }

    setAsociando(true);
    setErrorAsociacion(null);
    try {
      const formData = new FormData();
      formData.append("archivo", archivoAsociar);
      const res = await asociarArchivoOriginalRag(docParaAsociar.id, formData);
      setMensajeExito(res.mensaje || `Archivo original asociado exitosamente a '${docParaAsociar.codigo}' v${docParaAsociar.version}.`);
      setDocParaAsociar(null);
      await cargarDocumentos();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorAsociacion(friendly.descripcion);
    } finally {
      setAsociando(false);
    }
  };

  const handleDescargar = async (doc: RagDocumentoDto) => {
    if (doc.archivo_disponible === false) {
      setErrorGlobal("El archivo original no se encuentra disponible en almacenamiento persistente.");
      return;
    }
    setDescargandoId(doc.id);
    setErrorGlobal(null);
    try {
      const nombre = doc.nombre_archivo_original || `${doc.codigo}_v${doc.version}.pdf`;
      await descargarDocumentoRagOriginal(doc.id, nombre);
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorGlobal(friendly.descripcion);
    } finally {
      setDescargandoId(null);
    }
  };

  if (!puedeAdministrar) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-red-800">Acceso No Autorizado</h2>
          <p className="text-sm text-red-600 mt-1">
            Se requiere el permiso <code className="font-mono font-semibold">RAG_DOCUMENTOS_ADMINISTRAR</code> para acceder al panel de administración documental.
          </p>
        </div>
      </div>
    );
  }

  // Filtrado de documentos
  const documentosFiltrados = documentos.filter((d) => {
    if (filtroSoloActivos && !d.activo) return false;
    if (filtroTexto.trim()) {
      const q = filtroTexto.toLowerCase();
      const matchCod = d.codigo.toLowerCase().includes(q);
      const matchTit = d.titulo.toLowerCase().includes(q);
      const matchVer = d.version.toLowerCase().includes(q);
      const matchDesc = (d.descripcion || "").toLowerCase().includes(q);
      return matchCod || matchTit || matchVer || matchDesc;
    }
    return true;
  });

  // Agrupación por código para resumen
  const totalVersiones = documentos.length;
  const totalActivos = documentos.filter((d) => d.activo).length;
  const totalListos = documentos.filter((d) => d.estado_procesamiento === "LISTO").length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Encabezado Corporativo */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-[#009944]">
                Administración &bull; Base de Conocimiento RAG
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-slate-100 text-slate-600 border border-slate-200">
                RAG_DOCUMENTOS_ADMINISTRAR
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-[#009944]" />
              Gestión Documental y Carga de PDF
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Cargue, audite y active versiones del Reglamento Interno y demás políticas normativas. Solo los documentos activos y con indexación completa alimentan las respuestas del asistente semántico.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={cargarDocumentos}
              disabled={cargando}
              className="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Refrescar lista"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${cargando ? "animate-spin" : ""}`} />
              Actualizar
            </button>
            <button
              type="button"
              id="btn-nuevo-documento"
              onClick={abrirModalNuevo}
              className="inline-flex items-center px-4 py-2 bg-[#009944] text-white rounded-lg text-sm font-semibold hover:bg-[#008037] transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Cargar Documento PDF
            </button>
          </div>
        </div>

        {/* Tarjetas métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-[#009944] flex items-center justify-center font-bold">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Documentos Activos en RAG</div>
              <div className="text-xl font-black text-slate-800">{totalActivos}</div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Versiones Históricas Registradas</div>
              <div className="text-xl font-black text-slate-800">{totalVersiones}</div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Listos para Activación</div>
              <div className="text-xl font-black text-slate-800">{totalListos}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {errorGlobal && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-bold text-red-800">Error</div>
            <div className="text-sm text-red-700 mt-0.5">{errorGlobal}</div>
          </div>
          <button
            type="button"
            onClick={() => setErrorGlobal(null)}
            className="text-red-400 hover:text-red-600 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {mensajeExito && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-bold text-emerald-800">Operación exitosa</div>
            <div className="text-sm text-emerald-700 mt-0.5">{mensajeExito}</div>
          </div>
          <button
            type="button"
            onClick={() => setMensajeExito(null)}
            className="text-emerald-500 hover:text-emerald-700 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filtros y Búsqueda */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            placeholder="Buscar por código, título, versión..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009944] focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filtroSoloActivos}
              onChange={(e) => setFiltroSoloActivos(e.target.checked)}
              className="rounded border-slate-300 text-[#009944] focus:ring-[#009944]"
            />
            <span>Mostrar solo versiones activas</span>
          </label>
        </div>
      </div>

      {/* Tabla de Documentos */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 text-[#009944] animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">Cargando catálogo documental RAG...</p>
          </div>
        ) : documentosFiltrados.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-base font-bold text-slate-700">No se encontraron documentos</p>
            <p className="text-sm text-slate-500 mt-1">
              {filtroTexto || filtroSoloActivos
                ? "No hay documentos que coincidan con los criterios de búsqueda aplicados."
                : "No hay documentos cargados en el sistema."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">Documento</th>
                  <th scope="col" className="px-4 py-3 text-left">Versión</th>
                  <th scope="col" className="px-4 py-3 text-left">Estado Proceso</th>
                  <th scope="col" className="px-4 py-3 text-left">Participación RAG</th>
                  <th scope="col" className="px-4 py-3 text-left">Fragmentos</th>
                  <th scope="col" className="px-4 py-3 text-left">Auditoría Carga</th>
                  <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {documentosFiltrados.map((doc) => {
                  const esActivo = doc.activo;
                  const listo = doc.estado_procesamiento === "LISTO";
                  const enError = doc.estado_procesamiento === "ERROR";

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Documento (Código + Título) */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-2.5">
                          <FileText className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              <span>{doc.codigo}</span>
                              {doc.fecha_vigencia && (
                                <span className="text-xs font-normal text-slate-500 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Vigente: {String(doc.fecha_vigencia).slice(0, 10)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 font-medium line-clamp-1">{doc.titulo}</div>
                            {doc.descripcion && (
                              <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{doc.descripcion}</div>
                            )}
                            {doc.archivo_disponible === false && (
                              <div className="mt-1">
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  Archivo original no disponible
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Versión */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold font-mono bg-slate-100 text-slate-800 border border-slate-200">
                          v{doc.version}
                        </span>
                      </td>

                      {/* Estado Proceso */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {doc.estado_procesamiento === "LISTO" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            LISTO
                          </span>
                        )}
                        {doc.estado_procesamiento === "PROCESANDO" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                            PROCESANDO
                          </span>
                        )}
                        {doc.estado_procesamiento === "RECIBIDO" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            RECIBIDO
                          </span>
                        )}
                        {doc.estado_procesamiento === "ERROR" && (
                          <button
                            type="button"
                            onClick={() => setDocDetalle(doc)}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200"
                            title={doc.error_mensaje || "Ver detalle de error"}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            ERROR
                          </button>
                        )}
                      </td>

                      {/* Estado Activación RAG */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {esActivo ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#009944]/15 text-[#009944] border border-[#009944]/30">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            ACTIVO (Consultas RAG)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                            Inactivo (Excluido)
                          </span>
                        )}
                      </td>

                      {/* Fragmentos / Páginas */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
                        <div className="font-semibold text-slate-800">
                          {doc.total_fragmentos} {doc.total_fragmentos === 1 ? "chunk" : "chunks"}
                        </div>
                        <div className="text-slate-400">
                          {doc.total_paginas > 0 ? `${doc.total_paginas} páginas` : "Sin páginas"}
                        </div>
                      </td>

                      {/* Auditoría Carga */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
                        <div className="flex items-center gap-1 font-medium text-slate-700">
                          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span>{doc.creado_por_nombre || "Sistema / Ingesta"}</span>
                        </div>
                        <div className="text-slate-400">
                          {new Date(doc.creado_en).toLocaleString("es-CR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </div>
                        {doc.activado_por_nombre && (
                          <div className="text-[11px] text-[#009944] mt-0.5">
                            Activó: {doc.activado_por_nombre}
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-right text-xs">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Botón Activar / Desactivar */}
                          {esActivo ? (
                            <button
                              type="button"
                              onClick={() => confirmarDesactivar(doc)}
                              className="px-2.5 py-1 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded border border-slate-200 transition-colors inline-flex items-center gap-1"
                              title="Desactivar versión (excluir de consultas RAG)"
                            >
                              <PowerOff className="w-3.5 h-3.5" />
                              <span>Desactivar</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => confirmarActivar(doc)}
                              disabled={!listo}
                              className={`px-2.5 py-1 rounded border transition-colors inline-flex items-center gap-1 ${
                                listo
                                  ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 font-semibold"
                                  : "text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed"
                              }`}
                              title={
                                listo
                                  ? "Activar versión para participar en consultas RAG"
                                  : "No se puede activar hasta que esté en estado LISTO"
                              }
                            >
                              <Power className="w-3.5 h-3.5" />
                              <span>Activar</span>
                            </button>
                          )}

                          {/* Botón Nueva Versión */}
                          <button
                            type="button"
                            onClick={() => abrirModalNuevaVersion(doc)}
                            className="px-2 py-1 text-slate-600 hover:text-[#009944] hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                            title="Subir nueva versión para este código documental"
                          >
                            + Versión
                          </button>

                          {/* Botón Asociar PDF original (cuando no hay archivo físico) */}
                          {doc.archivo_disponible === false && (
                            <button
                              type="button"
                              onClick={() => abrirModalAsociar(doc)}
                              className="px-2 py-1 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 transition-colors inline-flex items-center gap-1 font-medium"
                              title="Asociar archivo PDF original a este documento legado sin alterar sus fragmentos"
                            >
                              <Paperclip className="w-3.5 h-3.5 text-amber-600" />
                              <span>Asociar PDF</span>
                            </button>
                          )}

                          {/* Botón Descargar PDF original (cuando archivo físico existe) */}
                          {doc.archivo_disponible && (
                            <button
                              type="button"
                              onClick={() => handleDescargar(doc)}
                              disabled={descargandoId === doc.id}
                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-200 transition-colors disabled:opacity-50"
                              title="Descargar archivo PDF original de forma segura"
                            >
                              <Download className={`w-3.5 h-3.5 ${descargandoId === doc.id ? "animate-bounce" : ""}`} />
                            </button>
                          )}

                          {/* Botón Ver Detalles / Indexación */}
                          <button
                            type="button"
                            onClick={() => setDocDetalle(doc)}
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                            title="Ver detalles técnicos e información de indexación"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          {/* Botón Eliminar versión */}
                          <button
                            type="button"
                            onClick={() => confirmarEliminar(doc)}
                            className={`p-1 rounded border transition-colors ${
                              doc.activo
                                ? "text-slate-300 border-slate-100 hover:text-slate-400 cursor-not-allowed"
                                : "text-slate-400 hover:text-red-600 hover:bg-red-50 border-slate-200"
                            }`}
                            title={
                              doc.activo
                                ? "Debe desactivar el documento antes de poder eliminarlo"
                                : "Eliminar versión de forma controlada"
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE CARGA DE DOCUMENTO / NUEVA VERSIÓN */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#009944]" />
                <h3 className="text-lg font-bold text-slate-800">
                  {codigoDoc ? `Cargar Versión de '${codigoDoc}'` : "Cargar Nuevo Documento RAG"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !subiendo && setModalAbierto(false)}
                disabled={subiendo}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCargarPdf} className="space-y-4 mt-4">
              {errorFormulario && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorFormulario}</span>
                </div>
              )}

              {/* Selector de Archivo PDF */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Archivo PDF <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-[#009944] transition-colors">
                  <input
                    type="file"
                    id={fileInputId}
                    accept="application/pdf,.pdf"
                    onChange={handleFileChange}
                    disabled={subiendo}
                    className="hidden"
                  />
                  <label htmlFor={fileInputId} className="cursor-pointer block">
                    <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    {archivoSeleccionado ? (
                      <div>
                        <p className="text-sm font-bold text-[#009944]">{archivoSeleccionado.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {(archivoSeleccionado.size / 1024 / 1024).toFixed(2)} MB &bull; Listo para indexar
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold text-slate-700">
                          Haga clic para seleccionar o arrastre un PDF
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Solo archivos .pdf con texto digital extraíble (máx. 15 MB)
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Código Documental */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Código Documental <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={codigoDoc}
                  onChange={(e) => setCodigoDoc(e.target.value.toUpperCase())}
                  placeholder="Ej. DTH-REG-001"
                  required
                  disabled={subiendo}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009944] uppercase font-mono"
                />
                <span className="text-[11px] text-slate-400">Identificador unívoco del tipo de política corporativa.</span>
              </div>

              {/* Título del Documento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nombre / Título del Documento <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tituloDoc}
                  onChange={(e) => setTituloDoc(e.target.value)}
                  placeholder="Ej. Reglamento Interno de Trabajo RIMAC S.A."
                  required
                  disabled={subiendo}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009944]"
                />
              </div>

              {/* Versión y Vigencia */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Versión <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={versionDoc}
                    onChange={(e) => setVersionDoc(e.target.value)}
                    placeholder="Ej. 1.0, 2.0"
                    required
                    disabled={subiendo}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009944] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Fecha de Vigencia
                  </label>
                  <input
                    type="date"
                    value={fechaVigenciaDoc}
                    onChange={(e) => setFechaVigenciaDoc(e.target.value)}
                    disabled={subiendo}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009944]"
                  />
                </div>
              </div>

              {/* Descripción Opcional */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Descripción / Alcance (Opcional)
                </label>
                <textarea
                  value={descripcionDoc}
                  onChange={(e) => setDescripcionDoc(e.target.value)}
                  placeholder="Notas de revisión, reformas incorporadas o resumen..."
                  rows={2}
                  disabled={subiendo}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009944]"
                />
              </div>

              {/* Aviso de Gobernanza */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-start gap-2">
                <Info className="w-4 h-4 text-[#009944] shrink-0 mt-0.5" />
                <span>
                  <strong>Regla de Gobernanza:</strong> Al procesar el archivo, se extraerá el texto y se generarán los embeddings semánticos. El documento quedará en estado <strong>LISTO</strong> pero permanecerá <strong>INACTIVO</strong> hasta su activación formal por parte del administrador.
                </span>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  disabled={subiendo}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={subiendo}
                  className="px-4 py-2 bg-[#009944] text-white rounded-lg text-sm font-semibold hover:bg-[#008037] transition-colors disabled:opacity-50 inline-flex items-center gap-2 shadow-xs"
                >
                  {subiendo ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Extrayendo y Vectorizando...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Procesar e Indexar PDF</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ACTIVACIÓN */}
      {docParaActivar && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 text-emerald-700 mb-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Power className="w-5 h-5 text-[#009944]" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Activar Versión en RAG</h3>
            </div>

            <p className="text-sm text-slate-600">
              ¿Está seguro de activar el documento <strong className="text-slate-900">{docParaActivar.codigo}</strong> en su versión <strong className="font-mono text-slate-900">v{docParaActivar.version}</strong>?
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 my-4 text-xs text-amber-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Operación Transaccional de Reemplazo
              </div>
              <p>
                Si existe otra versión actualmente activa para el código documental <strong>{docParaActivar.codigo}</strong>, será desactivada automáticamente para asegurar que el asistente no emita respuestas contradictorias.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDocParaActivar(null)}
                disabled={activando}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => ejecutarActivacion()}
                disabled={activando}
                className="px-4 py-2 bg-[#009944] text-white rounded-lg text-sm font-semibold hover:bg-[#008037] transition-colors disabled:opacity-50 inline-flex items-center gap-2 shadow-xs"
              >
                {activando ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Activando...</span>
                  </>
                ) : (
                  <>
                    <Power className="w-4 h-4" />
                    <span>Confirmar Activación</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE DESACTIVACIÓN */}
      {docParaDesactivar && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 text-amber-700 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <PowerOff className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Desactivar Versión</h3>
            </div>

            <p className="text-sm text-slate-600">
              ¿Está seguro de desactivar la versión <strong className="font-mono text-slate-900">{docParaDesactivar.codigo} v{docParaDesactivar.version}</strong>?
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 my-4 text-xs text-amber-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Exclusión Inmediata de Consultas RAG
              </div>
              <p>
                Sus fragmentos indexados dejarán de ser consultados por el Asistente RAG. El historial documental, los metadatos y los fragmentos se conservan íntegramente en la base de datos.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDocParaDesactivar(null)}
                disabled={desactivando}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => ejecutarDesactivacion()}
                disabled={desactivando}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2 shadow-xs"
              >
                {desactivando ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Desactivando...</span>
                  </>
                ) : (
                  <>
                    <PowerOff className="w-4 h-4" />
                    <span>Confirmar Desactivación</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ELIMINACIÓN CONTROLADA */}
      {docParaEliminar && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 text-red-700 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Eliminación Controlada</h3>
            </div>

            <p className="text-sm text-slate-600">
              ¿Está seguro de eliminar permanentemente la versión <strong className="font-mono text-slate-900">{docParaEliminar.codigo} v{docParaEliminar.version}</strong>?
            </p>

            {errorEliminacion && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-3 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorEliminacion}</span>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 my-3 text-xs text-slate-700 space-y-1">
              <p>
                <strong>Efectos de la eliminación:</strong>
              </p>
              <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                <li>Se retirarán los {docParaEliminar.total_fragmentos} fragmentos asociados de la base de datos.</li>
                <li>Si el archivo físico original no está compartido con otra versión, será eliminado.</li>
                <li>Se registrará un evento inmutable en la bitácora de auditoría.</li>
              </ul>
            </div>

            <div className="my-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Motivo / Justificación de la Eliminación <span className="text-red-500">*</span>
              </label>
              <textarea
                value={motivoEliminacion}
                onChange={(e) => setMotivoEliminacion(e.target.value)}
                placeholder="Indique el motivo técnico o justificación administrativa..."
                rows={3}
                required
                disabled={eliminando}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDocParaEliminar(null)}
                disabled={eliminando}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarEliminacion}
                disabled={eliminando || !motivoEliminacion.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2 shadow-xs"
              >
                {eliminando ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar Versión</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ASOCIACIÓN DE ARCHIVO ORIGINAL LEGADO */}
      {docParaAsociar && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-bold text-slate-800">
                  Asociar Archivo Original
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !asociando && setDocParaAsociar(null)}
                disabled={asociando}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={ejecutarAsociacion} className="space-y-4 mt-4">
              <div className="text-xs text-slate-600">
                Documento destino: <strong className="text-slate-800">{docParaAsociar.codigo} v{docParaAsociar.version}</strong> &bull; {docParaAsociar.titulo}
              </div>

              {errorAsociacion && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorAsociacion}</span>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-600" />
                  Gobernanza Documental
                </div>
                <p>
                  Esta operación asocia el binario PDF en el almacenamiento persistente privado para permitir su descarga formal, <strong>sin alterar los fragmentos vectorizados</strong> ni el estado de activación actual.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Seleccionar Archivo PDF Original <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    setErrorAsociacion(null);
                    if (e.target.files && e.target.files.length > 0) {
                      setArchivoAsociar(e.target.files[0]);
                    }
                  }}
                  disabled={asociando}
                  required
                  className="w-full text-xs text-slate-600 border border-slate-300 rounded-lg file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDocParaAsociar(null)}
                  disabled={asociando}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={asociando || !archivoAsociar}
                  onClick={ejecutarAsociacion}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2 shadow-xs"
                >
                  {asociando ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Asociando...</span>
                    </>
                  ) : (
                    <>
                      <Paperclip className="w-4 h-4" />
                      <span>Asociar PDF</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE DETALLES TÉCNICOS E INFORMACIÓN DE INDEXACIÓN */}
      {docDetalle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-bold text-slate-800">
                  Metadatos e Indexación: {docDetalle.codigo} v{docDetalle.version}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDocDetalle(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 mt-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Título:</span>
                  <span className="font-semibold text-slate-800 text-right">{docDetalle.titulo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Estado de Procesamiento:</span>
                  <span className="font-bold text-slate-800 font-mono">{docDetalle.estado_procesamiento}</span>
                </div>
                {docDetalle.error_mensaje && (
                  <div className="p-2 bg-red-50 text-red-700 rounded border border-red-200 font-mono mt-1">
                    {docDetalle.error_mensaje}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Participación RAG:</span>
                  <span className={docDetalle.activo ? "text-emerald-700 font-bold" : "text-slate-500 font-semibold"}>
                    {docDetalle.activo ? "ACTIVO" : "INACTIVO"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Fragmentos Indexados:</span>
                  <span className="font-semibold text-slate-800">{docDetalle.total_fragmentos}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Total de Páginas:</span>
                  <span className="font-semibold text-slate-800">{docDetalle.total_paginas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Fecha de Vigencia:</span>
                  <span className="font-semibold text-slate-800">{docDetalle.fecha_vigencia || "No especificada"}</span>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div className="text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[#009944]" />
                  Almacenamiento Persistente y Hash
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Archivo Original:</span>
                  <span className="font-mono text-slate-700 break-all">{docDetalle.nombre_archivo_original || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Ruta de Almacenamiento:</span>
                  <span className="font-mono text-slate-700 break-all">{docDetalle.ruta_almacenamiento || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Hash SHA-256 (Inmutable):</span>
                  <span className="font-mono text-slate-600 break-all bg-white p-1 rounded border border-slate-200 block text-[10px]">
                    {docDetalle.hash_archivo || "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tamaño en Disco:</span>
                  <span className="font-mono text-slate-700">
                    {docDetalle.tamano_bytes ? `${(docDetalle.tamano_bytes / 1024).toFixed(1)} KB` : "N/A"}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div className="text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-[#009944]" />
                  Trazabilidad y Auditoría
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cargado por:</span>
                  <span className="font-medium text-slate-800">{docDetalle.creado_por_nombre || docDetalle.creado_por_id || "Sistema"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fecha de Carga:</span>
                  <span className="font-medium text-slate-800">{new Date(docDetalle.creado_en).toLocaleString()}</span>
                </div>
                {docDetalle.activado_en && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Activado por:</span>
                      <span className="font-medium text-emerald-800">{docDetalle.activado_por_nombre || docDetalle.activado_por_id || "Sistema"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Fecha de Activación:</span>
                      <span className="font-medium text-emerald-800">{new Date(docDetalle.activado_en).toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => setDocDetalle(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
