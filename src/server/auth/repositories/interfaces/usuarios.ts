import type { UsuarioEntity, UsuarioConDetalles } from "../../types.js";

export interface IUsuariosRepository {
  obtenerPorId(id: string): Promise<UsuarioEntity | null>;
  obtenerPorUsernameOEmail(identificador: string): Promise<UsuarioEntity | null>;
  guardar(usuario: UsuarioEntity): Promise<void>;
  actualizar(id: string, parcial: Partial<UsuarioEntity>): Promise<void>;
  listar(filtros?: { busqueda?: string; rol?: string; estado?: string }): Promise<UsuarioConDetalles[]>;
  obtenerDetallePorId(id: string): Promise<UsuarioConDetalles | null>;
  obtenerPorEmpleadoId(empleadoId: string): Promise<UsuarioEntity | null>;
  contarAdministradoresActivos(excluyendoUsuarioId?: string): Promise<number>;
}
