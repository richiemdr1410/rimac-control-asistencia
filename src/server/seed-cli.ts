import { seedPostgresDemo } from "../db/seed.js";

async function main() {
  console.log("Iniciando carga de datos semilla en PostgreSQL...");
  const resultado = await seedPostgresDemo();
  console.log("Resultado de semilla PostgreSQL:", resultado);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error ejecutando semilla:", err);
  process.exit(1);
});
