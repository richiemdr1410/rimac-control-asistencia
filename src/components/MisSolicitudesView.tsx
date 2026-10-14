import React, { useState, useEffect } from "react";
import { apiRequest } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  FileText,
  PlusCircle,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Paperclip,
  RefreshCw,
  Info,
} from "lucide-react";

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

export const MisSolicitudesView: React.FC = () => {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [filtroEstado, setFiltroEstado] = useState<string>("TODAS");

  // Formulario de nueva solicitud
  const [tipo, setTipo] = useState<string>("PERMISO");
  const [fechaInicio, setFechaInicio] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState<string>(new Date().toISOString().slice(0, 10));
  const [esParcial, setEsParcial] = useState<boolean>(false);
  const [horaInicio, setHoraInicio] = useState<string>("08:00");
  const [horaFin, setHoraFin] = useState<string>("12:00");
  const [motivo, setMotivo] = useState<string>("");
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [guardando, setGuardando] = useState<boolean>(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargarSolicitudes = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiRequest<{ exito: boolean; datos: Solicitud[] }>(
        "/api/solicitudes/mis-solicitudes"
      );
      if (res.exito) {
        setSolicitudes(res.datos || []);
      }
    } catch (err: any) {
      setError(err.mensaje || "Error al cargar las solicitudes.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarSolicitudes();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setErrorForm("Por favor indique el motivo de la solicitud.");
      return;
    }

    setGuardando(true);
    setErrorForm(null);

    try {
      let fechaHoraInicio: string | undefined = undefined;
      let fechaHoraFin: string | undefined = undefined;

      if (esParcial && horaInicio && horaFin) {
        fechaHoraInicio = `${fechaInicio}T${horaInicio}:00-06:00`;
        fechaHoraFin = `${fechaInicio}T${horaFin}:00-06:00`;
      }

      const payload: any = {
        tipo_solicitud: tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: esParcial ? fechaInicio : fechaFin,
        fecha_hora_inicio: fechaHoraInicio,
        fecha_hora_fin: fechaHoraFin,
        motivo: motivo.trim(),
      };

      if (nombreArchivo.trim()) {
        payload.evidencia = {
          nombre_archivo: nombreArchivo.trim(),
          tipo_mime: "application/pdf",
        };
      }

      const res = await apiRequest<{ exito: boolean; datos: Solicitud }>("/api/solicitudes", {
        method: "POST",
        body: payload,
      });

      if (res.exito) {
        setModalAbierto(false);
        setMotivo("");
        setNombreArchivo("");
        setEsParcial(false);
        await cargarSolicitudes();
      }
    } catch (err: any) {
      setErrorForm(err.mensaje || "No se pudo registrar la solicitud.");
    } finally {
      setGuardando(false);
    }
  };

  const getBadgeEstado = (estado: string) => {
    switch (estado) {
      case "APROBADA":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Aprobada
          </span>
        );
      case "EN_REVISION":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            <Clock className="w-3.5 h-3.5 mr-1 text-blue-600" />
            En Revisión (Nivel 2)
          </span>
        );
      case "RECHAZADA":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <XCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
            Rechazada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
            Pendiente
          </span>
        );
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

  const solicitudesFiltradas = solicitudes.filter((s) => {
    if (filtroEstado === "TODAS") return true;
    return s.estado === filtroEstado;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-7 h-7 text-[#009944]" />
            Mis Solicitudes de Tiempo y Justificaciones
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestión personal de permisos, vacaciones y regularizaciones de jornada para {usuario?.nombre_completo}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={cargarSolicitudes}
            disabled={cargando}
            className="inline-flex items-center px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </button>

          <button
            type="button"
            id="btn-nueva-solicitud"
            onClick={() => {
              setErrorForm(null);
              setModalAbierto(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-[#009944] text-white rounded-lg text-sm font-semibold shadow-xs hover:bg-[#007a37] transition-colors"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Nueva Solicitud
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase mr-2">Estado:</span>
        {["TODAS", "PENDIENTE", "EN_REVISION", "APROBADA", "RECHAZADA"].map((est) => (
          <button
            key={est}
            onClick={() => setFiltroEstado(est)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filtroEstado === est
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
            }`}
          >
            {est.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Lista de Solicitudes */}
      {cargando ? (
        <div className="py-16 text-center text-slate-500">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[#009944] mb-3" />
          <p className="text-sm font-medium">Cargando solicitudes...</p>
        </div>
      ) : error ? (
        <div className="mt-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : solicitudesFiltradas.length === 0 ? (
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">No hay solicitudes registradas</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {filtroEstado === "TODAS"
              ? "Aún no ha creado ninguna solicitud de permiso o justificación. Utilice el botón 'Nueva Solicitud' para crear una."
              : `No se encontraron solicitudes con estado '${filtroEstado}'.`}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {solicitudesFiltradas.map((sol) => (
            <div
              key={sol.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-800">
                    {getTipoEtiqueta(sol.tipo_solicitud)}
                  </span>
                  {getBadgeEstado(sol.estado)}
                </div>
                <span className="text-xs text-slate-400">
                  Registrada: {sol.creado_en ? new Date(sol.creado_en).toLocaleString("es-CR") : "Reciente"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-sm text-slate-600">
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
                  <span className="text-xs font-semibold text-slate-400 block uppercase">Tiempo</span>
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

              {/* Historial de Decisiones si existen */}
              {sol.decisiones && sol.decisiones.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50 -mx-5 -mb-5 p-4 rounded-b-xl">
                  <span className="text-xs font-bold text-slate-600 uppercase block mb-2">
                    Historial de Aprobación / Revisión:
                  </span>
                  <div className="space-y-2">
                    {sol.decisiones.map((dec) => (
                      <div key={dec.id} className="text-xs flex items-start justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                        <div>
                          <span className="font-semibold text-slate-700">
                            Nivel {dec.nivel} ({dec.rol_evaluador.replace(/_/g, " ")}):{" "}
                          </span>
                          <span
                            className={
                              dec.decision === "APROBADA"
                                ? "text-emerald-700 font-bold"
                                : "text-rose-700 font-bold"
                            }
                          >
                            {dec.decision}
                          </span>
                          {dec.decisor_nombre && (
                            <span className="text-slate-500 ml-1">por {dec.decisor_nombre}</span>
                          )}
                          {dec.comentarios && (
                            <p className="text-slate-600 mt-1 italic">
                              Nota: "{dec.comentarios}"
                            </p>
                          )}
                        </div>
                        <span className="text-slate-400 text-[10px]">
                          {new Date(dec.fecha_decision).toLocaleDateString("es-CR")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Nueva Solicitud */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-[#009944]" />
                Registrar Solicitud
              </h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {errorForm && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorForm}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Tipo de Solicitud
                </label>
                <select
                  id="select-tipo-solicitud"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
                >
                  <option value="PERMISO">Permiso Parcial / Laboral</option>
                  <option value="VACACIONES">Vacaciones</option>
                  <option value="JUSTIFICACION_AUSENCIA">Justificación de Ausencia</option>
                  <option value="JUSTIFICACION_TARDIA">Justificación de Llegada Tardía</option>
                  <option value="JUSTIFICACION_MARCA_OMITIDA">Justificación de Marca Omitida</option>
                </select>
              </div>

              {/* Rango de Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Fecha Inicio
                  </label>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    required
                    className="w-full text-sm border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Fecha Fin
                  </label>
                  <input
                    type="date"
                    value={esParcial ? fechaInicio : fechaFin}
                    disabled={esParcial}
                    onChange={(e) => setFechaFin(e.target.value)}
                    required
                    className="w-full text-sm border border-slate-300 rounded-lg p-2.5 text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Checkbox Permiso Parcial */}
              {(tipo === "PERMISO" || tipo === "JUSTIFICACION_TARDIA") && (
                <div className="pt-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={esParcial}
                      onChange={(e) => setEsParcial(e.target.checked)}
                      className="rounded text-[#009944] focus:ring-[#009944] h-4 w-4"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Cubrir únicamente intervalo parcial de la jornada (horas específicas)
                    </span>
                  </label>

                  {esParcial && (
                    <div className="grid grid-cols-2 gap-3 mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Hora Inicio
                        </label>
                        <input
                          type="time"
                          value={horaInicio}
                          onChange={(e) => setHoraInicio(e.target.value)}
                          className="w-full text-sm border border-slate-300 rounded-md p-2 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Hora Fin
                        </label>
                        <input
                          type="time"
                          value={horaFin}
                          onChange={(e) => setHoraFin(e.target.value)}
                          className="w-full text-sm border border-slate-300 rounded-md p-2 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Motivo */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Motivo / Justificación
                </label>
                <textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Detalle el motivo laboral o personal de la solicitud..."
                  required
                  className="w-full text-sm border border-slate-300 rounded-lg p-2.5 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
                />
              </div>

              {/* Evidencia opcional */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1 flex items-center justify-between">
                  <span>Evidencia o Documento de Respaldo</span>
                  <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                </label>
                <input
                  type="text"
                  value={nombreArchivo}
                  onChange={(e) => setNombreArchivo(e.target.value)}
                  placeholder="Ej. Constancia_Medica_CCSS.pdf"
                  className="w-full text-sm border border-slate-300 rounded-lg p-2.5 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  Almacena metadatos y referencia de auditoría sin cargar binarios a base de datos.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-guardar-solicitud"
                  disabled={guardando}
                  className="px-4 py-2 bg-[#009944] text-white rounded-lg text-sm font-semibold hover:bg-[#007a37] disabled:opacity-50 transition-colors"
                >
                  {guardando ? "Registrando..." : "Enviar Solicitud"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
