import React, { useState, useEffect } from "react";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Clock,
  Calendar,
  Coffee,
  Utensils,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Info,
  Search,
  Filter,
  X,
  Building2,
  AlertTriangle,
} from "lucide-react";

interface SnapshotHorarioModal {
  horario_id_origen?: string;
  hora_entrada_programada?: string;
  hora_salida_programada?: string;
  tolerancia_minutos?: number;
  minutos_esperados?: number;
  cruza_medianoche?: boolean;
}

interface IncidenciaRelacionada {
  id: string;
  tipo_incidencia: string;
  descripcion: string;
  minutos_afectados: number;
  estado: string;
  resolucion_motivo?: string | null;
  usuario_resolvio_nombre?: string | null;
  fecha_resolucion?: string | null;
}

export interface JornadaConsolidada {
  id: string;
  empleado_id: string;
  empleado_nombre?: string;
  empleado_cedula?: string;
  departamento_nombre?: string;
  fecha_jornada: string;
  estado_jornada: string;
  hora_entrada_marcada?: string | null;
  hora_entrada_calculo?: string | null;
  origen_entrada_calculo?: string;
  hora_salida_marcada?: string | null;
  hora_salida_calculo?: string | null;
  origen_salida_calculo?: string;
  es_salida_regularizada?: boolean;
  es_feriado?: boolean;
  snapshot_horario?: SnapshotHorarioModal;
  minutos_tiempo_total: number;
  minutos_desayuno: number;
  minutos_almuerzo: number;
  minutos_cafe: number;
  minutos_total_descansos: number;
  minutos_efectivos: number;
  minutos_tardanza: number;
  minutos_salida_anticipada: number;
  minutos_tiempo_adicional: number;
  minutos_tiempo_adicional_aprobado: number;
  estado_tiempo_adicional: "NO_APLICA" | "PENDIENTE" | "APROBADO_TOTAL" | "APROBADO_PARCIAL" | "RECHAZADO";
  cumplimiento_porcentaje: number;
  resultados_derivados?: {
    hora_entrada_efectiva?: string;
    hora_salida_efectiva?: string;
    minutos_tiempo_total?: number;
    minutos_efectivos?: number;
    minutos_desayuno?: number;
    minutos_almuerzo?: number;
    minutos_cafe?: number;
    minutos_descansos?: number;
    minutos_tiempo_adicional?: number;
    minutos_tiempo_adicional_aprobado?: number;
    estado_tiempo_adicional?: string;
  };
}

interface MarcaDetalle {
  id: string;
  tipo_marca: string;
  timestamp_servidor: string;
  origen_marca: string;
  estado_marca: string;
}

interface ConsolidacionJornadasViewProps {
  modoPersonal?: boolean;
  filtroFechaDesdeInicial?: string;
  filtroFechaHastaInicial?: string;
  filtroEstadoInicial?: string;
}

export const ConsolidacionJornadasView: React.FC<ConsolidacionJornadasViewProps> = ({
  modoPersonal = false,
  filtroFechaDesdeInicial = "",
  filtroFechaHastaInicial = "",
  filtroEstadoInicial = "TODOS",
}) => {
  const { usuario } = useAuth();
  const [jornadas, setJornadas] = useState<JornadaConsolidada[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros administrativos
  const [filtroFechaDesde, setFiltroFechaDesde] = useState<string>(filtroFechaDesdeInicial);
  const [filtroFechaHasta, setFiltroFechaHasta] = useState<string>(filtroFechaHastaInicial);
  const [filtroEstado, setFiltroEstado] = useState<string>(filtroEstadoInicial);
  const [filtroBusqueda, setFiltroBusqueda] = useState<string>("");

  // Modal detalle de jornada
  const [jornadaDetalle, setJornadaDetalle] = useState<JornadaConsolidada | null>(null);
  const [marcasDetalle, setMarcasDetalle] = useState<MarcaDetalle[]>([]);
  const [incidenciasDetalle, setIncidenciasDetalle] = useState<IncidenciaRelacionada[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState<boolean>(false);

  const formatearMinutosAHoras = (minutos?: number): string => {
    if (minutos === undefined || minutos === null || minutos <= 0) return "0 min";
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h === 0) return `${m} min`;
    return `${h}h ${m}m (${minutos} min)`;
  };

  const formatearHoraIso = (iso?: string | null): string => {
    if (!iso) return "--:--";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("es-CR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  const obtenerEtiquetaOrigen = (origen?: string, esRegularizada?: boolean): { texto: string; color: string } => {
    if (esRegularizada || origen === "SALIDA_PROGRAMADA_REGULARIZADA" || origen === "REGULARIZACION_MANUAL") {
      return { texto: "SALIDA REGULARIZADA", color: "bg-purple-100 text-purple-800 border-purple-200" };
    }
    if (origen === "CORRECCION_ADMINISTRATIVA" || origen === "CORRECCION") {
      return { texto: "CORRECCIÓN ADMINISTRATIVA", color: "bg-blue-100 text-blue-800 border-blue-200" };
    }
    if (origen === "MARCA_FISICA") {
      return { texto: "MARCA FÍSICA", color: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    }
    return { texto: origen || "MARCA FÍSICA", color: "bg-slate-100 text-slate-700 border-slate-200" };
  };

  const cargarJornadas = async () => {
    setCargando(true);
    setError(null);
    try {
      let url = modoPersonal ? "/api/jornadas/mis-jornadas" : "/api/jornadas";
      const params = new URLSearchParams();

      if (filtroFechaDesde) params.append("fecha_desde", filtroFechaDesde);
      if (filtroFechaHasta) params.append("fecha_hasta", filtroFechaHasta);
      if (filtroEstado && filtroEstado !== "TODOS") params.append("estado_jornada", filtroEstado);
      if (!modoPersonal && filtroBusqueda.trim()) params.append("busqueda", filtroBusqueda.trim());

      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await apiRequest<{ exito: boolean; datos: JornadaConsolidada[] }>(url);
      if (res.exito) {
        setJornadas(res.datos || []);
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setError(`${friendly.titulo}: ${friendly.descripcion}`);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarJornadas();
  }, [modoPersonal]);

  const aplicarFiltros = (e: React.FormEvent) => {
    e.preventDefault();
    cargarJornadas();
  };

  const limpiarFiltros = () => {
    setFiltroFechaDesde("");
    setFiltroFechaHasta("");
    setFiltroEstado("TODOS");
    setFiltroBusqueda("");
    setTimeout(() => {
      cargarJornadas();
    }, 0);
  };

  const verDetalle = async (jornada: JornadaConsolidada) => {
    setJornadaDetalle(jornada);
    setCargandoDetalle(true);
    setMarcasDetalle([]);
    setIncidenciasDetalle([]);
    try {
      const res = await apiRequest<{
        exito: boolean;
        datos: {
          jornada?: JornadaConsolidada;
          marcas?: MarcaDetalle[];
          incidencias?: IncidenciaRelacionada[];
        };
      }>(`/api/jornadas/${jornada.id}/detalle`);

      if (res.exito && res.datos) {
        if (res.datos.marcas) setMarcasDetalle(res.datos.marcas);
        if (res.datos.incidencias) setIncidenciasDetalle(res.datos.incidencias);
        if (res.datos.jornada) setJornadaDetalle(res.datos.jornada);
      }
    } catch {
      // Dejar marcas e incidencias vacías si hay error
    } finally {
      setCargandoDetalle(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado descriptivo */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-6 h-6 text-[#009944]" />
            {modoPersonal
              ? "Mis Jornadas y Pausas (Autoservicio)"
              : "Consolidación de Jornadas, Pausas y Horas de Trabajo"}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {modoPersonal
              ? "Consulta personal de sus marcas registradas, pausas tomadas y tiempo efectivo propio."
              : "Supervisión y auditoría de jornadas laborales, descansos efectivos y tiempo adicional según gobierno RBAC + ABAC."}
          </p>
        </div>
        <button
          type="button"
          onClick={cargarJornadas}
          disabled={cargando}
          className="inline-flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors shrink-0"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${cargando ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* Regla normativa visible con redacción oficial corregida (Requisito 9) */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#009944] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-emerald-950">
            Criterio de cálculo de jornada utilizado por el sistema:
          </p>
          <p>
            <strong>Tiempo Total de Jornada:</strong> Salida Efectiva de Cálculo &minus; Entrada Efectiva de Cálculo.
          </p>
          <p>
            <strong>Tiempo Efectivo Trabajado:</strong> Tiempo Total &minus; Pausas Reales Marcadas (Desayuno, Almuerzo, Café).
          </p>
          <p className="text-emerald-800">
            * Los horarios y pausas reglamentarias se fundamentan en la normativa interna aplicable de Agroquímica Industrial RIMAC S.A. Las pausas no tomadas por el colaborador no se convierten automáticamente en tiempo extraordinario sin aprobación jerárquica previa.
          </p>
        </div>
      </div>

      {/* Barra de Filtros (Requisito 7) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
        <form onSubmit={aplicarFiltros} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 uppercase tracking-wider">
              Desde
            </label>
            <input
              type="date"
              id="filtro-fecha-desde"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 uppercase tracking-wider">
              Hasta
            </label>
            <input
              type="date"
              id="filtro-fecha-hasta"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
            />
          </div>

          {!modoPersonal && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 uppercase tracking-wider">
                Colaborador (Nombre / Cédula)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  id="filtro-busqueda-colaborador"
                  placeholder="Buscar colaborador..."
                  value={filtroBusqueda}
                  onChange={(e) => setFiltroBusqueda(e.target.value)}
                  className="w-full text-xs sm:text-sm pl-9 pr-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 uppercase tracking-wider">
              Estado de Jornada
            </label>
            <select
              id="filtro-estado-jornada"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#009944] focus:outline-hidden bg-white"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="ABIERTA">ABIERTA (En curso)</option>
              <option value="CERRADA">CERRADA NORMAL</option>
              <option value="REGULARIZADA">REGULARIZADA</option>
              <option value="REGISTRO_INCOMPLETO">REGISTRO INCOMPLETO</option>
              <option value="AUSENCIA_INJUSTIFICADA">AUSENCIA INJUSTIFICADA</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              id="btn-aplicar-filtros"
              className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-[#009944] hover:bg-[#007f38] text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shadow-xs"
            >
              <Filter className="w-4 h-4 mr-1.5" />
              Filtrar
            </button>
            {(filtroFechaDesde || filtroFechaHasta || filtroEstado !== "TODOS" || filtroBusqueda) && (
              <button
                type="button"
                id="btn-limpiar-filtros"
                onClick={limpiarFiltros}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs sm:text-sm font-semibold transition-colors"
                title="Limpiar filtros"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Lista de Jornadas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-[#009944] mb-2" />
            <p className="text-sm font-medium">Consolidando registros de jornada...</p>
          </div>
        ) : jornadas.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="text-base font-semibold text-slate-600">No hay jornadas registradas</p>
            <p className="text-xs text-slate-400 mt-1">
              Las jornadas consolidadas aparecerán automáticamente al registrar marcas de entrada y salida o ajustar los filtros.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  {!modoPersonal && <th className="px-4 py-3">Colaborador</th>}
                  <th className="px-4 py-3">Entrada / Salida</th>
                  <th className="px-4 py-3">Pausas Reales</th>
                  <th className="px-4 py-3">Tiempo Total</th>
                  <th className="px-4 py-3">Tiempo Efectivo</th>
                  <th className="px-4 py-3">Tiempo Adicional</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jornadas.map((j) => {
                  const pausaTotal =
                    (j.minutos_desayuno || 0) + (j.minutos_almuerzo || 0) + (j.minutos_cafe || 0);

                  const tiempoTotal =
                    j.minutos_tiempo_total ?? j.resultados_derivados?.minutos_tiempo_total ?? 0;
                  const tiempoEfectivo =
                    j.minutos_efectivos ?? j.resultados_derivados?.minutos_efectivos ?? 0;
                  const tiempoAdicional =
                    j.minutos_tiempo_adicional ?? j.resultados_derivados?.minutos_tiempo_adicional ?? 0;

                  const esAbierta = j.estado_jornada === "ABIERTA" || !j.hora_salida_calculo;

                  return (
                    <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-800">
                        {j.fecha_jornada}
                        {j.es_feriado && (
                          <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded font-semibold">
                            Feriado
                          </span>
                        )}
                      </td>
                      {!modoPersonal && (
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-slate-800">
                              {j.empleado_nombre || (
                                <span className="text-amber-700 italic">
                                  Colaborador no encontrado ({j.empleado_id ? j.empleado_id.slice(0, 8) : "N/D"})
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <span>{j.empleado_cedula || ""}</span>
                              {j.departamento_nombre && (
                                <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[10px]">
                                  {j.departamento_nombre}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        <div className="flex flex-col text-xs space-y-0.5">
                          <span>
                            <strong className="text-slate-700">Ent:</strong> {formatearHoraIso(j.hora_entrada_calculo)}
                          </span>
                          <span>
                            <strong className="text-slate-700">Sal:</strong>{" "}
                            {esAbierta ? (
                              <span className="text-amber-600 italic font-medium">Pendiente</span>
                            ) : (
                              formatearHoraIso(j.hora_salida_calculo)
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        <div className="text-xs space-y-0.5">
                          <p>
                            ☕ Des: <span className="font-medium">{j.minutos_desayuno || 0}m</span>
                          </p>
                          <p>
                            🍽️ Alm: <span className="font-medium">{j.minutos_almuerzo || 0}m</span>
                          </p>
                          <p>
                            ☕ Café: <span className="font-medium">{j.minutos_cafe || 0}m</span>
                          </p>
                          <p className="font-semibold text-slate-700 border-t border-slate-200 pt-0.5">
                            Total: {pausaTotal} min
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                        {esAbierta ? (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-amber-50 text-amber-800 rounded-md">
                            En curso
                          </span>
                        ) : (
                          formatearMinutosAHoras(tiempoTotal)
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-bold text-[#009944]">
                        {esAbierta ? (
                          <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-md">
                            Pendiente de cierre
                          </span>
                        ) : (
                          formatearMinutosAHoras(tiempoEfectivo)
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {esAbierta ? (
                          <span className="text-slate-400 text-xs">Pendiente de cierre</span>
                        ) : tiempoAdicional > 0 ? (
                          <div>
                            <span className="font-bold text-amber-700">
                              {formatearMinutosAHoras(tiempoAdicional)}
                            </span>
                            <div className="mt-0.5">
                              {j.estado_tiempo_adicional === "APROBADO_TOTAL" ? (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                                  Aprobado Total ({j.minutos_tiempo_adicional_aprobado}m)
                                </span>
                              ) : j.estado_tiempo_adicional === "APROBADO_PARCIAL" ? (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800 rounded-full">
                                  Aprobado Parcial ({j.minutos_tiempo_adicional_aprobado}m)
                                </span>
                              ) : j.estado_tiempo_adicional === "RECHAZADO" ? (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-800 rounded-full">
                                  Rechazado (0m)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-full">
                                  Pendiente Aprobación
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">0 min (No aplica)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-xs font-semibold rounded-md ${
                            j.estado_jornada === "CERRADA_NORMAL" || j.estado_jornada === "CERRADA"
                              ? "bg-slate-100 text-slate-700"
                              : j.estado_jornada === "ABIERTA"
                              ? "bg-emerald-100 text-[#009944]"
                              : j.estado_jornada === "REGULARIZADA"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {j.estado_jornada}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => verDetalle(j)}
                          className="inline-flex items-center px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Detalle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Desglose Exhaustivo de Jornada (Requisito 8) */}
      {jornadaDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#009944]" />
                  Desglose Exhaustivo de Jornada &bull; {jornadaDetalle.fecha_jornada}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {jornadaDetalle.empleado_nombre || "Colaborador"} {jornadaDetalle.empleado_cedula ? `(${jornadaDetalle.empleado_cedula})` : ""}
                  {jornadaDetalle.departamento_nombre ? ` &bull; ${jornadaDetalle.departamento_nombre}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setJornadaDetalle(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-sm">
              {/* Tarjetas resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-[11px] text-slate-500 uppercase font-semibold">Tiempo Total</p>
                  <p className="text-base font-bold text-slate-800 mt-1">
                    {jornadaDetalle.estado_jornada === "ABIERTA" || !jornadaDetalle.hora_salida_calculo
                      ? "En curso"
                      : formatearMinutosAHoras(jornadaDetalle.minutos_tiempo_total)}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-[11px] text-slate-500 uppercase font-semibold">Total Pausas</p>
                  <p className="text-base font-bold text-slate-800 mt-1">
                    {jornadaDetalle.minutos_total_descansos || 0} min
                  </p>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <p className="text-[11px] text-emerald-800 uppercase font-semibold">Tiempo Efectivo</p>
                  <p className="text-base font-bold text-[#009944] mt-1">
                    {jornadaDetalle.estado_jornada === "ABIERTA" || !jornadaDetalle.hora_salida_calculo
                      ? "Pendiente de cierre"
                      : formatearMinutosAHoras(jornadaDetalle.minutos_efectivos)}
                  </p>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <p className="text-[11px] text-amber-800 uppercase font-semibold">Tiempo Adicional</p>
                  <p className="text-base font-bold text-amber-900 mt-1">
                    {jornadaDetalle.estado_jornada === "ABIERTA"
                      ? "Pendiente"
                      : formatearMinutosAHoras(jornadaDetalle.minutos_tiempo_adicional)}
                  </p>
                </div>
              </div>

              {/* Horario Programado vs Efectivo */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Horario Programado vs. Registros Efectivos:
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <p className="font-semibold text-slate-700">Entrada Oficial:</p>
                    <p>
                      Programada:{" "}
                      <span className="font-medium text-slate-800">
                        {jornadaDetalle.snapshot_horario?.hora_entrada_programada || "07:00"}
                      </span>
                    </p>
                    <p>
                      Efectiva:{" "}
                      <span className="font-bold text-slate-900">
                        {formatearHoraIso(jornadaDetalle.hora_entrada_calculo)}
                      </span>
                    </p>
                    <div className="pt-1">
                      {(() => {
                        const etiq = obtenerEtiquetaOrigen(jornadaDetalle.origen_entrada_calculo);
                        return (
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${etiq.color}`}>
                            Origen: {etiq.texto}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <p className="font-semibold text-slate-700">Salida Oficial:</p>
                    <p>
                      Programada:{" "}
                      <span className="font-medium text-slate-800">
                        {jornadaDetalle.snapshot_horario?.hora_salida_programada || "16:30"}
                      </span>
                    </p>
                    <p>
                      Efectiva:{" "}
                      <span className="font-bold text-slate-900">
                        {jornadaDetalle.estado_jornada === "ABIERTA" || !jornadaDetalle.hora_salida_calculo
                          ? "Pendiente de cierre"
                          : formatearHoraIso(jornadaDetalle.hora_salida_calculo)}
                      </span>
                    </p>
                    <div className="pt-1">
                      {(() => {
                        const etiq = obtenerEtiquetaOrigen(
                          jornadaDetalle.origen_salida_calculo,
                          jornadaDetalle.es_salida_regularizada
                        );
                        return (
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${etiq.color}`}>
                            Origen: {etiq.texto}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalle de Pausas Reglamentarias */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Desglose de Pausas Reales Registradas:
                </h4>
                <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">☕ Desayuno</p>
                    <p className="text-sm font-bold text-slate-800">{jornadaDetalle.minutos_desayuno || 0} min</p>
                    <p className="text-[10px] text-slate-400">Pausa reglamentaria (15m)</p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">🍽️ Almuerzo</p>
                    <p className="text-sm font-bold text-slate-800">{jornadaDetalle.minutos_almuerzo || 0} min</p>
                    <p className="text-[10px] text-slate-400">Pausa reglamentaria (30m)</p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">☕ Café</p>
                    <p className="text-sm font-bold text-slate-800">{jornadaDetalle.minutos_cafe || 0} min</p>
                    <p className="text-[10px] text-slate-400">Pausa reglamentaria (15m)</p>
                  </div>
                </div>
              </div>

              {/* Marcas de la Jornada */}
              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">
                  Marcas de la Jornada:
                </h4>
                {cargandoDetalle ? (
                  <div className="p-4 text-center text-slate-400 text-xs">Cargando marcas físicas...</div>
                ) : marcasDetalle.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No hay marcas físicas activas registradas para esta jornada.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-3 py-2">Tipo Marca</th>
                          <th className="px-3 py-2">Hora Oficial Servidor</th>
                          <th className="px-3 py-2">Origen de Marca</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {marcasDetalle.map((m) => (
                          <tr key={m.id}>
                            <td className="px-3 py-2 font-medium text-slate-800">{m.tipo_marca}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {new Date(m.timestamp_servidor).toLocaleString("es-CR")}
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-[11px]">{m.origen_marca}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Incidencias Relacionadas */}
              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Incidencias Registradas en la Fecha:
                </h4>
                {incidenciasDetalle.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200">
                    Sin incidencias registradas para esta jornada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {incidenciasDetalle.map((inc) => (
                      <div
                        key={inc.id}
                        className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-900">{inc.tipo_incidencia}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              inc.estado === "ABIERTA"
                                ? "bg-red-100 text-red-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {inc.estado}
                          </span>
                        </div>
                        <p className="text-slate-700">{inc.descripcion}</p>
                        {inc.resolucion_motivo && (
                          <p className="text-[11px] text-slate-500 border-t border-amber-200 pt-1 mt-1">
                            Resolución: {inc.resolucion_motivo}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setJornadaDetalle(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
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
