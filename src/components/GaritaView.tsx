import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import { DEMO_EMPLEADOS } from "../../shared/contracts/demo-data";
import {
  Search,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Briefcase,
  Building,
  UserCheck,
  ArrowRightCircle,
  Coffee,
  Utensils,
  LogIn,
  LogOut as LogOutIcon,
  ShieldAlert,
} from "lucide-react";

interface EmpleadoContexto {
  id: string;
  cedula: string;
  nombre_completo: string;
  departamento_id: string;
  puesto_id: string;
  estado: string;
}

interface JornadaContexto {
  id: string;
  fecha_jornada: string;
  estado_jornada: string;
  estado?: string;
  hora_entrada_efectiva?: string;
}

interface MarcaContexto {
  id: string;
  tipo_marca: string;
  timestamp_servidor: string;
  origen_marca: string;
}

interface HorarioContexto {
  id?: string;
  horario_id?: string;
  nombre?: string;
  hora_entrada?: string;
  hora_salida?: string;
  hora_entrada_programada?: string;
  hora_salida_programada?: string;
  tolerancia_minutos?: number;
  tolerancia_entrada_minutos?: number;
  es_laborable?: boolean;
}

interface ContextoOperativoGarita {
  empleado: EmpleadoContexto;
  jornada_actual?: JornadaContexto | null;
  jornada_abierta?: JornadaContexto | null;
  ultima_marca: MarcaContexto | null;
  horario_aplicable: HorarioContexto | null;
  acciones_validas: string[];
}

interface ConfirmacionMarca {
  empleado_nombre: string;
  tipo_marca: string;
  timestamp_servidor: string;
  estado_jornada: string;
}

export const GaritaView: React.FC = () => {
  const { usuario } = useAuth();
  const esSupervisor = usuario?.rol === "SUPERVISOR_SEGURIDAD";

  const [identificador, setIdentificador] = useState<string>("");
  const [buscando, setBuscando] = useState<boolean>(false);
  const [contexto, setContexto] = useState<ContextoOperativoGarita | null>(null);
  const [registrando, setRegistrando] = useState<boolean>(false);
  const [confirmacion, setConfirmacion] = useState<ConfirmacionMarca | null>(null);
  const [errorMsg, setErrorMsg] = useState<{ titulo: string; descripcion: string; codigo?: string } | null>(null);

  const inputScannerRef = useRef<HTMLInputElement>(null);
  const timerLimpiezaRef = useRef<NodeJS.Timeout | null>(null);

  // Restaurar foco al escáner de forma permanente
  const enfocarScanner = useCallback(() => {
    setTimeout(() => {
      inputScannerRef.current?.focus();
      inputScannerRef.current?.select();
    }, 50);
  }, []);

  useEffect(() => {
    enfocarScanner();
  }, [enfocarScanner]);

  // Búsqueda del empleado por cédula o código de barras
  const buscarEmpleado = async (e?: React.FormEvent, cedulaDirecta?: string) => {
    if (e) e.preventDefault();
    const cedula = (cedulaDirecta || identificador).trim();
    if (!cedula) return;

    if (cedulaDirecta) {
      setIdentificador(cedulaDirecta);
    }

    if (timerLimpiezaRef.current) {
      clearTimeout(timerLimpiezaRef.current);
      timerLimpiezaRef.current = null;
    }

    setBuscando(true);
    setErrorMsg(null);
    setConfirmacion(null);

    try {
      const cacheBuster = Date.now();
      const res = await apiRequest<{
        exito: boolean;
        datos: ContextoOperativoGarita;
      }>(`/api/garita/empleados/buscar?identificador=${encodeURIComponent(cedula)}&_t=${cacheBuster}`);

      if (res.exito && res.datos) {
        setContexto(res.datos);
      }
    } catch (err) {
      setContexto(null);
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(friendly);
      enfocarScanner();
    } finally {
      setBuscando(false);
    }
  };

  // Registro de marca en Garita
  const handleRegistrarMarca = async (tipoMarca: string) => {
    if (!contexto?.empleado?.id || registrando) return;

    setRegistrando(true);
    setErrorMsg(null);

    // Idempotency-Key UUIDv4 único generado para cada nueva acción intencional
    const idempotencyKey = crypto.randomUUID();
    const cedulaActual = contexto.empleado.cedula;

    try {
      const res = await apiRequest<{
        exito: boolean;
        datos: {
          marca: MarcaContexto;
          jornada: JornadaContexto;
        };
      }>("/api/garita/marcas", {
        method: "POST",
        idempotencyKey,
        body: {
          empleado_id: contexto.empleado.id,
          tipo_marca: tipoMarca,
        },
      });

      if (res.exito && res.datos) {
        setConfirmacion({
          empleado_nombre: contexto.empleado.nombre_completo,
          tipo_marca: res.datos.marca.tipo_marca,
          timestamp_servidor: res.datos.marca.timestamp_servidor,
          estado_jornada: res.datos.jornada.estado_jornada,
        });

        // Consultar de inmediato el estado canónico actualizado desde el backend (una sola fuente de verdad)
        try {
          const fresh = await apiRequest<{
            exito: boolean;
            datos: ContextoOperativoGarita;
          }>(`/api/garita/empleados/buscar?identificador=${encodeURIComponent(cedulaActual)}&_t=${Date.now()}`);
          if (fresh.exito && fresh.datos) {
            setContexto(fresh.datos);
          }
        } catch {
          // Mantener confirmación
        }

        // Auto-limpieza tras 5 segundos si el operador no avanza manualmente
        timerLimpiezaRef.current = setTimeout(() => {
          siguienteEmpleado();
        }, 5000);
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(friendly);

      // Requisito 6: Refrescar automáticamente el estado del colaborador para
      // reemplazar la botonera obsoleta por el estado real si cambió desde otro canal
      if (cedulaActual) {
        try {
          const fresh = await apiRequest<{
            exito: boolean;
            datos: ContextoOperativoGarita;
          }>(`/api/garita/empleados/buscar?identificador=${encodeURIComponent(cedulaActual)}&_t=${Date.now()}`);
          if (fresh.exito && fresh.datos) {
            setContexto(fresh.datos);
          }
        } catch {
          // Mantener error amigable visible
        }
      }
    } finally {
      setRegistrando(false);
    }
  };

  // Botón Siguiente Empleado (sin bloqueo)
  const siguienteEmpleado = () => {
    if (timerLimpiezaRef.current) {
      clearTimeout(timerLimpiezaRef.current);
      timerLimpiezaRef.current = null;
    }
    setContexto(null);
    setConfirmacion(null);
    setErrorMsg(null);
    setIdentificador("");
    enfocarScanner();
  };

  // Ayudante de formato de hora
  const formatearHora = (isoStr?: string) => {
    if (!isoStr) return "Sin registro previo";
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("es-CR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  // Mapeo visual de botones de marcas válidas
  const getBotonConfig = (tipo: string) => {
    switch (tipo) {
      case "ENTRADA":
        return {
          etiqueta: "Registrar Entrada",
          icono: LogIn,
          className: "bg-[#009944] hover:bg-[#008039] text-white border-transparent",
        };
      case "SALIDA":
        return {
          etiqueta: "Registrar Salida",
          icono: LogOutIcon,
          className: "bg-slate-800 hover:bg-slate-900 text-white border-transparent",
        };
      case "INICIO_ALMUERZO":
        return {
          etiqueta: "Inicio Almuerzo",
          icono: Utensils,
          className: "bg-amber-600 hover:bg-amber-700 text-white border-transparent",
        };
      case "FIN_ALMUERZO":
        return {
          etiqueta: "Fin Almuerzo",
          icono: Utensils,
          className: "bg-sky-600 hover:bg-sky-700 text-white border-transparent",
        };
      case "INICIO_DESAYUNO":
        return {
          etiqueta: "Inicio Desayuno",
          icono: Coffee,
          className: "bg-amber-600 hover:bg-amber-700 text-white border-transparent",
        };
      case "FIN_DESAYUNO":
        return {
          etiqueta: "Fin Desayuno",
          icono: Coffee,
          className: "bg-sky-600 hover:bg-sky-700 text-white border-transparent",
        };
      case "INICIO_CAFE":
        return {
          etiqueta: "Inicio Café",
          icono: Coffee,
          className: "bg-amber-600 hover:bg-amber-700 text-white border-transparent",
        };
      case "FIN_CAFE":
        return {
          etiqueta: "Fin Café",
          icono: Coffee,
          className: "bg-sky-600 hover:bg-sky-700 text-white border-transparent",
        };
      default:
        return {
          etiqueta: tipo.replace("_", " "),
          icono: CheckCircle2,
          className: "bg-slate-700 hover:bg-slate-800 text-white border-transparent",
        };
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Barra de Control y Scanner Superior */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#e8f7ed] text-[#009944] mb-1">
              Punto de Control
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              Garita de Seguridad RIMAC
            </h2>
            <p className="text-xs text-slate-500">
              Escanee la cédula física del colaborador con el lector o ingrese el número manualmente.
            </p>
          </div>

          {esSupervisor && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 max-w-md">
              <span className="font-semibold text-slate-800 flex items-center mb-0.5">
                <ShieldAlert className="w-4 h-4 text-[#009944] mr-1.5 shrink-0" />
                Supervisión de Seguridad
              </span>
              <span>
                Puesto de supervisión autorizado: Puede operar el registro de marcas y consultar el estado operativo en tiempo real.
              </span>
            </div>
          )}

          {contexto && (
            <button
              type="button"
              id="btn-siguiente-empleado"
              onClick={siguienteEmpleado}
              className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors self-start sm:self-auto"
            >
              <RotateCcw className="w-4 h-4 mr-2 text-slate-500" />
              Siguiente Colaborador
            </button>
          )}
        </div>

        {/* Input del Escáner */}
        <form onSubmit={buscarEmpleado} className="flex gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-5 h-5" />
            </div>
            <input
              ref={inputScannerRef}
              id="input-scanner-cedula"
              type="text"
              autoFocus
              disabled={buscando || registrando}
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              placeholder="Escanee código de barras o escriba cédula (ej. DEMO-1005)..."
              className="w-full pl-11 pr-4 py-3.5 border-2 border-slate-300 focus:border-[#009944] rounded-xl text-base font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009944]/20 transition-all font-mono"
            />
          </div>

          <button
            type="submit"
            id="btn-buscar-cedula"
            disabled={buscando || registrando || !identificador.trim()}
            className="px-6 py-3.5 bg-[#009944] hover:bg-[#008039] active:bg-[#00662d] text-white font-bold rounded-xl text-sm transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center"
          >
            {buscando ? (
              <span>Buscando...</span>
            ) : (
              <span>Buscar</span>
            )}
          </button>
        </form>

        {/* Acceso Rápido a Cédulas de Demostración */}
        <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Cédulas de prueba (PostgreSQL):</span>
          {DEMO_EMPLEADOS.map((emp) => (
            <button
              key={emp.cedula}
              type="button"
              id={`btn-demo-${emp.cedula.toLowerCase()}`}
              onClick={() => buscarEmpleado(undefined, emp.cedula)}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-mono text-[11px] transition-colors"
            >
              {emp.cedula} ({emp.nombre})
            </button>
          ))}
        </div>
      </div>

      {/* Alerta de Error Accesible */}
      {errorMsg && (
        <div
          id="alerta-error-garita"
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3 text-red-800"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-bold text-red-900">{errorMsg.titulo}</p>
              {errorMsg.codigo && (
                <span className="font-mono text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                  {errorMsg.codigo}
                </span>
              )}
            </div>
            <p className="mt-1 text-red-700">{errorMsg.descripcion}</p>
          </div>
        </div>
      )}

      {/* Banner de Confirmación Exitosa (201 Created) */}
      {confirmacion && (
        <div
          id="banner-confirmacion-marca"
          className="bg-emerald-50 border-2 border-[#009944] rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn"
        >
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-[#009944] text-white rounded-lg shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center text-xs font-bold text-[#009944] uppercase tracking-wider">
                {confirmacion.tipo_marca === "SALIDA" || confirmacion.estado_jornada?.startsWith("CERRADA")
                  ? "Jornada finalizada correctamente"
                  : "Marca Registrada Exitosamente"}
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {confirmacion.empleado_nombre}
              </h3>
              <p className="text-sm text-slate-600 mt-0.5">
                Acción: <strong className="text-slate-900 font-bold">{confirmacion.tipo_marca.replace("_", " ")}</strong> &bull; Hora Servidor:{" "}
                <span className="font-mono font-semibold text-[#009944]">
                  {formatearHora(confirmacion.timestamp_servidor)}
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Estado resultante de la jornada: <span className="font-semibold">{confirmacion.estado_jornada}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn-confirmacion-siguiente"
            onClick={siguienteEmpleado}
            className="px-5 py-2.5 bg-[#009944] hover:bg-[#008039] text-white font-bold rounded-lg text-sm shadow-xs transition-colors shrink-0 self-end sm:self-center"
          >
            Siguiente Empleado &rarr;
          </button>
        </div>
      )}

      {/* Contexto Operativo del Colaborador (Cuando se encuentra) */}
      {contexto && (
        <div
          id="panel-contexto-empleado"
          className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <UserCheck className="w-5 h-5 text-[#009944]" />
              <span className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                Identificación de Colaborador
              </span>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
              {contexto.empleado.estado}
            </span>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna 1: Identidad y Datos Laborales */}
            <div className="space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200 pb-6 lg:pb-0 lg:pr-6">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full bg-[#009944]/10 border-2 border-[#009944] flex items-center justify-center text-[#009944] font-black text-xl select-none">
                  {contexto.empleado.nombre_completo.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg leading-snug">
                    {contexto.empleado.nombre_completo}
                  </h3>
                  <p className="text-sm font-mono text-slate-500 font-semibold">
                    Cédula: {contexto.empleado.cedula}
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2 text-sm">
                <div className="flex items-center text-slate-600">
                  <Building className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                  <span>Dpto: <strong>{contexto.empleado.departamento_id}</strong></span>
                </div>
                <div className="flex items-center text-slate-600">
                  <Briefcase className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                  <span>Puesto: <strong>{contexto.empleado.puesto_id}</strong></span>
                </div>
              </div>
            </div>

            {/* Columna 2: Horario y Jornada Actual */}
            <div className="space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200 pb-6 lg:pb-0 lg:pr-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Horario Asignado
                </h4>
                {contexto.horario_aplicable ? (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span className="flex items-center">
                        <Clock className="w-4 h-4 mr-1.5 text-[#009944]" />
                        {contexto.horario_aplicable.hora_entrada || contexto.horario_aplicable.hora_entrada_programada || "08:00"} - {contexto.horario_aplicable.hora_salida || contexto.horario_aplicable.hora_salida_programada || "17:00"}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        Tol: {contexto.horario_aplicable.tolerancia_minutos ?? contexto.horario_aplicable.tolerancia_entrada_minutos ?? 15} min
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic">Sin horario asignado para hoy</p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Estado de la Jornada
                </h4>
                {(() => {
                  const jornadaActiva = contexto.jornada_actual || contexto.jornada_abierta || null;
                  const estaJornadaAbierta = Boolean(
                    jornadaActiva && (
                      jornadaActiva.estado_jornada === "ABIERTA" ||
                      jornadaActiva.estado === "ABIERTA"
                    )
                  );
                  const estaJornadaCerrada = Boolean(
                    jornadaActiva && (
                      jornadaActiva.estado_jornada?.startsWith("CERRADA") ||
                      jornadaActiva.estado?.startsWith("CERRADA")
                    )
                  );

                  return (
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                          estaJornadaAbierta
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : estaJornadaCerrada
                            ? "bg-blue-100 text-blue-800 border border-blue-300"
                            : "bg-slate-100 text-slate-600 border border-slate-300"
                        }`}
                      >
                        {estaJornadaAbierta
                          ? "JORNADA ABIERTA"
                          : estaJornadaCerrada
                          ? `JORNADA CERRADA (${jornadaActiva?.estado_jornada || "FINALIZADA"})`
                          : "SIN JORNADA ACTIVA"}
                      </span>

                      {jornadaActiva && (
                        <span className="text-xs text-slate-500 font-mono">
                          Fecha: {jornadaActiva.fecha_jornada}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Última Marca Registrada
                </h4>
                {contexto.ultima_marca ? (
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">
                      {contexto.ultima_marca.tipo_marca.replace("_", " ")}
                    </span>
                    <span className="text-slate-400 mx-1">&bull;</span>
                    <span className="font-mono text-xs font-semibold text-[#009944]">
                      {formatearHora(contexto.ultima_marca.timestamp_servidor)}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No registra marcas previas en la jornada</p>
                )}
              </div>
            </div>

            {/* Columna 3: Botonera de Acciones Válidas (Calculadas por Backend) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Acciones Operativas Válidas
                </h4>
                <span className="text-[11px] text-slate-400">Determinadas por backend</span>
              </div>

              {contexto.acciones_validas && contexto.acciones_validas.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {contexto.acciones_validas.map((tipo) => {
                    const cfg = getBotonConfig(tipo);
                    const IconComp = cfg.icono;
                    return (
                      <button
                        key={tipo}
                        type="button"
                        id={`btn-garita-${tipo.toLowerCase()}`}
                        disabled={registrando}
                        onClick={() => handleRegistrarMarca(tipo)}
                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl font-bold text-sm shadow-xs transition-transform active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed ${cfg.className}`}
                      >
                        <span className="flex items-center">
                          <IconComp className="w-5 h-5 mr-3 shrink-0" />
                          <span>{cfg.etiqueta}</span>
                        </span>
                        <ArrowRightCircle className="w-4 h-4 opacity-70" />
                      </button>
                    );
                  })}
                </div>
              ) : (() => {
                const jornadaActiva = contexto.jornada_actual || contexto.jornada_abierta || null;
                const estaJornadaCerrada = Boolean(
                  jornadaActiva && (
                    jornadaActiva.estado_jornada?.startsWith("CERRADA") ||
                    jornadaActiva.estado?.startsWith("CERRADA")
                  )
                );

                if (estaJornadaCerrada) {
                  return (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 text-center text-slate-700 text-sm space-y-1">
                      <CheckCircle2 className="w-7 h-7 mx-auto mb-1 text-[#009944]" />
                      <p className="font-bold text-slate-900 text-base">Jornada finalizada correctamente</p>
                      <p className="text-xs text-slate-600">
                        No tiene una jornada abierta actualmente. Todas las marcas del día han sido completadas.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-amber-800 text-sm">
                    <ShieldAlert className="w-6 h-6 mx-auto mb-1 text-amber-600" />
                    <p className="font-bold">Sin acciones permitidas</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      No tiene una jornada abierta actualmente o no permite transiciones adicionales.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
