import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import { MisSolicitudesView } from "./MisSolicitudesView";
import { BandejaSolicitudesView } from "./BandejaSolicitudesView";
import { FeriadosView } from "./FeriadosView";
import { ConsolidacionJornadasView } from "./ConsolidacionJornadasView";
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  LogIn,
  LogOut as LogOutIcon,
  Utensils,
  Coffee,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  FileText,
  CheckSquare,
} from "lucide-react";

interface JornadaAutoservicio {
  id: string;
  fecha_jornada: string;
  estado_jornada: string;
  hora_entrada_efectiva?: string;
  hora_salida_efectiva?: string;
  minutos_tiempo_total?: number;
  minutos_efectivos?: number;
  minutos_descansos?: number;
  cumplimiento_porcentaje?: number;
}

interface MarcaAutoservicio {
  id: string;
  tipo_marca: string;
  timestamp_servidor: string;
}

interface HorarioAutoservicio {
  id?: string;
  horario_id?: string;
  nombre?: string;
  hora_entrada?: string;
  hora_salida?: string;
  hora_entrada_programada?: string;
  hora_salida_programada?: string;
  tolerancia_minutos?: number;
  tolerancia_entrada_minutos?: number;
  es_laborable?: boolean;
}

interface EstadoAutoservicio {
  empleado: {
    id: string;
    cedula: string;
    nombre_completo: string;
    departamento_id: string;
    puesto_id: string;
  };
  jornada_actual?: JornadaAutoservicio | null;
  jornada_abierta?: JornadaAutoservicio | null;
  ultima_marca: MarcaAutoservicio | null;
  horario_aplicable: HorarioAutoservicio | null;
  acciones_validas: string[];
}

interface ConfirmacionAutoservicio {
  tipo_marca: string;
  timestamp_servidor: string;
  estado_jornada: string;
}

export const AutoservicioView: React.FC = () => {
  const { usuario, tienePermiso } = useAuth();
  const [seccionActiva, setSeccionActiva] = useState<"marcaje" | "solicitudes" | "jornadas" | "aprobaciones" | "feriados">("marcaje");
  const [cargando, setCargando] = useState<boolean>(true);
  const [registrando, setRegistrando] = useState<boolean>(false);
  const [estado, setEstado] = useState<EstadoAutoservicio | null>(null);
  const [confirmacion, setConfirmacion] = useState<ConfirmacionAutoservicio | null>(null);
  const [errorMsg, setErrorMsg] = useState<{ titulo: string; descripcion: string; codigo?: string } | null>(null);
  const [relojLocal, setRelojLocal] = useState<string>("");

  const puedeAprobar =
    usuario?.rol === "SUPERVISOR_SEGURIDAD" ||
    usuario?.rol === "TALENTO_HUMANO" ||
    usuario?.rol === "ADMINISTRADOR";

  // Reloj informativo de UX en navegador (no es autoridad temporal de backend)
  useEffect(() => {
    const actualizarReloj = () => {
      const ahora = new Date();
      setRelojLocal(
        ahora.toLocaleTimeString("es-CR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    actualizarReloj();
    const interval = setInterval(actualizarReloj, 1000);
    return () => clearInterval(interval);
  }, []);

  // Carga del estado actual desde GET /api/autoservicio/estado (con invalidación de caché atómica)
  const cargarEstado = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        exito: boolean;
        datos: EstadoAutoservicio;
      }>(`/api/autoservicio/estado?_t=${Date.now()}`);

      if (res.exito && res.datos) {
        setEstado(res.datos);
      }
    } catch (err) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(friendly);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  // Registro de marca: Envía ÚNICAMENTE { tipo_marca }
  const handleRegistrarMarca = async (tipoMarca: string) => {
    if (registrando) return;

    setRegistrando(true);
    setErrorMsg(null);
    setConfirmacion(null);

    // Nuevo Idempotency-Key UUIDv4 por cada acción intencional
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await apiRequest<{
        exito: boolean;
        datos: {
          marca: MarcaAutoservicio;
          jornada: JornadaAutoservicio;
        };
      }>("/api/autoservicio/marcas", {
        method: "POST",
        idempotencyKey,
        // REGLA ESTRICTA: El body funcional contiene ÚNICAMENTE { tipo_marca }
        body: {
          tipo_marca: tipoMarca,
        },
      });

      if (res.exito && res.datos) {
        setConfirmacion({
          tipo_marca: res.datos.marca.tipo_marca,
          timestamp_servidor: res.datos.marca.timestamp_servidor,
          estado_jornada: res.datos.jornada.estado_jornada,
        });

        // Actualizar el estado de inmediato consultando backend
        await cargarEstado();
      }
    } catch (err) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(friendly);
    } finally {
      setRegistrando(false);
    }
  };

  const formatearHoraServidor = (isoStr?: string) => {
    if (!isoStr) return "Sin registros previos";
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("es-CR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  const formatearFecha = () => {
    const ahora = new Date();
    return ahora.toLocaleDateString("es-CR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getBotonConfig = (tipo: string) => {
    switch (tipo) {
      case "ENTRADA":
        return {
          etiqueta: "Registrar Entrada",
          icono: LogIn,
          className: "bg-[#009944] hover:bg-[#008039] active:bg-[#00662d] text-white shadow-sm",
        };
      case "SALIDA":
        return {
          etiqueta: "Registrar Salida",
          icono: LogOutIcon,
          className: "bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white shadow-sm",
        };
      case "INICIO_ALMUERZO":
        return {
          etiqueta: "Iniciar Almuerzo",
          icono: Utensils,
          className: "bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm",
        };
      case "FIN_ALMUERZO":
        return {
          etiqueta: "Finalizar Almuerzo",
          icono: Utensils,
          className: "bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-sm",
        };
      case "INICIO_DESAYUNO":
        return {
          etiqueta: "Iniciar Desayuno",
          icono: Coffee,
          className: "bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm",
        };
      case "FIN_DESAYUNO":
        return {
          etiqueta: "Finalizar Desayuno",
          icono: Coffee,
          className: "bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-sm",
        };
      case "INICIO_CAFE":
        return {
          etiqueta: "Iniciar Pausa Café",
          icono: Coffee,
          className: "bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm",
        };
      case "FIN_CAFE":
        return {
          etiqueta: "Finalizar Pausa Café",
          icono: Coffee,
          className: "bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-sm",
        };
      default:
        return {
          etiqueta: tipo.replace("_", " "),
          icono: CheckCircle2,
          className: "bg-[#009944] hover:bg-[#008039] text-white",
        };
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Tarjeta de Bienvenida y Fecha Actual */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#009944]/5 rounded-full pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#e8f7ed] text-[#009944] mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Autoservicio del Colaborador</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Hola, {usuario?.nombre_completo?.split(" ")[0] || "Colaborador"}
            </h2>
            <p className="text-sm text-slate-500 capitalize mt-0.5">
              {formatearFecha()}
            </p>
          </div>

          <div className="flex items-center space-x-3 self-start sm:self-auto">
            {/* Reloj informativo en vivo */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Hora Local (CR)
              </span>
              <span className="font-mono text-lg font-black text-[#009944]">
                {relojLocal || "--:--:--"}
              </span>
            </div>

            <button
              type="button"
              id="btn-recargar-autoservicio"
              onClick={cargarEstado}
              disabled={cargando || registrando}
              title="Actualizar estado"
              className="p-2.5 text-slate-500 hover:text-[#009944] hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors"
              aria-label="Actualizar estado"
            >
              <RefreshCw className={`w-5 h-5 ${cargando ? "animate-spin text-[#009944]" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Navegación por Secciones de Autoservicio */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          type="button"
          id="tab-autoservicio-marcaje"
          onClick={() => setSeccionActiva("marcaje")}
          className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            seccionActiva === "marcaje"
              ? "bg-[#009944] text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Clock className="w-4 h-4 mr-2" />
          Marcaje Digital
        </button>

        <button
          type="button"
          id="tab-autoservicio-solicitudes"
          onClick={() => setSeccionActiva("solicitudes")}
          className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            seccionActiva === "solicitudes"
              ? "bg-[#009944] text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <FileText className="w-4 h-4 mr-2" />
          Mis Solicitudes
        </button>

        {(tienePermiso("JORNADAS_PERSONALES_VER") || tienePermiso("JORNADAS_DETALLE_VER")) && (
          <button
            type="button"
            id="tab-autoservicio-jornadas"
            onClick={() => setSeccionActiva("jornadas")}
            className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
              seccionActiva === "jornadas"
                ? "bg-[#009944] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200"
            }`}
          >
            <Clock className="w-4 h-4 mr-2" />
            Mis Jornadas y Pausas
          </button>
        )}

        {puedeAprobar && (
          <button
            type="button"
            id="tab-autoservicio-aprobaciones"
            onClick={() => setSeccionActiva("aprobaciones")}
            className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
              seccionActiva === "aprobaciones"
                ? "bg-[#009944] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200"
            }`}
          >
            <CheckSquare className="w-4 h-4 mr-2" />
            Solicitudes Pendientes
          </button>
        )}

        <button
          type="button"
          id="tab-autoservicio-feriados"
          onClick={() => setSeccionActiva("feriados")}
          className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            seccionActiva === "feriados"
              ? "bg-[#009944] text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Feriados Oficiales
        </button>
      </div>

      {/* Renderizado Condicional de la Sección Seleccionada */}
      {seccionActiva === "solicitudes" ? (
        <MisSolicitudesView />
      ) : seccionActiva === "jornadas" ? (
        <ConsolidacionJornadasView modoPersonal={true} />
      ) : seccionActiva === "aprobaciones" && puedeAprobar ? (
        <BandejaSolicitudesView />
      ) : seccionActiva === "feriados" ? (
        <FeriadosView />
      ) : (
        <>
          {/* Banner de Feedback de Error */}
      {errorMsg && (
        <div
          id="alerta-error-autoservicio"
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3 text-red-800"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-bold text-red-900">{errorMsg.titulo}</p>
              {errorMsg.codigo && (
                <span className="font-mono text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                  {errorMsg.codigo}
                </span>
              )}
            </div>
            <p className="mt-1 text-red-700">{errorMsg.descripcion}</p>
          </div>
        </div>
      )}

      {/* Banner de Confirmación Exitosa (201 Created) */}
      {confirmacion && (
        <div
          id="alerta-exito-autoservicio"
          className="bg-emerald-50 border-2 border-[#009944] rounded-xl p-5 flex items-start space-x-3 shadow-xs animate-fadeIn"
        >
          <div className="p-2 bg-[#009944] text-white rounded-lg shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-[#009944] uppercase tracking-wider block">
              Registro Procesado Correctamente
            </span>
            <p className="text-base font-bold text-slate-900 mt-0.5">
              {confirmacion.tipo_marca.replace("_", " ")}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Hora oficial del servidor:{" "}
              <strong className="font-mono text-[#009944]">
                {formatearHoraServidor(confirmacion.timestamp_servidor)}
              </strong>{" "}
              &bull; Jornada: <span className="font-semibold">{confirmacion.estado_jornada}</span>
            </p>
          </div>
        </div>
      )}

      {/* Tarjeta de Estado Actual y Horario */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="font-bold text-slate-900 text-base flex items-center">
            <Clock className="w-4 h-4 mr-2 text-[#009944]" />
            Estado Actual de la Jornada
          </h3>
          {(() => {
            const jActiva = estado?.jornada_abierta || null;
            const jActual = estado?.jornada_actual || null;
            const estaAbierta = Boolean(
              jActiva && (
                jActiva.estado_jornada === "ABIERTA" ||
                (jActiva as any).estado === "ABIERTA"
              )
            );
            const estaCerrada = Boolean(
              !estaAbierta && jActual && jActual.estado_jornada !== "ABIERTA"
            );

            if (estaAbierta) {
              return (
                <span
                  id="badge-estado-jornada"
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                >
                  JORNADA ABIERTA
                </span>
              );
            }
            if (estaCerrada) {
              return (
                <span
                  id="badge-estado-jornada"
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300"
                >
                  JORNADA FINALIZADA
                </span>
              );
            }
            return (
              <span
                id="badge-estado-jornada"
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-300"
              >
                SIN JORNADA ACTIVA
              </span>
            );
          })()}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Horario Programado
            </span>
            {estado?.horario_aplicable ? (
              <div className="font-bold text-slate-800">
                {(estado.horario_aplicable.hora_entrada || estado.horario_aplicable.hora_entrada_programada || "--:--")} a{" "}
                {(estado.horario_aplicable.hora_salida || estado.horario_aplicable.hora_salida_programada || "--:--")}
                <span className="text-xs font-normal text-slate-500 block mt-0.5">
                  Tolerancia: {estado.horario_aplicable.tolerancia_minutos ?? estado.horario_aplicable.tolerancia_entrada_minutos ?? 0} minutos
                </span>
              </div>
            ) : (
              <span className="text-slate-500 italic">No asignado para hoy</span>
            )}
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Última Marca Realizada
            </span>
            {estado?.ultima_marca ? (
              <div>
                <span className="font-bold text-slate-900">
                  {estado.ultima_marca.tipo_marca.replace("_", " ")}
                </span>
                <span className="text-xs font-mono text-[#009944] block mt-0.5 font-semibold">
                  {formatearHoraServidor(estado.ultima_marca.timestamp_servidor)}
                </span>
              </div>
            ) : (
              <span className="text-slate-500 italic">No registra marcas hoy</span>
            )}
          </div>
        </div>

        {/* Sección de Marcaje Táctil */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Acciones Válidas Disponibles
            </h4>
            <span className="text-[11px] text-slate-400">Calculadas por servidor</span>
          </div>

          {cargando ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#009944]" />
              Consultando estado de jornada...
            </div>
          ) : estado?.acciones_validas && estado.acciones_validas.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {estado.acciones_validas.map((tipo) => {
                const cfg = getBotonConfig(tipo);
                const IconComp = cfg.icono;
                return (
                  <button
                    key={tipo}
                    type="button"
                    id={`btn-autoservicio-${tipo.toLowerCase()}`}
                    disabled={registrando}
                    onClick={() => handleRegistrarMarca(tipo)}
                    className={`min-h-[56px] px-5 py-4 rounded-xl font-bold text-base flex items-center justify-center space-x-3 transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${cfg.className}`}
                  >
                    {registrando ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <IconComp className="w-5 h-5 shrink-0" />
                    )}
                    <span>{cfg.etiqueta}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-slate-600 text-sm">
              <ShieldCheck className="w-8 h-8 text-[#009944] mx-auto mb-2" />
              <p className="font-bold text-slate-800">
                {estado?.jornada_actual && estado.jornada_actual.estado_jornada !== "ABIERTA"
                  ? "Jornada finalizada correctamente"
                  : "No hay marcas pendientes"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {estado?.jornada_actual && estado.jornada_actual.estado_jornada !== "ABIERTA"
                  ? "No tiene una jornada abierta actualmente."
                  : "La jornada está cerrada o no requiere transiciones en este momento."}
              </p>
              {estado?.jornada_actual && estado.jornada_actual.estado_jornada !== "ABIERTA" && (
                <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block font-medium">Tiempo Total</span>
                    <strong className="text-slate-800 text-sm">
                      {Math.floor((estado.jornada_actual.minutos_tiempo_total || 0) / 60)}h {(estado.jornada_actual.minutos_tiempo_total || 0) % 60}m
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block font-medium">Efectivo</span>
                    <strong className="text-emerald-700 text-sm">
                      {Math.floor((estado.jornada_actual.minutos_efectivos || 0) / 60)}h {(estado.jornada_actual.minutos_efectivos || 0) % 60}m
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block font-medium">Pausas</span>
                    <strong className="text-amber-700 text-sm">
                      {estado.jornada_actual.minutos_descansos || 0} min
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block font-medium">Cumplimiento</span>
                    <strong className="text-slate-800 text-sm">
                      {estado.jornada_actual.cumplimiento_porcentaje ?? 100}%
                    </strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};
