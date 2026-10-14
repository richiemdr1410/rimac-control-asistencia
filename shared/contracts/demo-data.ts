/**
 * Datos Demo Centralizados para el Sistema de Control de Asistencia RIMAC
 * Fuente única de verdad para Seed, Autocompletado de Login y Ayudas Rápidas de Garita.
 */

export interface EmpleadoDemoRef {
  cedula: string;
  nombre: string;
  puesto: string;
  departamento: string;
  id: string;
}

export interface UsuarioDemoRef {
  username: string;
  alias?: string[];
  rol: "ADMINISTRADOR" | "TALENTO_HUMANO" | "SEGURIDAD" | "SUPERVISOR_SEGURIDAD" | "EMPLEADO";
  nombre: string;
  email: string;
  passwordDemo: string;
  empleadoAsociadoCedula?: string;
  empleado_id?: string | null;
}

export const DEMO_EMPLEADOS: EmpleadoDemoRef[] = [
  {
    id: "33333333-3333-4333-8333-333333333301",
    cedula: "DEMO-1001",
    nombre: "Admin Demo Sistemas",
    puesto: "Administrador de Sistemas",
    departamento: "Tecnología de la Información",
  },
  {
    id: "33333333-3333-4333-8333-333333333302",
    cedula: "DEMO-1002",
    nombre: "Lic. Andrea Humano",
    puesto: "Analista de Talento Humano",
    departamento: "Talento Humano",
  },
  {
    id: "33333333-3333-4333-8333-333333333303",
    cedula: "DEMO-1003",
    nombre: "Cap. Roberto Supervisor",
    puesto: "Supervisor de Seguridad",
    departamento: "Seguridad y Control Patrimonial",
  },
  {
    id: "33333333-3333-4333-8333-333333333304",
    cedula: "DEMO-1004",
    nombre: "Oficial Carlos Garita",
    puesto: "Oficial de Garita",
    departamento: "Seguridad y Control Patrimonial",
  },
  {
    id: "33333333-3333-4333-8333-333333333305",
    cedula: "DEMO-1005",
    nombre: "Carlos Alvarado",
    puesto: "Operario de Producción",
    departamento: "Producción y Planta",
  },
];

export const DEMO_USUARIOS: UsuarioDemoRef[] = [
  {
    username: "seguridad",
    alias: ["usr_seguridad"],
    rol: "SEGURIDAD",
    nombre: "Terminal Garita RIMAC",
    email: "seguridad@rimac.cr",
    passwordDemo: "PassSegura_2026!*",
    empleado_id: null,
  },
  {
    username: "supervisor_seg",
    alias: ["usr_sup_seguridad"],
    rol: "SUPERVISOR_SEGURIDAD",
    nombre: "Cap. Roberto Supervisor",
    email: "supervisor.seguridad@rimac.cr",
    passwordDemo: "PassSegura_2026!*",
    empleadoAsociadoCedula: "DEMO-1003",
    empleado_id: "33333333-3333-4333-8333-333333333303",
  },
  {
    username: "empleado",
    alias: ["usr_empleado"],
    rol: "EMPLEADO",
    nombre: "Carlos Alvarado",
    email: "carlos.alvarado@rimac.cr",
    passwordDemo: "PassSegura_2026!*",
    empleadoAsociadoCedula: "DEMO-1005",
    empleado_id: "33333333-3333-4333-8333-333333333305",
  },
  {
    username: "talento_humano",
    alias: ["usr_th"],
    rol: "TALENTO_HUMANO",
    nombre: "Lic. Andrea Humano",
    email: "talento.humano@rimac.cr",
    passwordDemo: "PassSegura_2026!*",
    empleadoAsociadoCedula: "DEMO-1002",
    empleado_id: "33333333-3333-4333-8333-333333333302",
  },
  {
    username: "admin",
    alias: ["usr_admin"],
    rol: "ADMINISTRADOR",
    nombre: "Administrador General",
    email: "admin@rimac.cr",
    passwordDemo: "PassSegura_2026!*",
    empleadoAsociadoCedula: "DEMO-1001",
    empleado_id: "33333333-3333-4333-8333-333333333301",
  },
];
