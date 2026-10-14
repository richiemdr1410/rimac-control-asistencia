import express from "express";
import path from "node:path";
import { createApp } from "./src/server/app.js";
import { errorHandler } from "./src/server/middlewares/error-handler.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Rutas de la API REST primero
  const backendApp = createApp();
  app.use(backendApp);

  // Garantía contractual estricta: ninguna ruta /api o /api/* puede pasar a Vite o SPA fallback ni retornar HTML
  const notFoundApiJson = (req: express.Request, res: express.Response) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(404).json({
      exito: false,
      codigo: "RECURSO_NO_ENCONTRADO",
      mensaje: `Ruta ${req.method} ${req.originalUrl} no encontrada en el servidor API.`,
      error: {
        codigo: "RECURSO_NO_ENCONTRADO",
        mensaje: `Ruta ${req.method} ${req.originalUrl} no encontrada en el servidor API.`,
        timestamp: new Date().toISOString(),
      },
    });
  };
  app.all("/api", notFoundApiJson);
  app.all("/api/*", notFoundApiJson);

  // Manejador de errores para rutas API que previene cualquier escape de HTML
  app.use("/api", errorHandler);

  // 2. Middleware de Vite en desarrollo o servidor de estáticos en producción
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[RIMAC] Servidor full-stack escuchando en http://0.0.0.0:${PORT} (Modo: ${process.env.NODE_ENV || "development"})`);
  });
}

startServer().catch((err) => {
  console.error("[RIMAC] Error crítico al iniciar el servidor:", err);
  process.exit(1);
});
