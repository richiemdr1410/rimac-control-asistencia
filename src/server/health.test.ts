import { test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "./app.js";

async function setupServer() {
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3000;
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { port, close };
}

test("GET /api/health - Conectado responde 200 OK con metadatos de PostgreSQL", async () => {
  const { port, close } = await setupServer();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.exito, true);
    assert.equal(data.datos.estado, "OK");
    assert.equal(data.datos.servidor, "OPERATIVO");
    assert.equal(data.datos.persistencia.adaptador, "POSTGRESQL");
    assert.equal(data.datos.persistencia.persistenceProvider, "postgres");
    assert.equal(data.datos.persistencia.estado, "CONECTADO");
    assert.equal(typeof data.datos.persistencia.latencia_ms, "number");
  } finally {
    await close();
  }
});

test("GET /api/ruta-inexistente - Responde 404 RECURSO_NO_ENCONTRADO estandarizado", async () => {
  const { port, close } = await setupServer();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ruta-inexistente`);
    assert.equal(res.status, 404);

    const data = await res.json();
    assert.equal(data.exito, false);
    assert.equal(data.error.codigo, "RECURSO_NO_ENCONTRADO");
  } finally {
    await close();
    setTimeout(() => process.exit(0), 100);
  }
});

