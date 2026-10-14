import type { RolUsuario } from "../../auth/types.js";

export interface PermisoEntity {
  codigo: string;
  modulo: string;
  descripcion: string;
  critico: boolean;
  creado_en: string;
}

export interface RolPermisoEntity {
  id: string;
  rol: RolUsuario;
  permiso_codigo: string;
  activo: boolean;
  actualizado_por_usuario_id?: string | null;
  actualizado_en: string;
}

export interface MatrizRolesPermisos {
  roles: RolUsuario[];
  permisos: PermisoEntity[];
  asignaciones: Record<RolUsuario, string[]>; // Permisos activos por rol
}

export interface IPermisosRepository {
  listarPermisos(): Promise<PermisoEntity[]>;
  listarPermisosActivosPorRol(rol: RolUsuario): Promise<string[]>;
  rolTienePermiso(rol: RolUsuario, permisoCodigo: string): Promise<boolean>;
  obtenerMatrizCompleta(): Promise<MatrizRolesPermisos>;
  actualizarPermisosRol(
    rol: RolUsuario,
    permisosActivos: string[],
    usuarioActorId: string
  ): Promise<{ modificados: number; detalles: Array<{ permiso: string; antes: boolean; ahora: boolean }> }>;
  invalidarCache(rol?: RolUsuario): void;
}
