-- ============================================================================
-- MIGRACIÓN 0001: Esquema Relacional Base (23 Tablas)
-- Agroquímica Industrial RIMAC S.A. - Control de Asistencia y Jornadas
-- ============================================================================

-- 1. Extensión para Exclusion Constraints (GiST sobre escalares y rangos)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Módulo de Seguridad y Cuentas (Tablas 1 - 3)
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  nombre_completo VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(30) NOT NULL CHECK (rol IN ('ADMINISTRADOR', 'TALENTO_HUMANO', 'SEGURIDAD', 'SUPERVISOR_SEGURIDAD', 'EMPLEADO')),
  empleado_id UUID UNIQUE,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO', 'BLOQUEADO')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sesiones (
  id VARCHAR(128) PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  csrf_token VARCHAR(128) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_acceso_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_en TIMESTAMPTZ NOT NULL,
  revocada BOOLEAN NOT NULL DEFAULT FALSE,
  ip_origen INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario_activa ON sesiones (usuario_id, revocada, expira_en);
CREATE INDEX IF NOT EXISTS idx_sesiones_expiracion ON sesiones (expira_en) WHERE revocada = FALSE;

CREATE TABLE IF NOT EXISTS idempotencia_solicitudes (
  id VARCHAR(128) PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  ruta_endpoint VARCHAR(200) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  status_code SMALLINT NOT NULL,
  response_body JSONB NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_idempotencia_usuario_ruta_key UNIQUE (usuario_id, ruta_endpoint, idempotency_key)
);

-- 3. Módulo Organizacional y Expedientes (Tablas 4 - 7)
CREATE TABLE IF NOT EXISTS departamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS puestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE RESTRICT,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_puestos_id_depto UNIQUE (id, departamento_id)
);

CREATE TABLE IF NOT EXISTS empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula VARCHAR(30) NOT NULL UNIQUE,
  nombre_completo VARCHAR(150) NOT NULL,
  correo_laboral VARCHAR(255) UNIQUE,
  telefono VARCHAR(30),
  departamento_id UUID NOT NULL,
  puesto_id UUID NOT NULL,
  referencia_foto VARCHAR(255),
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_empleados_puesto_depto FOREIGN KEY (puesto_id, departamento_id) REFERENCES puestos(id, departamento_id) ON DELETE RESTRICT
);

-- Vincular clave foránea de usuarios hacia empleados (si existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_usuarios_empleado_id'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT fk_usuarios_empleado_id
      FOREIGN KEY (empleado_id) REFERENCES empleados(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS asignaciones_jefatura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jefatura_empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  subordinado_empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  vigencia_rango DATERANGE GENERATED ALWAYS AS (daterange(fecha_inicio, COALESCE(fecha_fin, 'infinity'::date), '[]')) STORED,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'INACTIVA')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_jefatura_no_autoasociada CHECK (jefatura_empleado_id <> subordinado_empleado_id),
  CONSTRAINT chk_jefatura_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT no_solapamiento_jefatura_subordinado EXCLUDE USING gist (
    subordinado_empleado_id WITH =,
    vigencia_rango WITH &&
  ) WHERE (estado = 'ACTIVA')
);

-- 4. Módulo de Configuración, Horarios y Feriados (Tablas 8 - 12)
CREATE TABLE IF NOT EXISTS configuraciones_sistema (
  clave VARCHAR(50) PRIMARY KEY,
  valor VARCHAR(255) NOT NULL,
  tipo_dato VARCHAR(20) NOT NULL CHECK (tipo_dato IN ('INTEGER', 'STRING', 'BOOLEAN', 'TIME')),
  descripcion TEXT NOT NULL,
  actualizado_por_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(30) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  tolerancia_entrada_minutos SMALLINT NOT NULL DEFAULT 0 CHECK (tolerancia_entrada_minutos >= 0),
  minutos_semanales_referencia INTEGER NOT NULL DEFAULT 2880,
  minutos_desayuno_max SMALLINT NOT NULL DEFAULT 15 CHECK (minutos_desayuno_max >= 0),
  minutos_almuerzo_max SMALLINT NOT NULL DEFAULT 30 CHECK (minutos_almuerzo_max >= 0),
  minutos_cafe_max SMALLINT NOT NULL DEFAULT 15 CHECK (minutos_cafe_max >= 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS horario_detalles_dia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horario_id UUID NOT NULL REFERENCES horarios(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  es_laborable BOOLEAN NOT NULL,
  hora_entrada TIME,
  hora_salida TIME,
  cruza_medianoche BOOLEAN NOT NULL DEFAULT FALSE,
  minutos_esperados SMALLINT NOT NULL DEFAULT 0 CHECK (minutos_esperados >= 0),
  CONSTRAINT uq_horario_dia UNIQUE (horario_id, dia_semana),
  CONSTRAINT chk_horario_laborable CHECK (es_laborable = FALSE OR (hora_entrada IS NOT NULL AND hora_salida IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS asignaciones_horario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  horario_id UUID NOT NULL REFERENCES horarios(id) ON DELETE RESTRICT,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  vigencia_rango DATERANGE GENERATED ALWAYS AS (daterange(fecha_inicio, COALESCE(fecha_fin, 'infinity'::date), '[]')) STORED,
  usuario_asigno_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_asig_horario_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT no_solapamiento_horario_empleado EXCLUDE USING gist (
    empleado_id WITH =,
    vigencia_rango WITH &&
  )
);

CREATE TABLE IF NOT EXISTS feriados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL UNIQUE,
  descripcion VARCHAR(150) NOT NULL,
  tipo_feriado VARCHAR(30) NOT NULL CHECK (tipo_feriado IN ('PAGO_OBLIGATORIO', 'PAGO_NO_OBLIGATORIO', 'INSTITUCIONAL')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Módulo de Jornadas, Marcas y Correcciones (Tablas 13 - 16)
CREATE TABLE IF NOT EXISTS jornadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  fecha_jornada DATE NOT NULL,
  estado_jornada VARCHAR(30) NOT NULL CHECK (estado_jornada IN ('ABIERTA', 'CERRADA_NORMAL', 'REGISTRO_INCOMPLETO', 'AUSENCIA_INJUSTIFICADA', 'JUSTIFICADA_TOTAL', 'REGULARIZADA')),
  horario_id_aplicado UUID NOT NULL REFERENCES horarios(id) ON DELETE RESTRICT,
  snapshot_horario JSONB NOT NULL,
  hora_entrada_marcada TIMESTAMPTZ,
  hora_entrada_calculo TIMESTAMPTZ,
  origen_entrada_calculo VARCHAR(40) NOT NULL DEFAULT 'MARCA_FISICA' CHECK (origen_entrada_calculo IN ('MARCA_FISICA', 'REGULARIZACION_MANUAL', 'NO_REGISTRADA')),
  hora_salida_marcada TIMESTAMPTZ,
  hora_salida_calculo TIMESTAMPTZ,
  origen_salida_calculo VARCHAR(40) NOT NULL DEFAULT 'MARCA_FISICA' CHECK (origen_salida_calculo IN ('MARCA_FISICA', 'SALIDA_PROGRAMADA_REGULARIZADA', 'REGULARIZACION_MANUAL', 'SIN_SALIDA')),
  es_salida_regularizada BOOLEAN NOT NULL DEFAULT FALSE,
  usuario_regularizo_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
  regularizacion_motivo TEXT,
  regularizada_en TIMESTAMPTZ,
  minutos_desayuno SMALLINT NOT NULL DEFAULT 0,
  minutos_almuerzo SMALLINT NOT NULL DEFAULT 0,
  minutos_cafe SMALLINT NOT NULL DEFAULT 0,
  minutos_total_descansos SMALLINT NOT NULL DEFAULT 0,
  minutos_exceso_desayuno SMALLINT NOT NULL DEFAULT 0,
  minutos_exceso_almuerzo SMALLINT NOT NULL DEFAULT 0,
  minutos_exceso_cafe SMALLINT NOT NULL DEFAULT 0,
  minutos_total_excesos_descanso SMALLINT NOT NULL DEFAULT 0,
  minutos_efectivos SMALLINT NOT NULL DEFAULT 0,
  minutos_tardanza SMALLINT NOT NULL DEFAULT 0,
  minutos_salida_anticipada SMALLINT NOT NULL DEFAULT 0,
  minutos_tiempo_adicional SMALLINT NOT NULL DEFAULT 0,
  minutos_justificados_comp SMALLINT NOT NULL DEFAULT 0,
  minutos_justificados_nocomp SMALLINT NOT NULL DEFAULT 0,
  cumplimiento_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (cumplimiento_porcentaje >= 0.00),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_jornada_empleado_fecha UNIQUE (empleado_id, fecha_jornada)
);

CREATE TABLE IF NOT EXISTS marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id UUID NOT NULL REFERENCES jornadas(id) ON DELETE RESTRICT,
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  tipo_marca VARCHAR(30) NOT NULL CHECK (tipo_marca IN ('ENTRADA', 'SALIDA', 'INICIO_DESAYUNO', 'FIN_DESAYUNO', 'INICIO_ALMUERZO', 'FIN_ALMUERZO', 'INICIO_CAFE', 'FIN_CAFE')),
  timestamp_servidor TIMESTAMPTZ NOT NULL,
  canal_marca VARCHAR(30) NOT NULL CHECK (canal_marca IN ('GARITA', 'COMEDOR', 'COMPUTADORA_EMPLEADO')),
  usuario_registrador_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS correcciones_marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_original_id UUID NOT NULL REFERENCES marcas(id) ON DELETE RESTRICT,
  tipo_ajuste VARCHAR(30) NOT NULL CHECK (tipo_ajuste IN ('ANULACION_LOGICA', 'SUSTITUCION_TIMESTAMP', 'SUSTITUCION_TIPO')),
  timestamp_propuesto TIMESTAMPTZ,
  tipo_marca_propuesto VARCHAR(30) CHECK (tipo_marca_propuesto IS NULL OR tipo_marca_propuesto IN ('ENTRADA', 'SALIDA', 'INICIO_DESAYUNO', 'FIN_DESAYUNO', 'INICIO_ALMUERZO', 'FIN_ALMUERZO', 'INICIO_CAFE', 'FIN_CAFE')),
  motivo TEXT NOT NULL,
  usuario_solicito_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  usuario_autorizo_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  fecha_resolucion TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_correccion_resolucion CHECK (estado = 'PENDIENTE' OR (usuario_autorizo_id IS NOT NULL AND fecha_resolucion IS NOT NULL))
);

-- Índices Únicos Parciales en correcciones_marcas:
-- Máximo 1 corrección pendiente a la vez por marca original
CREATE UNIQUE INDEX IF NOT EXISTS idx_corr_marca_unica_pendiente 
  ON correcciones_marcas (marca_original_id) 
  WHERE estado = 'PENDIENTE';

-- Máximo 1 corrección aprobada vigente por marca original
CREATE UNIQUE INDEX IF NOT EXISTS idx_corr_marca_unica_aprobada 
  ON correcciones_marcas (marca_original_id) 
  WHERE estado = 'APROBADA';

CREATE TABLE IF NOT EXISTS incidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id UUID NOT NULL REFERENCES jornadas(id) ON DELETE RESTRICT,
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  tipo_incidencia VARCHAR(40) NOT NULL CHECK (tipo_incidencia IN ('SALIDA_OMITIDA', 'SECUENCIA_ANORMAL', 'NUEVA_ENTRADA_CON_JORNADA_ABIERTA', 'EXCESO_DESAYUNO', 'EXCESO_ALMUERZO', 'EXCESO_CAFE', 'TIEMPO_ADICIONAL_PENDIENTE', 'AUSENCIA_INJUSTIFICADA')),
  descripcion TEXT NOT NULL,
  minutos_afectados INTEGER NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'JUSTIFICADA', 'REGULARIZADA', 'DESCARTADA')),
  resolucion_motivo TEXT,
  usuario_resolvio_id UUID REFERENCES usuarios(id) ON DELETE RESTRICT,
  fecha_resolucion TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_incidencia_resolucion CHECK (estado = 'ABIERTA' OR (usuario_resolvio_id IS NOT NULL AND fecha_resolucion IS NOT NULL))
);

-- 6. Módulo de Políticas, Solicitudes, Decisiones y Evidencias (Tablas 17 - 20)
CREATE TABLE IF NOT EXISTS politicas_solicitud (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_solicitud VARCHAR(40) NOT NULL UNIQUE CHECK (tipo_solicitud IN ('PERMISO_CON_GOCE', 'PERMISO_SIN_GOCE', 'VACACIONES', 'INCAPACIDAD', 'JUSTIFICACION_OMISION_MARCA', 'TIEMPO_EXTRAORDINARIO')),
  requiere_evidencia BOOLEAN NOT NULL DEFAULT FALSE,
  niveles_aprobacion_requeridos SMALLINT NOT NULL DEFAULT 1 CHECK (niveles_aprobacion_requeridos BETWEEN 1 AND 2),
  rol_aprobador_nivel_1 VARCHAR(30) NOT NULL,
  rol_aprobador_nivel_2 VARCHAR(30),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solicitudes_justificacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  politica_id UUID NOT NULL REFERENCES politicas_solicitud(id) ON DELETE RESTRICT,
  tipo_solicitud VARCHAR(40) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  fecha_hora_inicio TIMESTAMPTZ,
  fecha_hora_fin TIMESTAMPTZ,
  minutos_solicitados INTEGER NOT NULL CHECK (minutos_solicitados > 0),
  motivo TEXT NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_solicitud_rango_fechas CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT chk_solicitud_rango_horas CHECK (fecha_hora_fin IS NULL OR fecha_hora_fin > fecha_hora_inicio)
);

CREATE TABLE IF NOT EXISTS solicitud_decisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES solicitudes_justificacion(id) ON DELETE RESTRICT,
  nivel SMALLINT NOT NULL CHECK (nivel BETWEEN 1 AND 2),
  rol_evaluador VARCHAR(30) NOT NULL,
  usuario_decisor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('APROBADA', 'RECHAZADA', 'OBSERVADA')),
  comentarios TEXT,
  fecha_decision TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_solicitud_nivel_decision UNIQUE (solicitud_id, nivel)
);

CREATE TABLE IF NOT EXISTS solicitud_evidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES solicitudes_justificacion(id) ON DELETE RESTRICT,
  nombre_archivo VARCHAR(255) NOT NULL,
  tipo_mime VARCHAR(100) NOT NULL,
  referencia_almacenamiento VARCHAR(500) NOT NULL,
  hash_archivo VARCHAR(64) NOT NULL,
  cargado_por_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Módulo de Auditoría (Tabla 21)
CREATE TABLE IF NOT EXISTS auditoria_eventos (
  id BIGSERIAL PRIMARY KEY,
  actor_usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  rol_actor VARCHAR(30) NOT NULL,
  accion VARCHAR(50) NOT NULL,
  entidad_tipo VARCHAR(50) NOT NULL,
  entidad_id VARCHAR(64) NOT NULL,
  timestamp_evento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  motivo TEXT,
  valor_anterior JSONB,
  valor_nuevo JSONB,
  ip_origen INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria_eventos (entidad_tipo, entidad_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_timestamp ON auditoria_eventos (timestamp_evento DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_actor ON auditoria_eventos (actor_usuario_id, timestamp_evento DESC);

-- 8. Módulo RAG Documental Desacoplado (Tablas 22 - 23)
CREATE TABLE IF NOT EXISTS rag_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) NOT NULL UNIQUE,
  titulo VARCHAR(200) NOT NULL,
  version VARCHAR(20) NOT NULL,
  total_paginas INTEGER NOT NULL DEFAULT 1,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES rag_documentos(id) ON DELETE CASCADE,
  chunk_codigo VARCHAR(100) NOT NULL UNIQUE,
  titulo_seccion VARCHAR(200) NOT NULL,
  articulo VARCHAR(100) NOT NULL,
  pagina INTEGER NOT NULL,
  contenido TEXT NOT NULL,
  vector_referencia_id VARCHAR(128),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc_chunk ON rag_chunks (documento_id, chunk_codigo);

-- ============================================================================
-- 9. TRIGGERS DE INMUTABILIDAD EN BASE DE DATOS
-- ============================================================================

-- A. Marcas: Append-Only Absoluto
CREATE OR REPLACE FUNCTION trg_prevent_update_delete_marcas()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La tabla marcas es inmutable (append-only). Operaciones UPDATE y DELETE están prohibidas.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS marcas_immutable_trg ON marcas;
CREATE TRIGGER marcas_immutable_trg
BEFORE UPDATE OR DELETE ON marcas
FOR EACH ROW EXECUTE FUNCTION trg_prevent_update_delete_marcas();

-- B. Auditoría: Append-Only Absoluto
CREATE OR REPLACE FUNCTION trg_prevent_update_delete_auditoria()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La tabla auditoria_eventos es inmutable (append-only). Operaciones UPDATE y DELETE están prohibidas.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditoria_immutable_trg ON auditoria_eventos;
CREATE TRIGGER auditoria_immutable_trg
BEFORE UPDATE OR DELETE ON auditoria_eventos
FOR EACH ROW EXECUTE FUNCTION trg_prevent_update_delete_auditoria();

-- C. Decisiones de Solicitud: Append-Only Absoluto
CREATE OR REPLACE FUNCTION trg_prevent_update_delete_decisiones()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La tabla solicitud_decisiones es inmutable (append-only). Operaciones UPDATE y DELETE están prohibidas.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS decisiones_immutable_trg ON solicitud_decisiones;
CREATE TRIGGER decisiones_immutable_trg
BEFORE UPDATE OR DELETE ON solicitud_decisiones
FOR EACH ROW EXECUTE FUNCTION trg_prevent_update_delete_decisiones();

-- D. Correcciones de Marcas: Inmutables una vez APROBADA o RECHAZADA
CREATE OR REPLACE FUNCTION trg_prevent_resolved_correccion_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF (OLD.estado IN ('APROBADA', 'RECHAZADA')) THEN
      RAISE EXCEPTION 'No se permite eliminar una corrección de marca resuelta con estado %', OLD.estado;
    END IF;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.estado IN ('APROBADA', 'RECHAZADA')) THEN
      RAISE EXCEPTION 'No se permite modificar una corrección de marca resuelta con estado %', OLD.estado;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS correcciones_resolved_immutable_trg ON correcciones_marcas;
CREATE TRIGGER correcciones_resolved_immutable_trg
BEFORE UPDATE OR DELETE ON correcciones_marcas
FOR EACH ROW EXECUTE FUNCTION trg_prevent_resolved_correccion_modification();
