import type { SesionEntity } from "../../types.js";

export interface ISesionesRepository {
  crear(sesion: SesionEntity): Promise<void>;
  obtenerPorId(id: string): Promise<SesionEntity | null>;
  actualizarUltimoAcceso(id: string, timestamp: string): Promise<void>;
  revocar(id: string): Promise<void>;
  revocarPorUsuario(usuario_id: string): Promise<void>;
}
