import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import {
  Users,
  Shield,
  KeyRound,
  Search,
  Plus,
  Edit,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  X,
  Clock,
  UserCheck,
  UserX,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";

interface PasswordPolicyStatus {
  longitudMinima: boolean;
  tieneMayuscula: boolean;
  tieneMinuscula: boolean;
  tieneNumero: boolean;
  tieneEspecial: boolean;
  esValida: boolean;
}

export function evaluarPasswordPolicy(pass: string): PasswordPolicyStatus {
  const p = pass || "";
  const longitudMinima = p.length >= 8;
  const tieneMayuscula = /[A-Z]/.test(p);
  const tieneMinuscula = /[a-z]/.test(p);
  const tieneNumero = /[0-9]/.test(p);
  const tieneEspecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p);
  return {
    longitudMinima,
    tieneMayuscula,
    tieneMinuscula,
    tieneNumero,
    tieneEspecial,
    esValida: longitudMinima && tieneMayuscula && tieneMinuscula && tieneNumero && tieneEspecial,
  };
}

const IndicadoresRequisitosPassword: React.FC<{ password: string }> = ({ password }) => {
  const policy = evaluarPasswordPolicy(password);
  const requisitos = [
    { label: "Mínimo 8 caracteres", cumplido: policy.longitudMinima },
    { label: "Una letra mayúscula (A-Z)", cumplido: policy.tieneMayuscula },
    { label: "Una letra minúscula (a-z)", cumplido: policy.tieneMinuscula },
    { label: "Un número (0-9)", cumplido: policy.tieneNumero },
    { label: "Un carácter especial (!@#$%...)", cumplido: policy.tieneEspecial },
  ];

  return (
    <div
      className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5"
      id="indicadores-password-requisitos"
    >
      <div className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
        <span>Requisitos de seguridad de la contraseña:</span>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            policy.esValida ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {policy.esValida ? "✓ Cumple política" : "Pendiente"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
        {requisitos.map((req, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-1.5 font-medium transition-colors ${
              req.cumplido ? "text-emerald-700" : "text-slate-400"
            }`}
          >
            {req.cumplido ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-slate-300 flex items-center justify-center shrink-0 text-[9px] text-slate-400">
                ○
              </div>
            )}
            <span>{req.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export interface UsuarioItem {
  id: string;
  username: string;
  email: string;
  nombre_completo: string;
  rol: "ADMINISTRADOR" | "TALENTO_HUMANO" | "SUPERVISOR_SEGURIDAD" | "SEGURIDAD" | "EMPLEADO";
  empleado_id?: string;
  estado: "ACTIVO" | "INACTIVO" | "BLOQUEADO";
  creado_en: string;
  actualizado_en: string;
  empleado_nombre?: string;
  empleado_cedula?: string;
  empleado_correo?: string;
  empleado_estado?: string;
  ultimo_acceso_en?: string;
  sesiones_activas_count?: number;
}

interface EmpleadoOpcion {
  id: string;
  cedula: string;
  nombre_completo: string;
  correo_laboral?: string;
  departamento_nombre?: string;
  tiene_usuario?: boolean;
  estado: "ACTIVO" | "INACTIVO";
}

interface UsuariosViewProps {
  empleadoIdPreseleccionado?: string;
  onLimpiarEmpleadoPreseleccionado?: () => void;
}

export const UsuariosView: React.FC<UsuariosViewProps> = ({
  empleadoIdPreseleccionado,
  onLimpiarEmpleadoPreseleccionado,
}) => {
  const { usuario: usuarioActual, tienePermiso } = useAuth();
  const puedeAdminUsuarios = tienePermiso("USUARIOS_ADMINISTRAR");

  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [empleadosDisponibles, setEmpleadosDisponibles] = useState<EmpleadoOpcion[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Filtros de búsqueda
  const [filtroBusqueda, setFiltroBusqueda] = useState<string>("");
  const [filtroRol, setFiltroRol] = useState<string>("TODOS");
  const [filtroEstado, setFiltroEstado] = useState<string>("TODOS");

  // Modales
  const [modalCrearAbierto, setModalCrearAbierto] = useState<boolean>(false);
  const [modalEditarAbierto, setModalEditarAbierto] = useState<boolean>(false);
  const [modalEstadoAbierto, setModalEstadoAbierto] = useState<boolean>(false);
  const [modalPasswordAbierto, setModalPasswordAbierto] = useState<boolean>(false);

  // Errores específicos dentro de modales
  const [errorModalCrear, setErrorModalCrear] = useState<string | null>(null);
  const [errorModalReset, setErrorModalReset] = useState<string | null>(null);

  // Usuario seleccionado para acción
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<UsuarioItem | null>(null);

  // Formulario Crear
  const [formCrear, setFormCrear] = useState({
    username: "",
    email: "",
    nombre_completo: "",
    rol: "EMPLEADO" as UsuarioItem["rol"],
    password: "",
    empleado_id: "",
    estado: "ACTIVO" as "ACTIVO" | "INACTIVO",
  });
  const [mostrarPasswordCrear, setMostrarPasswordCrear] = useState<boolean>(false);

  // Formulario Editar
  const [formEditar, setFormEditar] = useState({
    nombre_completo: "",
    email: "",
    rol: "EMPLEADO" as UsuarioItem["rol"],
    empleado_id: "",
  });

  // Formulario Estado
  const [formEstado, setFormEstado] = useState({
    estado: "ACTIVO" as "ACTIVO" | "INACTIVO" | "BLOQUEADO",
    motivo: "",
  });

  // Formulario Restablecer Contraseña
  const [formPassword, setFormPassword] = useState({
    nueva_contrasena: "",
  });
  const [mostrarPasswordReset, setMostrarPasswordReset] = useState<boolean>(false);

  // Cargar lista de usuarios
  const cargarUsuarios = async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (filtroBusqueda) params.append("busqueda", filtroBusqueda);
      if (filtroRol !== "TODOS") params.append("rol", filtroRol);
      if (filtroEstado !== "TODOS") params.append("estado", filtroEstado);

      const res = await apiRequest<{ exito: boolean; datos: UsuarioItem[] }>(
        `/api/admin/usuarios?${params.toString()}`
      );
      if (res?.exito) {
        setUsuarios(res.datos || []);
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    } finally {
      setCargando(false);
    }
  };

  // Cargar empleados para vincular
  const cargarEmpleadosDisponibles = async () => {
    try {
      const res = await apiRequest<{ exito: boolean; datos: EmpleadoOpcion[] }>("/api/empleados");
      if (res?.exito) {
        setEmpleadosDisponibles(res.datos || []);
      }
    } catch {
      // Ignorar si falla silenciosamente
    }
  };

  useEffect(() => {
    cargarUsuarios();
    cargarEmpleadosDisponibles();
  }, [filtroRol, filtroEstado]);

  // Si se recibe un empleado preseleccionado desde el expediente, abrir modal crear
  useEffect(() => {
    if (empleadoIdPreseleccionado && empleadosDisponibles.length > 0) {
      const emp = empleadosDisponibles.find((e) => e.id === empleadoIdPreseleccionado);
      if (emp && !emp.tiene_usuario) {
        abrirModalCrearConEmpleado(emp);
      }
      onLimpiarEmpleadoPreseleccionado?.();
    }
  }, [empleadoIdPreseleccionado, empleadosDisponibles]);

  const abrirModalCrearConEmpleado = (emp: EmpleadoOpcion) => {
    const sugerenciaUsername = emp.nombre_completo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, ".")
      .replace(/\.+/g, ".")
      .substring(0, 30);

    setFormCrear({
      username: sugerenciaUsername,
      email: emp.correo_laboral || `${sugerenciaUsername}@rimac.cr`,
      nombre_completo: emp.nombre_completo,
      rol: "EMPLEADO",
      password: generarPasswordSegura(),
      empleado_id: emp.id,
      estado: "ACTIVO",
    });
    setModalCrearAbierto(true);
  };

  const generarPasswordSegura = (): string => {
    const charsMayus = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const charsMinus = "abcdefghijkmnopqrstuvwxyz";
    const charsNum = "23456789";
    const charsSim = "!@#$%&*";
    let pass = "";
    pass += charsMayus.charAt(Math.floor(Math.random() * charsMayus.length));
    pass += charsMinus.charAt(Math.floor(Math.random() * charsMinus.length));
    pass += charsNum.charAt(Math.floor(Math.random() * charsNum.length));
    pass += charsSim.charAt(Math.floor(Math.random() * charsSim.length));
    const all = charsMayus + charsMinus + charsNum + charsSim;
    for (let i = 0; i < 8; i++) {
      pass += all.charAt(Math.floor(Math.random() * all.length));
    }
    return pass;
  };

  // Enviar Creación de Usuario
  const handleCrearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorModalCrear(null);
    setErrorMsg(null);
    setMensajeExito(null);

    const policy = evaluarPasswordPolicy(formCrear.password);
    if (!policy.esValida) {
      setErrorModalCrear("La contraseña debe cumplir con todos los requisitos de seguridad.");
      return;
    }

    try {
      const res = await apiRequest<{ exito: boolean; datos: UsuarioItem }>("/api/admin/usuarios", {
        method: "POST",
        body: formCrear,
      });

      if (res?.exito) {
        setMensajeExito(`Cuenta para '${res.datos.username}' creada exitosamente.`);
        setModalCrearAbierto(false);
        setErrorModalCrear(null);
        setFormCrear({
          username: "",
          email: "",
          nombre_completo: "",
          rol: "EMPLEADO",
          password: "",
          empleado_id: "",
          estado: "ACTIVO",
        });
        cargarUsuarios();
        cargarEmpleadosDisponibles();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorModalCrear(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Enviar Edición de Usuario
  const handleEditarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioSeleccionado) return;
    setErrorMsg(null);
    setMensajeExito(null);
    try {
      const res = await apiRequest<{ exito: boolean; datos: UsuarioItem }>(
        `/api/admin/usuarios/${usuarioSeleccionado.id}`,
        {
          method: "PUT",
          body: formEditar,
        }
      );

      if (res?.exito) {
        setMensajeExito(`Usuario '${usuarioSeleccionado.username}' actualizado correctamente.`);
        setModalEditarAbierto(false);
        setUsuarioSeleccionado(null);
        cargarUsuarios();
        cargarEmpleadosDisponibles();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Enviar Cambio de Estado
  const handleCambiarEstado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioSeleccionado) return;
    setErrorMsg(null);
    setMensajeExito(null);
    try {
      const res = await apiRequest<{ exito: boolean; datos: UsuarioItem }>(
        `/api/admin/usuarios/${usuarioSeleccionado.id}/estado`,
        {
          method: "PATCH",
          body: formEstado,
        }
      );

      if (res?.exito) {
        setMensajeExito(`Estado de cuenta actualizado a '${formEstado.estado}' para ${usuarioSeleccionado.username}.`);
        setModalEstadoAbierto(false);
        setUsuarioSeleccionado(null);
        cargarUsuarios();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Enviar Restablecimiento de Contraseña
  const handleRestablecerPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioSeleccionado) return;
    setErrorModalReset(null);
    setErrorMsg(null);
    setMensajeExito(null);

    const policy = evaluarPasswordPolicy(formPassword.nueva_contrasena);
    if (!policy.esValida) {
      setErrorModalReset("La nueva contraseña debe cumplir con todos los requisitos de seguridad.");
      return;
    }

    try {
      const res = await apiRequest<{ exito: boolean; mensaje: string }>(
        `/api/admin/usuarios/${usuarioSeleccionado.id}/restablecer-contrasena`,
        {
          method: "POST",
          body: { nueva_contrasena: formPassword.nueva_contrasena },
        }
      );

      if (res?.exito) {
        setMensajeExito(res.mensaje || "Contraseña restablecida exitosamente.");
        setModalPasswordAbierto(false);
        setErrorModalReset(null);
        setUsuarioSeleccionado(null);
        setFormPassword({ nueva_contrasena: "" });
        cargarUsuarios();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorModalReset(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  const getRolBadgeClass = (rol: string) => {
    switch (rol) {
      case "ADMINISTRADOR":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "TALENTO_HUMANO":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "SUPERVISOR_SEGURIDAD":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "SEGURIDAD":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "EMPLEADO":
      default:
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
    }
  };

  const getEstadoBadgeClass = (estado: string) => {
    switch (estado) {
      case "ACTIVO":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "BLOQUEADO":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "INACTIVO":
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  // Colaboradores que no tienen cuenta (para el selector de nuevo usuario)
  const colaboradoresSinUsuario = empleadosDisponibles.filter(
    (e) => !e.tiene_usuario && e.estado === "ACTIVO"
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-7 h-7 text-[#009944]" />
            Administración de Usuarios y Accesos
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gestión centralizada de cuentas corporativas, asignación de roles RBAC, activación de acceso y restablecimiento seguro de credenciales.
          </p>
        </div>

        {puedeAdminUsuarios && (
          <button
            type="button"
            id="btn-nuevo-usuario"
            onClick={() => {
              const primerSinCuenta = colaboradoresSinUsuario[0];
              if (primerSinCuenta) {
                abrirModalCrearConEmpleado(primerSinCuenta);
              } else {
                setFormCrear({
                  username: "",
                  email: "",
                  nombre_completo: "",
                  rol: "EMPLEADO",
                  password: generarPasswordSegura(),
                  empleado_id: "",
                  estado: "ACTIVO",
                });
                setModalCrearAbierto(true);
              }
            }}
            className="inline-flex items-center px-4 py-2 bg-[#009944] text-white rounded-lg hover:bg-[#008038] text-sm font-medium transition-colors shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo Usuario
          </button>
        )}
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMsg}</div>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {mensajeExito && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-[#009944] shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{mensajeExito}</div>
          <button type="button" onClick={() => setMensajeExito(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            id="input-filtro-usuarios"
            placeholder="Buscar por usuario, nombre de colaborador o cédula..."
            value={filtroBusqueda}
            onChange={(e) => setFiltroBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && cargarUsuarios()}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            id="select-filtro-rol"
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value)}
            className="px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none bg-white text-slate-700"
          >
            <option value="TODOS">Todos los Roles</option>
            <option value="ADMINISTRADOR">Administrador</option>
            <option value="TALENTO_HUMANO">Talento Humano</option>
            <option value="SUPERVISOR_SEGURIDAD">Supervisor Seguridad</option>
            <option value="SEGURIDAD">Seguridad (Garita)</option>
            <option value="EMPLEADO">Empleado</option>
          </select>

          <select
            id="select-filtro-estado"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none bg-white text-slate-700"
          >
            <option value="TODOS">Todos los Estados</option>
            <option value="ACTIVO">Activos</option>
            <option value="INACTIVO">Inactivos</option>
            <option value="BLOQUEADO">Bloqueados</option>
          </select>

          <button
            type="button"
            onClick={cargarUsuarios}
            title="Refrescar listado"
            className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${cargando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 text-sm text-left" id="tabla-usuarios">
          <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Colaborador Vinculado</th>
              <th className="px-4 py-3">Rol Asignado</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Último Acceso</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  <div className="inline-flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#009944]" />
                    <span>Cargando cuentas de usuario...</span>
                  </div>
                </td>
              </tr>
            ) : usuarios.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No se encontraron usuarios registrados que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              usuarios.map((u) => {
                const esYo = usuarioActual?.id === u.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-slate-800">{u.username}</span>
                        {esYo && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">
                            Tú
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>

                    <td className="px-4 py-3">
                      {u.empleado_nombre ? (
                        <div>
                          <div className="font-semibold text-slate-800">{u.empleado_nombre}</div>
                          <div className="text-xs text-slate-400 font-mono">
                            Cédula: {u.empleado_cedula}
                            {u.empleado_estado && u.empleado_estado !== "ACTIVO" && (
                              <span className="ml-2 text-rose-600 font-bold">({u.empleado_estado})</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="italic text-slate-400 text-xs flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5 text-amber-500" />
                          Cuenta Operacional Genérica
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getRolBadgeClass(u.rol)}`}>
                        {u.rol}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getEstadoBadgeClass(u.estado)}`}>
                        {u.estado}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-500">
                      {u.ultimo_acceso_en ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(u.ultimo_acceso_en).toLocaleString("es-CR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">Sin accesos</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {puedeAdminUsuarios && (
                        <div className="inline-flex items-center gap-1.5">
                          {/* Editar datos y rol */}
                          <button
                            type="button"
                            id={`btn-editar-usuario-${u.id}`}
                            onClick={() => {
                              setUsuarioSeleccionado(u);
                              setFormEditar({
                                nombre_completo: u.nombre_completo,
                                email: u.email,
                                rol: u.rol,
                                empleado_id: u.empleado_id || "",
                              });
                              setModalEditarAbierto(true);
                            }}
                            title="Editar rol y adscripción"
                            className="p-1.5 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          {/* Cambiar Estado */}
                          <button
                            type="button"
                            id={`btn-estado-usuario-${u.id}`}
                            onClick={() => {
                              setUsuarioSeleccionado(u);
                              setFormEstado({
                                estado: u.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO",
                                motivo: "",
                              });
                              setModalEstadoAbierto(true);
                            }}
                            title={u.estado === "ACTIVO" ? "Desactivar / Bloquear" : "Reactivar cuenta"}
                            className={`p-1.5 rounded-md transition-colors ${
                              u.estado === "ACTIVO"
                                ? "text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100"
                                : "text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100"
                            }`}
                          >
                            {u.estado === "ACTIVO" ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>

                          {/* Restablecer Contraseña */}
                          <button
                            type="button"
                            id={`btn-restablecer-usuario-${u.id}`}
                            onClick={() => {
                              setUsuarioSeleccionado(u);
                              setFormPassword({ nueva_contrasena: generarPasswordSegura() });
                              setModalPasswordAbierto(true);
                            }}
                            title="Restablecer contraseña"
                            className="p-1.5 text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* MODAL CREAR USUARIO */}
      {/* ======================================================== */}
      {modalCrearAbierto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative border border-slate-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setModalCrearAbierto(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#009944]" />
              Crear Nueva Cuenta de Usuario
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Vincule una cuenta a un colaborador existente y asigne su rol corporativo RBAC inicial.
            </p>

            {errorModalCrear && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Error en la creación de usuario</div>
                  <div>{errorModalCrear}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleCrearUsuario} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Colaborador Vinculado *
                </label>
                <select
                  required
                  id="select-empleado-vinculado"
                  value={formCrear.empleado_id}
                  onChange={(e) => {
                    const empId = e.target.value;
                    const emp = empleadosDisponibles.find((x) => x.id === empId);
                    if (emp) {
                      const sug = emp.nombre_completo
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z0-9]/g, ".")
                        .replace(/\.+/g, ".")
                        .substring(0, 30);
                      setFormCrear({
                        ...formCrear,
                        empleado_id: empId,
                        nombre_completo: emp.nombre_completo,
                        username: sug,
                        email: emp.correo_laboral || `${sug}@rimac.cr`,
                      });
                    } else {
                      setFormCrear({ ...formCrear, empleado_id: empId });
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                >
                  <option value="">Seleccione Colaborador Activo</option>
                  {empleadosDisponibles
                    .filter((e) => e.estado === "ACTIVO" && !e.tiene_usuario)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre_completo} ({e.cedula}) - {e.departamento_nombre || "Sin Depto"}
                      </option>
                    ))}
                </select>
                {colaboradoresSinUsuario.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Nota: Todos los colaboradores activos ya tienen un usuario vinculado o no hay colaboradores registrados.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre de Usuario (Username) *
                </label>
                <input
                  type="text"
                  required
                  id="input-crear-username"
                  placeholder="Ej. juan.perez"
                  value={formCrear.username}
                  onChange={(e) => setFormCrear({ ...formCrear, username: e.target.value.toLowerCase().trim() })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  id="input-crear-email"
                  placeholder="Ej. juan.perez@rimac.cr"
                  value={formCrear.email}
                  onChange={(e) => setFormCrear({ ...formCrear, email: e.target.value.toLowerCase().trim() })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Rol RBAC Asignado *
                  </label>
                  <select
                    required
                    id="select-crear-rol"
                    value={formCrear.rol}
                    onChange={(e) => setFormCrear({ ...formCrear, rol: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                  >
                    <option value="EMPLEADO">EMPLEADO</option>
                    <option value="TALENTO_HUMANO">TALENTO_HUMANO</option>
                    <option value="SUPERVISOR_SEGURIDAD">SUPERVISOR_SEGURIDAD</option>
                    <option value="SEGURIDAD">SEGURIDAD</option>
                    <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Estado Inicial *
                  </label>
                  <select
                    value={formCrear.estado}
                    onChange={(e) => setFormCrear({ ...formCrear, estado: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                  >
                    <option value="ACTIVO">ACTIVO</option>
                    <option value="INACTIVO">INACTIVO</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Contraseña Inicial *
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormCrear({ ...formCrear, password: generarPasswordSegura() })}
                    className="text-[11px] text-[#009944] hover:underline font-semibold flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Generar Segura
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={mostrarPasswordCrear ? "text" : "password"}
                    required
                    id="input-crear-password"
                    placeholder="Mínimo 8 caracteres (mayús, minús, número)"
                    value={formCrear.password}
                    onChange={(e) => setFormCrear({ ...formCrear, password: e.target.value })}
                    className="w-full pl-3 pr-10 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPasswordCrear(!mostrarPasswordCrear)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {mostrarPasswordCrear ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <IndicadoresRequisitosPassword password={formCrear.password} />
                <p className="text-[11px] text-slate-500 mt-1">
                  La contraseña se almacenará con algoritmo seguro scrypt y sal criptográfica. No se registrará en auditoría ni texto plano.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalCrearAbierto(false);
                    setErrorModalCrear(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-guardar-nuevo-usuario"
                  disabled={!evaluarPasswordPolicy(formCrear.password).esValida}
                  className="px-4 py-2 bg-[#009944] text-white text-sm font-medium rounded-lg hover:bg-[#008038] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL EDITAR USUARIO */}
      {/* ======================================================== */}
      {modalEditarAbierto && usuarioSeleccionado && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => {
                setModalEditarAbierto(false);
                setUsuarioSeleccionado(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar Usuario: {usuarioSeleccionado.username}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Modifique el rol asignado o la información del colaborador vinculado.
            </p>

            <form onSubmit={handleEditarUsuario} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre de Usuario (Identificador)
                </label>
                <input
                  type="text"
                  disabled
                  value={usuarioSeleccionado.username}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Rol Asignado *
                </label>
                <select
                  required
                  id="select-editar-rol"
                  value={formEditar.rol}
                  onChange={(e) => setFormEditar({ ...formEditar, rol: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                >
                  <option value="EMPLEADO">EMPLEADO</option>
                  <option value="TALENTO_HUMANO">TALENTO_HUMANO</option>
                  <option value="SUPERVISOR_SEGURIDAD">SUPERVISOR_SEGURIDAD</option>
                  <option value="SEGURIDAD">SEGURIDAD</option>
                  <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                </select>
                {usuarioSeleccionado.rol !== formEditar.rol && (
                  <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Cambiar el rol revocará inmediatamente todas las sesiones activas del usuario para garantizar la aplicación de los nuevos permisos.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  value={formEditar.nombre_completo}
                  onChange={(e) => setFormEditar({ ...formEditar, nombre_completo: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  value={formEditar.email}
                  onChange={(e) => setFormEditar({ ...formEditar, email: e.target.value.toLowerCase().trim() })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Colaborador Vinculado
                </label>
                <select
                  value={formEditar.empleado_id}
                  onChange={(e) => setFormEditar({ ...formEditar, empleado_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                >
                  <option value="">Cuenta genérica / Sin vinculación directa</option>
                  {empleadosDisponibles
                    .filter((e) => e.estado === "ACTIVO" || e.id === usuarioSeleccionado.empleado_id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre_completo} ({e.cedula}) {e.id === usuarioSeleccionado.empleado_id ? " [Actual]" : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalEditarAbierto(false);
                    setUsuarioSeleccionado(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-guardar-editar-usuario"
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL CAMBIAR ESTADO (ACTIVAR / DESACTIVAR / BLOQUEAR) */}
      {/* ======================================================== */}
      {modalEstadoAbierto && usuarioSeleccionado && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => {
                setModalEstadoAbierto(false);
                setUsuarioSeleccionado(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" />
              Cambiar Estado de Acceso
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Cuenta: <span className="font-mono font-bold text-slate-700">{usuarioSeleccionado.username}</span> (Estado actual: {usuarioSeleccionado.estado})
            </p>

            <form onSubmit={handleCambiarEstado} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nuevo Estado *
                </label>
                <select
                  id="select-cambiar-estado"
                  value={formEstado.estado}
                  onChange={(e) => setFormEstado({ ...formEstado, estado: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="ACTIVO">ACTIVO (Permite inicio de sesión)</option>
                  <option value="INACTIVO">INACTIVO (Desactiva acceso temporal)</option>
                  <option value="BLOQUEADO">BLOQUEADO (Bloqueo administrativo estricto)</option>
                </select>
              </div>

              {formEstado.estado !== "ACTIVO" && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Consecuencias de la desactivación:
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Se revocarán todas las sesiones activas en este instante.</li>
                    <li>El usuario no podrá autenticarse en garita ni autoservicio.</li>
                    <li>Se preservan íntegras sus marcas, solicitudes y registros históricos.</li>
                  </ul>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Motivo o Justificación (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={formEstado.motivo}
                  onChange={(e) => setFormEstado({ ...formEstado, motivo: e.target.value })}
                  placeholder="Ej. Suspensión temporal / Cese de labores / Solicitud de seguridad"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalEstadoAbierto(false);
                    setUsuarioSeleccionado(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-confirmar-cambio-estado"
                  className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${
                    formEstado.estado === "ACTIVO"
                      ? "bg-[#009944] hover:bg-[#008038]"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  Confirmar Cambio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL RESTABLECER CONTRASEÑA */}
      {/* ======================================================== */}
      {modalPasswordAbierto && usuarioSeleccionado && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => {
                setModalPasswordAbierto(false);
                setUsuarioSeleccionado(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-purple-600" />
              Restablecer Contraseña
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Cuenta: <span className="font-mono font-bold text-slate-700">{usuarioSeleccionado.username}</span> ({usuarioSeleccionado.nombre_completo})
            </p>

            {errorModalReset && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Error al restablecer contraseña</div>
                  <div>{errorModalReset}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleRestablecerPassword} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Nueva Contraseña *
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormPassword({ nueva_contrasena: generarPasswordSegura() })}
                    className="text-[11px] text-purple-700 hover:underline font-semibold flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Generar Segura
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={mostrarPasswordReset ? "text" : "password"}
                    required
                    id="input-reset-nueva-password"
                    placeholder="Mínimo 8 caracteres (mayús, minús, número)"
                    value={formPassword.nueva_contrasena}
                    onChange={(e) => setFormPassword({ nueva_contrasena: e.target.value })}
                    className="w-full pl-3 pr-10 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPasswordReset(!mostrarPasswordReset)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {mostrarPasswordReset ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <IndicadoresRequisitosPassword password={formPassword.nueva_contrasena} />
              </div>

              <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-purple-700" />
                  Garantía de Seguridad Criptográfica:
                </div>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Se hasheará con scrypt y sal única antes de persistir.</li>
                  <li>Todas las sesiones activas del usuario serán invalidadas de inmediato.</li>
                  <li>La contraseña anterior dejará de ser válida inmediatamente.</li>
                  <li>La contraseña no será registrada en logs ni en auditoría.</li>
                </ul>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalPasswordAbierto(false);
                    setErrorModalReset(null);
                    setUsuarioSeleccionado(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-confirmar-reset-password"
                  disabled={!evaluarPasswordPolicy(formPassword.nueva_contrasena).esValida}
                  className="px-4 py-2 bg-purple-700 text-white text-sm font-medium rounded-lg hover:bg-purple-800 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Restablecer Contraseña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
