import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  smallint,
  integer,
  numeric,
  timestamp,
  date,
  time,
  jsonb,
  bigserial,
  inet,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 1. usuarios
export const usuarios = pgTable("usuarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  nombre_completo: varchar("nombre_completo", { length: 150 }).notNull(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  rol: varchar("rol", { length: 30 }).notNull(),
  empleado_id: uuid("empleado_id").unique(),
  estado: varchar("estado", { length: 20 }).default("ACTIVO").notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 2. sesiones
export const sesiones = pgTable("sesiones", {
  id: varchar("id", { length: 128 }).primaryKey(),
  usuario_id: uuid("usuario_id").references(() => usuarios.id, { onDelete: "cascade" }).notNull(),
  csrf_token: varchar("csrf_token", { length: 128 }).notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  ultimo_acceso_en: timestamp("ultimo_acceso_en", { withTimezone: true }).defaultNow().notNull(),
  expira_en: timestamp("expira_en", { withTimezone: true }).notNull(),
  revocada: boolean("revocada").default(false).notNull(),
  ip_origen: inet("ip_origen"),
  user_agent: text("user_agent"),
});

// 3. idempotencia_solicitudes
export const idempotencia_solicitudes = pgTable("idempotencia_solicitudes", {
  id: varchar("id", { length: 128 }).primaryKey(),
  usuario_id: uuid("usuario_id").references(() => usuarios.id, { onDelete: "restrict" }).notNull(),
  ruta_endpoint: varchar("ruta_endpoint", { length: 200 }).notNull(),
  idempotency_key: varchar("idempotency_key", { length: 128 }).notNull(),
  payload_hash: varchar("payload_hash", { length: 64 }).notNull(),
  status_code: smallint("status_code").notNull(),
  response_body: jsonb("response_body").notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 4. departamentos
export const departamentos = pgTable("departamentos", {
  id: uuid("id").defaultRandom().primaryKey(),
  codigo: varchar("codigo", { length: 20 }).notNull().unique(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  activo: boolean("activo").default(true).notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 5. puestos
export const puestos = pgTable("puestos", {
  id: uuid("id").defaultRandom().primaryKey(),
  departamento_id: uuid("departamento_id").references(() => departamentos.id, { onDelete: "restrict" }).notNull(),
  codigo: varchar("codigo", { length: 20 }).notNull().unique(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  activo: boolean("activo").default(true).notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 6. empleados
export const empleados = pgTable("empleados", {
  id: uuid("id").defaultRandom().primaryKey(),
  cedula: varchar("cedula", { length: 30 }).notNull().unique(),
  nombre_completo: varchar("nombre_completo", { length: 150 }).notNull(),
  correo_laboral: varchar("correo_laboral", { length: 255 }).unique(),
  telefono: varchar("telefono", { length: 30 }),
  departamento_id: uuid("departamento_id").notNull(),
  puesto_id: uuid("puesto_id").notNull(),
  referencia_foto: varchar("referencia_foto", { length: 255 }),
  estado: varchar("estado", { length: 20 }).default("ACTIVO").notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 7. asignaciones_jefatura
export const asignaciones_jefatura = pgTable("asignaciones_jefatura", {
  id: uuid("id").defaultRandom().primaryKey(),
  jefatura_empleado_id: uuid("jefatura_empleado_id").references(() => empleados.id, { onDelete: "restrict" }).notNull(),
  subordinado_empleado_id: uuid("subordinado_empleado_id").references(() => empleados.id, { onDelete: "restrict" }).notNull(),
  fecha_inicio: date("fecha_inicio").notNull(),
  fecha_fin: date("fecha_fin"),
  estado: varchar("estado", { length: 20 }).default("ACTIVA").notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 8. configuraciones_sistema
export const configuraciones_sistema = pgTable("configuraciones_sistema", {
  clave: varchar("clave", { length: 50 }).primaryKey(),
  valor: varchar("valor", { length: 255 }).notNull(),
  tipo_dato: varchar("tipo_dato", { length: 20 }).notNull(),
  descripcion: text("descripcion").notNull(),
  actualizado_por_id: uuid("actualizado_por_id").references(() => usuarios.id, { onDelete: "restrict" }).notNull(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 9. horarios
export const horarios = pgTable("horarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  codigo: varchar("codigo", { length: 30 }).notNull().unique(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  tolerancia_entrada_minutos: smallint("tolerancia_entrada_minutos").default(0).notNull(),
  minutos_semanales_referencia: integer("minutos_semanales_referencia").default(2880).notNull(),
  minutos_desayuno_max: smallint("minutos_desayuno_max").default(15).notNull(),
  minutos_almuerzo_max: smallint("minutos_almuerzo_max").default(30).notNull(),
  minutos_cafe_max: smallint("minutos_cafe_max").default(15).notNull(),
  estado: varchar("estado", { length: 20 }).default("ACTIVO").notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 10. horario_detalles_dia
export const horario_detalles_dia = pgTable("horario_detalles_dia", {
  id: uuid("id").defaultRandom().primaryKey(),
  horario_id: uuid("horario_id").references(() => horarios.id, { onDelete: "cascade" }).notNull(),
  dia_semana: smallint("dia_semana").notNull(),
  es_laborable: boolean("es_laborable").notNull(),
  hora_entrada: time("hora_entrada"),
  hora_salida: time("hora_salida"),
  cruza_medianoche: boolean("cruza_medianoche").default(false).notNull(),
  minutos_esperados: smallint("minutos_esperados").default(0).notNull(),
});

// 11. asignaciones_horario
export const asignaciones_horario = pgTable("asignaciones_horario", {
  id: uuid("id").defaultRandom().primaryKey(),
  empleado_id: uuid("empleado_id").references(() => empleados.id, { onDelete: "restrict" }).notNull(),
  horario_id: uuid("horario_id").references(() => horarios.id, { onDelete: "restrict" }).notNull(),
  fecha_inicio: date("fecha_inicio").notNull(),
  fecha_fin: date("fecha_fin"),
  usuario_asigno_id: uuid("usuario_asigno_id").references(() => usuarios.id, { onDelete: "restrict" }).notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 12. feriados
export const feriados = pgTable("feriados", {
  id: uuid("id").defaultRandom().primaryKey(),
  fecha: date("fecha").notNull().unique(),
  descripcion: varchar("descripcion", { length: 150 }).notNull(),
  tipo_feriado: varchar("tipo_feriado", { length: 30 }).notNull(),
  activo: boolean("activo").default(true).notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 13. jornadas
export const jornadas = pgTable("jornadas", {
  id: uuid("id").defaultRandom().primaryKey(),
  empleado_id: uuid("empleado_id").references(() => empleados.id, { onDelete: "restrict" }).notNull(),
  fecha_jornada: date("fecha_jornada").notNull(),
  estado_jornada: varchar("estado_jornada", { length: 30 }).notNull(),
  horario_id_aplicado: uuid("horario_id_aplicado").references(() => horarios.id, { onDelete: "restrict" }).notNull(),
  snapshot_horario: jsonb("snapshot_horario").notNull(),
  hora_entrada_marcada: timestamp("hora_entrada_marcada", { withTimezone: true }),
  hora_entrada_calculo: timestamp("hora_entrada_calculo", { withTimezone: true }),
  origen_entrada_calculo: varchar("origen_entrada_calculo", { length: 40 }).default("MARCA_FISICA").notNull(),
  hora_salida_marcada: timestamp("hora_salida_marcada", { withTimezone: true }),
  hora_salida_calculo: timestamp("hora_salida_calculo", { withTimezone: true }),
  origen_salida_calculo: varchar("origen_salida_calculo", { length: 40 }).default("MARCA_FISICA").notNull(),
  es_salida_regularizada: boolean("es_salida_regularizada").default(false).notNull(),
  usuario_regularizo_id: uuid("usuario_regularizo_id").references(() => usuarios.id, { onDelete: "restrict" }),
  regularizacion_motivo: text("regularizacion_motivo"),
  regularizada_en: timestamp("regularizada_en", { withTimezone: true }),
  minutos_desayuno: smallint("minutos_desayuno").default(0).notNull(),
  minutos_almuerzo: smallint("minutos_almuerzo").default(0).notNull(),
  minutos_cafe: smallint("minutos_cafe").default(0).notNull(),
  minutos_total_descansos: smallint("minutos_total_descansos").default(0).notNull(),
  minutos_exceso_desayuno: smallint("minutos_exceso_desayuno").default(0).notNull(),
  minutos_exceso_almuerzo: smallint("minutos_exceso_almuerzo").default(0).notNull(),
  minutos_exceso_cafe: smallint("minutos_exceso_cafe").default(0).notNull(),
  minutos_total_excesos_descanso: smallint("minutos_total_excesos_descanso").default(0).notNull(),
  minutos_efectivos: smallint("minutos_efectivos").default(0).notNull(),
  minutos_tardanza: smallint("minutos_tardanza").default(0).notNull(),
  minutos_salida_anticipada: smallint("minutos_salida_anticipada").default(0).notNull(),
  minutos_tiempo_total: smallint("minutos_tiempo_total").default(0).notNull(),
  minutos_tiempo_adicional: smallint("minutos_tiempo_adicional").default(0).notNull(),
  minutos_tiempo_adicional_aprobado: smallint("minutos_tiempo_adicional_aprobado").default(0).notNull(),
  estado_tiempo_adicional: varchar("estado_tiempo_adicional", { length: 30 }).default("NO_APLICA").notNull(),
  usuario_aprobo_ta_id: uuid("usuario_aprobo_ta_id").references(() => usuarios.id, { onDelete: "set null" }),
  fecha_resolucion_ta: timestamp("fecha_resolucion_ta", { withTimezone: true }),
  motivo_resolucion_ta: text("motivo_resolucion_ta"),
  es_feriado: boolean("es_feriado").default(false).notNull(),
  minutos_justificados_comp: smallint("minutos_justificados_comp").default(0).notNull(),
  minutos_justificados_nocomp: smallint("minutos_justificados_nocomp").default(0).notNull(),
  cumplimiento_porcentaje: numeric("cumplimiento_porcentaje", { precision: 5, scale: 2 }).default("0.00").notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 14. marcas
export const marcas = pgTable("marcas", {
  id: uuid("id").defaultRandom().primaryKey(),
  jornada_id: uuid("jornada_id").references(() => jornadas.id, { onDelete: "restrict" }).notNull(),
  empleado_id: uuid("empleado_id").references(() => empleados.id, { onDelete: "restrict" }).notNull(),
  tipo_marca: varchar("tipo_marca", { length: 30 }).notNull(),
  timestamp_servidor: timestamp("timestamp_servidor", { withTimezone: true }).notNull(),
  canal_marca: varchar("canal_marca", { length: 30 }).notNull(),
  usuario_registrador_id: uuid("usuario_registrador_id").references(() => usuarios.id, { onDelete: "restrict" }).notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 15. correcciones_marcas
export const correcciones_marcas = pgTable(
  "correcciones_marcas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marca_original_id: uuid("marca_original_id").references(() => marcas.id, { onDelete: "restrict" }).notNull(),
    tipo_ajuste: varchar("tipo_ajuste", { length: 30 }).notNull(),
    timestamp_propuesto: timestamp("timestamp_propuesto", { withTimezone: true }),
    tipo_marca_propuesto: varchar("tipo_marca_propuesto", { length: 30 }),
    motivo: text("motivo").notNull(),
    usuario_solicito_id: uuid("usuario_solicito_id").references(() => usuarios.id, { onDelete: "restrict" }).notNull(),
    usuario_autorizo_id: uuid("usuario_autorizo_id").references(() => usuarios.id, { onDelete: "restrict" }),
    estado: varchar("estado", { length: 20 }).default("PENDIENTE").notNull(),
    fecha_resolucion: timestamp("fecha_resolucion", { withTimezone: true }),
    creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_corr_marca_unica_pendiente")
      .on(table.marca_original_id)
      .where(sql`estado = 'PENDIENTE'`),
    uniqueIndex("idx_corr_marca_unica_aprobada")
      .on(table.marca_original_id)
      .where(sql`estado = 'APROBADA'`),
  ]
);

// 16. incidencias
export const incidencias = pgTable("incidencias", {
  id: uuid("id").defaultRandom().primaryKey(),
  jornada_id: uuid("jornada_id").references(() => jornadas.id, { onDelete: "restrict" }).notNull(),
  empleado_id: uuid("empleado_id").references(() => empleados.id, { onDelete: "restrict" }).notNull(),
  tipo_incidencia: varchar("tipo_incidencia", { length: 40 }).notNull(),
  descripcion: text("descripcion").notNull(),
  minutos_afectados: integer("minutos_afectados").default(0).notNull(),
  estado: varchar("estado", { length: 20 }).default("ABIERTA").notNull(),
  resolucion_motivo: text("resolucion_motivo"),
  usuario_resolvio_id: uuid("usuario_resolvio_id").references(() => usuarios.id, { onDelete: "restrict" }),
  fecha_resolucion: timestamp("fecha_resolucion", { withTimezone: true }),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 17. politicas_solicitud
export const politicas_solicitud = pgTable("politicas_solicitud", {
  id: uuid("id").defaultRandom().primaryKey(),
  tipo_solicitud: varchar("tipo_solicitud", { length: 40 }).notNull().unique(),
  requiere_evidencia: boolean("requiere_evidencia").default(false).notNull(),
  niveles_aprobacion_requeridos: smallint("niveles_aprobacion_requeridos").default(1).notNull(),
  rol_aprobador_nivel_1: varchar("rol_aprobador_nivel_1", { length: 30 }).notNull(),
  rol_aprobador_nivel_2: varchar("rol_aprobador_nivel_2", { length: 30 }),
  activo: boolean("activo").default(true).notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 18. solicitudes_justificacion
export const solicitudes_justificacion = pgTable("solicitudes_justificacion", {
  id: uuid("id").defaultRandom().primaryKey(),
  empleado_id: uuid("empleado_id").references(() => empleados.id, { onDelete: "restrict" }).notNull(),
  politica_id: uuid("politica_id").references(() => politicas_solicitud.id, { onDelete: "restrict" }).notNull(),
  tipo_solicitud: varchar("tipo_solicitud", { length: 40 }).notNull(),
  fecha_inicio: date("fecha_inicio").notNull(),
  fecha_fin: date("fecha_fin").notNull(),
  fecha_hora_inicio: timestamp("fecha_hora_inicio", { withTimezone: true }),
  fecha_hora_fin: timestamp("fecha_hora_fin", { withTimezone: true }),
  minutos_solicitados: integer("minutos_solicitados").notNull(),
  motivo: text("motivo").notNull(),
  estado: varchar("estado", { length: 30 }).default("PENDIENTE").notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 19. solicitud_decisiones
export const solicitud_decisiones = pgTable("solicitud_decisiones", {
  id: uuid("id").defaultRandom().primaryKey(),
  solicitud_id: uuid("solicitud_id").references(() => solicitudes_justificacion.id, { onDelete: "restrict" }).notNull(),
  nivel: smallint("nivel").notNull(),
  rol_evaluador: varchar("rol_evaluador", { length: 30 }).notNull(),
  usuario_decisor_id: uuid("usuario_decisor_id").references(() => usuarios.id, { onDelete: "restrict" }).notNull(),
  decision: varchar("decision", { length: 20 }).notNull(),
  comentarios: text("comentarios"),
  fecha_decision: timestamp("fecha_decision", { withTimezone: true }).defaultNow().notNull(),
});

// 20. solicitud_evidencias
export const solicitud_evidencias = pgTable("solicitud_evidencias", {
  id: uuid("id").defaultRandom().primaryKey(),
  solicitud_id: uuid("solicitud_id").references(() => solicitudes_justificacion.id, { onDelete: "restrict" }).notNull(),
  nombre_archivo: varchar("nombre_archivo", { length: 255 }).notNull(),
  tipo_mime: varchar("tipo_mime", { length: 100 }).notNull(),
  referencia_almacenamiento: varchar("referencia_almacenamiento", { length: 500 }).notNull(),
  hash_archivo: varchar("hash_archivo", { length: 64 }).notNull(),
  cargado_por_usuario_id: uuid("cargado_por_usuario_id").references(() => usuarios.id, { onDelete: "restrict" }).notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 21. auditoria_eventos
export const auditoria_eventos = pgTable("auditoria_eventos", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actor_usuario_id: uuid("actor_usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  rol_actor: varchar("rol_actor", { length: 30 }).notNull(),
  accion: varchar("accion", { length: 50 }).notNull(),
  entidad_tipo: varchar("entidad_tipo", { length: 50 }).notNull(),
  entidad_id: varchar("entidad_id", { length: 64 }).notNull(),
  timestamp_evento: timestamp("timestamp_evento", { withTimezone: true }).defaultNow().notNull(),
  motivo: text("motivo"),
  valor_anterior: jsonb("valor_anterior"),
  valor_nuevo: jsonb("valor_nuevo"),
  ip_origen: inet("ip_origen"),
  user_agent: text("user_agent"),
});

// 22. rag_documentos
export const rag_documentos = pgTable("rag_documentos", {
  id: uuid("id").defaultRandom().primaryKey(),
  codigo: varchar("codigo", { length: 50 }).notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  version: varchar("version", { length: 20 }).notNull(),
  descripcion: text("descripcion"),
  fecha_vigencia: date("fecha_vigencia"),
  estado_procesamiento: varchar("estado_procesamiento", { length: 30 }).default("LISTO").notNull(),
  error_mensaje: text("error_mensaje"),
  hash_archivo: varchar("hash_archivo", { length: 64 }),
  nombre_archivo_original: varchar("nombre_archivo_original", { length: 255 }),
  ruta_almacenamiento: text("ruta_almacenamiento"),
  tamano_bytes: integer("tamano_bytes"),
  mime_type: varchar("mime_type", { length: 100 }).default("application/pdf"),
  total_paginas: integer("total_paginas").default(1).notNull(),
  total_fragmentos: integer("total_fragmentos").default(0).notNull(),
  creado_por_id: uuid("creado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
  activo: boolean("activo").default(false).notNull(),
  activado_en: timestamp("activado_en", { withTimezone: true }),
  activado_por_id: uuid("activado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("rag_documentos_codigo_version_idx").on(table.codigo, table.version),
]);

// 23. rag_chunks
export const rag_chunks = pgTable("rag_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  documento_id: uuid("documento_id").references(() => rag_documentos.id, { onDelete: "cascade" }).notNull(),
  chunk_codigo: varchar("chunk_codigo", { length: 100 }).notNull(),
  titulo_seccion: varchar("titulo_seccion", { length: 200 }).notNull(),
  articulo: varchar("articulo", { length: 100 }).notNull(),
  pagina: integer("pagina").notNull(),
  contenido: text("contenido").notNull(),
  vector_referencia_id: varchar("vector_referencia_id", { length: 128 }),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("rag_chunks_doc_chunk_idx").on(table.documento_id, table.chunk_codigo),
]);

// 24. permisos
export const permisos = pgTable("permisos", {
  codigo: varchar("codigo", { length: 60 }).primaryKey(),
  modulo: varchar("modulo", { length: 40 }).notNull(),
  descripcion: text("descripcion").notNull(),
  critico: boolean("critico").default(false).notNull(),
  creado_en: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
});

// 25. roles_permisos
export const roles_permisos = pgTable(
  "roles_permisos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rol: varchar("rol", { length: 30 }).notNull(),
    permiso_codigo: varchar("permiso_codigo", { length: 60 })
      .references(() => permisos.codigo, { onDelete: "cascade" })
      .notNull(),
    activo: boolean("activo").default(true).notNull(),
    actualizado_por_usuario_id: uuid("actualizado_por_usuario_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    actualizado_en: timestamp("actualizado_en", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_roles_permisos_rol_codigo").on(table.rol, table.permiso_codigo),
  ]
);
