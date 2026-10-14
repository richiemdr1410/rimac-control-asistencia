import React, { useState, useEffect } from "react";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  User,
  Filter,
  RefreshCw,
  Search,
  FileEdit,
  ShieldCheck,
  Eye,
  ArrowRight,
  Info,
  Check,
} from "lucide-react";

interface Incidencia {
  id: string;
  jornada_id: string;
  empleado_id: string;
  empleado_nombre?: string;
  empleado_identificador?: string;
  departamento_nombre?: string;
  fecha_jornada?: string;
  hora_entrada_programada?: string;
  hora_salida_programada?: string;
  tipo_incidencia: string;
  descripcion: string;
  minutos_afectados: number;
  estado: "ABIERTA" | "JUSTIFICADA" | "REGULARIZADA" | "DESCARTADA";
  resolucion_motivo?: string | null;
  usuario_resolvio_nombre?: string | null;
  fecha_resolucion?: string | null;
  creado_en: string;
}

interface CorreccionMarca {
  id: string;
  marca_original_id: string;
  marca_original_tipo: string;
  marca_original_timestamp: string;
  empleado_id: string;
  empleado_nombre: string;
  empleado_identificador: string;
  jornada_id: string;
  fecha_jornada: string;
  tipo_ajuste: "ANULACION_LOGICA" | "SUSTITUCION_TIMESTAMP" | "SUSTITUCION_TIPO";
  timestamp_propuesto?: string | null;
  tipo_marca_propuesto?: string | null;
  motivo: string;
  usuario_solicito_nombre: string;
  usuario_autorizo_nombre?: string | null;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  fecha_resolucion?: string | null;
  creado_en: string;
}

interface MarcaFisicaItem {
  id: string;
  tipo_marca: string;
  timestamp_servidor: string;
  canal_marca: string;
  tiene_correccion_pendiente?: boolean;
  correccion_pendiente_id?: string | null;
}

interface EmpleadoResumen {
  id: string;
  nombre_completo: string;
  cedula: string;
}

interface IncidenciasCorreccionesViewProps {
  pestañaInicial?: "incidencias" | "correcciones";
  filtroEstadoInicial?: string;
  filtroFechaInicial?: string;
}

export const IncidenciasCorreccionesView: React.FC<IncidenciasCorreccionesViewProps> = ({
  pestañaInicial = "incidencias",
  filtroEstadoInicial = "",
  filtroFechaInicial = "",
}) => {
  const { usuario, tienePermiso } = useAuth();
  const esEmpleado = usuario?.rol === "EMPLEADO";

  const [pestañaActiva, setPestañaActiva] = useState<"incidencias" | "correcciones">(pestañaInicial);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [correcciones, setCorrecciones] = useState<CorreccionMarca[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exitoMsg, setExitoMsg] = useState<string | null>(null);

  // Filtros
  const [filtroTipoIncidencia, setFiltroTipoIncidencia] = useState<string>("");
  const [filtroEstadoIncidencia, setFiltroEstadoIncidencia] = useState<string>(
    pestañaInicial === "incidencias" ? filtroEstadoInicial : ""
  );
  const [filtroFecha, setFiltroFecha] = useState<string>(filtroFechaInicial);
  const [filtroEstadoCorreccion, setFiltroEstadoCorreccion] = useState<string>(
    pestañaInicial === "correcciones" ? filtroEstadoInicial : ""
  );

  // Modales y sus errores contextuales locales
  const [modalRegularizar, setModalRegularizar] = useState<Incidencia | null>(null);
  const [motivoRegularizar, setMotivoRegularizar] = useState<string>("");
  const [errorModalRegularizar, setErrorModalRegularizar] = useState<{ titulo: string; descripcion: string } | null>(null);

  const [modalResolver, setModalResolver] = useState<Incidencia | null>(null);
  const [accionResolver, setAccionResolver] = useState<"JUSTIFICADA" | "DESCARTADA">("JUSTIFICADA");
  const [motivoResolver, setMotivoResolver] = useState<string>("");
  const [errorModalResolver, setErrorModalResolver] = useState<{ titulo: string; descripcion: string } | null>(null);

  const [modalDetalleJornada, setModalDetalleJornada] = useState<{
    jornada: any;
    marcas_fisicas: any[];
    marcas_activas_calculo: any[];
    es_salida_regularizada: boolean;
    hora_salida_calculo?: string;
  } | null>(null);

  // Modal: Solicitar Corrección Guiada
  const [modalNuevaCorreccion, setModalNuevaCorreccion] = useState<boolean>(false);
  const [empleadosLista, setEmpleadosLista] = useState<EmpleadoResumen[]>([]);
  const [colaboradorCorreccionId, setColaboradorCorreccionId] = useState<string>("");
  const [fechaCorreccion, setFechaCorreccion] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [marcasDisponibles, setMarcasDisponibles] = useState<MarcaFisicaItem[]>([]);
  const [cargandoMarcas, setCargandoMarcas] = useState<boolean>(false);
  const [mensajeInformativoMarcas, setMensajeInformativoMarcas] = useState<string | null>(null);
  const [marcaSeleccionadaId, setMarcaSeleccionadaId] = useState<string>("");
  const [marcaSeleccionadaInfo, setMarcaSeleccionadaInfo] = useState<MarcaFisicaItem | null>(null);

  const [tipoAjusteNuevo, setTipoAjusteNuevo] = useState<"SUSTITUCION_TIMESTAMP" | "ANULACION_LOGICA" | "SUSTITUCION_TIPO">("SUSTITUCION_TIMESTAMP");
  const [timestampPropuesto, setTimestampPropuesto] = useState<string>("");
  const [tipoMarcaPropuesto, setTipoMarcaPropuesto] = useState<string>("ENTRADA");
  const [motivoCorreccion, setMotivoCorreccion] = useState<string>("");
  const [errorModalCorreccion, setErrorModalCorreccion] = useState<{ titulo: string; descripcion: string } | null>(null);

  const puedeGestionarIncidencias = tienePermiso("INCIDENCIAS_GESTIONAR");
  const puedeRegularizar = tienePermiso("JORNADAS_REGULARIZAR");
  const puedeSolicitarCorreccion = tienePermiso("CORRECCIONES_MARCAS_SOLICITAR");
  const puedeAprobarCorreccion = tienePermiso("CORRECCIONES_MARCAS_APROBAR");

  const cargarDatos = async () => {
    try {
      setCargando(true);
      setErrorMsg(null);

      // Cargar incidencias
      let queryInc = "/api/incidencias?";
      if (filtroTipoIncidencia) queryInc += `&tipo_incidencia=${filtroTipoIncidencia}`;
      if (filtroEstadoIncidencia) queryInc += `&estado=${filtroEstadoIncidencia}`;
      if (filtroFecha) queryInc += `&fecha=${filtroFecha}`;

      const resInc: any = await apiRequest(queryInc);
      if (resInc.exito) {
        setIncidencias(resInc.datos || []);
      }

      // Cargar correcciones
      let queryCorr = "/api/incidencias/correcciones/todas?";
      if (filtroEstadoCorreccion) queryCorr += `&estado=${filtroEstadoCorreccion}`;
      if (filtroFecha) queryCorr += `&fecha=${filtroFecha}`;

      const resCorr: any = await apiRequest(queryCorr);
      if (resCorr.exito) {
        setCorrecciones(resCorr.datos || []);
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(friendly.descripcion);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [filtroTipoIncidencia, filtroEstadoIncidencia, filtroEstadoCorreccion, filtroFecha]);

  const ejecutarEscaneo = async () => {
    try {
      setCargando(true);
      setErrorMsg(null);
      const res: any = await apiRequest("/api/incidencias/detectar", {
        method: "POST",
        body: {},
      });
      if (res.exito) {
        setExitoMsg(res.mensaje);
        await cargarDatos();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(friendly.descripcion);
    } finally {
      setCargando(false);
    }
  };

  // Consultar marcas físicas para la fecha y colaborador seleccionados
  const consultarMarcasFisicas = async (empId: string, fecha: string) => {
    if (!fecha) return;
    try {
      setCargandoMarcas(true);
      setMensajeInformativoMarcas(null);
      setMarcaSeleccionadaId("");
      setMarcaSeleccionadaInfo(null);
      setErrorModalCorreccion(null);

      let url = `/api/incidencias/marcas-por-fecha?fecha=${fecha}`;
      if (!esEmpleado && empId) {
        url += `&empleado_id=${empId}`;
      }

      const res: any = await apiRequest(url);
      if (res.exito) {
        const marcas: MarcaFisicaItem[] = res.datos?.marcas || [];
        setMarcasDisponibles(marcas);
        if (marcas.length === 0) {
          setMensajeInformativoMarcas(
            res.datos?.mensaje_informativo ||
            "No existen marcas físicas registradas para la fecha seleccionada."
          );
        }
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorModalCorreccion({ titulo: friendly.titulo, descripcion: friendly.descripcion });
      setMarcasDisponibles([]);
    } finally {
      setCargandoMarcas(false);
    }
  };

  // Abrir modal de nueva corrección
  const abrirModalNuevaCorreccion = async () => {
    setErrorModalCorreccion(null);
    setMarcaSeleccionadaId("");
    setMarcaSeleccionadaInfo(null);
    setTipoAjusteNuevo("SUSTITUCION_TIMESTAMP");
    setTimestampPropuesto("");
    setTipoMarcaPropuesto("ENTRADA");
    setMotivoCorreccion("");
    setMensajeInformativoMarcas(null);

    const hoy = new Date().toISOString().split("T")[0];
    setFechaCorreccion(hoy);

    let initialEmpId = usuario?.empleado_id || "";

    if (!esEmpleado) {
      try {
        const res: any = await apiRequest("/api/empleados");
        if (res.exito && Array.isArray(res.datos)) {
          setEmpleadosLista(res.datos);
          if (res.datos.length > 0) {
            const selfEmp = res.datos.find((e: any) => e.id === usuario?.empleado_id);
            initialEmpId = selfEmp ? selfEmp.id : res.datos[0].id;
          }
        }
      } catch {
        // Fallback si no tiene permiso de nómina general
      }
    }

    setColaboradorCorreccionId(initialEmpId);
    setModalNuevaCorreccion(true);

    if (initialEmpId || esEmpleado) {
      await consultarMarcasFisicas(initialEmpId, hoy);
    }
  };

  const handleRegularizarSalida = async () => {
    if (!modalRegularizar) return;

    if (!motivoRegularizar.trim()) {
      setErrorModalRegularizar({
        titulo: "Motivo requerido",
        descripcion: "Debe especificar un motivo válido de regularización.",
      });
      return;
    }

    try {
      setCargando(true);
      setErrorModalRegularizar(null);
      const res: any = await apiRequest("/api/incidencias/regularizar-salida", {
        method: "POST",
        body: {
          jornada_id: modalRegularizar.jornada_id,
          motivo: motivoRegularizar.trim(),
        },
      });

      if (res.exito) {
        setExitoMsg("Salida regularizada exitosamente con horario oficial programado.");
        setModalRegularizar(null);
        setMotivoRegularizar("");
        setErrorModalRegularizar(null);
        await cargarDatos();
      }
    } catch (err: any) {
      // Manejo contextual: el error se muestra DENTRO del modal y el modal no se cierra
      const friendly = getFriendlyErrorMessage(err);
      setErrorModalRegularizar({
        titulo: friendly.titulo,
        descripcion: friendly.descripcion,
      });
    } finally {
      setCargando(false);
    }
  };

  const handleResolverIncidencia = async () => {
    if (!modalResolver) return;

    if (!motivoResolver.trim()) {
      setErrorModalResolver({
        titulo: "Motivo requerido",
        descripcion: "El motivo de resolución es obligatorio.",
      });
      return;
    }

    try {
      setCargando(true);
      setErrorModalResolver(null);
      const res: any = await apiRequest(`/api/incidencias/${modalResolver.id}/resolver`, {
        method: "POST",
        body: {
          estado: accionResolver,
          motivo: motivoResolver.trim(),
        },
      });

      if (res.exito) {
        setExitoMsg("Incidencia actualizada correctamente.");
        setModalResolver(null);
        setMotivoResolver("");
        setErrorModalResolver(null);
        await cargarDatos();
      }
    } catch (err: any) {
      // Manejo contextual: el error se muestra DENTRO del modal y el modal no se cierra
      const friendly = getFriendlyErrorMessage(err);
      setErrorModalResolver({
        titulo: friendly.titulo,
        descripcion: friendly.descripcion,
      });
    } finally {
      setCargando(false);
    }
  };

  const handleDecidirCorreccion = async (id: string, decision: "APROBAR" | "RECHAZAR") => {
    try {
      setCargando(true);
      setErrorMsg(null);
      const res: any = await apiRequest(`/api/incidencias/correcciones/${id}/decidir`, {
        method: "POST",
        body: { decision },
      });

      if (res.exito) {
        setExitoMsg(res.mensaje);
        await cargarDatos();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    } finally {
      setCargando(false);
    }
  };

  const handleCrearCorreccion = async () => {
    if (!marcaSeleccionadaId) {
      setErrorModalCorreccion({
        titulo: "Marca requerida",
        descripcion: "Seleccione una marca válida para continuar.",
      });
      return;
    }

    if (!motivoCorreccion.trim()) {
      setErrorModalCorreccion({
        titulo: "Motivo requerido",
        descripcion: "El motivo de la solicitud de corrección es obligatorio.",
      });
      return;
    }

    try {
      setCargando(true);
      setErrorModalCorreccion(null);

      const res: any = await apiRequest("/api/incidencias/correcciones/solicitar", {
        method: "POST",
        body: {
          marca_original_id: marcaSeleccionadaId,
          tipo_ajuste: tipoAjusteNuevo,
          motivo: motivoCorreccion.trim(),
          timestamp_propuesto: tipoAjusteNuevo === "SUSTITUCION_TIMESTAMP" ? timestampPropuesto : null,
          tipo_marca_propuesto: tipoAjusteNuevo === "SUSTITUCION_TIPO" ? tipoMarcaPropuesto : null,
        },
      });

      if (res.exito) {
        setExitoMsg("Solicitud de corrección de marca registrada exitosamente.");
        setModalNuevaCorreccion(false);
        setMarcaSeleccionadaId("");
        setMarcaSeleccionadaInfo(null);
        setMotivoCorreccion("");
        setTimestampPropuesto("");
        setErrorModalCorreccion(null);
        await cargarDatos();
      }
    } catch (err: any) {
      // Manejo contextual: el error se muestra DENTRO del modal y el modal no se cierra
      const friendly = getFriendlyErrorMessage(err);
      setErrorModalCorreccion({
        titulo: friendly.titulo,
        descripcion: friendly.descripcion,
      });
    } finally {
      setCargando(false);
    }
  };

  const verDetalleJornada = async (jornadaId: string) => {
    try {
      const res: any = await apiRequest(`/api/incidencias/jornadas/${jornadaId}/marcas`);
      if (res.exito) {
        setModalDetalleJornada(res.datos);
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(friendly.descripcion);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Corporativo RIMAC */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#009944]/10 text-[#009944]">
              Módulo de Asistencia y Control
            </span>
            <span className="text-xs text-slate-500 font-mono">Agroquímica Industrial RIMAC S.A.</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Incidencias, Salidas Omitidas y Correcciones de Marcas
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Gestión determinista de anomalías de jornada, regularización oficial con hora programada y auditoría inmutable de marcas.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {/* Solo usuarios no-empleado autorizados pueden escanear */}
          {!esEmpleado && (puedeGestionarIncidencias || puedeRegularizar) && (
            <button
              type="button"
              id="btn-escanear-incidencias"
              onClick={ejecutarEscaneo}
              disabled={cargando}
              className="inline-flex items-center px-4 py-2 bg-[#009944] text-white text-sm font-semibold rounded-lg hover:bg-[#008037] transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${cargando ? "animate-spin" : ""}`} />
              Escanear Incidencias
            </button>
          )}

          {puedeSolicitarCorreccion && (
            <button
              type="button"
              id="btn-abrir-solicitud-correccion"
              onClick={abrirModalNuevaCorreccion}
              className="inline-flex items-center px-4 py-2 bg-[#F15F2A] text-white text-sm font-semibold rounded-lg hover:bg-[#d94d1b] transition shadow-xs"
            >
              <FileEdit className="w-4 h-4 mr-2" />
              Solicitar Corrección
            </button>
          )}
        </div>
      </div>

      {/* Notificaciones Generales de Vista (Errores de carga de página o acciones de tabla) */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-red-800 text-sm">
          <div className="flex items-center">
            <XCircle className="w-5 h-5 mr-2 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-600 font-bold ml-4">✕</button>
        </div>
      )}

      {exitoMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center">
            <CheckCircle2 className="w-5 h-5 mr-2 shrink-0 text-emerald-600" />
            <span>{exitoMsg}</span>
          </div>
          <button onClick={() => setExitoMsg(null)} className="text-emerald-700 font-bold ml-4">✕</button>
        </div>
      )}

      {/* Selector de Pestañas */}
      <div className="border-b border-slate-200 flex space-x-6">
        <button
          type="button"
          onClick={() => setPestañaActiva("incidencias")}
          className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition ${
            pestañaActiva === "incidencias"
              ? "border-[#009944] text-[#009944]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Incidencias de Jornada ({incidencias.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setPestañaActiva("correcciones")}
          className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition ${
            pestañaActiva === "correcciones"
              ? "border-[#009944] text-[#009944]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Correcciones Administrativas ({correcciones.length})</span>
        </button>
      </div>

      {/* VISTA 1: INCIDENCIAS DE JORNADA */}
      {pestañaActiva === "incidencias" && (
        <div className="space-y-4">
          {/* Barra de Filtros */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de Anomalía</label>
                <select
                  value={filtroTipoIncidencia}
                  onChange={(e) => setFiltroTipoIncidencia(e.target.value)}
                  className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
                >
                  <option value="">Todas las anomalías</option>
                  <option value="SALIDA_OMITIDA">Salida Omitida</option>
                  <option value="ENTRADA_OMITIDA">Entrada Omitida</option>
                  <option value="SECUENCIA_ANORMAL">Secuencia Anormal</option>
                  <option value="MARCA_DUPLICADA">Marca Duplicada</option>
                  <option value="PAUSA_SIN_CIERRE">Pausa sin Cierre</option>
                  <option value="DURACION_ANOMALA">Duración Anómala</option>
                  <option value="INCONSISTENCIA_HORARIO">Inconsistencia con Horario</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
                <select
                  value={filtroEstadoIncidencia}
                  onChange={(e) => setFiltroEstadoIncidencia(e.target.value)}
                  className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
                >
                  <option value="">Todos los estados</option>
                  <option value="ABIERTA">Abierta (Pendiente)</option>
                  <option value="REGULARIZADA">Regularizada (Oficial)</option>
                  <option value="JUSTIFICADA">Justificada</option>
                  <option value="DESCARTADA">Descartada</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Fecha Jornada</label>
                <input
                  type="date"
                  value={filtroFecha}
                  onChange={(e) => setFiltroFecha(e.target.value)}
                  className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
                />
              </div>

              {(filtroTipoIncidencia || filtroEstadoIncidencia || filtroFecha) && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroTipoIncidencia("");
                    setFiltroEstadoIncidencia("");
                    setFiltroFecha("");
                  }}
                  className="text-xs text-[#F15F2A] hover:underline font-medium self-end mb-1.5"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 flex items-center">
              <Info className="w-4 h-4 mr-1 text-[#009944]" />
              {esEmpleado
                ? "Visualizando sus incidencias laborales personales"
                : "Detección determinista con margen configurable por turno"}
            </div>
          </div>

          {/* Tabla de Incidencias */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Colaborador</th>
                  <th className="px-4 py-3">Jornada</th>
                  <th className="px-4 py-3">Anomalía Detectada</th>
                  <th className="px-4 py-3">Descripción Técnica</th>
                  <th className="px-4 py-3">Min. Afectados</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {incidencias.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      {cargando ? "Cargando incidencias..." : "No se registraron incidencias para los filtros seleccionados."}
                    </td>
                  </tr>
                ) : (
                  incidencias.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {inc.empleado_nombre || "Colaborador"}
                        <div className="text-[10px] text-slate-500 font-mono">
                          {inc.empleado_identificador || inc.empleado_id}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {inc.fecha_jornada}
                        <div className="text-[10px] text-slate-400">
                          {inc.hora_entrada_programada || "--:--"} a {inc.hora_salida_programada || "--:--"}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            inc.tipo_incidencia === "SALIDA_OMITIDA"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : inc.tipo_incidencia === "ENTRADA_OMITIDA"
                              ? "bg-red-100 text-red-800 border border-red-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {inc.tipo_incidencia}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs">{inc.descripcion}</td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">
                        {inc.minutos_afectados > 0 ? `${inc.minutos_afectados} min` : "--"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inc.estado === "ABIERTA"
                              ? "bg-red-100 text-red-700"
                              : inc.estado === "REGULARIZADA"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {inc.estado}
                        </span>
                        {inc.usuario_resolvio_nombre && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Por: {inc.usuario_resolvio_nombre}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => verDetalleJornada(inc.jornada_id)}
                          className="text-slate-500 hover:text-slate-800 font-medium inline-flex items-center text-xs"
                          title="Ver marcas originales y cálculo"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Marcas
                        </button>

                        {/* Los colaboradores con rol EMPLEADO no pueden regularizar ni resolver */}
                        {!esEmpleado && inc.estado === "ABIERTA" && inc.tipo_incidencia === "SALIDA_OMITIDA" && puedeRegularizar && (
                          <button
                            type="button"
                            onClick={() => {
                              setErrorModalRegularizar(null);
                              setModalRegularizar(inc);
                              setMotivoRegularizar("Colaborador completó su jornada oficial y omitió la marcación física de salida.");
                            }}
                            className="bg-[#009944] text-white hover:bg-[#008037] px-2.5 py-1 rounded text-xs font-semibold shadow-2xs"
                          >
                            Regularizar Salida
                          </button>
                        )}

                        {!esEmpleado && inc.estado === "ABIERTA" && puedeGestionarIncidencias && (
                          <button
                            type="button"
                            onClick={() => {
                              setErrorModalResolver(null);
                              setModalResolver(inc);
                              setMotivoResolver("");
                            }}
                            className="text-slate-600 hover:text-slate-900 border border-slate-300 px-2 py-1 rounded text-xs"
                          >
                            Resolver
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 2: CORRECCIONES ADMINISTRATIVAS DE MARCAS */}
      {pestañaActiva === "correcciones" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Estado de Corrección</label>
                <select
                  value={filtroEstadoCorreccion}
                  onChange={(e) => setFiltroEstadoCorreccion(e.target.value)}
                  className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
                >
                  <option value="">Todos los estados</option>
                  <option value="PENDIENTE">Pendiente de Decisión</option>
                  <option value="APROBADA">Aprobada</option>
                  <option value="RECHAZADA">Rechazada</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500 flex items-center">
              <Info className="w-4 h-4 mr-1 text-[#009944]" />
              Las marcas físicas originales se preservan inmutables en base de datos.
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Empleado</th>
                  <th className="px-4 py-3">Marca Física Original</th>
                  <th className="px-4 py-3">Ajuste Solicitado</th>
                  <th className="px-4 py-3">Motivo Obligatorio</th>
                  <th className="px-4 py-3">Solicitante</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acción ABAC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {correcciones.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No hay solicitudes de corrección de marcas registradas.
                    </td>
                  </tr>
                ) : (
                  correcciones.map((corr) => {
                    const esPropia = usuario?.empleado_id === corr.empleado_id;
                    return (
                      <tr key={corr.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {corr.empleado_nombre}
                          <div className="text-[10px] text-slate-500 font-mono">
                            Jornada: {corr.fecha_jornada}
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono rounded border border-slate-200 mb-0.5">
                            [MARCA FÍSICA]
                          </span>
                          <div className="font-semibold text-slate-800">{corr.marca_original_tipo}</div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(corr.marca_original_timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-block px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-mono rounded border border-emerald-200 mb-0.5">
                            [CORRECCIÓN ADMINISTRATIVA]
                          </span>
                          <div className="font-medium text-slate-800">{corr.tipo_ajuste}</div>
                          {corr.timestamp_propuesto && (
                            <div className="text-[11px] text-emerald-700 font-semibold">
                              Nuevo: {new Date(corr.timestamp_propuesto).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                          {corr.tipo_marca_propuesto && (
                            <div className="text-[11px] text-emerald-700 font-semibold">
                              Tipo: {corr.tipo_marca_propuesto}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-600 max-w-xs">{corr.motivo}</td>

                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {corr.usuario_solicito_nombre}
                          <div className="text-[10px] text-slate-400">
                            {new Date(corr.creado_en).toLocaleDateString()}
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              corr.estado === "PENDIENTE"
                                ? "bg-amber-100 text-amber-800"
                                : corr.estado === "APROBADA"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {corr.estado}
                          </span>
                          {corr.usuario_autorizo_nombre && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Por: {corr.usuario_autorizo_nombre}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {corr.estado === "PENDIENTE" && puedeAprobarCorreccion && !esEmpleado ? (
                            esPropia ? (
                              <span
                                className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200"
                                title="No puede aprobar correcciones sobre sus propias marcas"
                              >
                                Autoaprobación no permitida
                              </span>
                            ) : (
                              <div className="inline-flex space-x-2">
                                <button
                                  type="button"
                                  onClick={() => handleDecidirCorreccion(corr.id, "APROBAR")}
                                  className="bg-[#009944] text-white hover:bg-[#008037] px-2.5 py-1 rounded text-xs font-semibold shadow-2xs"
                                >
                                  Aprobar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDecidirCorreccion(corr.id, "RECHAZAR")}
                                  className="bg-red-600 text-white hover:bg-red-700 px-2.5 py-1 rounded text-xs font-semibold shadow-2xs"
                                >
                                  Rechazar
                                </button>
                              </div>
                            )
                          ) : (
                            <span className="text-slate-400 text-xs">
                              {corr.estado === "PENDIENTE" ? "En revisión" : "Resuelta"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: REGULARIZAR SALIDA OMITIDA */}
      {modalRegularizar && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-[#009944]">
              <ShieldCheck className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-900">Regularizar Salida Omitida</h3>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
              <div>
                <span className="font-semibold text-slate-700">Colaborador:</span>{" "}
                {modalRegularizar.empleado_nombre} ({modalRegularizar.empleado_identificador})
              </div>
              <div>
                <span className="font-semibold text-slate-700">Jornada:</span> {modalRegularizar.fecha_jornada}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Hora Programada de Salida:</span>{" "}
                {modalRegularizar.hora_salida_programada || "16:30"}
              </div>
              <div className="text-[11px] text-amber-700 font-medium pt-1 border-t border-slate-200">
                Se utilizará la hora programada oficial para el cálculo efectivo. No se insertará una marca física ficticia.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Motivo Obligatorio de Regularización
              </label>
              <textarea
                value={motivoRegularizar}
                onChange={(e) => setMotivoRegularizar(e.target.value)}
                rows={3}
                placeholder="Indique la justificación formal autorizada..."
                className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
              />
            </div>

            {/* Error contextual dentro del modal */}
            {errorModalRegularizar && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start text-red-800 text-xs space-x-2">
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-red-900">{errorModalRegularizar.titulo}</div>
                  <div className="text-red-700 mt-0.5">{errorModalRegularizar.descripcion}</div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModalRegularizar(null);
                  setErrorModalRegularizar(null);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirmar-regularizacion"
                onClick={handleRegularizarSalida}
                disabled={cargando || !motivoRegularizar.trim()}
                className="px-4 py-2 bg-[#009944] text-white text-xs font-semibold rounded-lg hover:bg-[#008037] disabled:opacity-50 shadow-xs"
              >
                Confirmar Regularización
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: RESOLVER / DESCARTAR INCIDENCIA */}
      {modalResolver && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Resolver Incidencia Laboral</h3>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
              <div>
                <span className="font-semibold text-slate-700">Colaborador:</span>{" "}
                {modalResolver.empleado_nombre} ({modalResolver.empleado_identificador})
              </div>
              <div>
                <span className="font-semibold text-slate-700">Tipo:</span> {modalResolver.tipo_incidencia}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Descripción:</span> {modalResolver.descripcion}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Acción</label>
                <select
                  value={accionResolver}
                  onChange={(e) => setAccionResolver(e.target.value as any)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                >
                  <option value="JUSTIFICADA">Justificar (Con respaldo)</option>
                  <option value="DESCARTADA">Descartar (Falsa alarma o resuelta)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motivo de Resolución (Obligatorio)
                </label>
                <textarea
                  value={motivoResolver}
                  onChange={(e) => setMotivoResolver(e.target.value)}
                  rows={3}
                  placeholder="Detalle la justificación o motivo de descarte..."
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                />
              </div>
            </div>

            {/* Error contextual dentro del modal (evita alertas detrás del modal) */}
            {errorModalResolver && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start text-red-800 text-xs space-x-2">
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-red-900">{errorModalResolver.titulo}</div>
                  <div className="text-red-700 mt-0.5">{errorModalResolver.descripcion}</div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModalResolver(null);
                  setErrorModalResolver(null);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResolverIncidencia}
                disabled={cargando || !motivoResolver.trim()}
                className="px-4 py-2 bg-[#009944] text-white text-xs font-semibold rounded-lg hover:bg-[#008037] disabled:opacity-50"
              >
                Guardar Resolución
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DETALLE DE JORNADA Y MARCAS */}
      {modalDetalleJornada && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                Auditoría de Jornada: {modalDetalleJornada.jornada.fecha_jornada}
              </h3>
              <button
                onClick={() => setModalDetalleJornada(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg text-xs">
              <div>
                <span className="text-slate-500 block">Estado:</span>
                <span className="font-bold text-slate-800">{modalDetalleJornada.jornada.estado_jornada}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Minutos Efectivos:</span>
                <span className="font-bold text-slate-800">
                  {modalDetalleJornada.jornada.resultados_derivados?.minutos_efectivos ?? "--"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Tardanza:</span>
                <span className="font-bold text-slate-800">
                  {modalDetalleJornada.jornada.resultados_derivados?.minutos_tardanza ?? 0} min
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Salida Regularizada:</span>
                <span className={`font-bold ${modalDetalleJornada.es_salida_regularizada ? "text-emerald-700" : "text-slate-600"}`}>
                  {modalDetalleJornada.es_salida_regularizada ? "SÍ (Horario Oficial)" : "NO"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Eventos Físicos Originales Registrados
              </h4>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 text-xs">
                {modalDetalleJornada.marcas_fisicas.length === 0 ? (
                  <div className="p-3 text-slate-400 text-center">No hay marcas físicas en esta jornada.</div>
                ) : (
                  modalDetalleJornada.marcas_fisicas.map((m) => (
                    <div key={m.id} className="p-3 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border">
                          [MARCA FÍSICA]
                        </span>
                        <span className="font-bold text-slate-900">{m.tipo_marca}</span>
                        <span className="text-slate-500 text-[11px] font-mono">
                          {new Date(m.timestamp_servidor).toLocaleTimeString()}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">Origen: {m.canal_marca || m.origen_tipo}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {modalDetalleJornada.es_salida_regularizada && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 space-y-1">
                <div className="font-bold flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
                  [HORA REGULARIZADA PARA CÁLCULO]
                </div>
                <div>
                  Hora de Salida Oficial: <span className="font-mono font-bold">{modalDetalleJornada.hora_salida_calculo}</span>
                </div>
                <div className="text-[11px] text-emerald-700">
                  Esta hora se utiliza exclusivamente para el cálculo legal de jornada y no constituye una marca física de garita.
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setModalDetalleJornada(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SOLICITAR CORRECCIÓN GUIADA (Fase 4A.1) */}
      {modalNuevaCorreccion && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Solicitar Corrección de Marca</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Selección guiada de marcas físicas. La marca original permanecerá intacta en la base de datos para fines de auditoría.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalNuevaCorreccion(false);
                  setErrorModalCorreccion(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold ml-2 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* 1. Selección de Colaborador */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  1. Colaborador
                </label>
                {esEmpleado ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-[#009944]" />
                      <span className="font-semibold text-slate-800">
                        {usuario?.nombre_completo || usuario?.identificador}
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        ({usuario?.identificador || "Identidad Propia"})
                      </span>
                    </div>
                    <span className="text-[10px] bg-[#009944]/10 text-[#009944] font-bold px-2 py-0.5 rounded-full">
                      Sesión Autenticada
                    </span>
                  </div>
                ) : (
                  <select
                    value={colaboradorCorreccionId}
                    onChange={(e) => {
                      const newEmpId = e.target.value;
                      setColaboradorCorreccionId(newEmpId);
                      consultarMarcasFisicas(newEmpId, fechaCorreccion);
                    }}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
                  >
                    {empleadosLista.length > 0 ? (
                      empleadosLista.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nombre_completo} ({emp.cedula})
                        </option>
                      ))
                    ) : (
                      <option value={colaboradorCorreccionId}>
                        {usuario?.nombre_completo || usuario?.identificador} (Propio)
                      </option>
                    )}
                  </select>
                )}
              </div>

              {/* 2. Selección de Fecha */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  2. Fecha de Jornada
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={fechaCorreccion}
                    onChange={(e) => {
                      const newFecha = e.target.value;
                      setFechaCorreccion(newFecha);
                      consultarMarcasFisicas(colaboradorCorreccionId || usuario?.empleado_id || "", newFecha);
                    }}
                    className="flex-1 text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-[#009944] focus:outline-hidden font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => consultarMarcasFisicas(colaboradorCorreccionId || usuario?.empleado_id || "", fechaCorreccion)}
                    disabled={cargandoMarcas}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium inline-flex items-center"
                    title="Actualizar marcas de la fecha"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${cargandoMarcas ? "animate-spin" : ""}`} />
                    Consultar
                  </button>
                </div>
              </div>

              {/* 3. Selección Guiada de Marcas Físicas Disponibles */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    3. Seleccionar Marca Física a Corregir *
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {cargandoMarcas ? "Buscando marcas..." : `${marcasDisponibles.length} marcas registradas`}
                  </span>
                </div>

                {cargandoMarcas ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs text-slate-500">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-[#009944]" />
                    Consultando marcas físicas en base de datos...
                  </div>
                ) : marcasDisponibles.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center">
                    <Info className="w-4 h-4 mr-2 shrink-0 text-amber-600" />
                    <span>{mensajeInformativoMarcas || "No existen marcas físicas registradas para la fecha seleccionada."}</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto border border-slate-200 rounded-lg p-2 divide-y divide-slate-100">
                    {marcasDisponibles.map((m) => {
                      const isSelected = marcaSeleccionadaId === m.id;
                      const horaStr = new Date(m.timestamp_servidor).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      });
                      const tienePendiente = Boolean(m.tiene_correccion_pendiente);

                      return (
                        <div
                          key={m.id}
                          onClick={() => {
                            if (!tienePendiente) {
                              setMarcaSeleccionadaId(m.id);
                              setMarcaSeleccionadaInfo(m);
                            }
                          }}
                          className={`p-2.5 rounded-md cursor-pointer transition-colors flex items-center justify-between text-xs ${
                            isSelected
                              ? "bg-emerald-50 border border-emerald-500 text-emerald-950 font-medium"
                              : tienePendiente
                              ? "bg-slate-50 opacity-60 cursor-not-allowed text-slate-400"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="radio"
                              name="marca_seleccionada"
                              checked={isSelected}
                              disabled={tienePendiente}
                              onChange={() => {
                                setMarcaSeleccionadaId(m.id);
                                setMarcaSeleccionadaInfo(m);
                              }}
                              className="text-[#009944] focus:ring-[#009944]"
                            />
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold text-slate-900">{m.tipo_marca}</span>
                                <span className="text-[11px] font-mono text-slate-600">
                                  {horaStr}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Canal: {m.canal_marca}
                              </div>
                            </div>
                          </div>

                          <div>
                            {tienePendiente ? (
                              <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded border border-amber-200">
                                Corrección pendiente
                              </span>
                            ) : isSelected ? (
                              <span className="inline-flex items-center text-[11px] text-emerald-700 font-bold">
                                <Check className="w-3.5 h-3.5 mr-0.5" />
                                Seleccionada
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">Clic para elegir</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Resumen de marca elegida */}
                {marcaSeleccionadaInfo && (
                  <div className="mt-2 p-2 bg-emerald-50/80 border border-emerald-200 rounded-md text-xs text-emerald-900 flex items-center justify-between">
                    <div>
                      <span className="font-semibold">Marca Original:</span> {marcaSeleccionadaInfo.tipo_marca} a las{" "}
                      {new Date(marcaSeleccionadaInfo.timestamp_servidor).toLocaleTimeString()} ({marcaSeleccionadaInfo.canal_marca})
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700">UUID vinculado</span>
                  </div>
                )}
              </div>

              {/* 4. Tipo de Ajuste */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  4. Tipo de Ajuste
                </label>
                <select
                  value={tipoAjusteNuevo}
                  onChange={(e) => setTipoAjusteNuevo(e.target.value as any)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
                >
                  <option value="SUSTITUCION_TIMESTAMP">Sustitución de Hora / Timestamp</option>
                  <option value="SUSTITUCION_TIPO">Sustitución de Tipo de Evento</option>
                  <option value="ANULACION_LOGICA">Anulación Lógica (Marca errónea/duplicada)</option>
                </select>
              </div>

              {/* Parámetros específicos según Tipo de Ajuste */}
              {tipoAjusteNuevo === "SUSTITUCION_TIMESTAMP" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nueva Fecha y Hora Propuesta *
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampPropuesto}
                    onChange={(e) => setTimestampPropuesto(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 font-mono focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Indique el timestamp corregido que se tomará en cuenta para el recálculo determinista.
                  </p>
                </div>
              )}

              {tipoAjusteNuevo === "SUSTITUCION_TIPO" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nuevo Tipo de Marca Propuesto *
                  </label>
                  <select
                    value={tipoMarcaPropuesto}
                    onChange={(e) => setTipoMarcaPropuesto(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
                  >
                    <option value="ENTRADA">ENTRADA</option>
                    <option value="SALIDA">SALIDA</option>
                    <option value="INICIO_DESAYUNO">INICIO_DESAYUNO</option>
                    <option value="FIN_DESAYUNO">FIN_DESAYUNO</option>
                    <option value="INICIO_ALMUERZO">INICIO_ALMUERZO</option>
                    <option value="FIN_ALMUERZO">FIN_ALMUERZO</option>
                    <option value="INICIO_CAFE">INICIO_CAFE</option>
                    <option value="FIN_CAFE">FIN_CAFE</option>
                  </select>
                </div>
              )}

              {tipoAjusteNuevo === "ANULACION_LOGICA" && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                  <div className="font-semibold text-slate-800 mb-0.5">Efecto de la Anulación Lógica:</div>
                  La marca física original se mantendrá inmutable en la base de datos para efectos de auditoría legal, pero quedará excluida del recálculo de la jornada una vez aprobada. No requiere ingresar nueva fecha ni hora.
                </div>
              )}

              {/* 5. Motivo Obligatorio */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  5. Motivo Obligatorio de la Solicitud *
                </label>
                <textarea
                  value={motivoCorreccion}
                  onChange={(e) => setMotivoCorreccion(e.target.value)}
                  rows={3}
                  placeholder="Detalle la justificación laboral para esta solicitud de corrección..."
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-1 focus:ring-[#009944] focus:outline-hidden"
                />
              </div>
            </div>

            {/* Error Contextual DENTRO del Modal */}
            {errorModalCorreccion && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start text-red-800 text-xs space-x-2">
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-red-900">{errorModalCorreccion.titulo}</div>
                  <div className="text-red-700 mt-0.5">{errorModalCorreccion.descripcion}</div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setModalNuevaCorreccion(false);
                  setErrorModalCorreccion(null);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-enviar-correccion"
                onClick={handleCrearCorreccion}
                disabled={cargando || !marcaSeleccionadaId || !motivoCorreccion.trim()}
                className="px-4 py-2 bg-[#F15F2A] text-white text-xs font-semibold rounded-lg hover:bg-[#d94d1b] disabled:opacity-50 shadow-xs"
              >
                Enviar Solicitud
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
