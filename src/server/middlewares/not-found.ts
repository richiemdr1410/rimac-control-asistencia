import type { Request, Response, NextFunction } from "express";
import type { ApiErrorResponse } from "../../../shared/contracts/common.js";

export function notFoundHandler(req: Request, res: Response): void {
  const respuesta: ApiErrorResponse & { codigo?: string; mensaje?: string } = {
    exito: false,
    codigo: "RECURSO_NO_ENCONTRADO",
    mensaje: `Ruta ${req.method} ${req.originalUrl} no encontrada en el servidor.`,
    error: {
      codigo: "RECURSO_NO_ENCONTRADO",
      mensaje: `Ruta ${req.method} ${req.originalUrl} no encontrada en el servidor.`,
      timestamp: new Date().toISOString(),
    },
  };
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(404).json(respuesta);
}
