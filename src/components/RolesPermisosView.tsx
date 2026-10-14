import React, { useState, useEffect } from "react";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import { useAuth, type RolUsuario } from "../context/AuthContext";
import {
  ShieldAlert,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  RotateCcw,
  Sliders,
} from "lucide-react";

interface Permiso {
  codigo: string;
  modulo: string;
  descripcion: string;
  critico: boolean;
}

interface MatrizRolesPermisosResponse {
  roles: RolUsuario[];
  permisos: Permiso[];
  asignaciones: Record<RolUsuario, string[]>;
}

const ROLES_ORDER: { rol: RolUsuario; label: string; badgeClass: string }[] = [
  { rol: "ADMINISTRADOR", label: "Administrador", badgeClass: "bg-purple-100 text-purple-800 border-purple-200" },
  { rol: "TALENTO_HUMANO", label: "Talento Humano", badgeClass: "bg-blue-100 text-blue-800 border-blue-200" },
  { rol: "SUPERVISOR_SEGURIDAD", label: "Sup. Seguridad", badgeClass: "bg-amber-100 text-amber-800 border-amber-200" },
  { rol: "SEGURIDAD", label: "Seguridad", badgeClass: "bg-slate-100 text-slate-800 border-slate-200" },
  { rol: "EMPLEADO", label: "Empleado", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200" },
];

export const RolesPermisosView: React.FC = () => {
  const { tienePermiso, recargarSesion } = useAuth();
  const [cargando, setCargando] = useState<boolean>(true);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exitoMsg, setExitoMsg] = useState<string | null>(null);

  const [permisos, setPermisos] = useState<Permiso[]>([]);
  // Matriz original desde backend
  const [matrizOriginal, setMatrizOriginal] = useState<Record<RolUsuario, Set<string>>>({
    ADMINISTRADOR: new Set(),
    TALENTO_HUMANO: new Set(),
    SUPERVISOR_SEGURIDAD: new Set(),
    SEGURIDAD: new Set(),
    EMPLEADO: new Set(),
  });
  // Matriz editable en el cliente
  const [matrizEditada, setMatrizEditada] = useState<Record<RolUsuario, Set<string>>>({
    ADMINISTRADOR: new Set(),
    TALENTO_HUMANO: new Set(),
    SUPERVISOR_SEGURIDAD: new Set(),
    SEGURIDAD: new Set(),
    EMPLEADO: new Set(),
  });

  // Modal de confirmación
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);

  const cargarDatos = async () => {
    setCargando(true);
    setErrorMsg(null);
    setExitoMsg(null);
    try {
      const res = await apiRequest<{ exito: boolean; datos: MatrizRolesPermisosResponse }>(
        "/api/admin/roles-permisos"
      );
      if (res && res.exito && res.datos) {
        setPermisos(res.datos.permisos || []);
        const orig: Record<RolUsuario, Set<string>> = {
          ADMINISTRADOR: new Set(res.datos.asignaciones.ADMINISTRADOR || []),
          TALENTO_HUMANO: new Set(res.datos.asignaciones.TALENTO_HUMANO || []),
          SUPERVISOR_SEGURIDAD: new Set(res.datos.asignaciones.SUPERVISOR_SEGURIDAD || []),
          SEGURIDAD: new Set(res.datos.asignaciones.SEGURIDAD || []),
          EMPLEADO: new Set(res.datos.asignaciones.EMPLEADO || []),
        };
        setMatrizOriginal(orig);
        // Clonar para edición
        setMatrizEditada({
          ADMINISTRADOR: new Set(orig.ADMINISTRADOR),
          TALENTO_HUMANO: new Set(orig.TALENTO_HUMANO),
          SUPERVISOR_SEGURIDAD: new Set(orig.SUPERVISOR_SEGURIDAD),
          SEGURIDAD: new Set(orig.SEGURIDAD),
          EMPLEADO: new Set(orig.EMPLEADO),
        });
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (tienePermiso("ROLES_PERMISOS_ADMINISTRAR")) {
      cargarDatos();
    }
  }, []);

  if (!tienePermiso("ROLES_PERMISOS_ADMINISTRAR")) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl">
          <ShieldAlert className="w-12 h-12 mx-auto text-rose-500 mb-3" />
          <h2 className="text-lg font-bold">Acceso Denegado</h2>
          <p className="text-sm mt-1">
            No posee el permiso administrativo <code>ROLES_PERMISOS_ADMINISTRAR</code> para acceder a este módulo.
          </p>
        </div>
      </div>
    );
  }

  // Detectar cambios realizados
  const obtenerCambios = (): Array<{ rol: RolUsuario; permiso: string; accion: "activar" | "desactivar"; descripcion: string }> => {
    const cambios: Array<{ rol: RolUsuario; permiso: string; accion: "activar" | "desactivar"; descripcion: string }> = [];
    const permMap = new Map(permisos.map((p) => [p.codigo, p.descripcion]));

    for (const item of ROLES_ORDER) {
      const rol = item.rol;
      const orig = matrizOriginal[rol];
      const edit = matrizEditada[rol];

      // Permisos agregados
      for (const p of edit) {
        if (!orig.has(p)) {
          cambios.push({
            rol,
            permiso: p,
            accion: "activar",
            descripcion: permMap.get(p) || p,
          });
        }
      }

      // Permisos eliminados
      for (const p of orig) {
        if (!edit.has(p)) {
          cambios.push({
            rol,
            permiso: p,
            accion: "desactivar",
            descripcion: permMap.get(p) || p,
          });
        }
      }
    }
    return cambios;
  };

  const listaCambios = obtenerCambios();
  const hayCambios = listaCambios.length > 0;

  const togglePermiso = (rol: RolUsuario, codigo: string) => {
    setMatrizEditada((prev) => {
      const nuevoSet = new Set(prev[rol]);
      if (nuevoSet.has(codigo)) {
        nuevoSet.delete(codigo);
      } else {
        nuevoSet.add(codigo);
      }
      return {
        ...prev,
        [rol]: nuevoSet,
      };
    });
  };

  const descartarCambios = () => {
    setMatrizEditada({
      ADMINISTRADOR: new Set(matrizOriginal.ADMINISTRADOR),
      TALENTO_HUMANO: new Set(matrizOriginal.TALENTO_HUMANO),
      SUPERVISOR_SEGURIDAD: new Set(matrizOriginal.SUPERVISOR_SEGURIDAD),
      SEGURIDAD: new Set(matrizOriginal.SEGURIDAD),
      EMPLEADO: new Set(matrizOriginal.EMPLEADO),
    });
    setExitoMsg(null);
    setErrorMsg(null);
  };

  const guardarCambios = async () => {
    setGuardando(true);
    setErrorMsg(null);
    setExitoMsg(null);

    try {
      // Identificar qué roles tuvieron cambios
      const rolesConCambios: RolUsuario[] = [];
      for (const item of ROLES_ORDER) {
        const rol = item.rol;
        const orig = matrizOriginal[rol];
        const edit = matrizEditada[rol];
        let cambio = false;
        if (orig.size !== edit.size) {
          cambio = true;
        } else {
          for (const p of edit) {
            if (!orig.has(p)) {
              cambio = true;
              break;
            }
          }
        }
        if (cambio) {
          rolesConCambios.push(rol);
        }
      }

      for (const rol of rolesConCambios) {
        const payload = {
          permisos_activos: Array.from(matrizEditada[rol]),
        };
        await apiRequest(`/api/admin/roles-permisos/${rol}`, {
          method: "PUT",
          body: payload,
        });
      }

      setExitoMsg(`Se actualizaron con éxito las asignaciones de ${rolesConCambios.length} rol(es).`);
      setModalAbierto(false);
      await recargarSesion();
      await cargarDatos();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
      setModalAbierto(false);
    } finally {
      setGuardando(false);
    }
  };

  // Agrupar permisos por módulo
  const modulosMap = new Map<string, Permiso[]>();
  for (const p of permisos) {
    if (!modulosMap.has(p.modulo)) {
      modulosMap.set(p.modulo, []);
    }
    modulosMap.get(p.modulo)!.push(p);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Encabezado */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Administración de Roles y Permisos (RBAC)
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Configuración central de capacidades funcionales para los 5 roles canónicos del sistema
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={cargarDatos}
            disabled={cargando || guardando}
            className="inline-flex items-center px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${cargando ? "animate-spin text-[#009944]" : ""}`} />
            Recargar
          </button>

          {hayCambios && (
            <button
              type="button"
              onClick={descartarCambios}
              disabled={guardando}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Descartar
            </button>
          )}

          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            disabled={!hayCambios || guardando}
            className={`inline-flex items-center px-4 py-2 text-xs font-bold rounded-xl shadow-xs transition-all ${
              hayCambios
                ? "bg-[#009944] text-white hover:bg-[#008038] cursor-pointer"
                : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
            }`}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Guardar Cambios {hayCambios && `(${listaCambios.length})`}
          </button>
        </div>
      </div>

      {/* Banners de estado */}
      {exitoMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{exitoMsg}</span>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-semibold">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Nota de Principio Arquitectónico */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex items-start space-x-3 text-xs text-amber-900">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Regla de Arquitectura:</span> Los roles canónicos son estrictamente 5. Los permisos determinan capacidades funcionales en la aplicación. Las relaciones jerárquicas (jefaturas directas) y el acceso a recursos propios continúan regidos por el modelo <strong>ABAC</strong> y la prohibición absoluta de autoaprobación.
        </div>
      </div>

      {/* Tabla Matriz */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-bold">
                <th className="py-3.5 px-4 w-2/5">Permiso / Capacidad Funcional</th>
                {ROLES_ORDER.map((item) => (
                  <th key={item.rol} className="py-3.5 px-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${item.badgeClass}`}>
                      {item.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from(modulosMap.entries()).map(([modulo, permisosModulo]) => (
                <React.Fragment key={modulo}>
                  {/* Fila separadora de módulo */}
                  <tr className="bg-slate-100/70 border-y border-slate-200/60 font-bold text-slate-700">
                    <td colSpan={6} className="py-2 px-4 uppercase tracking-wider text-[11px] text-slate-600">
                      Módulo: {modulo} ({permisosModulo.length} capacidades)
                    </td>
                  </tr>

                  {/* Filas de permisos del módulo */}
                  {permisosModulo.map((p) => (
                    <tr key={p.codigo} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-start space-x-2">
                          {p.critico ? (
                            <span
                              title="Permiso Crítico de Seguridad"
                              className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 shrink-0"
                            >
                              <Lock className="w-2.5 h-2.5 mr-1" />
                              CRÍTICO
                            </span>
                          ) : null}
                          <div>
                            <span className="font-semibold text-slate-800 block text-xs">
                              {p.descripcion}
                            </span>
                            <code className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                              {p.codigo}
                            </code>
                          </div>
                        </div>
                      </td>

                      {ROLES_ORDER.map((item) => {
                        const rol = item.rol;
                        const activo = matrizEditada[rol]?.has(p.codigo) ?? false;
                        const originalActivo = matrizOriginal[rol]?.has(p.codigo) ?? false;
                        const modificado = activo !== originalActivo;

                        return (
                          <td key={rol} className={`py-3 px-3 text-center ${modificado ? "bg-amber-50/40" : ""}`}>
                            <label className="inline-flex items-center justify-center cursor-pointer p-1">
                              <input
                                type="checkbox"
                                checked={activo}
                                onChange={() => togglePermiso(rol, p.codigo)}
                                className="w-4 h-4 text-[#009944] rounded border-slate-300 focus:ring-[#009944] cursor-pointer"
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmación de Cambios */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Confirmar Modificación de Permisos
                </h3>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Revise el resumen de cambios antes de aplicar las modificaciones a la matriz de seguridad:
              </p>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
                {listaCambios.map((c, i) => (
                  <div key={i} className="p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800">{c.rol}: </span>
                      <span className="text-slate-600">{c.descripcion}</span>
                      <code className="block text-[10px] text-slate-400 font-mono mt-0.5">
                        {c.permiso}
                      </code>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ml-3 ${
                        c.accion === "activar"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-rose-100 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {c.accion === "activar" ? "+ ACTIVAR" : "- DESACTIVAR"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-500">
                Cada cambio será registrado formalmente en la bitácora transaccional <code>auditoria_eventos</code>.
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                disabled={guardando}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarCambios}
                disabled={guardando}
                className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-[#009944] hover:bg-[#008038] rounded-xl shadow-xs transition-colors"
              >
                {guardando ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Confirmar y Guardar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
