import assert from "node:assert";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  terminate,
} from "firebase/firestore";
import fs from "node:fs";
import path from "node:path";

async function testExternalFirestoreDenyAll() {
  console.log("=== PRUEBA EXTERNA DE FIRESTORE WEB SDK (POLÍTICA DENY-ALL) ===");

  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("No se localizó firebase-applet-config.json");
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  const app = initializeApp(config, "external-audit-client");
  const db = config.firestoreDatabaseId
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);

  let passed = 0;

  // 1. Intentar leer usuarios
  try {
    console.log("1. Intentando leer colección 'usuarios'...");
    await getDocs(collection(db, "usuarios"));
    assert.fail("VULNERABILIDAD: Se permitió leer usuarios en Firestore.");
  } catch (err: any) {
    assert.ok(
      err.code === "permission-denied" || err.message?.includes("Missing or insufficient permissions"),
      `Código inesperado: ${err.code} - ${err.message}`
    );
    console.log("[PASS] 1. Lectura de 'usuarios' rechazada con PERMISSION_DENIED");
    passed++;
  }

  // 2. Intentar leer empleados
  try {
    console.log("2. Intentando leer colección 'empleados'...");
    await getDocs(collection(db, "empleados"));
    assert.fail("VULNERABILIDAD: Se permitió leer empleados en Firestore.");
  } catch (err: any) {
    assert.ok(
      err.code === "permission-denied" || err.message?.includes("Missing or insufficient permissions"),
      `Código inesperado: ${err.code} - ${err.message}`
    );
    console.log("[PASS] 2. Lectura de 'empleados' rechazada con PERMISSION_DENIED");
    passed++;
  }

  // 3. Intentar leer marcas
  try {
    console.log("3. Intentando leer colección 'marcas'...");
    await getDocs(collection(db, "marcas"));
    assert.fail("VULNERABILIDAD: Se permitió leer marcas en Firestore.");
  } catch (err: any) {
    assert.ok(
      err.code === "permission-denied" || err.message?.includes("Missing or insufficient permissions"),
      `Código inesperado: ${err.code} - ${err.message}`
    );
    console.log("[PASS] 3. Lectura de 'marcas' rechazada con PERMISSION_DENIED");
    passed++;
  }

  // 4. Intentar escribir marcas
  try {
    console.log("4. Intentando escribir en colección 'marcas'...");
    await addDoc(collection(db, "marcas"), {
      empleado_id: "hack",
      tipo_marca: "ENTRADA",
      timestamp_servidor: new Date().toISOString(),
    });
    assert.fail("VULNERABILIDAD: Se permitió escribir marcas en Firestore.");
  } catch (err: any) {
    assert.ok(
      err.code === "permission-denied" || err.message?.includes("Missing or insufficient permissions"),
      `Código inesperado: ${err.code} - ${err.message}`
    );
    console.log("[PASS] 4. Escritura en 'marcas' rechazada con PERMISSION_DENIED");
    passed++;
  }

  // 5. Intentar crear/modificar empleados
  try {
    console.log("5. Intentando crear/modificar documento en 'empleados'...");
    await setDoc(doc(db, "empleados", "hack-test-id"), {
      cedula: "HACK-999",
      nombre_completo: "Infiltrado Malicioso",
    });
    assert.fail("VULNERABILIDAD: Se permitió crear/modificar empleado en Firestore.");
  } catch (err: any) {
    assert.ok(
      err.code === "permission-denied" || err.message?.includes("Missing or insufficient permissions"),
      `Código inesperado: ${err.code} - ${err.message}`
    );
    console.log("[PASS] 5. Modificación de 'empleados' rechazada con PERMISSION_DENIED");
    passed++;
  }

  await terminate(db);
  console.log(`\n=== RESULTADO PRUEBA EXTERNA FIRESTORE: ${passed}/5 RECHAZADOS (PERMISSION_DENIED) ===`);
  assert.strictEqual(passed, 5);
}

testExternalFirestoreDenyAll().catch((err) => {
  console.error("Fallo en prueba externa Firestore:", err);
  process.exit(1);
});
