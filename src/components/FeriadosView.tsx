import React, { useState, useEffect } from "react";
import { apiRequest } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Calendar,
  PlusCircle,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Power,
  Info,
  ShieldCheck,
} from "lucide-react";

export interface Feriado {
  id: string;
  fecha: string;
  descripcion: string;
  tipo_feriado: string;
  activo: boolean;
  creado_en?: string;
}

export const FeriadosView: React.FC = () => {
  const { usuario } = useAuth();
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroActivos, setFiltroActivos] = useState<boolean>(false);

  // Estados del modal de creación/edición
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [modoEdicion, setModoEdicion] = useState<boolean>(false);
  const [feriadoEditandoId, setFeriadoEditandoId] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string>("");
  const [descripcion, setDescripcion] = useState<string>("");
  const [tipoFeriado, setTipoFeriado] = useState<string>("PAGO_OBLIGATORIO");
  const [activo, setActivo] = useState<boolean>(true);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const puedeGestionar =
    usuario?.rol === "TALENTO_HUMANO" || usuario?.rol === "ADMINISTRADOR";

  const cargarFeriados = async () => {
    setCargando(true);
    setError(null);
    try {
      const endpoint = filtroActivos ? "/api/feriados?activos=true" : "/api/feriados";
      const res = await apiRequest<{ exito: boolean; datos: Feriado[] }>(endpoint);
      if (res.exito) {
        setFeriados(res.datos || []);
      }
    } catch (err: any) {
      setError(err.mensaje || "Error al cargar el catálogo de feriados.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarFeriados();
  }, [filtroActivos]);

  const abrirModalCrear = () => {
    setModoEdicion(false);
    setFeriadoEditandoId(null);
    setFecha(new Date().toISOString().slice(0, 10));
    setDescripcion("");
    setTipoFeriado("PAGO_OBLIGATORIO");
    setActivo(true);
    setErrorForm(null);
    setModalAbierto(true);
  };

  const abrirModalEditar = (f: Feriado) => {
    setModoEdicion(true);
    setFeriadoEditandoId(f.id);
    setFecha(f.fecha);
    setDescripcion(f.descripcion);
    setTipoFeriado(f.tipo_feriado || "PAGO_OBLIGATORIO");
    setActivo(f.activo);
    setErrorForm(null);
    setModalAbierto(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fecha || !descripcion.trim()) {
      setErrorForm("La fecha y la descripción son obligatorias.");
      return;
    }

    setGuardando(true);
    setErrorForm(null);

    try {
      if (modoEdicion && feriadoEditandoId) {
        const res = await apiRequest<{ exito: boolean; datos: Feriado }>(
          `/api/feriados/${feriadoEditandoId}`,
          {
            method: "PUT",
            body: {
              fecha,
              descripcion: descripcion.trim(),
              tipo_feriado: tipoFeriado,
              activo,
            },
          }
        );
        if (res.exito) {
          setModalAbierto(false);
          await cargarFeriados();
        }
      } else {
        const res = await apiRequest<{ exito: boolean; datos: Feriado }>(
          "/api/feriados",
          {
            method: "POST",
            body: {
              fecha,
              descripcion: descripcion.trim(),
              tipo_feriado: tipoFeriado,
              activo,
            },
          }
        );
        if (res.exito) {
          setModalAbierto(false);
          await cargarFeriados();
        }
      }
    } catch (err: any) {
      setErrorForm(err.mensaje || "Error al procesar el feriado.");
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleEstado = async (f: Feriado) => {
    try {
      const nuevoEstado = !f.activo;
      const res = await apiRequest<{ exito: boolean; datos: Feriado }>(
        `/api/feriados/${f.id}/estado`,
        {
          method: "PATCH",
          body: { activo: nuevoEstado },
        }
      );
      if (res.exito) {
        setFeriados((prev) =>
          prev.map((item) =>
            item.id === f.id ? { ...item, activo: nuevoEstado } : item
          )
        );
      }
    } catch (err: any) {
      alert(err.mensaje || "No se pudo actualizar el estado del feriado.");
    }
  };

  const formatearFechaLegible = (fechaStr: string) => {
    try {
      const partes = fechaStr.split("-");
      if (partes.length === 3) {
        const anio = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1;
        const dia = parseInt(partes[2], 10);
        const fechaObj = new Date(anio, mes, dia);
        return fechaObj.toLocaleDateString("es-CR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }
      return fechaStr;
    } catch {
      return fechaStr;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Encabezado y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-emerald-100 text-[#009944] rounded-lg">
              <Calendar className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold text-slate-900">
              Catálogo de Feriados RIMAC
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Control oficial de días festivos reconocidos por el motor de cálculo de jornada.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={cargarFeriados}
            disabled={cargando}
            className="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </button>

          {puedeGestionar && (
            <button
              type="button"
              id="btn-nuevo-feriado"
              onClick={abrirModalCrear}
              className="inline-flex items-center px-4 py-2 bg-[#009944] hover:bg-[#008039] text-white rounded-lg text-sm font-semibold shadow-xs transition-colors"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Nuevo Feriado
            </button>
          )}
        </div>
      </div>

      {/* Nota de Principio de Alcance Institucional */}
      <div className="my-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 flex items-start space-x-3">
        <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-700">
            Tratamiento Operativo de Feriados en Control de Tiempo:
          </p>
          <p>
            Un feriado activo es considerado automáticamente por el motor de asistencia para no calificar la falta de marcas como ausencia injustificada ordinaria. Si un colaborador registra trabajo durante un feriado, el sistema conserva las marcas físicas y calcula con precisión las horas efectivamente laboradas, sin generar de forma automática pagos de nómina ni sustituir los procesos oficiales de Softland.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Filtrar:
          </span>
          <button
            type="button"
            onClick={() => setFiltroActivos(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              !filtroActivos
                ? "bg-[#009944] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todos ({feriados.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroActivos(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filtroActivos
                ? "bg-[#009944] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Solo Activos
          </button>
        </div>
      </div>

      {/* Estado de Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Listado de Feriados */}
      {cargando && feriados.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#009944]" />
          Cargando catálogo de feriados...
        </div>
      ) : feriados.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">
            No se encontraron feriados registrados
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {puedeGestionar
              ? "Utilice el botón 'Nuevo Feriado' para registrar las fechas feriadas del año laboral."
              : "No hay feriados configurados para mostrar en este momento."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-6 py-3.5">
                  Fecha
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Descripción Oficial
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Tipo Feriado
                </th>
                <th scope="col" className="px-6 py-3.5 text-center">
                  Estado
                </th>
                {puedeGestionar && (
                  <th scope="col" className="px-6 py-3.5 text-right">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {feriados.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono font-bold text-slate-900 block">
                      {f.fecha}
                    </span>
                    <span className="text-xs text-slate-400 capitalize block">
                      {formatearFechaLegible(f.fecha)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-slate-800 block">
                      {f.descripcion}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md font-mono">
                      {f.tipo_feriado.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {f.activo ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                        <XCircle className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        Inactivo
                      </span>
                    )}
                  </td>
                  {puedeGestionar && (
                    <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => abrirModalEditar(f)}
                        className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleEstado(f)}
                        title={f.activo ? "Desactivar feriado" : "Activar feriado"}
                        className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                          f.activo
                            ? "text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100"
                            : "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                        }`}
                      >
                        <Power className="w-3.5 h-3.5 mr-1" />
                        {f.activo ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Crear / Editar Feriado */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-900">
                {modoEdicion ? "Editar Feriado" : "Registrar Nuevo Feriado"}
              </h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGuardar} className="mt-4 space-y-4">
              {errorForm && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{errorForm}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Fecha Oficial (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Descripción Oficial
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Día de la Independencia"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#009944] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tipo de Feriado
                </label>
                <select
                  value={tipoFeriado}
                  onChange={(e) => setTipoFeriado(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#009944] focus:outline-hidden bg-white"
                >
                  <option value="PAGO_OBLIGATORIO">Pago Obligatorio (De ley)</option>
                  <option value="PAGO_NO_OBLIGATORIO">Pago No Obligatorio</option>
                  <option value="INSTITUCIONAL">Feriado Institucional / Empresa</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="chk-activo"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                  className="w-4 h-4 text-[#009944] rounded border-slate-300 focus:ring-[#009944]"
                />
                <label htmlFor="chk-activo" className="text-sm font-medium text-slate-700">
                  Feriado Activo (Considerado por el motor de jornada)
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 bg-[#009944] hover:bg-[#008039] text-white rounded-xl text-sm font-semibold shadow-xs disabled:opacity-50"
                >
                  {guardando ? "Guardando..." : modoEdicion ? "Actualizar" : "Crear Feriado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
