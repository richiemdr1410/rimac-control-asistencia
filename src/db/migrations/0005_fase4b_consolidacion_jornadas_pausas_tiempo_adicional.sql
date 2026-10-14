-- Migración 0005: Consolidación de Jornadas, Pausas y Tiempo Adicional (Fase 4B)

-- 1. Ampliar columnas en tabla jornadas para consolidación y aprobación de tiempo adicional
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS minutos_tiempo_adicional_aprobado SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS estado_tiempo_adicional VARCHAR(30) NOT NULL DEFAULT 'NO_APLICA'
  CHECK (estado_tiempo_adicional IN ('NO_APLICA', 'PENDIENTE', 'APROBADO_TOTAL', 'APROBADO_PARCIAL', 'RECHAZADO'));
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS usuario_aprobo_ta_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS fecha_resolucion_ta TIMESTAMPTZ;
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS motivo_resolucion_ta TEXT;
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS es_feriado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS minutos_tiempo_total SMALLINT NOT NULL DEFAULT 0;

-- 2. Registrar nuevos permisos RBAC en catálogo para Fase 4B
INSERT INTO permisos (codigo, modulo, descripcion, critico, creado_en)
VALUES
  ('JORNADAS_DETALLE_VER', 'Jornadas', 'Consultar detalle y consolidación de jornada laboral', false, NOW()),
  ('TIEMPO_ADICIONAL_VER', 'Jornadas', 'Consultar tiempo adicional y horas trabajadas fuera de horario', false, NOW()),
  ('JORNADAS_TIEMPO_EXTRA_APROBAR', 'Jornadas', 'Aprobar horas y tiempo adicional de colaboradores subordinados', false, NOW())
ON CONFLICT (codigo) DO UPDATE SET
  modulo = EXCLUDED.modulo,
  descripcion = EXCLUDED.descripcion;

-- 3. Matriz inicial Rol-Permiso según especificación de gobierno Fase 4B
-- ADMINISTRADOR
INSERT INTO roles_permisos (rol, permiso_codigo, activo)
VALUES
  ('ADMINISTRADOR', 'JORNADAS_DETALLE_VER', true),
  ('ADMINISTRADOR', 'TIEMPO_ADICIONAL_VER', true),
  ('ADMINISTRADOR', 'JORNADAS_TIEMPO_EXTRA_APROBAR', true),

-- TALENTO_HUMANO
  ('TALENTO_HUMANO', 'JORNADAS_DETALLE_VER', true),
  ('TALENTO_HUMANO', 'TIEMPO_ADICIONAL_VER', true),
  ('TALENTO_HUMANO', 'JORNADAS_TIEMPO_EXTRA_APROBAR', true),

-- SUPERVISOR_SEGURIDAD
  ('SUPERVISOR_SEGURIDAD', 'JORNADAS_DETALLE_VER', true),
  ('SUPERVISOR_SEGURIDAD', 'TIEMPO_ADICIONAL_VER', true),
  ('SUPERVISOR_SEGURIDAD', 'JORNADAS_TIEMPO_EXTRA_APROBAR', true),

-- EMPLEADO (consulta propia únicamente; no puede aprobar)
  ('EMPLEADO', 'JORNADAS_DETALLE_VER', true),
  ('EMPLEADO', 'TIEMPO_ADICIONAL_VER', true),
  ('EMPLEADO', 'JORNADAS_TIEMPO_EXTRA_APROBAR', false),

-- SEGURIDAD (cuenta operacional sin acceso personal por defecto)
  ('SEGURIDAD', 'JORNADAS_DETALLE_VER', false),
  ('SEGURIDAD', 'TIEMPO_ADICIONAL_VER', false),
  ('SEGURIDAD', 'JORNADAS_TIEMPO_EXTRA_APROBAR', false)
ON CONFLICT (rol, permiso_codigo) DO UPDATE SET activo = EXCLUDED.activo;
