import React from "react";
import { useAuth } from "../context/AuthContext";
import { RimacLogo } from "./RimacLogo";
import { LogOut, Shield, User, Clock, BookOpen, CheckSquare, Calendar, Sliders, Users, KeyRound, Database, AlertTriangle, BarChart3 } from "lucide-react";

export type VistaType =
  | "garita"
  | "autoservicio"
  | "jornadas"
  | "solicitudes"
  | "aprobaciones"
  | "feriados"
  | "incidencias"
  | "politicas"
  | "roles_permisos"
  | "gestion_personal"
  | "usuarios"
  | "admin_rag"
  | "reportes";

interface NavbarProps {
  vistaActual: VistaType;
  alCambiarVista: (vista: VistaType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ vistaActual, alCambiarVista }) => {
  const {
    usuario,
    logout,
    puedeAccederGarita,
    puedeAccederAutoservicio,
    tienePermiso,
    tieneSubordinados,
  } = useAuth();

  const getRolEtiqueta = (rol?: string) => {
    switch (rol) {
      case "SEGURIDAD":
        return "Oficial de Seguridad";
      case "SUPERVISOR_SEGURIDAD":
        return "Supervisor Seguridad";
      case "EMPLEADO":
        return "Colaborador RIMAC";
      case "TALENTO_HUMANO":
        return "Talento Humano";
      case "ADMINISTRADOR":
        return "Administrador de Sistema";
      default:
        return rol || "Usuario";
    }
  };

  // Visibilidad derivada de permisos y atributos ABAC
  const puedeAprobar =
    tienePermiso("SOLICITUDES_BANDEJA_VER") &&
    (usuario?.rol === "TALENTO_HUMANO" ||
      usuario?.rol === "ADMINISTRADOR" ||
      tieneSubordinados);

  const puedeVerFeriados =
    tienePermiso("FERIADOS_VER") || tienePermiso("FERIADOS_ADMINISTRAR");

  const esInstitucional =
    (tienePermiso("JORNADAS_INSTITUCIONALES_VER") || tienePermiso("JORNADAS_DETALLE_VER")) &&
    (usuario?.rol === "TALENTO_HUMANO" || usuario?.rol === "ADMINISTRADOR");

  const esSupervisorOEquipo =
    (tienePermiso("JORNADAS_EQUIPO_VER") || tienePermiso("JORNADAS_DETALLE_VER")) &&
    (usuario?.rol === "SUPERVISOR_SEGURIDAD" || tieneSubordinados);

  const puedeVerJornadas =
    usuario?.rol !== "SEGURIDAD" && (esInstitucional || esSupervisorOEquipo);

  const puedeVerReportes =
    usuario?.rol !== "SEGURIDAD" &&
    (tienePermiso("REPORTES_INSTITUCIONALES_VER") ||
      (tienePermiso("REPORTES_EQUIPO_VER") &&
        (usuario?.rol === "SUPERVISOR_SEGURIDAD" || tieneSubordinados)) ||
      tienePermiso("REPORTES_PERSONALES_VER"));

  const puedeVerIncidencias =
    tienePermiso("INCIDENCIAS_VER") ||
    tienePermiso("INCIDENCIAS_GESTIONAR") ||
    tienePermiso("CORRECCIONES_MARCAS_SOLICITAR") ||
    tienePermiso("CORRECCIONES_MARCAS_APROBAR") ||
    tienePermiso("JORNADAS_REGULARIZAR");

  const puedeGestionarPersonal =
    tienePermiso("EMPLEADOS_VER") ||
    tienePermiso("EMPLEADOS_ADMINISTRAR") ||
    tienePermiso("ORGANIZACION_ADMINISTRAR") ||
    tienePermiso("HORARIOS_VER") ||
    tienePermiso("HORARIOS_ADMINISTRAR") ||
    tienePermiso("JEFATURAS_ADMINISTRAR");

  const puedeAdministrarRoles = tienePermiso("ROLES_PERMISOS_ADMINISTRAR");
  const puedeAdministrarUsuarios = tienePermiso("USUARIOS_ADMINISTRAR");
  const puedeAdministrarRag = tienePermiso("RAG_DOCUMENTOS_ADMINISTRAR");

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Lado Izquierdo: Logotipo RIMAC y Nombre del Sistema */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <RimacLogo height={38} showSlogan={false} />
            </div>
            <div className="hidden md:block h-6 w-px bg-slate-200" />
            <div className="hidden md:flex flex-col">
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Sistema Integral
              </span>
              <span className="text-sm font-bold text-slate-800">
                Control de Asistencia y Horas Laborales
              </span>
            </div>
          </div>

          {/* Centro: Selector de Vistas Autorizadas */}
          <div className="flex items-center space-x-1 sm:space-x-1.5 overflow-x-auto py-1">
            {puedeAccederGarita && (
              <button
                type="button"
                id="btn-nav-garita"
                onClick={() => alCambiarVista("garita")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "garita"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Shield className="w-4 h-4 mr-1.5" />
                <span>Garita</span>
              </button>
            )}

            {puedeAccederAutoservicio && (
              <button
                type="button"
                id="btn-nav-autoservicio"
                onClick={() => alCambiarVista("autoservicio")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "autoservicio"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Clock className="w-4 h-4 mr-1.5" />
                <span>Autoservicio</span>
              </button>
            )}

            {puedeVerJornadas && (
              <button
                type="button"
                id="btn-nav-jornadas"
                onClick={() => alCambiarVista("jornadas")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "jornadas"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Clock className="w-4 h-4 mr-1.5" />
                <span>Jornadas</span>
              </button>
            )}

            {puedeVerReportes && (
              <button
                type="button"
                id="btn-nav-reportes"
                onClick={() => alCambiarVista("reportes")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "reportes"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <BarChart3 className="w-4 h-4 mr-1.5" />
                <span>Dashboard / Reportes</span>
              </button>
            )}

            {puedeAprobar && (
              <button
                type="button"
                id="btn-nav-aprobaciones"
                onClick={() => alCambiarVista("aprobaciones")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "aprobaciones"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <CheckSquare className="w-4 h-4 mr-1.5" />
                <span>Aprobaciones</span>
              </button>
            )}

            {puedeVerFeriados && (
              <button
                type="button"
                id="btn-nav-feriados"
                onClick={() => alCambiarVista("feriados")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "feriados"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Calendar className="w-4 h-4 mr-1.5" />
                <span>Feriados</span>
              </button>
            )}

            {puedeVerIncidencias && (
              <button
                type="button"
                id="btn-nav-incidencias"
                onClick={() => alCambiarVista("incidencias")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "incidencias"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <AlertTriangle className="w-4 h-4 mr-1.5" />
                <span>Incidencias</span>
              </button>
            )}

            {/* Roles y Permisos RBAC Dinámico */}
            {puedeAdministrarRoles && (
              <button
                type="button"
                id="btn-nav-roles-permisos"
                onClick={() => alCambiarVista("roles_permisos")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "roles_permisos"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Sliders className="w-4 h-4 mr-1.5" />
                <span>Roles y Permisos</span>
              </button>
            )}

            {/* Administración de Usuarios y Accesos (Fase 3.2D) */}
            {puedeAdministrarUsuarios && (
              <button
                type="button"
                id="btn-nav-usuarios"
                onClick={() => alCambiarVista("usuarios")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "usuarios"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <KeyRound className="w-4 h-4 mr-1.5" />
                <span>Usuarios y Accesos</span>
              </button>
            )}

            {/* Estructura Organizacional y Gestión de Personal (Fase 3.2C) */}
            {puedeGestionarPersonal && (
              <button
                type="button"
                id="btn-nav-gestion-personal"
                onClick={() => alCambiarVista("gestion_personal")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "gestion_personal"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Users className="w-4 h-4 mr-1.5" />
                <span>Gestión de Personal</span>
              </button>
            )}

            {/* Administración -> Base de Conocimiento RAG (Fase 3.2E) */}
            {puedeAdministrarRag && (
              <button
                type="button"
                id="btn-nav-admin-rag"
                onClick={() => alCambiarVista("admin_rag")}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  vistaActual === "admin_rag"
                    ? "bg-[#009944] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Database className="w-4 h-4 mr-1.5" />
                <span>Base de Conocimiento RAG</span>
              </button>
            )}

            {/* Asistente de Políticas RAG DTH-REG-001 (Accesible a todos los roles canónicos) */}
            <button
              type="button"
              id="btn-nav-politicas"
              onClick={() => alCambiarVista("politicas")}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                vistaActual === "politicas"
                  ? "bg-[#009944] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <BookOpen className="w-4 h-4 mr-1.5" />
              <span>Políticas</span>
            </button>
          </div>

          {/* Lado Derecho: Perfil de Usuario y Botón de Salir */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-semibold text-slate-800 leading-tight">
                {usuario?.nombre_completo || usuario?.identificador}
              </span>
              <span className="text-xs font-medium text-[#009944]">
                {getRolEtiqueta(usuario?.rol)}
              </span>
            </div>

            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
              <User className="w-4 h-4 text-slate-500" />
            </div>

            <button
              type="button"
              id="btn-cerrar-sesion"
              onClick={() => logout()}
              title="Cerrar sesión segura"
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {/* Línea corporativa sutil en la parte inferior */}
      <div className="h-0.5 w-full bg-gradient-to-r from-[#009944] via-[#009944] to-[#F15F2A]" />
    </header>
  );
};

