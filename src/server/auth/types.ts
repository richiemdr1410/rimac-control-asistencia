/**
 * Roles RBAC formalmente aprobados en la arquitectura
 */
export type RolUsuario =
  | "ADMINISTRADOR"
  | "TALENTO_HUMANO"
  | "SEGURIDAD"
  | "SUPERVISOR_SEGURIDAD"
  | "EMPLEADO";

export interface UsuarioEntity {
  id: string;
  username: string;
  email: string;
  nombre_completo: string;
  password_hash: string;
  rol: RolUsuario;
  empleado_id?: string; // Vinculación con el expediente del empleado en la empresa
  estado: "ACTIVO" | "INACTIVO" | "BLOQUEADO";
  creado_en: string;
  actualizado_en: string;
}

export interface SesionEntity {
  id: string; // Token opaco (sid)
  usuario_id: string;
  rol: RolUsuario;
  empleado_id?: string;
  csrf_token: string;
  creado_en: string;
  ultimo_acceso_en: string;
  expira_en: string; // Expiración absoluta
  revocada: boolean;
  user_agent?: string;
  ip_origen?: string;
}

export interface AsignacionJefaturaEntity {
  id: string;
  jefatura_empleado_id: string; // ID del empleado que actúa como jefatura
  subordinado_empleado_id: string; // ID del colaborador supervisado
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin?: string; // YYYY-MM-DD (null o indefinido si está vigente)
  estado: "ACTIVA" | "INACTIVA";
  creado_en: string;
}

export interface ContextoAutenticado {
  usuario_id: string;
  rol: RolUsuario;
  empleado_id?: string;
  sesion_id: string;
  csrf_token: string;
}

export interface UsuarioPublico {
  id: string;
  username: string;
  email: string;
  nombre_completo: string;
  rol: RolUsuario;
  empleado_id?: string;
  estado: "ACTIVO" | "INACTIVO" | "BLOQUEADO";
  permisos?: string[];
  tiene_subordinados?: boolean;
}

export interface UsuarioConDetalles {
  id: string;
  username: string;
  email: string;
  nombre_completo: string;
  rol: RolUsuario;
  empleado_id?: string;
  estado: "ACTIVO" | "INACTIVO" | "BLOQUEADO";
  creado_en: string;
  actualizado_en: string;
  empleado_nombre?: string;
  empleado_cedula?: string;
  empleado_correo?: string;
  empleado_estado?: string;
  ultimo_acceso_en?: string;
  sesiones_activas_count?: number;
}
