import type { ISesionesRepository } from "../repositories/interfaces/sesiones.js";
import type { IUsuariosRepository } from "../repositories/interfaces/usuarios.js";
import type { IEmpleadosRepository } from "../../repositories/interfaces/empleados.js";
import type { ContextoAutenticado, UsuarioPublico } from "../types.js";
import { env } from "../../config/env.js";

export class ValidarSesionUseCase {
  constructor(
    private sesionesRepo: ISesionesRepository,
    private usuariosRepo: IUsuariosRepository,
    private empleadosRepo?: IEmpleadosRepository
  ) {}

  async ejecutar(sesion_id: string): Promise<{ contexto: ContextoAutenticado; usuario: UsuarioPublico }> {
    const errorInvalida = (codigo = "SESION_INVALIDA", mensaje = "Sesión inválida o revocada.") => {
      const err = new Error(mensaje);
      (err as any).statusCode = 401;
      (err as any).codigo = codigo;
      return err;
    };

    if (!sesion_id) {
      throw errorInvalida("SESION_NO_SUMINISTRADA", "No se proporcionó token de sesión.");
    }

    const sesion = await this.sesionesRepo.obtenerPorId(sesion_id);
    if (!sesion || sesion.revocada) {
      throw errorInvalida();
    }

    const ahora = new Date();
    const ahoraMs = ahora.getTime();

    // 1. Validar expiración absoluta (TTL)
    const expiraMs = new Date(sesion.expira_en).getTime();
    if (ahoraMs > expiraMs) {
      await this.sesionesRepo.revocar(sesion_id);
      throw errorInvalida("SESION_EXPIRADA", "La sesión ha expirado por tiempo absoluto.");
    }

    // 2. Validar expiración por inactividad
    const ultimoAccesoMs = new Date(sesion.ultimo_acceso_en).getTime();
    const inactividadMs = env.SESSION_IDLE_MINUTES * 60 * 1000;
    if (ahoraMs - ultimoAccesoMs > inactividadMs) {
      await this.sesionesRepo.revocar(sesion_id);
      throw errorInvalida("SESION_EXPIRADA", "La sesión ha expirado por inactividad.");
    }

    // 3. Validar estado del usuario
    const usuario = await this.usuariosRepo.obtenerPorId(sesion.usuario_id);
    if (!usuario || usuario.estado !== "ACTIVO") {
      await this.sesionesRepo.revocar(sesion_id);
      throw errorInvalida("USUARIO_BLOQUEADO", "El usuario asociado a la sesión está inactivo o bloqueado.");
    }

    // 4. Validar estado del colaborador vinculado (si es cuenta personal)
    if (usuario.empleado_id && this.empleadosRepo) {
      const emp = await this.empleadosRepo.obtenerPorId(usuario.empleado_id);
      if (!emp || emp.estado !== "ACTIVO") {
        await this.sesionesRepo.revocar(sesion_id);
        throw errorInvalida("EMPLEADO_INACTIVO", "El colaborador vinculado a la sesión se encuentra inactivo.");
      }
    }

    // Actualizar último acceso (sliding window)
    const ahoraIso = ahora.toISOString();
    await this.sesionesRepo.actualizarUltimoAcceso(sesion_id, ahoraIso);

    const contexto: ContextoAutenticado = {
      usuario_id: usuario.id,
      rol: usuario.rol,
      empleado_id: usuario.empleado_id,
      sesion_id: sesion.id,
      csrf_token: sesion.csrf_token,
    };

    const usuarioPublico: UsuarioPublico = {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      nombre_completo: usuario.nombre_completo,
      rol: usuario.rol,
      empleado_id: usuario.empleado_id,
      estado: usuario.estado,
    };

    return { contexto, usuario: usuarioPublico };
  }
}
