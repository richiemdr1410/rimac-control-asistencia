import type { ISesionesRepository } from "../repositories/interfaces/sesiones.js";

export class CerrarSesionUseCase {
  constructor(private sesionesRepo: ISesionesRepository) {}

  async ejecutar(sesion_id: string): Promise<void> {
    if (!sesion_id) return;
    await this.sesionesRepo.revocar(sesion_id);
  }
}
