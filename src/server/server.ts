import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

const server = app.listen(env.PORT, "0.0.0.0", async () => {
  console.log(`[Backend] Servidor iniciado exitosamente en puerto ${env.PORT} (Modo: ${env.NODE_ENV})`);
});

// Manejo de señales de apagado limpio
process.on("SIGTERM", () => {
  console.log("[Backend] Señal SIGTERM recibida, cerrando servidor HTTP...");
  server.close(() => {
    console.log("[Backend] Servidor HTTP cerrado.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[Backend] Señal SIGINT recibida, cerrando servidor HTTP...");
  server.close(() => {
    console.log("[Backend] Servidor HTTP cerrado.");
    process.exit(0);
  });
});
