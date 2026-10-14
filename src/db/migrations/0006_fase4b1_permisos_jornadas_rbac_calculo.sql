-- Migración 0006: Corrección Quirúrgica Fase 4B.1 - Permisos, RBAC/ABAC y Recálculo Histórico de Jornadas

-- 1. Catálogo de Permisos Canónicos para Fase 4B.1
INSERT INTO permisos (codigo, modulo, descripcion, critico, creado_en)
VALUES
  ('JORNADAS_PERSONALES_VER', 'Jornadas', 'Consultar marcas, pausas, incidencias y consolidación de jornada personal (Autoservicio)', false, NOW()),
  ('JORNADAS_EQUIPO_VER', 'Jornadas', 'Consultar jornadas y pausas de colaboradores subordinados bajo alcance ABAC', false, NOW()),
  ('JORNADAS_INSTITUCIONALES_VER', 'Jornadas', 'Consultar y auditar jornadas de colaboradores a nivel institucional', false, NOW()),
  ('TIEMPO_ADICIONAL_VER', 'Jornadas', 'Consultar tiempo adicional detectado y horas trabajadas fuera de horario', false, NOW()),
  ('JORNADAS_TIEMPO_EXTRA_APROBAR', 'Jornadas', 'Aprobar o rechazar tiempo adicional detectado de colaboradores subordinados', false, NOW()),
  ('JORNADAS_DETALLE_VER', 'Jornadas', 'Consultar detalle y consolidación de jornada laboral (compatibilidad)', false, NOW())
ON CONFLICT (codigo) DO UPDATE SET
  modulo = EXCLUDED.modulo,
  descripcion = EXCLUDED.descripcion;

-- 2. Matriz Inicial Rol-Permiso Fase 4B.1
-- ADMINISTRADOR
INSERT INTO roles_permisos (rol, permiso_codigo, activo)
VALUES
  ('ADMINISTRADOR', 'JORNADAS_PERSONALES_VER', true),
  ('ADMINISTRADOR', 'JORNADAS_EQUIPO_VER', true),
  ('ADMINISTRADOR', 'JORNADAS_INSTITUCIONALES_VER', true),
  ('ADMINISTRADOR', 'TIEMPO_ADICIONAL_VER', true),
  ('ADMINISTRADOR', 'JORNADAS_TIEMPO_EXTRA_APROBAR', true),
  ('ADMINISTRADOR', 'JORNADAS_DETALLE_VER', true),

-- TALENTO_HUMANO
  ('TALENTO_HUMANO', 'JORNADAS_PERSONALES_VER', true),
  ('TALENTO_HUMANO', 'JORNADAS_EQUIPO_VER', true),
  ('TALENTO_HUMANO', 'JORNADAS_INSTITUCIONALES_VER', true),
  ('TALENTO_HUMANO', 'TIEMPO_ADICIONAL_VER', true),
  ('TALENTO_HUMANO', 'JORNADAS_TIEMPO_EXTRA_APROBAR', true),
  ('TALENTO_HUMANO', 'JORNADAS_DETALLE_VER', true),

-- SUPERVISOR_SEGURIDAD
  ('SUPERVISOR_SEGURIDAD', 'JORNADAS_PERSONALES_VER', true),
  ('SUPERVISOR_SEGURIDAD', 'JORNADAS_EQUIPO_VER', true),
  ('SUPERVISOR_SEGURIDAD', 'JORNADAS_INSTITUCIONALES_VER', false),
  ('SUPERVISOR_SEGURIDAD', 'TIEMPO_ADICIONAL_VER', true),
  ('SUPERVISOR_SEGURIDAD', 'JORNADAS_TIEMPO_EXTRA_APROBAR', true),
  ('SUPERVISOR_SEGURIDAD', 'JORNADAS_DETALLE_VER', true),

-- EMPLEADO
  ('EMPLEADO', 'JORNADAS_PERSONALES_VER', true),
  ('EMPLEADO', 'JORNADAS_EQUIPO_VER', true), -- Capacidad efectiva sólo cuando posea subordinados ABAC
  ('EMPLEADO', 'JORNADAS_INSTITUCIONALES_VER', false),
  ('EMPLEADO', 'TIEMPO_ADICIONAL_VER', true), -- Consulta propia únicamente
  ('EMPLEADO', 'JORNADAS_TIEMPO_EXTRA_APROBAR', false),
  ('EMPLEADO', 'JORNADAS_DETALLE_VER', true),

-- SEGURIDAD (Sin acceso personal ni administrativo por defecto)
  ('SEGURIDAD', 'JORNADAS_PERSONALES_VER', false),
  ('SEGURIDAD', 'JORNADAS_EQUIPO_VER', false),
  ('SEGURIDAD', 'JORNADAS_INSTITUCIONALES_VER', false),
  ('SEGURIDAD', 'TIEMPO_ADICIONAL_VER', false),
  ('SEGURIDAD', 'JORNADAS_TIEMPO_EXTRA_APROBAR', false),
  ('SEGURIDAD', 'JORNADAS_DETALLE_VER', false)
ON CONFLICT (rol, permiso_codigo) DO UPDATE SET activo = EXCLUDED.activo;

-- 3. Recálculo histórico y corrección de tiempo total en jornadas con entrada y salida
UPDATE jornadas
SET minutos_tiempo_total = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (hora_salida_calculo - hora_entrada_calculo)) / 60)::smallint),
    minutos_efectivos = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (hora_salida_calculo - hora_entrada_calculo)) / 60)::smallint - COALESCE(minutos_total_descansos, 0)::smallint)
WHERE hora_entrada_calculo IS NOT NULL 
  AND hora_salida_calculo IS NOT NULL 
  AND (minutos_tiempo_total = 0 OR minutos_tiempo_total IS NULL);
