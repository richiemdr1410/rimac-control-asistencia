import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import { type VistaType } from "./Navbar";
import {
  BarChart3,
  Calendar,
  Users,
  Clock,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Download,
  Filter,
  RotateCcw,
  Search,
  Shield,
  Briefcase,
  TrendingUp,
  AlertCircle,
  Building,
  CheckSquare,
  XCircle,
  ArrowRight,
  Eye,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CalendarDays,
  ExternalLink,
} from "lucide-react";

type PestañaReporte =
  | "dashboard"
  | "resumen_horas"
  | "asistencia"
  | "horas"
  | "incidencias"
  | "solicitudes"
  | "feriados"
  | "correcciones"
  | "auditoria";

interface DashboardKpis {
  colaboradores_activos: number;
  jornadas_registradas: number;
  jornadas_cerradas: number;
  jornadas_abiertas: number;
  tardias: number;
  ausencias: number;
  incidencias_abiertas: number;
  solicitudes_pendientes: number;
  correcciones_pendientes: number;
  minutos_tiempo_adicional_detectado: number;
  minutos_tiempo_adicional_pendiente: number;
  minutos_tiempo_adicional_aprobado: number;
  tendencia_asistencia: Array<{
    fecha: string;
    registradas: number;
    tardias: number;
    ausencias: number;
  }>;
  incidencias_por_tipo: Array<{
    tipo: string;
    cantidad: number;
  }>;
  tiempo_efectivo_por_dia: Array<{
    fecha: string;
    minutos_efectivos: number;
    minutos_adicional: number;
  }>;
}

export interface ResumenHorasTotales {
  horas_programadas_minutos: number;
  horas_totales_minutos: number;
  pausas_acumuladas_minutos: number;
  horas_efectivas_minutos: number;
  tiempo_adicional_detectado_minutos: number;
  tiempo_adicional_aprobado_minutos: number;
}

export interface JornadaDetalleItem {
  id: string;
  fecha_jornada: string;
  horario_nombre: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  minutos_tiempo_total: number;
  minutos_total_descansos: number;
  minutos_desayuno: number;
  minutos_almuerzo: number;
  minutos_cafe: number;
  minutos_efectivos: number;
  minutos_tiempo_adicional: number;
  minutos_tiempo_adicional_aprobado: number;
  estado_tiempo_adicional: string | null;
  estado_jornada: string;
  es_salida_regularizada: boolean;
}

export interface ResumenHorasColaboradorItem {
  empleado_id: string;
  empleado_nombre: string;
  empleado_cedula: string;
  departamento_nombre: string;
  puesto_nombre?: string;
  jornadas_programadas: number;
  jornadas_registradas: number;
  minutos_programados: number;
  minutos_tiempo_total: number;
  minutos_desayuno: number;
  minutos_almuerzo: number;
  minutos_cafe: number;
  minutos_total_descansos: number;
  minutos_efectivos: number;
  minutos_tiempo_adicional: number;
  minutos_tiempo_adicional_aprobado: number;
  tardias: number;
  minutos_tardia: number;
  ausencias: number;
  jornadas_regularizadas: number;
  jornadas_detalle: JornadaDetalleItem[];
}

export interface DashboardReportesViewProps {
  onNavegar?: (destino: VistaType, params?: any) => void;
}

export const DashboardReportesView: React.FC<DashboardReportesViewProps> = ({ onNavegar }) => {
  const { usuario, tienePermiso, tieneSubordinados } = useAuth();

  // Pestaña activa
  const [pestaña, setPestaña] = useState<PestañaReporte>("dashboard");

  // Rango de fechas por defecto: Mes en curso
  const hoyStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const inicioMesStr = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  }, []);

  const [fechaDesde, setFechaDesde] = useState<string>(inicioMesStr);
  const [fechaHasta, setFechaHasta] = useState<string>(hoyStr);
  const [departamentoId, setDepartamentoId] = useState<string>("");
  const [empleadoId, setEmpleadoId] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [filtroTipoIncidencia, setFiltroTipoIncidencia] = useState<string>("");
  const [filtroTipoSolicitud, setFiltroTipoSolicitud] = useState<string>("");

  // Catálogos para filtros
  const [departamentos, setDepartamentos] = useState<Array<{ id: string; nombre: string }>>([]);
  const [empleadosFiltro, setEmpleadosFiltro] = useState<Array<{ id: string; nombre_completo: string; cedula: string }>>([]);

  // Estados de carga y error
  const [cargando, setCargando] = useState<boolean>(false);
  const [exportando, setExportando] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Datos
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [alcanceInfo, setAlcanceInfo] = useState<{ esInstitucional: boolean; esEquipo: boolean; esPersonal: boolean } | null>(null);
  const [reporteAsistencia, setReporteAsistencia] = useState<any[]>([]);
  const [reporteHoras, setReporteHoras] = useState<{ items: any[]; totales: any } | null>(null);
  const [reporteResumenHoras, setReporteResumenHoras] = useState<{
    items: ResumenHorasColaboradorItem[];
    totales: ResumenHorasTotales;
  } | null>(null);
  const [colaboradorExpandidoId, setColaboradorExpandidoId] = useState<string | null>(null);
  const [reporteIncidencias, setReporteIncidencias] = useState<any[]>([]);
  const [reporteSolicitudes, setReporteSolicitudes] = useState<any[]>([]);
  const [reporteFeriados, setReporteFeriados] = useState<any[]>([]);
  const [reporteCorrecciones, setReporteCorrecciones] = useState<any[]>([]);
  const [reporteAuditoria, setReporteAuditoria] = useState<any[]>([]);

  // Permisos efectivos
  const puedeExportar = tienePermiso("REPORTES_EXPORTAR");
  const puedeVerAuditoria = tienePermiso("AUDITORIA_VER");
  const esInstitucional = tienePermiso("REPORTES_INSTITUCIONALES_VER");
  const esSupervisorOEquipo = tienePermiso("REPORTES_EQUIPO_VER") && (usuario?.rol === "SUPERVISOR_SEGURIDAD" || tieneSubordinados);
  const esEmpleadoPersonal = !esInstitucional && !esSupervisorOEquipo;

  // Cargar catálogos iniciales
  useEffect(() => {
    async function cargarCatalogos() {
      try {
        if (esInstitucional) {
          const resDep = await apiRequest<{ exito: boolean; datos: any[] }>("/api/departamentos");
          if (resDep?.exito) setDepartamentos(resDep.datos || []);

          const resEmp = await apiRequest<{ exito: boolean; datos: any[] }>("/api/empleados?estado=ACTIVO&limite=300");
          if (resEmp?.exito) setEmpleadosFiltro(resEmp.datos || []);
        } else if (esSupervisorOEquipo && usuario?.empleado_id) {
          // Obtener subordinados directos para el filtro
          const resJornadas = await apiRequest<{ exito: boolean; datos: any[] }>("/api/jornadas?limite=100");
          if (resJornadas?.exito && resJornadas.datos) {
            const unicos = new Map<string, { id: string; nombre_completo: string; cedula: string }>();
            resJornadas.datos.forEach((j: any) => {
              if (j.empleado_id && j.empleado_nombre) {
                unicos.set(j.empleado_id, {
                  id: j.empleado_id,
                  nombre_completo: j.empleado_nombre,
                  cedula: j.empleado_cedula || "-",
                });
              }
            });
            setEmpleadosFiltro(Array.from(unicos.values()));
          }
        }
      } catch (e) {
        // Silencioso para no romper si no tiene permisos sobre catálogos directos
      }
    }
    cargarCatalogos();
  }, [esInstitucional, esSupervisorOEquipo, usuario?.empleado_id]);

  // Función constructora de query string
  const construirQueryString = (overrideTipo?: string) => {
    const params = new URLSearchParams();
    if (fechaDesde) params.append("fecha_desde", fechaDesde);
    if (fechaHasta) params.append("fecha_hasta", fechaHasta);
    if (departamentoId) params.append("departamento_id", departamentoId);
    if (empleadoId) params.append("empleado_id", empleadoId);
    if (busqueda) params.append("busqueda", busqueda);
    if (filtroEstado) params.append("estado", filtroEstado);
    if (filtroTipoIncidencia) params.append("tipo_incidencia", filtroTipoIncidencia);
    if (filtroTipoSolicitud) params.append("tipo_solicitud", filtroTipoSolicitud);
    if (overrideTipo) params.append("tipo", overrideTipo);
    return params.toString();
  };

  // Cargar datos según la pestaña activa
  const cargarDatos = async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const qs = construirQueryString();

      if (pestaña === "dashboard") {
        const res = await apiRequest<{ exito: boolean; datos: { kpis: DashboardKpis; alcance: any } }>(
          `/api/reportes/dashboard?${qs}`
        );
        if (res?.exito) {
          setKpis(res.datos.kpis);
          setAlcanceInfo(res.datos.alcance);
        }
      } else if (pestaña === "resumen_horas") {
        const res = await apiRequest<{ exito: boolean; datos: { items: ResumenHorasColaboradorItem[]; totales: ResumenHorasTotales } }>(
          `/api/reportes/resumen-horas?${qs}`
        );
        if (res?.exito) setReporteResumenHoras(res.datos);
      } else if (pestaña === "asistencia") {
        const res = await apiRequest<{ exito: boolean; datos: any[] }>(`/api/reportes/asistencia?${qs}`);
        if (res?.exito) setReporteAsistencia(res.datos || []);
      } else if (pestaña === "horas") {
        const res = await apiRequest<{ exito: boolean; datos: { items: any[]; totales: any } }>(
          `/api/reportes/horas-jornadas?${qs}`
        );
        if (res?.exito) setReporteHoras(res.datos);
      } else if (pestaña === "incidencias") {
        const res = await apiRequest<{ exito: boolean; datos: any[] }>(`/api/reportes/incidencias?${qs}`);
        if (res?.exito) setReporteIncidencias(res.datos || []);
      } else if (pestaña === "solicitudes") {
        const res = await apiRequest<{ exito: boolean; datos: any[] }>(`/api/reportes/solicitudes?${qs}`);
        if (res?.exito) setReporteSolicitudes(res.datos || []);
      } else if (pestaña === "feriados") {
        const res = await apiRequest<{ exito: boolean; datos: any[] }>(`/api/reportes/feriados?${qs}`);
        if (res?.exito) setReporteFeriados(res.datos || []);
      } else if (pestaña === "correcciones") {
        const res = await apiRequest<{ exito: boolean; datos: any[] }>(`/api/reportes/correcciones?${qs}`);
        if (res?.exito) setReporteCorrecciones(res.datos || []);
      } else if (pestaña === "auditoria") {
        const res = await apiRequest<{ exito: boolean; datos: any[] }>(`/api/reportes/auditoria?${qs}`);
        if (res?.exito) setReporteAuditoria(res.datos || []);
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [pestaña]);

  // Manejar exportación a CSV
  const handleExportarCsv = async () => {
    if (!puedeExportar) return;
    setExportando(true);
    try {
      let tipoExportacion = "asistencia";
      if (pestaña === "resumen_horas" || pestaña === "dashboard") tipoExportacion = "resumen-horas";
      else if (pestaña === "horas") tipoExportacion = "horas-jornadas";
      else if (pestaña === "incidencias") tipoExportacion = "incidencias";
      else if (pestaña === "solicitudes") tipoExportacion = "solicitudes";
      else if (pestaña === "feriados") tipoExportacion = "feriados";
      else if (pestaña === "correcciones") tipoExportacion = "correcciones";
      else if (pestaña === "auditoria") tipoExportacion = "auditoria";

      const qs = construirQueryString(tipoExportacion);
      const url = `/api/reportes/exportar?${qs}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "text/csv",
        },
      });

      if (!res.ok) {
        throw new Error(`Error en la descarga del reporte: ${res.status} ${res.statusText}`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `reporte_rimac_${tipoExportacion}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      setErrorMsg(`Error al exportar reporte: ${err.message}`);
    } finally {
      setExportando(false);
    }
  };

  // Presets de fechas quincenales y mensuales
  const aplicarPrimeraQuincena = () => {
    const ref = fechaDesde || hoyStr;
    const parts = ref.split("-");
    const y = parts[0];
    const m = parts[1];
    setFechaDesde(`${y}-${m}-01`);
    setFechaHasta(`${y}-${m}-15`);
  };

  const aplicarSegundaQuincena = () => {
    const ref = fechaDesde || hoyStr;
    const parts = ref.split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const mStr = String(m).padStart(2, "0");
    const ultimoDia = new Date(y, m, 0).getDate(); // Último día real del mes (28, 29, 30, 31)
    setFechaDesde(`${y}-${mStr}-16`);
    setFechaHasta(`${y}-${mStr}-${String(ultimoDia).padStart(2, "0")}`);
  };

  const aplicarMesActual = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const mStr = String(m).padStart(2, "0");
    const ultimoDia = new Date(y, m, 0).getDate();
    setFechaDesde(`${y}-${mStr}-01`);
    setFechaHasta(`${y}-${mStr}-${String(ultimoDia).padStart(2, "0")}`);
  };

  // Limpiar filtros
  const handleLimpiarFiltros = () => {
    setFechaDesde(inicioMesStr);
    setFechaHasta(hoyStr);
    setDepartamentoId("");
    setEmpleadoId("");
    setBusqueda("");
    setFiltroEstado("");
    setFiltroTipoIncidencia("");
    setFiltroTipoSolicitud("");
  };

  // Formateador de minutos a formato legible "82 h 35 min" determinista
  const formatoHorasMinutos = (totalMin?: number) => {
    if (totalMin === undefined || totalMin === null || isNaN(totalMin)) return "0 h 00 min";
    const abs = Math.abs(totalMin);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const prefijo = totalMin < 0 ? "-" : "";
    return `${prefijo}${h} h ${String(m).padStart(2, "0")} min`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Encabezado Principal */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-50 text-[#009944] rounded-lg border border-emerald-100">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Dashboard, Reportería y Analítica Operativa
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Consolidación laboral, indicadores de asistencia y trazabilidad &bull; Agroquímica Industrial RIMAC S.A.
              </p>
            </div>
          </div>
        </div>

        {/* Alcance del Usuario e Indicadores de Seguridad */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium">Alcance:</span>
            {esInstitucional ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                <Building className="w-3.5 h-3.5 mr-1" />
                Institucional Global
              </span>
            ) : esSupervisorOEquipo ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                <Users className="w-3.5 h-3.5 mr-1" />
                Equipo de Supervisión (ABAC)
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Clock className="w-3.5 h-3.5 mr-1" />
                Personal Autenticado
              </span>
            )}
          </div>

          {puedeExportar && (
            <button
              type="button"
              id="btn-exportar-reporte-csv"
              onClick={handleExportarCsv}
              disabled={exportando || cargando}
              className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-1.5 text-slate-500" />
              {exportando ? "Exportando..." : "Exportar CSV"}
            </button>
          )}
        </div>
      </div>

      {/* Alerta de Error si existiese */}
      {errorMsg && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg shadow-xs flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-800">{errorMsg}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs text-rose-600 hover:underline font-medium"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Panel de Filtros Globales (Ejecutados en Backend) */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center space-x-2 text-slate-800 font-semibold text-sm">
            <Filter className="w-4 h-4 text-[#009944]" />
            <span>Filtros Paramétricos del Reporte</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleLimpiarFiltros}
              className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Restablecer
            </button>
            <button
              type="button"
              id="btn-aplicar-filtros-reporte"
              onClick={cargarDatos}
              disabled={cargando}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold text-white bg-[#009944] hover:bg-[#007a37] rounded-md transition-colors shadow-xs disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5 mr-1" />
              {cargando ? "Actualizando..." : "Aplicar Filtros"}
            </button>
          </div>
        </div>

        {/* Accesos Rápidos Quincenales y Mensuales */}
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center">
            <CalendarDays className="w-3.5 h-3.5 mr-1 text-[#009944]" />
            Accesos Rápidos:
          </span>
          <button
            type="button"
            id="btn-preset-primera-quincena"
            onClick={aplicarPrimeraQuincena}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-[#009944] border border-slate-200 transition-colors"
          >
            1ª Quincena (1–15)
          </button>
          <button
            type="button"
            id="btn-preset-segunda-quincena"
            onClick={aplicarSegundaQuincena}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-[#009944] border border-slate-200 transition-colors"
          >
            2ª Quincena (16–Fin de Mes)
          </button>
          <button
            type="button"
            id="btn-preset-mes-actual"
            onClick={aplicarMesActual}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-[#009944] border border-slate-200 transition-colors"
          >
            Mes Completo
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
          {/* Fecha Desde */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Fecha Desde</label>
            <input
              type="date"
              id="filtro-fecha-desde"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#009944]"
            />
          </div>

          {/* Fecha Hasta */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Fecha Hasta</label>
            <input
              type="date"
              id="filtro-fecha-hasta"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#009944]"
            />
          </div>

          {/* Colaborador (solo si no es personal) */}
          {!esEmpleadoPersonal && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Colaborador</label>
              <select
                id="filtro-empleado"
                value={empleadoId}
                onChange={(e) => setEmpleadoId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#009944]"
              >
                <option value="">Todos los colaboradores autorizados</option>
                {empleadosFiltro.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre_completo} ({emp.cedula})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Departamento (solo institucional) */}
          {esInstitucional && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Departamento</label>
              <select
                id="filtro-departamento"
                value={departamentoId}
                onChange={(e) => setDepartamentoId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#009944]"
              >
                <option value="">Todos los departamentos</option>
                {departamentos.map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {dep.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Búsqueda por texto */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Búsqueda rápida</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                id="filtro-busqueda-texto"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, cédula o motivo..."
                className="w-full pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#009944]"
              />
            </div>
          </div>

          {/* Filtros específicos por pestaña */}
          {(pestaña === "horas" || pestaña === "dashboard") && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Estado de Jornada</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#009944]"
              >
                <option value="">Todos los estados</option>
                <option value="CERRADA">Cerrada</option>
                <option value="ABIERTA">Abierta / En Curso</option>
                <option value="REGULARIZADA">Regularizada</option>
              </select>
            </div>
          )}

          {pestaña === "incidencias" && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo de Incidencia</label>
              <select
                value={filtroTipoIncidencia}
                onChange={(e) => setFiltroTipoIncidencia(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#009944]"
              >
                <option value="">Todos los tipos</option>
                <option value="TARDIA">Tardía</option>
                <option value="SALIDA_ANTICIPADA">Salida Anticipada</option>
                <option value="SALIDA_OMITIDA">Salida Omitida</option>
                <option value="AUSENCIA_INJUSTIFICADA">Ausencia Injustificada</option>
                <option value="PAUSA_EXCEDIDA">Pausa Excedida</option>
              </select>
            </div>
          )}

          {pestaña === "solicitudes" && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo de Solicitud</label>
              <select
                value={filtroTipoSolicitud}
                onChange={(e) => setFiltroTipoSolicitud(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#009944]"
              >
                <option value="">Todos los tipos</option>
                <option value="PERMISO">Permiso</option>
                <option value="VACACIONES">Vacaciones</option>
                <option value="JUSTIFICACION_AUSENCIA">Justificación Ausencia</option>
                <option value="JUSTIFICACION_TARDIA">Justificación Tardía</option>
                <option value="JUSTIFICACION_MARCA_OMITIDA">Justificación Marca Omitida</option>
                <option value="INCAPACIDAD">Incapacidad</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Navegación de Pestañas de Reporte */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-x-auto">
        <nav className="flex space-x-1 p-1.5 min-w-max text-xs sm:text-sm font-medium">
          <button
            type="button"
            id="tab-reporte-dashboard"
            onClick={() => setPestaña("dashboard")}
            className={`px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              pestaña === "dashboard"
                ? "bg-[#009944] text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Dashboard Ejecutivo</span>
          </button>

          <button
            type="button"
            id="tab-reporte-resumen-horas"
            onClick={() => setPestaña("resumen_horas")}
            className={`px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              pestaña === "resumen_horas"
                ? "bg-[#009944] text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Resumen de Horas (Quincenal)</span>
          </button>

          <button
            type="button"
            id="tab-reporte-asistencia"
            onClick={() => setPestaña("asistencia")}
            className={`px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              pestaña === "asistencia"
                ? "bg-[#009944] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>A. Asistencia</span>
          </button>

          <button
            type="button"
            id="tab-reporte-horas"
            onClick={() => setPestaña("horas")}
            className={`px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              pestaña === "horas"
                ? "bg-[#009944] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>B. Horas y Jornadas</span>
          </button>

          <button
            type="button"
            id="tab-reporte-incidencias"
            onClick={() => setPestaña("incidencias")}
            className={`px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              pestaña === "incidencias"
                ? "bg-[#009944] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>C. Incidencias</span>
          </button>

          <button
            type="button"
            id="tab-reporte-solicitudes"
            onClick={() => setPestaña("solicitudes")}
            className={`px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              pestaña === "solicitudes"
                ? "bg-[#009944] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>D. Solicitudes</span>
          </button>

          <button
            type="button"
            id="tab-reporte-feriados"
            onClick={() => setPestaña("feriados")}
            className={`px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              pestaña === "feriados"
                ? "bg-[#009944] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>E. Feriados</span>
          </button>

          <button
            type="button"
            id="tab-reporte-correcciones"
            onClick={() => setPestaña("correcciones")}
            className={`px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
              pestaña === "correcciones"
                ? "bg-[#009944] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>F. Correcciones Marcas</span>
          </button>

          {puedeVerAuditoria && (
            <button
              type="button"
              id="tab-reporte-auditoria"
              onClick={() => setPestaña("auditoria")}
              className={`px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
                pestaña === "auditoria"
                  ? "bg-[#009944] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>G. Auditoría</span>
            </button>
          )}
        </nav>
      </div>

      {/* CONTENIDO PRINCIPAL SEGÚN PESTAÑA */}
      {cargando ? (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#009944] border-t-transparent" />
          <p className="mt-3 text-sm text-slate-600 font-medium">Consultando registros consolidados...</p>
        </div>
      ) : (
        <>
          {/* ========================================================
              PESTAÑA: DASHBOARD EJECUTIVO
             ======================================================== */}
          {pestaña === "dashboard" && kpis && (
            <div className="space-y-6">
              {/* Tarjetas KPI Superiores con Drill-Down y Seguridad RBAC/ABAC */}
              {(() => {
                const puedeDrillColaboradores = Boolean(
                  onNavegar && (tienePermiso("EMPLEADOS_VER") || tienePermiso("EMPLEADOS_ADMINISTRAR") || tienePermiso("ORGANIZACION_ADMINISTRAR"))
                );
                const puedeDrillJornadas = Boolean(
                  onNavegar &&
                  usuario?.rol !== "SEGURIDAD" &&
                  (((tienePermiso("JORNADAS_INSTITUCIONALES_VER") || tienePermiso("JORNADAS_DETALLE_VER")) && (usuario?.rol === "TALENTO_HUMANO" || usuario?.rol === "ADMINISTRADOR")) ||
                    ((tienePermiso("JORNADAS_EQUIPO_VER") || tienePermiso("JORNADAS_DETALLE_VER")) && (usuario?.rol === "SUPERVISOR_SEGURIDAD" || tieneSubordinados)))
                );
                const puedeDrillIncidencias = Boolean(
                  onNavegar && (tienePermiso("INCIDENCIAS_VER") || tienePermiso("INCIDENCIAS_EQUIPO_VER") || tienePermiso("INCIDENCIAS_INSTITUCIONALES_VER") || usuario?.rol === "ADMINISTRADOR" || usuario?.rol === "TALENTO_HUMANO" || usuario?.rol === "SUPERVISOR_SEGURIDAD")
                );
                const puedeDrillAprobaciones = Boolean(
                  onNavegar && (tienePermiso("SOLICITUDES_APROBAR") || usuario?.rol === "ADMINISTRADOR" || usuario?.rol === "TALENTO_HUMANO" || usuario?.rol === "SUPERVISOR_SEGURIDAD")
                );
                const puedeDrillMisSolicitudes = Boolean(onNavegar && usuario?.rol === "EMPLEADO");
                const puedeDrillCorrecciones = Boolean(
                  onNavegar && (tienePermiso("CORRECCIONES_MARCAS_GESTIONAR") || tienePermiso("INCIDENCIAS_INSTITUCIONALES_VER") || usuario?.rol === "ADMINISTRADOR" || usuario?.rol === "TALENTO_HUMANO" || usuario?.rol === "SUPERVISOR_SEGURIDAD")
                );
                const puedeDrillTiempoAdicional = Boolean(
                  onNavegar && (tienePermiso("TIEMPO_ADICIONAL_APROBAR") || tienePermiso("JORNADAS_EQUIPO_VER") || tienePermiso("JORNADAS_INSTITUCIONALES_VER") || usuario?.rol === "ADMINISTRADOR" || usuario?.rol === "TALENTO_HUMANO" || usuario?.rol === "SUPERVISOR_SEGURIDAD")
                );

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {/* 1. Colaboradores Activos */}
                    <div
                      id="card-kpi-colaboradores"
                      onClick={() => puedeDrillColaboradores && onNavegar?.("gestion_personal", { subPestana: "colaboradores" })}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillColaboradores ? "cursor-pointer hover:border-[#009944] hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Colaboradores Activos</span>
                          <span className="text-xl font-bold text-slate-900">{kpis.colaboradores_activos}</span>
                        </div>
                      </div>
                      {puedeDrillColaboradores && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#009944] transition-colors" />
                      )}
                    </div>

                    {/* 2. Jornadas Registradas */}
                    <div
                      id="card-kpi-jornadas-registradas"
                      onClick={() => puedeDrillJornadas && onNavegar?.("jornadas", { fechaDesde, fechaHasta, estado: "TODOS" })}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillJornadas ? "cursor-pointer hover:border-[#009944] hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-emerald-50 text-[#009944] rounded-lg">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Jornadas Registradas</span>
                          <span className="text-xl font-bold text-slate-900">{kpis.jornadas_registradas}</span>
                        </div>
                      </div>
                      {puedeDrillJornadas && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#009944] transition-colors" />
                      )}
                    </div>

                    {/* 3. Jornadas Cerradas */}
                    <div
                      id="card-kpi-jornadas-cerradas"
                      onClick={() => puedeDrillJornadas && onNavegar?.("jornadas", { fechaDesde, fechaHasta, estado: "CERRADA" })}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillJornadas ? "cursor-pointer hover:border-[#009944] hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-slate-50 text-slate-700 rounded-lg">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Jornadas Cerradas</span>
                          <span className="text-xl font-bold text-slate-900">{kpis.jornadas_cerradas}</span>
                        </div>
                      </div>
                      {puedeDrillJornadas && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#009944] transition-colors" />
                      )}
                    </div>

                    {/* 4. Jornadas Abiertas */}
                    <div
                      id="card-kpi-jornadas-abiertas"
                      onClick={() => puedeDrillJornadas && onNavegar?.("jornadas", { fechaDesde, fechaHasta, estado: "ABIERTA" })}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillJornadas ? "cursor-pointer hover:border-[#009944] hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                          <Clock className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Jornadas Abiertas</span>
                          <span className="text-xl font-bold text-amber-700">{kpis.jornadas_abiertas}</span>
                        </div>
                      </div>
                      {puedeDrillJornadas && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#009944] transition-colors" />
                      )}
                    </div>

                    {/* 5. Tardías */}
                    <div
                      id="card-kpi-tardias"
                      onClick={() => setPestaña("asistencia")}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all cursor-pointer hover:border-amber-500 hover:shadow-md group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Tardías Detectadas</span>
                          <span className="text-xl font-bold text-amber-800">{kpis.tardias}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                    </div>

                    {/* 6. Ausencias */}
                    <div
                      id="card-kpi-ausencias"
                      onClick={() => setPestaña("asistencia")}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all cursor-pointer hover:border-rose-500 hover:shadow-md group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
                          <XCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Ausencias Registradas</span>
                          <span className="text-xl font-bold text-rose-700">{kpis.ausencias}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-rose-600 transition-colors" />
                    </div>

                    {/* 7. Incidencias Abiertas */}
                    <div
                      id="card-kpi-incidencias-abiertas"
                      onClick={() => puedeDrillIncidencias && onNavegar?.("incidencias", { pestañaInicial: "incidencias", estado: "ABIERTA", fechaDesde, fechaHasta })}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillIncidencias ? "cursor-pointer hover:border-rose-500 hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Incidencias Abiertas</span>
                          <span className="text-xl font-bold text-rose-700">{kpis.incidencias_abiertas}</span>
                        </div>
                      </div>
                      {puedeDrillIncidencias && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-rose-600 transition-colors" />
                      )}
                    </div>

                    {/* 8. Solicitudes Pendientes */}
                    <div
                      id="card-kpi-solicitudes-pendientes"
                      onClick={() => {
                        if (puedeDrillAprobaciones) {
                          onNavegar?.("aprobaciones", { tabInicial: "solicitudes", estado: "PENDIENTE" });
                        } else if (puedeDrillMisSolicitudes) {
                          onNavegar?.("solicitudes", { estado: "PENDIENTE" });
                        }
                      }}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillAprobaciones || puedeDrillMisSolicitudes ? "cursor-pointer hover:border-blue-500 hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Solicitudes Pendientes</span>
                          <span className="text-xl font-bold text-blue-700">{kpis.solicitudes_pendientes}</span>
                        </div>
                      </div>
                      {(puedeDrillAprobaciones || puedeDrillMisSolicitudes) && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                      )}
                    </div>

                    {/* 9. Correcciones Pendientes */}
                    <div
                      id="card-kpi-correcciones-pendientes"
                      onClick={() => puedeDrillCorrecciones && onNavegar?.("incidencias", { pestañaInicial: "correcciones", estado: "PENDIENTE" })}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillCorrecciones ? "cursor-pointer hover:border-[#F15F2A] hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-orange-50 text-[#F15F2A] rounded-lg">
                          <CheckSquare className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Correcciones Marcas Pend.</span>
                          <span className="text-xl font-bold text-[#F15F2A]">{kpis.correcciones_pendientes}</span>
                        </div>
                      </div>
                      {puedeDrillCorrecciones && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#F15F2A] transition-colors" />
                      )}
                    </div>

                    {/* 10. Tiempo Adicional Detectado */}
                    <div
                      id="card-kpi-tiempo-adicional-detectado"
                      onClick={() => puedeDrillTiempoAdicional && onNavegar?.("aprobaciones", { tabInicial: "tiempo_adicional", estado: "TODOS", fechaDesde, fechaHasta })}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillTiempoAdicional ? "cursor-pointer hover:border-indigo-500 hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Tiempo Adicional Detectado</span>
                          <span className="text-lg font-bold text-indigo-900">
                            {formatoHorasMinutos(kpis.minutos_tiempo_adicional_detectado)}
                          </span>
                        </div>
                      </div>
                      {puedeDrillTiempoAdicional && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                      )}
                    </div>

                    {/* 11. Tiempo Adicional Pendiente */}
                    <div
                      id="card-kpi-tiempo-adicional-pendiente"
                      onClick={() => puedeDrillTiempoAdicional && onNavegar?.("aprobaciones", { tabInicial: "tiempo_adicional", estado: "PENDIENTE", fechaDesde, fechaHasta })}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillTiempoAdicional ? "cursor-pointer hover:border-amber-500 hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Tiempo Adicional Pendiente</span>
                          <span className="text-lg font-bold text-amber-800">
                            {formatoHorasMinutos(kpis.minutos_tiempo_adicional_pendiente)}
                          </span>
                        </div>
                      </div>
                      {puedeDrillTiempoAdicional && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                      )}
                    </div>

                    {/* 12. Tiempo Adicional Aprobado */}
                    <div
                      id="card-kpi-tiempo-adicional-aprobado"
                      onClick={() => puedeDrillTiempoAdicional && onNavegar?.("aprobaciones", { tabInicial: "tiempo_adicional", estado: "APROBADO", fechaDesde, fechaHasta })}
                      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between transition-all ${
                        puedeDrillTiempoAdicional ? "cursor-pointer hover:border-emerald-500 hover:shadow-md group" : ""
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                          <Check className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-medium block">Tiempo Adicional Aprobado</span>
                          <span className="text-lg font-bold text-emerald-800">
                            {formatoHorasMinutos(kpis.minutos_tiempo_adicional_aprobado)}
                          </span>
                        </div>
                      </div>
                      {puedeDrillTiempoAdicional && (
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Gráficos Analíticos Visuales y Prácticos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico 1: Tendencia de Jornadas y Tardías por Período */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center">
                      <BarChart3 className="w-4 h-4 mr-2 text-[#009944]" />
                      Tendencia de Asistencia y Puntualidad
                    </h3>
                    <span className="text-xs text-slate-500">Últimos días registrados</span>
                  </div>

                  {kpis.tendencia_asistencia.length === 0 ? (
                    <p className="text-xs text-slate-500 py-8 text-center">No hay registros en el rango seleccionado</p>
                  ) : (
                    <div className="space-y-3 pt-2">
                      {kpis.tendencia_asistencia.slice(0, 7).map((t, idx) => {
                        const total = Math.max(t.registradas, 1);
                        const pctTardias = Math.min(100, Math.round((t.tardias / total) * 100));
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-semibold text-slate-700">{t.fecha}</span>
                              <span className="text-slate-500">
                                {t.registradas} jornadas &bull; <span className="text-amber-600 font-medium">{t.tardias} tardías</span>
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                              <div
                                className="bg-[#009944] h-3 transition-all"
                                style={{ width: `${Math.max(15, 100 - pctTardias)}%` }}
                                title={`Puntuales: ${t.registradas - t.tardias}`}
                              />
                              {pctTardias > 0 && (
                                <div
                                  className="bg-amber-500 h-3 transition-all"
                                  style={{ width: `${pctTardias}%` }}
                                  title={`Tardías: ${t.tardias}`}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Gráfico 2: Distribución de Incidencias por Tipo */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-2 text-[#F15F2A]" />
                      Distribución de Incidencias por Tipología
                    </h3>
                    <span className="text-xs text-slate-500">Período consultado</span>
                  </div>

                  {kpis.incidencias_por_tipo.length === 0 ? (
                    <p className="text-xs text-slate-500 py-8 text-center">Sin incidencias en el período</p>
                  ) : (
                    <div className="space-y-3 pt-2">
                      {kpis.incidencias_por_tipo.map((inc, idx) => {
                        const maxVal = Math.max(...kpis.incidencias_por_tipo.map((i) => i.cantidad), 1);
                        const pct = Math.round((inc.cantidad / maxVal) * 100);
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-semibold text-slate-700">{inc.tipo.replace(/_/g, " ")}</span>
                              <span className="font-bold text-slate-900">{inc.cantidad} eventos</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                              <div
                                className="bg-[#F15F2A] h-2.5 rounded-full transition-all"
                                style={{ width: `${Math.max(5, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              PESTAÑA: REPORTE PRINCIPAL - RESUMEN DE HORAS POR COLABORADOR
             ======================================================== */}
          {pestaña === "resumen_horas" && reporteResumenHoras && (
            <div className="space-y-6">
              {/* Totales Consolidados del Período Filtrado */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-[#009944]" />
                    Totales Acumulados del Período ({fechaDesde} al {fechaHasta})
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {reporteResumenHoras.items.length} colaboradores consolidados
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                  {/* 1. Horas Programadas */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 font-medium block">Horas Programadas</span>
                    <span className="text-base font-bold text-slate-900 mt-0.5 block">
                      {formatoHorasMinutos(reporteResumenHoras.totales.horas_programadas_minutos)}
                    </span>
                  </div>

                  {/* 2. Horas Totales Registradas */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 font-medium block">Horas Totales Registradas</span>
                    <span className="text-base font-bold text-slate-900 mt-0.5 block">
                      {formatoHorasMinutos(reporteResumenHoras.totales.horas_totales_minutos)}
                    </span>
                  </div>

                  {/* 3. Pausas Acumuladas */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 font-medium block">Pausas Acumuladas</span>
                    <span className="text-base font-bold text-slate-700 mt-0.5 block">
                      {formatoHorasMinutos(reporteResumenHoras.totales.pausas_acumuladas_minutos)}
                    </span>
                  </div>

                  {/* 4. Horas Efectivas */}
                  <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                    <span className="text-emerald-700 font-medium block">Horas Efectivas Netas</span>
                    <span className="text-base font-bold text-[#009944] mt-0.5 block">
                      {formatoHorasMinutos(reporteResumenHoras.totales.horas_efectivas_minutos)}
                    </span>
                  </div>

                  {/* 5. Tiempo Adicional Detectado */}
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                    <span className="text-indigo-700 font-medium block">Tiempo Adicional Detectado</span>
                    <span className="text-base font-bold text-indigo-900 mt-0.5 block">
                      {formatoHorasMinutos(reporteResumenHoras.totales.tiempo_adicional_detectado_minutos)}
                    </span>
                  </div>

                  {/* 6. Tiempo Adicional Aprobado */}
                  <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                    <span className="text-emerald-700 font-medium block">Tiempo Adicional Aprobado</span>
                    <span className="text-base font-bold text-emerald-800 mt-0.5 block">
                      {formatoHorasMinutos(reporteResumenHoras.totales.tiempo_adicional_aprobado_minutos)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabla Principal: Consolidado por Colaborador */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Resumen de Horas por Colaborador &bull; Consolidado Quincenal / Período
                    </h3>
                    <p className="text-xs text-slate-500">
                      Una fila por colaborador con desglose de pausas, puntualidad y detalle diario desplegable
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {reporteResumenHoras.items.length} colaboradores en alcance
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-100 font-semibold text-slate-700">
                      <tr>
                        <th className="px-3 py-3 text-left">Colaborador</th>
                        <th className="px-3 py-3 text-left">Departamento</th>
                        <th className="px-2 py-3 text-center" title="Jornadas Programadas / Registradas">Jornadas (P/R)</th>
                        <th className="px-3 py-3 text-right">Tiempo Prog.</th>
                        <th className="px-3 py-3 text-right">Tiempo Total</th>
                        <th className="px-2 py-3 text-center" title="Desayuno">Des.</th>
                        <th className="px-2 py-3 text-center" title="Almuerzo">Alm.</th>
                        <th className="px-2 py-3 text-center" title="Café">Café</th>
                        <th className="px-3 py-3 text-right">Total Pausas</th>
                        <th className="px-3 py-3 text-right">Tiempo Efectivo</th>
                        <th className="px-3 py-3 text-right">T. Adic. Detect.</th>
                        <th className="px-3 py-3 text-right">T. Adic. Aprob.</th>
                        <th className="px-2 py-3 text-center">Tardías</th>
                        <th className="px-2 py-3 text-center">Ausencias</th>
                        <th className="px-2 py-3 text-center">Regul.</th>
                        <th className="px-3 py-3 text-center">Detalle Diario</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {reporteResumenHoras.items.length === 0 ? (
                        <tr>
                          <td colSpan={16} className="py-8 text-center text-slate-500 text-xs">
                            No se encontraron colaboradores en el período seleccionado.
                          </td>
                        </tr>
                      ) : (
                        reporteResumenHoras.items.map((row) => {
                          const estaExpandido = colaboradorExpandidoId === row.empleado_id;
                          return (
                            <React.Fragment key={row.empleado_id}>
                              <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-3 font-semibold text-slate-900">
                                  <div>{row.empleado_nombre}</div>
                                  <div className="text-[10px] text-slate-400 font-normal">Céd: {row.empleado_cedula}</div>
                                </td>
                                <td className="px-3 py-3 text-slate-600">
                                  <div>{row.departamento_nombre}</div>
                                  {row.puesto_nombre && (
                                    <div className="text-[10px] text-slate-400">{row.puesto_nombre}</div>
                                  )}
                                </td>
                                <td className="px-2 py-3 text-center font-medium text-slate-800">
                                  {row.jornadas_programadas} / <span className="font-bold text-slate-900">{row.jornadas_registradas}</span>
                                </td>
                                <td className="px-3 py-3 text-right text-slate-600">
                                  {formatoHorasMinutos(row.minutos_programados)}
                                </td>
                                <td className="px-3 py-3 text-right font-medium text-slate-900">
                                  {formatoHorasMinutos(row.minutos_tiempo_total)}
                                </td>
                                <td className="px-2 py-3 text-center text-slate-500">{row.minutos_desayuno}m</td>
                                <td className="px-2 py-3 text-center text-slate-500">{row.minutos_almuerzo}m</td>
                                <td className="px-2 py-3 text-center text-slate-500">{row.minutos_cafe}m</td>
                                <td className="px-3 py-3 text-right text-slate-600">
                                  {formatoHorasMinutos(row.minutos_total_descansos)}
                                </td>
                                <td className="px-3 py-3 text-right font-bold text-[#009944]">
                                  {formatoHorasMinutos(row.minutos_efectivos)}
                                </td>
                                <td className="px-3 py-3 text-right font-medium text-indigo-700">
                                  {row.minutos_tiempo_adicional > 0 ? formatoHorasMinutos(row.minutos_tiempo_adicional) : "-"}
                                </td>
                                <td className="px-3 py-3 text-right font-semibold text-emerald-800">
                                  {row.minutos_tiempo_adicional_aprobado > 0 ? formatoHorasMinutos(row.minutos_tiempo_adicional_aprobado) : "-"}
                                </td>
                                <td className="px-2 py-3 text-center">
                                  {row.tardias > 0 ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 text-[10px]">
                                      {row.tardias} ({row.minutos_tardia}m)
                                    </span>
                                  ) : (
                                    "0"
                                  )}
                                </td>
                                <td className="px-2 py-3 text-center">
                                  {row.ausencias > 0 ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800 text-[10px]">
                                      {row.ausencias}
                                    </span>
                                  ) : (
                                    "0"
                                  )}
                                </td>
                                <td className="px-2 py-3 text-center">
                                  {row.jornadas_regularizadas > 0 ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-800 text-[10px]">
                                      {row.jornadas_regularizadas}
                                    </span>
                                  ) : (
                                    "0"
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setColaboradorExpandidoId(estaExpandido ? null : row.empleado_id)}
                                    className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-md border border-slate-200 text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:text-[#009944] transition-colors"
                                  >
                                    {estaExpandido ? (
                                      <>
                                        <ChevronUp className="w-3.5 h-3.5 mr-1" />
                                        <span>Cerrar ({row.jornadas_detalle.length})</span>
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-3.5 h-3.5 mr-1" />
                                        <span>Ver ({row.jornadas_detalle.length})</span>
                                      </>
                                    )}
                                  </button>
                                </td>
                              </tr>

                              {/* Fila Desplegable con Detalle Diario de Jornadas */}
                              {estaExpandido && (
                                <tr className="bg-slate-50/70 border-b-2 border-slate-200">
                                  <td colSpan={16} className="px-4 py-3">
                                    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs">
                                      <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-bold text-slate-800 flex items-center">
                                          <Calendar className="w-3.5 h-3.5 mr-1.5 text-[#009944]" />
                                          Detalle Diario de Jornadas &bull; {row.empleado_nombre} ({row.jornadas_detalle.length} registros)
                                        </h4>
                                        <span className="text-[11px] text-slate-500 font-medium">
                                          Valores consolidados de jornada
                                        </span>
                                      </div>

                                      {row.jornadas_detalle.length === 0 ? (
                                        <p className="text-xs text-slate-500 py-3 text-center">
                                          No hay jornadas registradas para este colaborador en el rango filtrado.
                                        </p>
                                      ) : (
                                        <div className="overflow-x-auto">
                                          <table className="min-w-full divide-y divide-slate-200 text-xs">
                                            <thead className="bg-slate-100 font-semibold text-slate-600 text-[11px]">
                                              <tr>
                                                <th className="px-3 py-2 text-left">Fecha</th>
                                                <th className="px-3 py-2 text-left">Horario</th>
                                                <th className="px-3 py-2 text-center">Entrada</th>
                                                <th className="px-3 py-2 text-center">Salida</th>
                                                <th className="px-3 py-2 text-right">Tiempo Total</th>
                                                <th className="px-3 py-2 text-center">Pausas (D/A/C)</th>
                                                <th className="px-3 py-2 text-right">Tiempo Efectivo</th>
                                                <th className="px-3 py-2 text-right">Tiempo Adicional</th>
                                                <th className="px-3 py-2 text-center">Estado</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 bg-white">
                                              {row.jornadas_detalle.map((jd) => (
                                                <tr key={jd.id} className="hover:bg-slate-50">
                                                  <td className="px-3 py-2 font-medium text-slate-800">{jd.fecha_jornada}</td>
                                                  <td className="px-3 py-2 text-slate-600">{jd.horario_nombre}</td>
                                                  <td className="px-3 py-2 text-center text-slate-700">
                                                    {jd.hora_entrada
                                                      ? new Date(jd.hora_entrada).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })
                                                      : "-"}
                                                  </td>
                                                  <td className="px-3 py-2 text-center text-slate-700">
                                                    {jd.hora_salida
                                                      ? new Date(jd.hora_salida).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })
                                                      : jd.estado_jornada === "ABIERTA" ? "En curso" : "-"}
                                                  </td>
                                                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                                                    {formatoHorasMinutos(jd.minutos_tiempo_total)}
                                                  </td>
                                                  <td className="px-3 py-2 text-center text-slate-600">
                                                    {formatoHorasMinutos(jd.minutos_total_descansos)}
                                                    <span className="text-[10px] text-slate-400 block">
                                                      ({jd.minutos_desayuno}/{jd.minutos_almuerzo}/{jd.minutos_cafe})
                                                    </span>
                                                  </td>
                                                  <td className="px-3 py-2 text-right font-bold text-[#009944]">
                                                    {formatoHorasMinutos(jd.minutos_efectivos)}
                                                  </td>
                                                  <td className="px-3 py-2 text-right text-slate-800">
                                                    {jd.minutos_tiempo_adicional > 0 ? (
                                                      <div>
                                                        <span className="font-semibold text-indigo-700">
                                                          {formatoHorasMinutos(jd.minutos_tiempo_adicional)}
                                                        </span>
                                                        {jd.minutos_tiempo_adicional_aprobado > 0 && (
                                                          <span className="text-[10px] text-emerald-600 block">
                                                            Aprob: {formatoHorasMinutos(jd.minutos_tiempo_adicional_aprobado)}
                                                          </span>
                                                        )}
                                                      </div>
                                                    ) : (
                                                      "-"
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2 text-center">
                                                    <span
                                                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                        jd.estado_jornada === "CERRADA"
                                                          ? "bg-emerald-100 text-[#009944]"
                                                          : jd.estado_jornada === "ABIERTA"
                                                          ? "bg-amber-100 text-amber-800"
                                                          : "bg-blue-100 text-blue-800"
                                                      }`}
                                                    >
                                                      {jd.estado_jornada}
                                                    </span>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              PESTAÑA: REPORTE A - ASISTENCIA
             ======================================================== */}
          {pestaña === "asistencia" && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reporte A &bull; Consolidado de Asistencia</h3>
                  <p className="text-xs text-slate-500">
                    Jornadas programadas, registradas, omisiones y puntualidad por colaborador
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {reporteAsistencia.length} colaboradores listados
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100 font-semibold text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-3 py-3 text-left">Departamento</th>
                      <th className="px-3 py-3 text-center">Programadas</th>
                      <th className="px-3 py-3 text-center">Registradas</th>
                      <th className="px-3 py-3 text-center">Entradas</th>
                      <th className="px-3 py-3 text-center">Salidas</th>
                      <th className="px-3 py-3 text-center">Tardías</th>
                      <th className="px-3 py-3 text-center">Ausencias</th>
                      <th className="px-3 py-3 text-center">Salidas Omitidas</th>
                      <th className="px-3 py-3 text-center">Regularizadas</th>
                      <th className="px-4 py-3 text-right">Tiempo Efectivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {reporteAsistencia.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-8 text-center text-slate-500 text-xs">
                          No se encontraron registros de asistencia con los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      reporteAsistencia.map((row) => (
                        <tr key={row.empleado_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            <div>{row.empleado_nombre}</div>
                            <div className="text-[10px] text-slate-400 font-normal">Céd: {row.empleado_cedula}</div>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{row.departamento_nombre}</td>
                          <td className="px-3 py-3 text-center text-slate-700">{row.jornadas_programadas}</td>
                          <td className="px-3 py-3 text-center font-bold text-slate-900">{row.jornadas_registradas}</td>
                          <td className="px-3 py-3 text-center text-slate-600">{row.entradas_registradas}</td>
                          <td className="px-3 py-3 text-center text-slate-600">{row.salidas_registradas}</td>
                          <td className="px-3 py-3 text-center">
                            {row.tardias > 0 ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">
                                {row.tardias}
                              </span>
                            ) : (
                              "0"
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {row.ausencias > 0 ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800">
                                {row.ausencias}
                              </span>
                            ) : (
                              "0"
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {row.salidas_omitidas > 0 ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded-full font-bold bg-orange-100 text-[#F15F2A]">
                                {row.salidas_omitidas}
                              </span>
                            ) : (
                              "0"
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {row.jornadas_regularizadas > 0 ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-800">
                                {row.jornadas_regularizadas}
                              </span>
                            ) : (
                              "0"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {formatoHorasMinutos(row.minutos_efectivos_totales)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================
              PESTAÑA: REPORTE B - HORAS Y JORNADAS
             ======================================================== */}
          {pestaña === "horas" && reporteHoras && (
            <div className="space-y-4">
              {/* Tarjeta de Totales Acumulados */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-xs grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <span className="text-emerald-700 font-medium block">Total Tiempo Registrado:</span>
                  <span className="text-base font-bold text-slate-900">
                    {formatoHorasMinutos(reporteHoras.totales.total_tiempo_minutos)}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700 font-medium block">Descansos y Pausas:</span>
                  <span className="text-base font-bold text-slate-900">
                    {formatoHorasMinutos(reporteHoras.totales.total_descansos_minutos)}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700 font-medium block">Tiempo Efectivo Neto:</span>
                  <span className="text-base font-bold text-[#009944]">
                    {formatoHorasMinutos(reporteHoras.totales.total_efectivo_minutos)}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700 font-medium block">Tiempo Extra Detectado:</span>
                  <span className="text-base font-bold text-indigo-900">
                    {formatoHorasMinutos(reporteHoras.totales.total_adicional_detectado)}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700 font-medium block">Tiempo Extra Aprobado:</span>
                  <span className="text-base font-bold text-emerald-800">
                    {formatoHorasMinutos(reporteHoras.totales.total_adicional_aprobado)}
                  </span>
                </div>
              </div>

              {/* Tabla Detallada */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Reporte B &bull; Detalle de Horas por Jornada</h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {reporteHoras.items.length} jornadas consolidadas
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-100 font-semibold text-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left">Fecha</th>
                        <th className="px-4 py-3 text-left">Colaborador</th>
                        <th className="px-3 py-3 text-left">Horario</th>
                        <th className="px-3 py-3 text-center">Entrada - Salida</th>
                        <th className="px-3 py-3 text-center">Tiempo Total</th>
                        <th className="px-3 py-3 text-center">Pausas (D/A/C)</th>
                        <th className="px-3 py-3 text-center">Tiempo Efectivo</th>
                        <th className="px-3 py-3 text-center">Tiempo Extra</th>
                        <th className="px-3 py-3 text-center">Estado TA</th>
                        <th className="px-4 py-3 text-center">Estado Jornada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {reporteHoras.items.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-500 text-xs">
                            No se encontraron jornadas en el rango seleccionado.
                          </td>
                        </tr>
                      ) : (
                        reporteHoras.items.map((j) => (
                          <tr key={j.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-800">{j.fecha_jornada}</td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{j.empleado_nombre}</div>
                              <div className="text-[10px] text-slate-400">{j.departamento_nombre}</div>
                            </td>
                            <td className="px-3 py-3 text-slate-600">{j.horario_nombre || "General"}</td>
                            <td className="px-3 py-3 text-center text-slate-700">
                              {j.hora_entrada_calculo
                                ? new Date(j.hora_entrada_calculo).toLocaleTimeString("es-CR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "-"}
                              {" — "}
                              {j.hora_salida_calculo
                                ? new Date(j.hora_salida_calculo).toLocaleTimeString("es-CR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : j.estado_jornada === "ABIERTA"
                                ? "En curso"
                                : "-"}
                            </td>
                            <td className="px-3 py-3 text-center font-medium text-slate-800">
                              {j.estado_jornada === "ABIERTA" && !j.hora_salida_calculo
                                ? "En curso"
                                : formatoHorasMinutos(j.minutos_tiempo_total)}
                            </td>
                            <td className="px-3 py-3 text-center text-slate-600">
                              {formatoHorasMinutos(j.minutos_total_descansos)}
                              <span className="text-[10px] text-slate-400 block">
                                ({j.minutos_desayuno}/{j.minutos_almuerzo}/{j.minutos_cafe})
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center font-bold text-[#009944]">
                              {j.estado_jornada === "ABIERTA" && !j.hora_salida_calculo
                                ? "Pendiente cierre"
                                : formatoHorasMinutos(j.minutos_efectivos)}
                            </td>
                            <td className="px-3 py-3 text-center text-slate-800">
                              {j.minutos_tiempo_adicional > 0 ? (
                                <span className="font-semibold text-indigo-700">
                                  {formatoHorasMinutos(j.minutos_tiempo_adicional)}
                                </span>
                              ) : (
                                "0 min"
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {j.estado_tiempo_adicional === "APROBADO" ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Aprobado
                                </span>
                              ) : j.estado_tiempo_adicional === "RECHAZADO" ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                  Rechazado
                                </span>
                              ) : j.minutos_tiempo_adicional > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                  Pendiente
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  j.estado_jornada === "CERRADA"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : j.estado_jornada === "REGULARIZADA"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {j.estado_jornada}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              PESTAÑA: REPORTE C - INCIDENCIAS
             ======================================================== */}
          {pestaña === "incidencias" && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reporte C &bull; Incidencias Operativas</h3>
                  <p className="text-xs text-slate-500">Tardías, omisiones, pausas excedidas y ausencias detectadas</p>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {reporteIncidencias.length} incidencias encontradas
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100 font-semibold text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-3 py-3 text-left">Tipo Incidencia</th>
                      <th className="px-3 py-3 text-center">Minutos Afectados</th>
                      <th className="px-3 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-left">Descripción / Motivo</th>
                      <th className="px-3 py-3 text-left">Resolución</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {reporteIncidencias.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          No se encontraron incidencias en el período seleccionado.
                        </td>
                      </tr>
                    ) : (
                      reporteIncidencias.map((inc) => (
                        <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">{inc.fecha_jornada}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{inc.empleado_nombre}</div>
                            <div className="text-[10px] text-slate-400">{inc.departamento_nombre}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              {inc.tipo_incidencia.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-bold text-slate-800">
                            {inc.minutos_afectados > 0 ? `${inc.minutos_afectados} min` : "-"}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                inc.estado === "RESUELTA" || inc.estado === "JUSTIFICADA"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {inc.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{inc.descripcion}</td>
                          <td className="px-3 py-3 text-slate-500">
                            {inc.resolucion_motivo ? (
                              <div>
                                <span className="font-medium text-slate-800">{inc.resolucion_motivo}</span>
                                {inc.usuario_resolvio_nombre && (
                                  <div className="text-[10px] text-slate-400">Por: {inc.usuario_resolvio_nombre}</div>
                                )}
                              </div>
                            ) : (
                              "-"
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

          {/* ========================================================
              PESTAÑA: REPORTE D - SOLICITUDES
             ======================================================== */}
          {pestaña === "solicitudes" && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reporte D &bull; Solicitudes y Justificaciones</h3>
                  <p className="text-xs text-slate-500">
                    Permisos, vacaciones, justificaciones y flujo de aprobación por niveles
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {reporteSolicitudes.length} solicitudes encontradas
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100 font-semibold text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-3 py-3 text-left">Tipo de Solicitud</th>
                      <th className="px-3 py-3 text-center">Rango Solicitado</th>
                      <th className="px-3 py-3 text-center">Minutos</th>
                      <th className="px-4 py-3 text-left">Motivo Declarado</th>
                      <th className="px-3 py-3 text-center">Estado</th>
                      <th className="px-3 py-3 text-left">Resolución / Decisor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {reporteSolicitudes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          No se encontraron solicitudes registradas.
                        </td>
                      </tr>
                    ) : (
                      reporteSolicitudes.map((sol) => (
                        <tr key={sol.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            <div>{sol.empleado_nombre}</div>
                            <div className="text-[10px] text-slate-400">{sol.departamento_nombre}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                              {sol.tipo_solicitud.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center text-slate-700">
                            {sol.fecha_inicio} {sol.fecha_fin !== sol.fecha_inicio ? `al ${sol.fecha_fin}` : ""}
                          </td>
                          <td className="px-3 py-3 text-center font-medium text-slate-800">
                            {sol.minutos_solicitados > 0 ? formatoHorasMinutos(sol.minutos_solicitados) : "Día Completo"}
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{sol.motivo}</td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                sol.estado === "APROBADA"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : sol.estado === "RECHAZADA"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {sol.estado}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {sol.aprobador_nombre ? (
                              <div>
                                <span className="font-semibold text-slate-800">{sol.aprobador_nombre}</span>
                                {sol.comentarios_resolucion && (
                                  <div className="text-[10px] text-slate-400">{sol.comentarios_resolucion}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">En evaluación</span>
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

          {/* ========================================================
              PESTAÑA: REPORTE E - FERIADOS
             ======================================================== */}
          {pestaña === "feriados" && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reporte E &bull; Feriados Oficiales y Personal</h3>
                  <p className="text-xs text-slate-500">
                    Registro de feriados del período y colaboradores que laboraron (sin cálculo de pago extraordinario)
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-medium">{reporteFeriados.length} registros</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100 font-semibold text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-left">Descripción del Feriado</th>
                      <th className="px-3 py-3 text-left">Tipo de Feriado</th>
                      <th className="px-3 py-3 text-center">Laboró</th>
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-3 py-3 text-center">Entrada - Salida</th>
                      <th className="px-4 py-3 text-right">Tiempo Efectivo Registrado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {reporteFeriados.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          No se encontraron feriados activos en el período.
                        </td>
                      </tr>
                    ) : (
                      reporteFeriados.map((fer, idx) => (
                        <tr key={`${fer.feriado_id}-${fer.empleado_id || idx}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">{fer.fecha}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{fer.descripcion}</td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                              {fer.tipo_feriado.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {fer.trabajo_en_feriado ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                SÍ
                              </span>
                            ) : (
                              <span className="text-slate-400">NO</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {fer.empleado_nombre ? (
                              <div>
                                <span className="font-semibold text-slate-900">{fer.empleado_nombre}</span>
                                <span className="text-[10px] text-slate-400 block">{fer.departamento_nombre}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Sin jornada registrada</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center text-slate-700">
                            {fer.hora_entrada_calculo
                              ? new Date(fer.hora_entrada_calculo).toLocaleTimeString("es-CR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                            {" — "}
                            {fer.hora_salida_calculo
                              ? new Date(fer.hora_salida_calculo).toLocaleTimeString("es-CR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {fer.minutos_efectivos > 0 ? formatoHorasMinutos(fer.minutos_efectivos) : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================
              PESTAÑA: REPORTE F - CORRECCIONES DE MARCAS
             ======================================================== */}
          {pestaña === "correcciones" && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reporte F &bull; Correcciones de Marcas</h3>
                  <p className="text-xs text-slate-500">
                    Marcaciones corregidas, marcas originales vs propuestas y responsables de aprobación
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {reporteCorrecciones.length} solicitudes de corrección
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100 font-semibold text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left">Fecha Registro</th>
                      <th className="px-4 py-3 text-left">Colaborador</th>
                      <th className="px-3 py-3 text-left">Tipo Ajuste</th>
                      <th className="px-3 py-3 text-left">Marca Original</th>
                      <th className="px-3 py-3 text-left">Marca Propuesta</th>
                      <th className="px-4 py-3 text-left">Motivo</th>
                      <th className="px-3 py-3 text-center">Estado</th>
                      <th className="px-3 py-3 text-left">Autorizó / Decisión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {reporteCorrecciones.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                          No se encontraron solicitudes de corrección de marca.
                        </td>
                      </tr>
                    ) : (
                      reporteCorrecciones.map((corr) => (
                        <tr key={corr.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-700 font-medium">
                            {new Date(corr.creado_en).toLocaleDateString("es-CR")}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            <div>{corr.empleado_nombre}</div>
                            <div className="text-[10px] text-slate-400">{corr.departamento_nombre}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              {corr.tipo_ajuste}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            <div>{corr.marca_original_tipo}</div>
                            <div className="text-[10px] text-slate-400">
                              {corr.marca_original_timestamp !== "-"
                                ? new Date(corr.marca_original_timestamp).toLocaleTimeString("es-CR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Omitida"}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-900 font-semibold">
                            <div>{corr.tipo_marca_propuesto}</div>
                            <div className="text-[10px] text-slate-500">
                              {corr.timestamp_propuesto !== "-"
                                ? new Date(corr.timestamp_propuesto).toLocaleTimeString("es-CR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "-"}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{corr.motivo}</td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                corr.estado === "APROBADA"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : corr.estado === "RECHAZADA"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {corr.estado}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {corr.usuario_autorizo_nombre ? (
                              <span className="font-semibold text-slate-800">{corr.usuario_autorizo_nombre}</span>
                            ) : (
                              <span className="text-slate-400">Pendiente</span>
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

          {/* ========================================================
              PESTAÑA: REPORTE G - AUDITORÍA (AUDITORIA_VER)
             ======================================================== */}
          {pestaña === "auditoria" && puedeVerAuditoria && (
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reporte G &bull; Trazabilidad y Bitácora de Eventos</h3>
                  <p className="text-xs text-slate-500">Registro inmutable de acciones corporativas y auditoría forense</p>
                </div>
                <span className="text-xs text-slate-500 font-medium">{reporteAuditoria.length} eventos registrados</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100 font-semibold text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left">Fecha y Hora</th>
                      <th className="px-4 py-3 text-left">Usuario Responsable</th>
                      <th className="px-3 py-3 text-left">Rol</th>
                      <th className="px-3 py-3 text-left">Acción</th>
                      <th className="px-3 py-3 text-left">Entidad / ID</th>
                      <th className="px-4 py-3 text-left">Motivo / Detalle</th>
                      <th className="px-3 py-3 text-left">IP Origen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {reporteAuditoria.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          No se encontraron eventos de auditoría en el rango seleccionado.
                        </td>
                      </tr>
                    ) : (
                      reporteAuditoria.map((aud) => (
                        <tr key={aud.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                            {new Date(aud.timestamp_evento).toLocaleString("es-CR")}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {aud.usuario_nombre || aud.actor_usuario_id || "Sistema"}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                              {aud.rol_actor || "-"}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] font-bold text-indigo-700">{aud.accion}</td>
                          <td className="px-3 py-3 text-slate-600">
                            {aud.entidad_tipo} {aud.entidad_id ? `(${aud.entidad_id.slice(0, 8)}...)` : ""}
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{aud.motivo || "-"}</td>
                          <td className="px-3 py-3 font-mono text-slate-500 text-[11px]">{aud.ip_origen || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
