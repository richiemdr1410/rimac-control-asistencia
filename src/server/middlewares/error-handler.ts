import type { Request, Response, NextFunction } from "express";
import type { ApiErrorResponse } from "../../../shared/contracts/common.js";

export function errorHandler(
  err: Error & { statusCode?: number; codigo?: string; titulo?: string; detalles?: Record<string, string[]> },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const codigo = err.codigo || (statusCode === 500 ? "ERROR_INTERNO_SERVIDOR" : "ERROR_OPERACIONAL");

  if (statusCode >= 500) {
    console.error(`[Error Handler] ${codigo} (${statusCode}):`, err.message);
    if (err.stack) {
      console.error(err.stack);
    }
  } else {
    // Respuestas 4xx son flujos operacionales esperados (no-autenticado en /me para invitados,
    // validación de credenciales en formulario, rate-limits o validaciones de entrada).
    // Se registran mediante console.info para evitar falsos positivos de fallas críticas en el entorno.
    console.info(`[Info Handler] ${codigo} (${statusCode}):`, err.message);
  }

  const respuesta: {
    exito: false;
    codigo: string;
    titulo?: string;
    mensaje: string;
    error: {
      codigo: string;
      titulo?: string;
      mensaje: string;
      detalles?: Record<string, string[]>;
      timestamp: string;
    };
  } = {
    exito: false,
    codigo,
    titulo: err.titulo,
    mensaje: statusCode === 500 ? "Ha ocurrido un error interno en el servidor." : err.message,
    error: {
      codigo,
      titulo: err.titulo,
      mensaje: statusCode === 500 ? "Ha ocurrido un error interno en el servidor." : err.message,
      detalles: err.detalles,
      timestamp: new Date().toISOString(),
    },
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(statusCode).json(respuesta);
}
