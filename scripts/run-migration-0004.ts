import { getPool } from "../src/db/index.js";
import fs from "fs";

const pool = getPool();
async function main() {
  const sql = fs.readFileSync("./src/db/migrations/0004_incidencias_correcciones_fase4a.sql", "utf-8");
  await pool.query(sql);
  console.log("Migración 0004 ejecutada exitosamente.");
  const res = await pool.query("SELECT codigo, modulo, descripcion FROM permisos WHERE modulo IN ('Incidencias', 'Jornadas') ORDER BY codigo;");
  console.log("Permisos Fase 4A:", res.rows);
  process.exit(0);
}
main().catch((e) => {
  console.error("Error en migración 0004:", e);
  process.exit(1);
});
