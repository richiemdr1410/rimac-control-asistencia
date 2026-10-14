import React, { useState, useEffect } from "react";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  User,
  AlertCircle,
  Paperclip,
  RefreshCw,
  Building,
  CheckSquare,
} from "lucide-react";

interface TiempoAdicionalItem {
  id: string;
  empleado_id: string;
  empleado_nombre?: string;
  empleado_cedula?: string;
  departamento_nombre?: string;
  fecha_jornada: string;
  hora_entrada_calculo?: string | null;
  hora_salida_calculo?: string | null;
  minutos_tiempo_total: number;
  minutos_desayuno: number;
  minutos_almuerzo: number;
  minutos_cafe: number;
  minutos_total_descansos: number;
  minutos_efectivos: number;
  minutos_tiempo_adicional: number;
  minutos_tiempo_adicional_aprobado: number;
  estado_tiempo_adicional: "NO_APLICA" | "PENDIENTE" | "APROBADO_TOTAL" | "APROBADO_PARCIAL" | "RECHAZADO";
  usuario_aprobo_ta_id?: string | null;
  usuario_aprobo_nombre?: string | null;
  fecha_resolucion_ta?: string | null;
  motivo_resolucion_ta?: string | null;
}

interface SolicitudDecision {
  id: string;
  nivel: number;
  rol_evaluador: string;
  decision: "APROBADA" | "RECHAZADA";
  comentarios?: string | null;
  fecha_decision: string;
  decisor_nombre?: string;
}

interface SolicitudEvidencia {
  id: string;
  nombre_archivo: string;
  tipo_mime: string;
}

interface Solicitud {
  id: string;
  empleado_id: string;
  empleado_nombre?: string;
  empleado_cedula?: string;
  departamento_nombre?: string;
  tipo_solicitud: string;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_hora_inicio?: string | null;
  fecha_hora_fin?: string | null;
  minutos_solicitados: number;
  motivo: string;
  estado: "PENDIENTE" | "EN_REVISION" | "APROBADA" | "RECHAZADA";
  creado_en?: string;
  decisiones?: SolicitudDecision[];
  evidencias?: SolicitudEvidencia[];
}

interface BandejaSolicitudesViewProps {
  tabInicial?: "solicitudes" | "tiempo_adicional";
  filtroEstadoTAInicial?: string;
}

export const BandejaSolicitudesView: React.FC<BandejaSolicitudesViewProps> = ({
  tabInicial = "solicitudes",
  filtroEstadoTAInicial = "TODOS",
}) => {
  const { usuario, tienePermiso } = useAuth();
  const [tabActiva, setTabActiva] = useState<"solicitudes" | "tiempo_adicional">(tabInicial);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Tiempo Adicional (Fase 4B)
  const [itemsTA, setItemsTA] = useState<TiempoAdicionalItem[]>([]);
  const [cargandoTA, setCargandoTA] = useState<boolean>(false);
  const [filtroEstadoTA, setFiltroEstadoTA] = useState<string>(filtroEstadoTAInicial);
  const [modalTAItem, setModalTAItem] = useState<TiempoAdicionalItem | null>(null);
  const [decisionTA, setDecisionTA] = useState<"APROBAR_TOTAL" | "APROBAR_PARCIAL" | "RECHAZAR">("APROBAR_TOTAL");
  const [minutosAprobadosTA, setMinutosAprobadosTA] = useState<number>(0);
  const [motivoTA, setMotivoTA] = useState<string>("");
  const [procesandoTA, setProcesandoTA] = useState<boolean>(false);
  const [errorModalTA, setErrorModalTA] = useState<{ titulo: string; descripcion: string } | null>(null);
  const [exitoTA, setExitoTA] = useState<string | null>(null);

  const cargarTiempoAdicional = async () => {
    setCargandoTA(true);
    try {
      const res = await apiRequest<{ exito: boolean; datos: TiempoAdicionalItem[] }>(
        "/api/jefatura/tiempo-adicional/pendientes"
      );
      if (res.exito) {
        setItemsTA(res.datos || []);
      }
    } catch {
      setItemsTA([]);
    } finally {
      setCargandoTA(false);
    }
  };

  const abrirModalTA = (item: TiempoAdicionalItem) => {
    setModalTAItem(item);
    setDecisionTA("APROBAR_TOTAL");
    setMinutosAprobadosTA(item.minutos_tiempo_adicional);
    setMotivoTA("");
    setErrorModalTA(null);
  };

  const handleConfirmarTA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTAItem) return;

    if (!motivoTA.trim()) {
      setErrorModalTA({
        titulo: "Motivo requerido",
        descripcion: "El motivo o justificación de la resolución es obligatorio.",
      });
      return;
    }

    if (
      decisionTA === "APROBAR_PARCIAL" &&
      (minutosAprobadosTA <= 0 || minutosAprobadosTA > modalTAItem.minutos_tiempo_adicional)
    ) {
      setErrorModalTA({
        titulo: "Minutos aprobados inválidos",
        descripcion: `Debe especificar un valor entre 1 y ${modalTAItem.minutos_tiempo_adicional} minutos.`,
      });
      return;
    }

    setProcesandoTA(true);
    setErrorModalTA(null);

    try {
      const res = await apiRequest<{ exito: boolean; mensaje: string; datos: any }>(
        "/api/jefatura/aprobar-tiempo-adicional",
        {
          method: "POST",
          body: {
            jornada_id: modalTAItem.id,
            decision: decisionTA,
            minutos_aprobados:
              decisionTA === "APROBAR_TOTAL"
                ? modalTAItem.minutos_tiempo_adicional
                : decisionTA === "APROBAR_PARCIAL"
                ? minutosAprobadosTA
                : 0,
            motivo: motivoTA.trim(),
          },
        }
      );

      if (res.exito) {
        setModalTAItem(null);
        setExitoTA(`Tiempo adicional resuelto exitosamente (${decisionTA}).`);
        await cargarTiempoAdicional();
      }
    } catch (err: any) {
      let parsedPayload: any = null;
      if (typeof err === "string") {
        try {
          parsedPayload = JSON.parse(err);
        } catch {}
      } else if (err && typeof err === "object") {
        if (typeof err.message === "string" && err.message.trim().startsWith("{")) {
          try {
            parsedPayload = JSON.parse(err.message);
          } catch {}
        }
        if (typeof err.response?.data === "string" && err.response.data.trim().startsWith("{")) {
          try {
            parsedPayload = JSON.parse(err.response.data);
          } catch {}
        }
      }

      const codigo =
        err?.codigo ||
        err?.code ||
        err?.error?.codigo ||
        err?.response?.data?.error?.codigo ||
        err?.response?.data?.codigo ||
        parsedPayload?.codigo;

      const status = err?.status || err?.statusCode || err?.response?.status;
      const errString = `${err?.message || ""} ${err?.mensaje || ""} ${JSON.stringify(err || "")}`;

      const esAutoaprobacion =
        codigo === "AUTOAPROBACION_NO_PERMITIDA" ||
        errString.includes("AUTOAPROBACION_NO_PERMITIDA") ||
        (status === 403 &&
          (modalTAItem.empleado_id === usuario?.empleado_id ||
            errString.includes("propia") ||
            errString.includes("usted mismo")));

      if (esAutoaprobacion) {
        setErrorModalTA({
          titulo: "No puede resolver su propia jornada",
          descripcion:
            "No es posible aprobar o rechazar tiempo adicional correspondiente a usted mismo. La jornada debe ser revisada por su jefatura directa o por otro responsable autorizado según el flujo de aprobación.",
        });
      } else {
        const friendly = getFriendlyErrorMessage(err);
        setErrorModalTA({
          titulo: friendly.titulo,
          descripcion: friendly.descripcion,
        });
      }
    } finally {
      setProcesandoTA(false);
    }
  };

  // Estados de Modales de Decisión
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState<Solicitud | null>(null);
  const [accionTipo, setAccionTipo] = useState<"aprobar" | "rechazar" | null>(null);
  const [comentario, setComentario] = useState<string>("");
  const [procesando, setProcesando] = useState<boolean>(false);
  const [errorModal, setErrorModal] = useState<{ titulo: string; descripcion: string } | null>(null);

  const cargarPendientes = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiRequest<{ exito: boolean; datos: Solicitud[] }>(
        "/api/solicitudes/pendientes"
      );
      if (res.exito) {
        setSolicitudes(res.datos || []);
      }
    } catch (err: any) {
      setError(err.mensaje || "Error al cargar solicitudes pendientes.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPendientes();
  }, []);

  const abrirModalDecision = (sol: Solicitud, accion: "aprobar" | "rechazar") => {
    setSolicitudSeleccionada(sol);
    setAccionTipo(accion);
    setComentario("");
    setErrorModal(null);
  };

  const handleConfirmarDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solicitudSeleccionada || !accionTipo) return;

    if (accionTipo === "rechazar" && !comentario.trim()) {
      setErrorModal({
        titulo: "Motivo de rechazo requerido",
        descripcion: "El motivo de rechazo es estrictamente obligatorio según normativa laboral.",
      });
      return;
    }

    setProcesando(true);
    setErrorModal(null);

    try {
      const endpoint =
        accionTipo === "aprobar"
          ? `/api/solicitudes/${solicitudSeleccionada.id}/aprobar`
          : `/api/solicitudes/${solicitudSeleccionada.id}/rechazar`;

      const res = await apiRequest<{ exito: boolean; datos: any }>(endpoint, {
        method: "POST",
        body: { comentarios: comentario.trim() },
      });

      if (res.exito) {
        setSolicitudSeleccionada(null);
        setAccionTipo(null);
        await cargarPendientes();
      }
    } catch (err: any) {
      // Extracción exhaustiva de código, status y mensajes
      let parsedPayload: any = null;
      if (typeof err === "string") {
        try {
          parsedPayload = JSON.parse(err);
        } catch {}
      } else if (err && typeof err === "object") {
        if (typeof err.message === "string" && err.message.trim().startsWith("{")) {
          try {
            parsedPayload = JSON.parse(err.message);
          } catch {}
        }
        if (typeof err.response?.data === "string" && err.response.data.trim().startsWith("{")) {
          try {
            parsedPayload = JSON.parse(err.response.data);
          } catch {}
        }
        if (typeof err.data === "string" && err.data.trim().startsWith("{")) {
          try {
            parsedPayload = JSON.parse(err.data);
          } catch {}
        }
      }

      const codigo =
        err?.codigo ||
        err?.code ||
        err?.error?.codigo ||
        err?.response?.data?.error?.codigo ||
        err?.response?.data?.codigo ||
        err?.data?.error?.codigo ||
        err?.data?.codigo ||
        parsedPayload?.error?.codigo ||
        parsedPayload?.codigo;

      const status =
        err?.status ||
        err?.statusCode ||
        err?.response?.status ||
        parsedPayload?.status;

      const errString = `${err?.message || ""} ${err?.mensaje || ""} ${JSON.stringify(err || "")}`;
      const esAutoaprobacion =
        codigo === "AUTOAPROBACION_NO_PERMITIDA" ||
        errString.includes("AUTOAPROBACION_NO_PERMITIDA") ||
        (status === 403 &&
          (solicitudSeleccionada.empleado_id === usuario?.empleado_id ||
            errString.includes("propia") ||
            errString.includes("usted mismo")));

      if (esAutoaprobacion) {
        setErrorModal({
          titulo: "No puede resolver su propia solicitud",
          descripcion:
            "No es posible aprobar o rechazar una solicitud correspondiente a usted mismo. La solicitud debe ser revisada por su jefatura directa o por otro responsable autorizado según el flujo de aprobación.",
        });
      } else {
        const friendly = getFriendlyErrorMessage(err);
        // Garantía contractual: si status es 403, jamás mostrar "Servicio no disponible"
        if (status === 403 && friendly.titulo.toLowerCase().includes("servicio no disponible")) {
          setErrorModal({
            titulo: "No puede resolver su propia solicitud",
            descripcion:
              "No es posible aprobar o rechazar una solicitud correspondiente a usted mismo. La solicitud debe ser revisada por su jefatura directa o por otro responsable autorizado según el flujo de aprobación.",
          });
        } else {
          setErrorModal({
            titulo: friendly.titulo,
            descripcion: friendly.descripcion,
          });
        }
      }
    } finally {
      setProcesando(false);
    }
  };

  const getTipoEtiqueta = (t: string) => {
    switch (t) {
      case "PERMISO":
        return "Permiso Parcial / Laboral";
      case "VACACIONES":
        return "Vacaciones";
      case "JUSTIFICACION_AUSENCIA":
        return "Justificación de Ausencia";
      case "JUSTIFICACION_TARDIA":
        return "Justificación de Llegada Tardía";
      case "JUSTIFICACION_MARCA_OMITIDA":
        return "Justificación de Marca Omitida";
      default:
        return t.replace(/_/g, " ");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-7 h-7 text-[#009944]" />
            Bandeja de Aprobaciones y Justificaciones
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestión de solicitudes de tiempo y regularizaciones para colaboradores bajo su ámbito de jefatura o gestión de Talento Humano.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (tabActiva === "solicitudes") {
              cargarPendientes();
            } else {
              cargarTiempoAdicional();
            }
          }}
          disabled={cargando || cargandoTA}
          className="inline-flex items-center px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${cargando || cargandoTA ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* Selector de Pestañas: Solicitudes vs Tiempo Adicional */}
      <div className="flex items-center space-x-3 mt-6 border-b border-slate-200 pb-2">
        <button
          type="button"
          id="tab-bandeja-solicitudes"
          onClick={() => setTabActiva("solicitudes")}
          className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tabActiva === "solicitudes"
              ? "bg-[#009944] text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 bg-white border border-slate-200"
          }`}
        >
          <CheckSquare className="w-4 h-4 mr-2" />
          Solicitudes de Colaboradores
          <span
            className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
              tabActiva === "solicitudes" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {solicitudes.length}
          </span>
        </button>

        <button
          type="button"
          id="tab-bandeja-tiempo-adicional"
          onClick={() => {
            setTabActiva("tiempo_adicional");
            cargarTiempoAdicional();
          }}
          className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            tabActiva === "tiempo_adicional"
              ? "bg-[#009944] text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 bg-white border border-slate-200"
          }`}
        >
          <Clock className="w-4 h-4 mr-2" />
          Tiempo Adicional Detectado
          <span
            className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
              tabActiva === "tiempo_adicional" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
            }`}
          >
            {itemsTA.filter((i) => i.estado_tiempo_adicional === "PENDIENTE").length}
          </span>
        </button>
      </div>

      {/* Banner de Éxito para Tiempo Adicional */}
      {exitoTA && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-[#009944]" />
            <span className="font-semibold">{exitoTA}</span>
          </div>
          <button
            type="button"
            onClick={() => setExitoTA(null)}
            className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {tabActiva === "solicitudes" ? (
        <>
          {/* Lista de Solicitudes Pendientes */}
          {cargando ? (
            <div className="py-16 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[#009944] mb-3" />
              <p className="text-sm font-medium">Cargando solicitudes pendientes...</p>
            </div>
          ) : error ? (
            <div className="mt-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          ) : solicitudes.length === 0 ? (
            <div className="mt-8 bg-white border border-slate-200 rounded-xl p-12 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-700">Bandeja al día</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                No hay solicitudes pendientes de aprobación para su usuario en este momento.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
          {solicitudes.map((sol) => (
            <div
              key={sol.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-800">
                    {getTipoEtiqueta(sol.tipo_solicitud)}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      sol.estado === "EN_REVISION"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {sol.estado === "EN_REVISION" ? "Pendiente Nivel 2 (TH)" : "Pendiente Nivel 1"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => abrirModalDecision(sol, "rechazar")}
                    className="inline-flex items-center px-3 py-1.5 border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Rechazar
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirModalDecision(sol, "aprobar")}
                    className="inline-flex items-center px-3.5 py-1.5 bg-[#009944] text-white hover:bg-[#007a37] rounded-lg text-xs font-semibold shadow-xs transition-colors"
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    Aprobar
                  </button>
                </div>
              </div>

              {/* Datos del Colaborador y Solicitud */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 text-sm text-slate-600">
                <div>
                  <span className="text-xs font-semibold text-slate-400 block uppercase">Colaborador</span>
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                    <User className="w-4 h-4 text-slate-500" />
                    {sol.empleado_nombre || "Colaborador"}
                  </div>
                  <span className="text-xs text-slate-500 block mt-0.5">
                    Cédula: {sol.empleado_cedula || "N/A"}
                  </span>
                  {sol.departamento_nombre && (
                    <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Building className="w-3 h-3" />
                      {sol.departamento_nombre}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-400 block uppercase">Período</span>
                  <div className="font-medium text-slate-800 mt-0.5">
                    {sol.fecha_inicio === sol.fecha_fin
                      ? sol.fecha_inicio
                      : `${sol.fecha_inicio} al ${sol.fecha_fin}`}
                  </div>
                  {sol.fecha_hora_inicio && sol.fecha_hora_fin && (
                    <div className="text-xs text-slate-500 mt-1">
                      Horario: {new Date(sol.fecha_hora_inicio).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })} -{" "}
                      {new Date(sol.fecha_hora_fin).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-400 block uppercase">Tiempo Solicitado</span>
                  <div className="font-medium text-slate-800 mt-0.5">
                    {sol.minutos_solicitados} minutos ({Number((sol.minutos_solicitados / 60).toFixed(1))} hrs)
                  </div>
                  {sol.evidencias && sol.evidencias.length > 0 && (
                    <div className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                      <Paperclip className="w-3.5 h-3.5" />
                      {sol.evidencias[0].nombre_archivo}
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-400 block uppercase">Motivo</span>
                  <p className="text-slate-700 italic mt-0.5 line-clamp-2">"{sol.motivo}"</p>
                </div>
              </div>

              {/* Historial previo de decisiones si existen */}
              {sol.decisiones && sol.decisiones.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50 -mx-5 -mb-5 p-4 rounded-b-xl">
                  <span className="text-xs font-bold text-slate-600 uppercase block mb-1">
                    Decisión Nivel 1 registrada:
                  </span>
                  {sol.decisiones.map((dec) => (
                    <div key={dec.id} className="text-xs text-slate-600 flex items-center justify-between">
                      <span>
                        Nivel {dec.nivel} por {dec.decisor_nombre || dec.rol_evaluador}:{" "}
                        <strong className="text-emerald-700">{dec.decision}</strong>{" "}
                        {dec.comentarios && `("${dec.comentarios}")`}
                      </span>
                      <span className="text-slate-400">
                        {new Date(dec.fecha_decision).toLocaleDateString("es-CR")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  ) : (
    <div className="mt-6 space-y-4">
      {/* Filtros de estado para Tiempo Adicional */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase mr-1">Filtrar por estado:</span>
        {(["TODOS", "PENDIENTE", "APROBADO_TOTAL", "APROBADO_PARCIAL", "RECHAZADO"] as const).map((est) => (
          <button
            key={est}
            type="button"
            onClick={() => setFiltroEstadoTA(est)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              filtroEstadoTA === est
                ? "bg-[#009944] text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {est === "TODOS"
              ? "Todos"
              : est === "PENDIENTE"
              ? "Pendientes"
              : est === "APROBADO_TOTAL"
              ? "Aprobados Total"
              : est === "APROBADO_PARCIAL"
              ? "Aprobados Parcial"
              : "Rechazados"}
          </button>
        ))}
      </div>

      {cargandoTA ? (
        <div className="py-16 text-center text-slate-500">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[#009944] mb-3" />
          <p className="text-sm font-medium">Cargando registros de tiempo adicional...</p>
        </div>
      ) : itemsTA.filter((i) => filtroEstadoTA === "TODOS" || i.estado_tiempo_adicional === filtroEstadoTA).length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">Sin tiempo adicional pendiente</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            No hay jornadas con tiempo adicional registrado bajo el filtro seleccionado.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {itemsTA
            .filter((i) => filtroEstadoTA === "TODOS" || i.estado_tiempo_adicional === filtroEstadoTA)
            .map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-800">
                      Jornada &bull; {item.fecha_jornada}
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        item.estado_tiempo_adicional === "PENDIENTE"
                          ? "bg-amber-100 text-amber-800"
                          : item.estado_tiempo_adicional === "APROBADO_TOTAL"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.estado_tiempo_adicional === "APROBADO_PARCIAL"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {item.estado_tiempo_adicional === "PENDIENTE"
                        ? "Pendiente de Aprobación"
                        : item.estado_tiempo_adicional === "APROBADO_TOTAL"
                        ? "Aprobado Total"
                        : item.estado_tiempo_adicional === "APROBADO_PARCIAL"
                        ? "Aprobado Parcial"
                        : "Rechazado"}
                    </span>
                  </div>

                  {tienePermiso("JORNADAS_TIEMPO_EXTRA_APROBAR") && (
                    <button
                      type="button"
                      onClick={() => abrirModalTA(item)}
                      className="inline-flex items-center px-3 py-1.5 bg-[#009944] hover:bg-[#007a37] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                    >
                      Resolver Tiempo Adicional
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 text-sm text-slate-600">
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block uppercase">Colaborador</span>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                      <User className="w-4 h-4 text-slate-500" />
                      {item.empleado_nombre || "Colaborador"}
                    </div>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      Cédula: {item.empleado_cedula || "N/A"}
                    </span>
                    {item.departamento_nombre && (
                      <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building className="w-3 h-3" />
                        {item.departamento_nombre}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-400 block uppercase">Tiempo Efectivo</span>
                    <div className="font-semibold text-emerald-700 mt-0.5">
                      {item.minutos_efectivos} minutos ({Number((item.minutos_efectivos / 60).toFixed(1))} hrs)
                    </div>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      Total pausas: {item.minutos_total_descansos || 0} min
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-400 block uppercase">Tiempo Adicional Detectado</span>
                    <div className="font-bold text-amber-800 mt-0.5">
                      {item.minutos_tiempo_adicional} minutos ({Number((item.minutos_tiempo_adicional / 60).toFixed(1))} hrs)
                    </div>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      Excedente sobre horario programado
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-400 block uppercase">Estado Resolución</span>
                    <div className="font-medium text-slate-800 mt-0.5">
                      {item.minutos_tiempo_adicional_aprobado > 0 ? (
                        <span className="text-emerald-700 font-bold">
                          {item.minutos_tiempo_adicional_aprobado} min aprobados
                        </span>
                      ) : item.estado_tiempo_adicional === "RECHAZADO" ? (
                        <span className="text-rose-700 font-semibold">0 min (Rechazado)</span>
                      ) : (
                        <span className="text-amber-700 italic">Pendiente de revisión humana</span>
                      )}
                    </div>
                    {item.usuario_aprobo_nombre && (
                      <span className="text-xs text-slate-400 block mt-0.5">
                        Por: {item.usuario_aprobo_nombre}
                      </span>
                    )}
                    {item.motivo_resolucion_ta && (
                      <p className="text-xs text-slate-500 italic mt-0.5 line-clamp-1">
                        "{item.motivo_resolucion_ta}"
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )}

  {/* Modal Decisión Tiempo Adicional (Fase 4B) */}
  {modalTAItem && (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#009944]" />
            Resolver Tiempo Adicional
          </h3>
          <button
            type="button"
            onClick={() => setModalTAItem(null)}
            className="text-slate-400 hover:text-slate-600 text-lg font-bold"
          >
            &times;
          </button>
        </div>

        {errorModalTA && (
          <div
            id="alerta-error-tiempo-adicional"
            className="mt-3 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-bold text-rose-900">{errorModalTA.titulo}</div>
              <div className="text-rose-700 mt-0.5 leading-relaxed">{errorModalTA.descripcion}</div>
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
          <div>
            <strong>Colaborador:</strong> {modalTAItem.empleado_nombre} ({modalTAItem.empleado_cedula})
          </div>
          <div>
            <strong>Fecha:</strong> {modalTAItem.fecha_jornada}
          </div>
          <div>
            <strong>Tiempo Efectivo Trabajado:</strong> {modalTAItem.minutos_efectivos} min
          </div>
          <div>
            <strong>Tiempo Adicional Detectado:</strong>{" "}
            <span className="font-bold text-amber-700">
              {modalTAItem.minutos_tiempo_adicional} minutos (
              {Number((modalTAItem.minutos_tiempo_adicional / 60).toFixed(1))} hrs)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 italic mt-1 pt-1 border-t border-slate-200">
            * El tiempo adicional no constituye horas extraordinarias reconocidas legalmente hasta su debida aprobación formal.
          </p>
        </div>

        <form onSubmit={handleConfirmarTA} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              Decisión de Resolución:
            </label>
            <div className="space-y-2">
              <label className="flex items-center p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="decisionTA"
                  value="APROBAR_TOTAL"
                  checked={decisionTA === "APROBAR_TOTAL"}
                  onChange={() => {
                    setDecisionTA("APROBAR_TOTAL");
                    setMinutosAprobadosTA(modalTAItem.minutos_tiempo_adicional);
                  }}
                  className="text-[#009944] focus:ring-[#009944]"
                />
                <span className="ml-2 text-xs font-medium text-slate-800">
                  Aprobar Total ({modalTAItem.minutos_tiempo_adicional} min)
                </span>
              </label>

              <label className="flex items-center p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="decisionTA"
                  value="APROBAR_PARCIAL"
                  checked={decisionTA === "APROBAR_PARCIAL"}
                  onChange={() => {
                    setDecisionTA("APROBAR_PARCIAL");
                    if (
                      minutosAprobadosTA <= 0 ||
                      minutosAprobadosTA > modalTAItem.minutos_tiempo_adicional
                    ) {
                      setMinutosAprobadosTA(Math.floor(modalTAItem.minutos_tiempo_adicional / 2));
                    }
                  }}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-xs font-medium text-slate-800">
                  Aprobar Parcialmente
                </span>
              </label>

              {decisionTA === "APROBAR_PARCIAL" && (
                <div className="ml-6 pl-2 border-l-2 border-blue-400">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Minutos a aprobar (máximo {modalTAItem.minutos_tiempo_adicional}):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={modalTAItem.minutos_tiempo_adicional}
                    value={minutosAprobadosTA}
                    onChange={(e) => setMinutosAprobadosTA(parseInt(e.target.value, 10) || 0)}
                    className="w-32 text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              )}

              <label className="flex items-center p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="decisionTA"
                  value="RECHAZAR"
                  checked={decisionTA === "RECHAZAR"}
                  onChange={() => {
                    setDecisionTA("RECHAZAR");
                    setMinutosAprobadosTA(0);
                  }}
                  className="text-rose-600 focus:ring-rose-500"
                />
                <span className="ml-2 text-xs font-medium text-rose-700">
                  Rechazar Tiempo Adicional (0 min reconocidos)
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Motivo o Justificación de la Decisión *
            </label>
            <textarea
              rows={3}
              value={motivoTA}
              onChange={(e) => setMotivoTA(e.target.value)}
              placeholder="Indique la justificación operativa o causa de la resolución..."
              required
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModalTAItem(null)}
              className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={procesandoTA}
              className={`px-4 py-2 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                decisionTA === "RECHAZAR"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-[#009944] hover:bg-[#007a37]"
              }`}
            >
              {procesandoTA ? "Procesando..." : "Confirmar Resolución"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )}

      {/* Modal Decisión (Aprobar / Rechazar) */}
      {solicitudSeleccionada && accionTipo && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {accionTipo === "aprobar" ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-[#009944]" />
                    Aprobar Solicitud
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-rose-600" />
                    Rechazar Solicitud
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSolicitudSeleccionada(null);
                  setAccionTipo(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {errorModal && (
              <div className="mt-3 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="font-bold text-rose-900">{errorModal.titulo}</div>
                  <div className="text-rose-700 mt-0.5 leading-relaxed">{errorModal.descripcion}</div>
                </div>
              </div>
            )}

            <div className="mt-4 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <div>
                <strong>Colaborador:</strong> {solicitudSeleccionada.empleado_nombre} ({solicitudSeleccionada.empleado_cedula})
              </div>
              <div>
                <strong>Tipo:</strong> {getTipoEtiqueta(solicitudSeleccionada.tipo_solicitud)}
              </div>
              <div>
                <strong>Período:</strong> {solicitudSeleccionada.fecha_inicio} al {solicitudSeleccionada.fecha_fin}
              </div>
              <div>
                <strong>Motivo:</strong> "{solicitudSeleccionada.motivo}"
              </div>
            </div>

            <form onSubmit={handleConfirmarDecision} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  {accionTipo === "rechazar" ? (
                    <span className="text-rose-700 font-bold">
                      Motivo o Justificación del Rechazo (Obligatorio) *
                    </span>
                  ) : (
                    <span>Observación / Comentario (Opcional)</span>
                  )}
                </label>
                <textarea
                  rows={3}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder={
                    accionTipo === "rechazar"
                      ? "Indique la justificación formal del rechazo según políticas laborales..."
                      : "Notas opcionales de aprobación..."
                  }
                  required={accionTipo === "rechazar"}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2.5 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setSolicitudSeleccionada(null);
                    setAccionTipo(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className={`px-4 py-2 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                    accionTipo === "aprobar"
                      ? "bg-[#009944] hover:bg-[#007a37]"
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {procesando
                    ? "Registrando..."
                    : accionTipo === "aprobar"
                    ? "Confirmar Aprobación"
                    : "Confirmar Rechazo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
