import express from "express";
import type { Express } from "express";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { notFoundHandler } from "./middlewares/not-found.js";

export function createApp(): Express {
  // NOTA ARQUITECTÓNICA: El arranque normal de la aplicación NO ejecuta datos semilla automáticamente.
  // El seed es desacoplado y solo se ejecuta de forma controlada/explícita (CLI o endpoint administrativo).

  const app = express();

  // Middlewares estándar de parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Enrutador de la API REST
  app.use("/api", apiRouter);

  // Manejador de rutas inexistentes para la API REST (404)
  app.all("/api/*", notFoundHandler);
  app.all("/api", notFoundHandler);

  // Manejador global de errores
  app.use(errorHandler);

  return app;
}
