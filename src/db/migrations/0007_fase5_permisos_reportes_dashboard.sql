-- ====================================================================
-- FASE 5: MIGRACIÓN DE PERMISOS DE REPORTERÍA, DASHBOARD Y ANALÍTICA
-- Agroquímica Industrial RIMAC S.A.
-- ====================================================================

-- 1. Catálogo de Permisos Canónicos de Reportería
INSERT INTO permisos (codigo, modulo, descripcion, critico, creado_en)
VALUES
  ('REPORTES_PERSONALES_VER', 'Reportes', 'Consultar reportes correspondientes exclusivamente al empleado autenticado', false, NOW()),
  ('REPORTES_EQUIPO_VER', 'Reportes', 'Consultar reportes de subordinados vigentes mediante ABAC', false, NOW()),
  ('REPORTES_INSTITUCIONALES_VER', 'Reportes', 'Consultar información global de la organización', false, NOW()),
  ('REPORTES_EXPORTAR', 'Reportes', 'Exportar resultados autorizados de reportes', false, NOW())
ON CONFLICT (codigo) DO UPDATE SET
  modulo = EXCLUDED.modulo,
  descripcion = EXCLUDED.descripcion;

-- 2. Matriz Inicial Rol-Permiso Fase 5
-- ADMINISTRADOR
INSERT INTO roles_permisos (rol, permiso_codigo, activo)
VALUES
  ('ADMINISTRADOR', 'REPORTES_PERSONALES_VER', true),
  ('ADMINISTRADOR', 'REPORTES_EQUIPO_VER', true),
  ('ADMINISTRADOR', 'REPORTES_INSTITUCIONALES_VER', true),
  ('ADMINISTRADOR', 'REPORTES_EXPORTAR', true),

-- TALENTO_HUMANO
  ('TALENTO_HUMANO', 'REPORTES_PERSONALES_VER', true),
  ('TALENTO_HUMANO', 'REPORTES_EQUIPO_VER', true),
  ('TALENTO_HUMANO', 'REPORTES_INSTITUCIONALES_VER', true),
  ('TALENTO_HUMANO', 'REPORTES_EXPORTAR', true),

-- SUPERVISOR_SEGURIDAD
  ('SUPERVISOR_SEGURIDAD', 'REPORTES_PERSONALES_VER', true),
  ('SUPERVISOR_SEGURIDAD', 'REPORTES_EQUIPO_VER', true),
  ('SUPERVISOR_SEGURIDAD', 'REPORTES_INSTITUCIONALES_VER', false),
  ('SUPERVISOR_SEGURIDAD', 'REPORTES_EXPORTAR', true),

-- EMPLEADO
  ('EMPLEADO', 'REPORTES_PERSONALES_VER', true),
  ('EMPLEADO', 'REPORTES_EQUIPO_VER', true), -- Capacidad efectiva sólo si posee subordinados ABAC
  ('EMPLEADO', 'REPORTES_INSTITUCIONALES_VER', false),
  ('EMPLEADO', 'REPORTES_EXPORTAR', false),

-- SEGURIDAD
  ('SEGURIDAD', 'REPORTES_PERSONALES_VER', false),
  ('SEGURIDAD', 'REPORTES_EQUIPO_VER', false),
  ('SEGURIDAD', 'REPORTES_INSTITUCIONALES_VER', false),
  ('SEGURIDAD', 'REPORTES_EXPORTAR', false)
ON CONFLICT (rol, permiso_codigo) DO UPDATE SET activo = EXCLUDED.activo;
