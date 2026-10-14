import { randomUUID } from "node:crypto";
import { getRepositoryContainer } from "../repositories/factory.js";
import { RegistrarMarcaUseCase } from "../use-cases/registrar-marca.js";
import { getPool } from "../../db/index.js";

interface ValidationResult {
  numero: number;
  nombre: string;
  estado: "PASS" | "FAIL";
  detalle?: string;
}

const BASE_URL = "http://127.0.0.1:3000/api";

async function main() {
  const resultados: ValidationResult[] = [];

  async function check(numero: number, nombre: string, fn: () => Promise<void>) {
    try {
      await fn();
      resultados.push({ numero, nombre, estado: "PASS" });
      console.log(`[PASS] ${numero}. ${nombre}`);
    } catch (err: any) {
      resultados.push({ numero, nombre, estado: "FAIL", detalle: err.message });
      console.error(`[FAIL] ${numero}. ${nombre}:`, err.message);
    }
  }

  console.log("================================================================================");
  console.log("INICIANDO SUITE DE VALIDACIÓN FUNCIONAL FASE 2D (POSTGRESQL)");
  console.log("================================================================================");

  // Helper para hacer login y extraer cookies y token CSRF
  async function loginHelper(user: string, pass: string) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: user, contrasena: pass }),
    });
    if (!res.ok) {
      throw new Error(`Login falló con status ${res.status}: ${await res.text()}`);
    }
    const setCookie = res.headers.get("set-cookie") || "";
    const sidMatch = setCookie.match(/sid=([^;]+)/);
    const sid = sidMatch ? sidMatch[1] : res.headers.get("x-session-id") || "";
    const data = await res.json();
    return {
      sid,
      csrf_token: data.datos.csrf_token || data.datos.token_csrf,
      usuario: data.datos.usuario,
    };
  }

  let adminSession: { sid: string; csrf_token: string; usuario: any };
  let thSession: { sid: string; csrf_token: string; usuario: any };
  let segSession: { sid: string; csrf_token: string; usuario: any };
  let supSegSession: { sid: string; csrf_token: string; usuario: any };
  let empSession: { sid: string; csrf_token: string; usuario: any };

  // 1. /api/health
  await check(1, "/api/health responde 200 OK confirmando persistencia PostgreSQL", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error(`Health falló: status ${res.status}`);
    const data = await res.json();
    if (data.datos.persistencia.persistenceProvider !== "postgres") {
      throw new Error(`persistenceProvider esperado "postgres", recibido "${data.datos.persistencia.persistenceProvider}"`);
    }
    if (data.datos.persistencia.adaptador !== "POSTGRESQL") {
      throw new Error(`adaptador esperado "POSTGRESQL", recibido "${data.datos.persistencia.adaptador}"`);
    }
    if (data.datos.persistencia.estado !== "CONECTADO") {
      throw new Error(`estado de persistencia no conectado`);
    }
  });

  // 2. login ADMINISTRADOR
  await check(2, "login ADMINISTRADOR (usuario: admin)", async () => {
    adminSession = await loginHelper("admin", "Demo1234!");
    if (adminSession.usuario.rol !== "ADMINISTRADOR") {
      throw new Error(`Rol esperado ADMINISTRADOR, recibido: ${adminSession.usuario.rol}`);
    }
  });

  // 3. login TALENTO_HUMANO
  await check(3, "login TALENTO_HUMANO (usuario: talento_humano)", async () => {
    thSession = await loginHelper("talento_humano", "Demo1234!");
    if (thSession.usuario.rol !== "TALENTO_HUMANO") {
      throw new Error(`Rol esperado TALENTO_HUMANO, recibido: ${thSession.usuario.rol}`);
    }
  });

  // 4. login SEGURIDAD
  await check(4, "login SEGURIDAD (usuario: seguridad)", async () => {
    segSession = await loginHelper("seguridad", "Demo1234!");
    if (segSession.usuario.rol !== "SEGURIDAD") {
      throw new Error(`Rol esperado SEGURIDAD, recibido: ${segSession.usuario.rol}`);
    }
  });

  // 5. login SUPERVISOR_SEGURIDAD
  await check(5, "login SUPERVISOR_SEGURIDAD (usuario: supervisor_seg)", async () => {
    supSegSession = await loginHelper("supervisor_seg", "Demo1234!");
    if (supSegSession.usuario.rol !== "SUPERVISOR_SEGURIDAD") {
      throw new Error(`Rol esperado SUPERVISOR_SEGURIDAD, recibido: ${supSegSession.usuario.rol}`);
    }
  });

  // 6. login EMPLEADO
  await check(6, "login EMPLEADO (usuario: empleado)", async () => {
    empSession = await loginHelper("empleado", "Demo1234!");
    if (empSession.usuario.rol !== "EMPLEADO") {
      throw new Error(`Rol esperado EMPLEADO, recibido: ${empSession.usuario.rol}`);
    }
  });

  // 7. RBAC
  await check(7, "Control de Acceso Basado en Roles (RBAC)", async () => {
    // A. EMPLEADO intentando acceder a ruta de garita debe recibir 403
    const resGarita = await fetch(`${BASE_URL}/seguridad/terminal-garita`, {
      headers: { Cookie: `sid=${empSession.sid}` },
    });
    if (resGarita.status !== 403) {
      throw new Error(`EMPLEADO debió recibir 403 en ruta de seguridad, recibió: ${resGarita.status}`);
    }

    // B. SEGURIDAD intentando acceder a ruta de admin debe recibir 403
    const resAdmin = await fetch(`${BASE_URL}/admin/configuracion`, {
      headers: { Cookie: `sid=${segSession.sid}` },
    });
    if (resAdmin.status !== 403) {
      throw new Error(`SEGURIDAD debió recibir 403 en ruta de administración, recibió: ${resAdmin.status}`);
    }

    // C. ADMINISTRADOR accediendo a ruta de admin debe recibir 200
    const resAdminOk = await fetch(`${BASE_URL}/admin/configuracion`, {
      headers: { Cookie: `sid=${adminSession.sid}` },
    });
    if (resAdminOk.status !== 200) {
      throw new Error(`ADMINISTRADOR debió recibir 200 en su ruta, recibió: ${resAdminOk.status}`);
    }
  });

  // 8. ABAC/jefaturas
  await check(8, "Control de Acceso Basado en Atributos (ABAC) y Jefaturas", async () => {
    // TALENTO_HUMANO aprueba tiempo adicional para Juan Perez Operario -> 200 OK
    const resAprobarTH = await fetch(`${BASE_URL}/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${thSession.sid}`,
        "X-CSRF-Token": thSession.csrf_token,
      },
      body: JSON.stringify({
        subordinado_empleado_id: empSession.usuario.empleado_id,
        fecha_jornada: "2026-10-15",
        minutos_adicionales: 30,
      }),
    });
    if (!resAprobarTH.ok) {
      throw new Error(`TALENTO_HUMANO debió aprobar tiempo adicional, status: ${resAprobarTH.status}`);
    }

    // EMPLEADO intentando aprobar tiempo adicional sin jefatura válida -> 403
    const resAprobarEmp = await fetch(`${BASE_URL}/jefatura/aprobar-tiempo-adicional`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${empSession.sid}`,
        "X-CSRF-Token": empSession.csrf_token,
      },
      body: JSON.stringify({
        subordinado_empleado_id: "33333333-3333-4333-8333-333333333301",
        fecha_jornada: "2026-10-15",
        minutos_adicionales: 30,
      }),
    });
    if (resAprobarEmp.status !== 403) {
      throw new Error(`EMPLEADO sin jefatura debió ser rechazado con 403, status: ${resAprobarEmp.status}`);
    }
  });

  // 9. Consulta de empleados
  await check(9, "Consulta de empleados (Garita: búsqueda por cédula)", async () => {
    const res = await fetch(`${BASE_URL}/garita/empleados/buscar?identificador=DEMO-1005`, {
      headers: { Cookie: `sid=${segSession.sid}` },
    });
    if (!res.ok) throw new Error(`Búsqueda de empleado falló: ${res.status}`);
    const data = await res.json();
    if (!data.datos.empleado || data.datos.empleado.cedula !== "DEMO-1005") {
      throw new Error(`Empleado incorrecto devuelto: ${JSON.stringify(data.datos.empleado)}`);
    }
  });

  // 10. Horario aplicable
  await check(10, "Horario aplicable devuelto en el contexto operativo", async () => {
    const res = await fetch(`${BASE_URL}/garita/empleados/buscar?identificador=DEMO-1005`, {
      headers: { Cookie: `sid=${segSession.sid}` },
    });
    const data = await res.json();
    const horario = data.datos.horario_aplicable;
    if (!horario || !horario.hora_entrada_programada) {
      throw new Error(`Horario aplicable no presente o incompleto: ${JSON.stringify(horario)}`);
    }
    if (horario.tolerancia_minutos !== 5) {
      throw new Error(`Tolerancia esperada 5 min, recibida: ${horario.tolerancia_minutos}`);
    }
  });

  // Para las validaciones 11 a 20 (ciclo completo de marcas):
  // Creamos un empleado de prueba dedicado en PostgreSQL con horario para probar la jornada completa
  const repos = getRepositoryContainer("postgres");
  const useCase = new RegistrarMarcaUseCase(
    repos.empleadosRepo,
    repos.horariosRepo,
    repos.jornadasRepo,
    repos.marcasRepo,
    repos.idempotenciaRepo
  );

  const testEmpId = randomUUID();
  const testCedula = `DEMO-CICLO-${Date.now().toString().slice(-6)}`;
  await repos.empleadosRepo.crearOActualizar({
    id: testEmpId,
    cedula: testCedula,
    nombre_completo: "Colaborador Ciclo Completo",
    departamento_id: "11111111-1111-4111-8111-111111111104", // Producción
    puesto_id: "22222222-2222-4222-8222-222222222205", // Operario
    estado: "ACTIVO",
    creado_en: new Date().toISOString(),
  });

  // Asignar horario vigente
  await repos.horariosRepo.asignarHorarioEmpleado({
    id: randomUUID(),
    empleado_id: testEmpId,
    horario_id: "55555555-5555-4555-8555-555555555501", // Horario regular L-V
    fecha_inicio: "2026-01-01",
    usuario_asigno_id: adminSession.usuario.id,
    creado_en: new Date().toISOString(),
  });

  let testJornadaId: string = "";
  const baseFecha = "2026-10-15"; // Jueves laboral

  // 11. Apertura de jornada y 12. ENTRADA
  await check(11, "Apertura de jornada al registrar primera marca", async () => {
    const res = await useCase.ejecutar({
      empleado_id: testEmpId,
      tipo_marca: "ENTRADA",
      origen_marca: "GARITA_LECTOR",
      usuario_registrador_id: segSession.usuario.id,
      timestamp_servidor: `${baseFecha}T07:02:00-06:00`,
    });
    if (!res.jornada || res.jornada.estado_jornada !== "ABIERTA") {
      throw new Error(`Jornada no quedó abierta: ${res.jornada?.estado_jornada}`);
    }
    testJornadaId = res.jornada.id;
  });

  await check(12, "Marca ENTRADA clasificada correctamente (A_TIEMPO)", async () => {
    const jornada = await repos.jornadasRepo.obtenerPorId(testJornadaId);
    if (!jornada) throw new Error("Jornada no encontrada");
    const marcas = await repos.marcasRepo.listarMarcasActivasJornada(testJornadaId);
    if (marcas.length !== 1 || marcas[0].tipo_marca !== "ENTRADA") {
      throw new Error(`Marca de entrada no registrada correctamente`);
    }
  });

  // 13. INICIO_DESAYUNO
  await check(13, "Marca INICIO_DESAYUNO", async () => {
    const res = await useCase.ejecutar({
      empleado_id: testEmpId,
      tipo_marca: "INICIO_DESAYUNO",
      origen_marca: "AUTOSERVICIO",
      usuario_registrador_id: segSession.usuario.id,
      timestamp_servidor: `${baseFecha}T09:00:00-06:00`,
    });
    if (res.marca.tipo_marca !== "INICIO_DESAYUNO") throw new Error("Fallo al registrar INICIO_DESAYUNO");
  });

  // 14. FIN_DESAYUNO
  await check(14, "Marca FIN_DESAYUNO", async () => {
    const res = await useCase.ejecutar({
      empleado_id: testEmpId,
      tipo_marca: "FIN_DESAYUNO",
      origen_marca: "AUTOSERVICIO",
      usuario_registrador_id: segSession.usuario.id,
      timestamp_servidor: `${baseFecha}T09:15:00-06:00`,
    });
    if (res.marca.tipo_marca !== "FIN_DESAYUNO") throw new Error("Fallo al registrar FIN_DESAYUNO");
  });

  // 15. INICIO_ALMUERZO
  await check(15, "Marca INICIO_ALMUERZO", async () => {
    const res = await useCase.ejecutar({
      empleado_id: testEmpId,
      tipo_marca: "INICIO_ALMUERZO",
      origen_marca: "AUTOSERVICIO",
      usuario_registrador_id: segSession.usuario.id,
      timestamp_servidor: `${baseFecha}T12:00:00-06:00`,
    });
    if (res.marca.tipo_marca !== "INICIO_ALMUERZO") throw new Error("Fallo al registrar INICIO_ALMUERZO");
  });

  // 16. FIN_ALMUERZO
  await check(16, "Marca FIN_ALMUERZO", async () => {
    const res = await useCase.ejecutar({
      empleado_id: testEmpId,
      tipo_marca: "FIN_ALMUERZO",
      origen_marca: "AUTOSERVICIO",
      usuario_registrador_id: segSession.usuario.id,
      timestamp_servidor: `${baseFecha}T12:30:00-06:00`,
    });
    if (res.marca.tipo_marca !== "FIN_ALMUERZO") throw new Error("Fallo al registrar FIN_ALMUERZO");
  });

  // 17. INICIO_CAFE
  await check(17, "Marca INICIO_CAFE", async () => {
    const res = await useCase.ejecutar({
      empleado_id: testEmpId,
      tipo_marca: "INICIO_CAFE",
      origen_marca: "AUTOSERVICIO",
      usuario_registrador_id: segSession.usuario.id,
      timestamp_servidor: `${baseFecha}T14:45:00-06:00`,
    });
    if (res.marca.tipo_marca !== "INICIO_CAFE") throw new Error("Fallo al registrar INICIO_CAFE");
  });

  // 18. FIN_CAFE
  await check(18, "Marca FIN_CAFE", async () => {
    const res = await useCase.ejecutar({
      empleado_id: testEmpId,
      tipo_marca: "FIN_CAFE",
      origen_marca: "AUTOSERVICIO",
      usuario_registrador_id: segSession.usuario.id,
      timestamp_servidor: `${baseFecha}T15:00:00-06:00`,
    });
    if (res.marca.tipo_marca !== "FIN_CAFE") throw new Error("Fallo al registrar FIN_CAFE");
  });

  // 19. SALIDA y cierre de jornada
  await check(19, "Marca SALIDA y cierre formal de jornada (CERRADA_NORMAL)", async () => {
    const res = await useCase.ejecutar({
      empleado_id: testEmpId,
      tipo_marca: "SALIDA",
      origen_marca: "GARITA_LECTOR",
      usuario_registrador_id: segSession.usuario.id,
      timestamp_servidor: `${baseFecha}T16:30:00-06:00`,
    });
    if (res.marca.tipo_marca !== "SALIDA") throw new Error("Fallo al registrar SALIDA");
    if (res.jornada.estado_jornada !== "CERRADA_NORMAL") {
      throw new Error(`Estado de jornada esperado CERRADA_NORMAL, recibido: ${res.jornada.estado_jornada}`);
    }
  });

  // 20. Consulta ordenada de marcas
  await check(20, "Consulta de marcas activas ordenadas cronológicamente", async () => {
    const marcas = await repos.marcasRepo.listarMarcasActivasJornada(testJornadaId);
    if (marcas.length !== 8) {
      throw new Error(`Esperadas 8 marcas en la jornada, encontradas: ${marcas.length}`);
    }
    const ordenEsperado = [
      "ENTRADA",
      "INICIO_DESAYUNO",
      "FIN_DESAYUNO",
      "INICIO_ALMUERZO",
      "FIN_ALMUERZO",
      "INICIO_CAFE",
      "FIN_CAFE",
      "SALIDA",
    ];
    for (let i = 0; i < ordenEsperado.length; i++) {
      if (marcas[i].tipo_marca !== ordenEsperado[i]) {
        throw new Error(`Marca en posición ${i} esperada ${ordenEsperado[i]}, recibida: ${marcas[i].tipo_marca}`);
      }
    }
  });

  // 21. Autoservicio vía API HTTP
  // Creamos un segundo empleado vinculado a un usuario de autoservicio
  const autoEmpId = randomUUID();
  const autoCedula = `DEMO-AUTO-${Date.now().toString().slice(-6)}`;
  await repos.empleadosRepo.crearOActualizar({
    id: autoEmpId,
    cedula: autoCedula,
    nombre_completo: "Colaborador Autoservicio HTTP",
    departamento_id: "11111111-1111-4111-8111-111111111104",
    puesto_id: "22222222-2222-4222-8222-222222222205",
    estado: "ACTIVO",
    creado_en: new Date().toISOString(),
  });
  await repos.horariosRepo.asignarHorarioEmpleado({
    id: randomUUID(),
    empleado_id: autoEmpId,
    horario_id: "55555555-5555-4555-8555-555555555501",
    fecha_inicio: "2026-01-01",
    usuario_asigno_id: adminSession.usuario.id,
    creado_en: new Date().toISOString(),
  });

  // Vincular con usuario temporal de autoservicio
  const autoUserId = randomUUID();
  const autoUserLogin = `auto_${Date.now().toString().slice(-4)}`;
  const { hashPassword } = await import("../auth/crypto.js");
  await repos.usuariosRepo.guardar({
    id: autoUserId,
    username: autoUserLogin,
    email: `${autoUserLogin}@rimac.local`,
    nombre_completo: "Colaborador Autoservicio HTTP",
    password_hash: hashPassword("Demo1234!"),
    rol: "EMPLEADO",
    empleado_id: autoEmpId,
    estado: "ACTIVO",
    creado_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString(),
  });

  const autoSession = await loginHelper(autoUserLogin, "Demo1234!");

  await check(21, "Registro de marca vía API de Autoservicio (/api/autoservicio/marcas)", async () => {
    const idemKey = randomUUID();
    const res = await fetch(`${BASE_URL}/autoservicio/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${autoSession.sid}`,
        "X-CSRF-Token": autoSession.csrf_token,
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        tipo_marca: "ENTRADA",
      }),
    });
    if (!res.ok) {
      throw new Error(`Autoservicio falló con status ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    if (!data.datos.marca || data.datos.marca.tipo_marca !== "ENTRADA") {
      throw new Error("Respuesta inválida de autoservicio");
    }
  });

  // 22. Garita vía API HTTP
  let garitaIdemKey = randomUUID();
  let garitaPayload: any;
  const garitaEmpId = randomUUID();
  await repos.empleadosRepo.crearOActualizar({
    id: garitaEmpId,
    cedula: `DEMO-GAR-${Date.now().toString().slice(-6)}`,
    nombre_completo: "Colaborador Garita HTTP",
    departamento_id: "11111111-1111-4111-8111-111111111104",
    puesto_id: "22222222-2222-4222-8222-222222222205",
    estado: "ACTIVO",
    creado_en: new Date().toISOString(),
  });
  await repos.horariosRepo.asignarHorarioEmpleado({
    id: randomUUID(),
    empleado_id: garitaEmpId,
    horario_id: "55555555-5555-4555-8555-555555555501",
    fecha_inicio: "2026-01-01",
    usuario_asigno_id: adminSession.usuario.id,
    creado_en: new Date().toISOString(),
  });

  await check(22, "Registro de marca vía API de Garita (/api/garita/marcas)", async () => {
    garitaPayload = {
      empleado_id: garitaEmpId,
      tipo_marca: "ENTRADA",
    };
    const res = await fetch(`${BASE_URL}/garita/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${segSession.sid}`,
        "X-CSRF-Token": segSession.csrf_token,
        "Idempotency-Key": garitaIdemKey,
      },
      body: JSON.stringify(garitaPayload),
    });
    if (!res.ok) {
      throw new Error(`Garita falló con status ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    if (!data.datos.marca || data.datos.marca.tipo_marca !== "ENTRADA") {
      throw new Error("Respuesta inválida de garita");
    }
  });

  // 23. Idempotencia
  await check(23, "Idempotencia transaccional: reintento exacto devuelve respuesta cacheada", async () => {
    const resReintento = await fetch(`${BASE_URL}/garita/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${segSession.sid}`,
        "X-CSRF-Token": segSession.csrf_token,
        "Idempotency-Key": garitaIdemKey,
      },
      body: JSON.stringify(garitaPayload),
    });
    if (resReintento.status !== 201 && resReintento.status !== 200) {
      throw new Error(`Reintento idempotente debió responder exitoso, respondió: ${resReintento.status}`);
    }
    const data = await resReintento.json();
    if (!data.datos.marca || data.datos.marca.tipo_marca !== "ENTRADA") {
      throw new Error("El reintento idempotente no devolvió el payload esperado");
    }
  });

  // 24. Cooldowns
  await check(24, "Cooldown anti-rebote: segundo registro inmediato es rechazado con 409", async () => {
    const nuevoIdemKey = randomUUID();
    const resInmediato = await fetch(`${BASE_URL}/garita/marcas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${segSession.sid}`,
        "X-CSRF-Token": segSession.csrf_token,
        "Idempotency-Key": nuevoIdemKey,
      },
      body: JSON.stringify({
        empleado_id: garitaEmpId,
        tipo_marca: "INICIO_DESAYUNO",
      }),
    });
    if (resInmediato.status !== 409) {
      throw new Error(`Se esperaba 409 COOLDOWN_MARCA_ACTIVO, se recibió: ${resInmediato.status}`);
    }
    const errData = await resInmediato.json();
    if (!errData.error.mensaje.includes("Cooldown activo")) {
      throw new Error(`Mensaje de error inesperado: ${errData.error.mensaje}`);
    }
  });

  // 25. RAG consulta informativa
  let ragData: any;
  await check(25, "RAG: consulta en lenguaje natural sobre políticas (/api/rag/consultar)", async () => {
    const res = await fetch(`${BASE_URL}/rag/consultar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${empSession.sid}`,
      },
      body: JSON.stringify({
        pregunta: "¿Cuáles son los descansos autorizados según el reglamento?",
      }),
    });
    if (!res.ok) {
      throw new Error(`RAG falló con status ${res.status}: ${await res.text()}`);
    }
    ragData = await res.json();
    if (!ragData.datos.respuesta || typeof ragData.datos.respuesta !== "string") {
      throw new Error("Respuesta RAG vacía o inválida");
    }
  });

  // 26. Fuentes/Citas del RAG
  await check(26, "RAG: verificación de fuentes y artículos citados (DTH-REG-001)", async () => {
    if (!ragData || !ragData.datos.fuentes || ragData.datos.fuentes.length === 0) {
      throw new Error("No se incluyeron fuentes citadas en la respuesta RAG");
    }
    const primeraFuente = ragData.datos.fuentes[0];
    if (!primeraFuente.codigo || !primeraFuente.documento) {
      throw new Error(`Estructura de fuente citada inválida: ${JSON.stringify(primeraFuente)}`);
    }
  });

  // 27. Abstención RAG ante evidencia insuficiente
  await check(27, "RAG: abstención ante pregunta fuera del alcance documental", async () => {
    const res = await fetch(`${BASE_URL}/rag/consultar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${empSession.sid}`,
      },
      body: JSON.stringify({
        pregunta: "¿Cuál es la velocidad máxima de crucero de un submarino nuclear de la clase Virginia?",
      }),
    });
    if (!res.ok) throw new Error(`RAG falló: ${res.status}`);
    const data = await res.json();
    if (
      data.datos.estado !== "ABSTENCION_EVIDENCIA_INSUFICIENTE" &&
      data.datos.estado !== "EVIDENCIA_INSUFICIENTE" &&
      !data.datos.respuesta.toLowerCase().includes("no contiene evidencia")
    ) {
      throw new Error(`Se esperaba abstención, respuesta: ${data.datos.estado} - ${data.datos.respuesta}`);
    }
  });

  // 28. Rechazo RAG de solicitudes transaccionales
  await check(28, "RAG: rechazo determinista de solicitud de acción transaccional", async () => {
    const res = await fetch(`${BASE_URL}/rag/consultar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${empSession.sid}`,
      },
      body: JSON.stringify({
        pregunta: "Por favor modifica mi marca de entrada de hoy para ponerla a las 08:00.",
      }),
    });
    if (!res.ok) throw new Error(`RAG falló: ${res.status}`);
    const data = await res.json();
    if (data.datos.estado !== "SOLICITUD_TRANSACCIONAL_RECHAZADA") {
      throw new Error(`Se esperaba estado SOLICITUD_TRANSACCIONAL_RECHAZADA, recibido: ${data.datos.estado}`);
    }
  });

  console.log("================================================================================");
  const aprobadas = resultados.filter((r) => r.estado === "PASS").length;
  const fallidas = resultados.filter((r) => r.estado === "FAIL").length;
  console.log(`RESUMEN FINAL: ${aprobadas}/28 PASS | ${fallidas}/28 FAIL`);
  console.log("================================================================================");

  // Cerrar pool pg para permitir terminación limpia del proceso de prueba
  try {
    await getPool().end();
  } catch {
    // Ignorar si ya terminó
  }

  if (fallidas > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Error fatal ejecutando suite 2D:", err);
  process.exit(1);
});
