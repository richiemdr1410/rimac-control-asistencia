import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Navbar, type VistaType } from "./components/Navbar";
import { LoginView } from "./components/LoginView";
import { GaritaView } from "./components/GaritaView";
import { AutoservicioView } from "./components/AutoservicioView";
import { PoliticasView } from "./components/PoliticasView";
import { BandejaSolicitudesView } from "./components/BandejaSolicitudesView";
import { FeriadosView } from "./components/FeriadosView";
import { MisSolicitudesView } from "./components/MisSolicitudesView";
import { RolesPermisosView } from "./components/RolesPermisosView";
import { GestionPersonalView } from "./components/GestionPersonalView";
import { UsuariosView } from "./components/UsuariosView";
import { AdminRagView } from "./components/AdminRagView";
import { IncidenciasCorreccionesView } from "./components/IncidenciasCorreccionesView";
import { ConsolidacionJornadasView } from "./components/ConsolidacionJornadasView";
import { DashboardReportesView } from "./components/DashboardReportesView";
import { RimacLogo } from "./components/RimacLogo";

const AppContent: React.FC = () => {
  const {
    usuario,
    isLoading,
    puedeAccederGarita,
    puedeAccederAutoservicio,
    tienePermiso,
    tieneSubordinados,
  } = useAuth();
  const [vistaActual, setVistaActual] = useState<VistaType>("autoservicio");
  const [empleadoPreseleccionadoId, setEmpleadoPreseleccionadoId] = useState<string | undefined>(undefined);
  const [drillDownParams, setDrillDownParams] = useState<any>(null);

  // Callback para navegar desde Dashboard / Reportes conservando filtros
  const handleNavegarDesdeDashboard = (destino: VistaType, params?: any) => {
    setDrillDownParams(params || null);
    setVistaActual(destino);
  };

  // Definir la vista predeterminada según el rol del usuario
  useEffect(() => {
    if (usuario) {
      if (puedeAccederGarita && (usuario.rol === "SEGURIDAD" || usuario.rol === "SUPERVISOR_SEGURIDAD")) {
        setVistaActual("garita");
      } else if (puedeAccederAutoservicio) {
        setVistaActual("autoservicio");
      } else {
        setVistaActual("politicas");
      }
    }
  }, [usuario, puedeAccederGarita, puedeAccederAutoservicio]);

  // Pantalla de Carga Inicial
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="animate-pulse flex flex-col items-center">
          <RimacLogo height={64} showSlogan={true} />
          <div className="mt-8 flex items-center space-x-2 text-slate-500 text-sm font-medium">
            <div className="w-2.5 h-2.5 bg-[#009944] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2.5 h-2.5 bg-[#009944] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2.5 h-2.5 bg-[#F15F2A] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            <span className="ml-2 font-semibold">Validando sesión corporativa...</span>
          </div>
        </div>
      </div>
    );
  }

  // Si no hay sesión válida: Mostrar pantalla de Login
  if (!usuario) {
    return <LoginView />;
  }

  // Renderizado dinámico según la vista activa
  const renderVista = () => {
    switch (vistaActual) {
      case "politicas":
        return <PoliticasView />;
      case "garita":
        return puedeAccederGarita ? <GaritaView /> : <AutoservicioView />;
      case "jornadas": {
        const puedeVerJornadasAdmin =
          usuario?.rol !== "SEGURIDAD" &&
          (((tienePermiso("JORNADAS_INSTITUCIONALES_VER") || tienePermiso("JORNADAS_DETALLE_VER")) &&
            (usuario?.rol === "TALENTO_HUMANO" || usuario?.rol === "ADMINISTRADOR")) ||
            ((tienePermiso("JORNADAS_EQUIPO_VER") || tienePermiso("JORNADAS_DETALLE_VER")) &&
              (usuario?.rol === "SUPERVISOR_SEGURIDAD" || tieneSubordinados)));

        return puedeVerJornadasAdmin ? (
          <ConsolidacionJornadasView
            filtroFechaDesdeInicial={drillDownParams?.fechaDesde || ""}
            filtroFechaHastaInicial={drillDownParams?.fechaHasta || ""}
            filtroEstadoInicial={drillDownParams?.estado || "TODOS"}
          />
        ) : (
          <AutoservicioView />
        );
      }
      case "reportes": {
        const puedeVerReportes =
          usuario?.rol !== "SEGURIDAD" &&
          (tienePermiso("REPORTES_INSTITUCIONALES_VER") ||
            (tienePermiso("REPORTES_EQUIPO_VER") &&
              (usuario?.rol === "SUPERVISOR_SEGURIDAD" || tieneSubordinados)) ||
            tienePermiso("REPORTES_PERSONALES_VER"));

        return puedeVerReportes ? (
          <DashboardReportesView onNavegar={handleNavegarDesdeDashboard} />
        ) : (
          <AutoservicioView />
        );
      }
      case "aprobaciones":
        return (
          <BandejaSolicitudesView
            tabInicial={drillDownParams?.tabInicial || "solicitudes"}
            filtroEstadoTAInicial={drillDownParams?.estado || "TODOS"}
          />
        );
      case "feriados":
        return <FeriadosView />;
      case "incidencias":
        return (
          <IncidenciasCorreccionesView
            pestañaInicial={drillDownParams?.pestañaInicial || "incidencias"}
            filtroEstadoInicial={drillDownParams?.estado || ""}
            filtroFechaInicial={drillDownParams?.fecha || ""}
          />
        );
      case "solicitudes":
        return <MisSolicitudesView />;
      case "roles_permisos":
        return tienePermiso("ROLES_PERMISOS_ADMINISTRAR") ? (
          <RolesPermisosView />
        ) : (
          <AutoservicioView />
        );
      case "usuarios":
        return tienePermiso("USUARIOS_ADMINISTRAR") ? (
          <UsuariosView
            empleadoIdPreseleccionado={empleadoPreseleccionadoId}
            onLimpiarEmpleadoPreseleccionado={() => setEmpleadoPreseleccionadoId(undefined)}
          />
        ) : (
          <AutoservicioView />
        );
      case "admin_rag":
        return tienePermiso("RAG_DOCUMENTOS_ADMINISTRAR") ? (
          <AdminRagView />
        ) : (
          <AutoservicioView />
        );
      case "gestion_personal":
        return tienePermiso("EMPLEADOS_VER") ||
          tienePermiso("EMPLEADOS_ADMINISTRAR") ||
          tienePermiso("ORGANIZACION_ADMINISTRAR") ||
          tienePermiso("HORARIOS_VER") ||
          tienePermiso("HORARIOS_ADMINISTRAR") ||
          tienePermiso("JEFATURAS_ADMINISTRAR") ? (
          <GestionPersonalView
            pestanaInicial={drillDownParams?.subPestana || "colaboradores"}
            onNavegarAUsuarios={(empId) => {
              setEmpleadoPreseleccionadoId(empId);
              setVistaActual("usuarios");
            }}
          />
        ) : (
          <AutoservicioView />
        );
      case "autoservicio":
      default:
        return puedeAccederAutoservicio ? (
          <AutoservicioView />
        ) : puedeAccederGarita ? (
          <GaritaView />
        ) : (
          <PoliticasView />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <Navbar vistaActual={vistaActual} alCambiarVista={setVistaActual} />
      <main className="flex-1 py-4 sm:py-6">{renderVista()}</main>
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500">
        Agroquímica Industrial RIMAC S.A. &bull; Sistema de Control de Asistencia y Horas Laborales
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
