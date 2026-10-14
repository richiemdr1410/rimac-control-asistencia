import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { RimacLogo } from "./RimacLogo";
import { getFriendlyErrorMessage } from "../services/api";
import { DEMO_USUARIOS } from "../../shared/contracts/demo-data";
import { Lock, User, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [identificador, setIdentificador] = useState<string>("");
  const [contrasena, setContrasena] = useState<string>("");
  const [mostrarContrasena, setMostrarContrasena] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<{ titulo: string; descripcion: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identificador.trim() || !contrasena) {
      setErrorMsg({
        titulo: "Datos requeridos",
        descripcion: "Por favor ingrese su usuario y contraseña.",
      });
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await login(identificador.trim(), contrasena);
      // AuthContext maneja el usuario y la redirección automática según sus capacidades
    } catch (err) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(friendly);
      // Limpiar contraseña por seguridad ante error
      setContrasena("");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Autocompletado rápido para demostración académica
  const cargarCredencialesDemo = (user: string, pass: string) => {
    setIdentificador(user);
    setContrasena(pass);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Contenedor Principal */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logotipo RIMAC */}
        <div className="flex justify-center mb-4">
          <RimacLogo height={72} showSlogan={true} />
        </div>

        <h1 className="text-center text-2xl font-bold text-slate-900 tracking-tight">
          Control de Asistencia y Horas Laborales
        </h1>
        <p className="mt-1 text-center text-sm text-slate-600 font-medium">
          Agroquímica Industrial RIMAC S.A.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-10">
          {/* Alerta de Error */}
          {errorMsg && (
            <div
              id="alerta-error-login"
              role="alert"
              className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3 text-red-800 animate-fadeIn"
            >
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-red-900">{errorMsg.titulo}</p>
                <p className="mt-0.5 text-red-700">{errorMsg.descripcion}</p>
              </div>
            </div>
          )}

          {/* Formulario de Login */}
          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Campo Usuario / Identificador */}
            <div>
              <label
                htmlFor="input-identificador"
                className="block text-sm font-semibold text-slate-700 mb-1"
              >
                Usuario institucional o Correo
              </label>
              <div className="relative rounded-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="h-5 w-5" />
                </div>
                <input
                  id="input-identificador"
                  name="identificador"
                  type="text"
                  autoComplete="username"
                  required
                  autoFocus
                  disabled={isSubmitting}
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="ej. empleado, seguridad, admin..."
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009944] focus:border-transparent text-sm disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>

            {/* Campo Contraseña */}
            <div>
              <label
                htmlFor="input-contrasena"
                className="block text-sm font-semibold text-slate-700 mb-1"
              >
                Contraseña
              </label>
              <div className="relative rounded-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="input-contrasena"
                  name="contrasena"
                  type={mostrarContrasena ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={isSubmitting}
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009944] focus:border-transparent text-sm disabled:bg-slate-100 disabled:text-slate-400"
                />
                <button
                  type="button"
                  id="btn-toggle-contrasena"
                  onClick={() => setMostrarContrasena(!mostrarContrasena)}
                  disabled={isSubmitting}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={mostrarContrasena ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {mostrarContrasena ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Botón Ingresar */}
            <div>
              <button
                type="submit"
                id="btn-ingresar"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-xs text-sm font-bold text-white bg-[#009944] hover:bg-[#008039] active:bg-[#00662d] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#009944] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Autenticando en servidor...
                  </span>
                ) : (
                  <span className="flex items-center">
                    Ingresar al Sistema
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </span>
                )}
              </button>
            </div>
          </form>

          {/* Accesos Rápidos para Demostración */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 text-[#009944] mr-1.5" />
                Ambiente de demostración — Datos sintéticos
              </span>
              <span className="text-[10px] text-amber-700 font-medium bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                Uso Exclusivo Demo
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Seleccione una cuenta canónica para cargar credenciales de demostración:
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DEMO_USUARIOS.map((u, idx) => (
                <button
                  key={u.username}
                  type="button"
                  id={`demo-btn-${u.username}`}
                  onClick={() => cargarCredencialesDemo(u.username, u.passwordDemo)}
                  className={`text-left px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs transition-colors ${
                    u.rol === "ADMINISTRADOR" ? "sm:col-span-2" : ""
                  }`}
                >
                  <div className="font-semibold text-slate-800">
                    {idx + 1}. {u.nombre}
                  </div>
                  <div className="text-[#009944] font-medium text-[11px]">
                    Rol: {u.rol}
                  </div>
                  <div className="text-slate-500 font-mono text-[10px]">
                    Usuario: {u.username}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pie de pantalla corporativo */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Agroquímica Industrial RIMAC S.A. &bull; Conexión segura con cifrado y cookies HttpOnly.
        </p>
      </div>
    </div>
  );
};
