import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest, getFriendlyErrorMessage } from "../services/api";
import {
  Users,
  Building2,
  Briefcase,
  Clock,
  GitBranch,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  History,
  Calendar,
  Lock,
  Trash2,
  Edit,
  Check,
  KeyRound,
} from "lucide-react";

type SubPestana = "colaboradores" | "departamentos" | "puestos" | "horarios" | "jefaturas";

interface Departamento {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  creado_en: string;
}

interface Puesto {
  id: string;
  departamento_id: string;
  departamento_nombre?: string;
  departamento_codigo?: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  creado_en: string;
}

interface HorarioDetalleDia {
  dia_semana: number;
  es_laborable: boolean;
  hora_entrada?: string;
  hora_salida?: string;
  cruza_medianoche: boolean;
  minutos_esperados: number;
}

interface Horario {
  id: string;
  codigo: string;
  nombre: string;
  tolerancia_entrada_minutos: number;
  minutos_semanales_referencia?: number;
  minutos_desayuno_max?: number;
  minutos_almuerzo_max?: number;
  minutos_cafe_max?: number;
  estado: "ACTIVO" | "INACTIVO";
  detalles_dia: HorarioDetalleDia[];
}

interface EmpleadoResumen {
  id: string;
  cedula: string;
  nombre_completo: string;
  correo_laboral?: string;
  telefono?: string;
  departamento_id: string;
  departamento_nombre?: string;
  departamento_codigo?: string;
  puesto_id: string;
  puesto_nombre?: string;
  puesto_codigo?: string;
  usuario_id?: string;
  tiene_usuario?: boolean;
  estado: "ACTIVO" | "INACTIVO";
  horario_vigente?: {
    id: string;
    codigo: string;
    nombre: string;
    fecha_inicio: string;
  } | null;
  jefatura_vigente?: {
    id: string;
    jefatura_empleado_id: string;
    nombre_completo: string;
    cedula: string;
    fecha_inicio: string;
  } | null;
}

interface EmpleadoDetalle extends EmpleadoResumen {
  historial_horarios: Array<{
    id: string;
    horario_id: string;
    codigo: string;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string | null;
    usuario_asigno_id: string;
    creado_en: string;
  }>;
  historial_jefaturas: Array<{
    id: string;
    jefatura_empleado_id: string;
    nombre_jefatura: string;
    cedula_jefatura: string;
    fecha_inicio: string;
    fecha_fin: string | null;
    estado: string;
    creado_en: string;
  }>;
  usuario: {
    id: string;
    identificador: string;
    rol: string;
    estado: string;
  } | null;
}

interface AsignacionJefaturaItem {
  id: string;
  jefatura_empleado_id: string;
  jefatura_nombre: string;
  jefatura_cedula: string;
  subordinado_empleado_id: string;
  subordinado_nombre: string;
  subordinado_cedula: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: string;
}

export const GestionPersonalView: React.FC<{
  onNavegarAUsuarios?: (empleadoId?: string) => void;
  pestanaInicial?: SubPestana;
}> = ({
  onNavegarAUsuarios,
  pestanaInicial,
}) => {
  const { tienePermiso } = useAuth();

  // Permisos efectivos
  const puedeVerEmpleados = tienePermiso("EMPLEADOS_VER");
  const puedeAdminEmpleados = tienePermiso("EMPLEADOS_ADMINISTRAR");
  const puedeAdminOrganizacion = tienePermiso("ORGANIZACION_ADMINISTRAR");
  const puedeVerHorarios = tienePermiso("HORARIOS_VER");
  const puedeAdminHorarios = tienePermiso("HORARIOS_ADMINISTRAR");
  const puedeAdminJefaturas = tienePermiso("JEFATURAS_ADMINISTRAR");
  const puedeAdminUsuarios = tienePermiso("USUARIOS_ADMINISTRAR");

  // Pestaña inicial según permisos o prop
  const [pestana, setPestana] = useState<SubPestana>(() => {
    if (pestanaInicial) return pestanaInicial;
    if (puedeVerEmpleados || puedeAdminEmpleados) return "colaboradores";
    if (puedeAdminOrganizacion) return "departamentos";
    if (puedeVerHorarios || puedeAdminHorarios) return "horarios";
    if (puedeAdminJefaturas) return "jefaturas";
    return "colaboradores";
  });

  // Estados de carga y mensajes
  const [cargando, setCargando] = useState<boolean>(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [advertenciaMsg, setAdvertenciaMsg] = useState<string | null>(null);

  // Datos principales
  const [empleados, setEmpleados] = useState<EmpleadoResumen[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [jefaturasVigentes, setJefaturasVigentes] = useState<AsignacionJefaturaItem[]>([]);

  // Filtros de colaboradores
  const [filtroTexto, setFiltroTexto] = useState<string>("");
  const [filtroDepto, setFiltroDepto] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");

  // Modales
  const [modalAltaColabAbierto, setModalAltaColabAbierto] = useState<boolean>(false);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<EmpleadoDetalle | null>(null);
  const [modalAsignarHorarioAbierto, setModalAsignarHorarioAbierto] = useState<boolean>(false);
  const [modalAsignarJefeAbierto, setModalAsignarJefeAbierto] = useState<boolean>(false);

  // Modales de Departamentos / Puestos / Horarios
  const [modalDeptoAbierto, setModalDeptoAbierto] = useState<boolean>(false);
  const [deptoEditando, setDeptoEditando] = useState<Departamento | null>(null);
  const [formDepto, setFormDepto] = useState({ codigo: "", nombre: "" });

  const [modalPuestoAbierto, setModalPuestoAbierto] = useState<boolean>(false);
  const [puestoEditando, setPuestoEditando] = useState<Puesto | null>(null);
  const [formPuesto, setFormPuesto] = useState({ departamento_id: "", codigo: "", nombre: "" });

  const [modalHorarioDetalle, setModalHorarioDetalle] = useState<Horario | null>(null);

  // Generador de días estándar de la semana (Lunes a Viernes 08:00 - 17:00, Sáb/Dom descanso)
  const generarDiasPorDefecto = (): HorarioDetalleDia[] => [
    { dia_semana: 1, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 2, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 3, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 4, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 5, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
    { dia_semana: 6, es_laborable: false, hora_entrada: "", hora_salida: "", cruza_medianoche: false, minutos_esperados: 0 },
    { dia_semana: 7, es_laborable: false, hora_entrada: "", hora_salida: "", cruza_medianoche: false, minutos_esperados: 0 },
  ];

  // Helper para normalizar los 7 días de la semana garantizando que siempre existan los 7 registros (1 a 7)
  const normalizarDiasSemana = (detalles?: HorarioDetalleDia[]): HorarioDetalleDia[] => {
    const base = generarDiasPorDefecto();
    if (!detalles || detalles.length === 0) return base;
    return base.map((diaDef) => {
      const existente = detalles.find((d) => d.dia_semana === diaDef.dia_semana);
      if (!existente) return { ...diaDef };
      const esLab = Boolean(existente.es_laborable);
      return {
        dia_semana: diaDef.dia_semana,
        es_laborable: esLab,
        hora_entrada: esLab ? (existente.hora_entrada || "08:00") : "",
        hora_salida: esLab ? (existente.hora_salida || "17:00") : "",
        cruza_medianoche: esLab ? Boolean(existente.cruza_medianoche) : false,
        minutos_esperados: esLab ? (Number(existente.minutos_esperados) || 480) : 0,
      };
    });
  };

  // Cálculo determinista de minutos esperados
  const calcularMinutosEsperados = (horaEntrada: string, horaSalida: string, cruzaNoche: boolean): number => {
    if (!horaEntrada || !horaSalida) return 480;
    const [hE, mE] = horaEntrada.split(":").map(Number);
    const [hS, mS] = horaSalida.split(":").map(Number);
    if (isNaN(hE) || isNaN(mE) || isNaN(hS) || isNaN(mS)) return 480;
    let diff = (hS * 60 + mS) - (hE * 60 + mE);
    if (cruzaNoche || diff < 0) {
      if (diff <= 0) diff += 1440;
    }
    return diff > 60 ? diff - 60 : (diff > 0 ? diff : 480);
  };

  // Formulario Crear / Editar Horario
  const [modalHorarioFormAbierto, setModalHorarioFormAbierto] = useState<boolean>(false);
  const [horarioEditando, setHorarioEditando] = useState<Horario | null>(null);
  const [formHorario, setFormHorario] = useState({
    codigo: "",
    nombre: "",
    tolerancia_entrada_minutos: 15,
    minutos_semanales_referencia: 2400,
    minutos_desayuno_max: 15,
    minutos_almuerzo_max: 30,
    minutos_cafe_max: 15,
    detalles_dia: generarDiasPorDefecto(),
  });

  // Manejador inmutable y atómico para activar/desactivar un día de la matriz semanal
  const handleToggleDiaLaborable = (diaNum: number, esLaborable: boolean) => {
    setFormHorario((prev) => {
      const nuevosDias = prev.detalles_dia.map((d) => {
        if (d.dia_semana !== diaNum) return d;
        if (!esLaborable) {
          // Día no laborable (Descanso): sin horas ni minutos ni cruce
          return {
            ...d,
            es_laborable: false,
            hora_entrada: "",
            hora_salida: "",
            cruza_medianoche: false,
            minutos_esperados: 0,
          };
        } else {
          // Día laborable: si no tenía horas, inicializar por defecto
          const horaEntrada = d.hora_entrada && d.hora_entrada.trim() ? d.hora_entrada : "08:00";
          const horaSalida = d.hora_salida && d.hora_salida.trim() ? d.hora_salida : "17:00";
          const cruza = Boolean(d.cruza_medianoche);
          const mins = d.minutos_esperados > 0
            ? d.minutos_esperados
            : calcularMinutosEsperados(horaEntrada, horaSalida, cruza);
          return {
            ...d,
            es_laborable: true,
            hora_entrada: horaEntrada,
            hora_salida: horaSalida,
            cruza_medianoche: cruza,
            minutos_esperados: mins,
          };
        }
      });
      return { ...prev, detalles_dia: nuevosDias };
    });
  };

  // Manejador inmutable para actualizar campos individuales de un día laborable
  const handleActualizarCampoDia = (
    diaNum: number,
    campo: "hora_entrada" | "hora_salida" | "cruza_medianoche" | "minutos_esperados",
    valor: any
  ) => {
    setFormHorario((prev) => {
      const nuevosDias = prev.detalles_dia.map((d) => {
        if (d.dia_semana !== diaNum) return d;
        const actualizado = { ...d, [campo]: valor };
        if (campo === "hora_entrada" || campo === "hora_salida" || campo === "cruza_medianoche") {
          actualizado.minutos_esperados = calcularMinutosEsperados(
            actualizado.hora_entrada || "08:00",
            actualizado.hora_salida || "17:00",
            actualizado.cruza_medianoche
          );
        }
        return actualizado;
      });
      return { ...prev, detalles_dia: nuevosDias };
    });
  };

  // Formulario Nueva Asignación de Jefatura (desde pestaña Jefaturas)
  const [modalNuevaJefaturaAbierto, setModalNuevaJefaturaAbierto] = useState<boolean>(false);
  const [formNuevaJefatura, setFormNuevaJefatura] = useState({
    subordinado_empleado_id: "",
    jefatura_empleado_id: "",
    fecha_inicio: new Date().toISOString().split("T")[0],
    fecha_fin: "",
  });

  // Modal de Confirmación Explícita (Eliminaciones y Finalización)
  const [modalConfirmacion, setModalConfirmacion] = useState<{
    abierto: boolean;
    tipo: "eliminar_depto" | "eliminar_puesto" | "eliminar_horario" | "finalizar_jefatura" | "eliminar_jefatura";
    id: string;
    nombre: string;
    fecha_fin?: string;
  } | null>(null);

  // Formulario Alta Colaborador (Flujo por Secciones: Datos → Organización → Horario → Jefatura)
  const [formAlta, setFormAlta] = useState({
    cedula: "",
    nombre_completo: "",
    correo_laboral: "",
    telefono: "",
    departamento_id: "",
    puesto_id: "",
    horario_id: "",
    fecha_inicio_horario: new Date().toISOString().split("T")[0],
    jefatura_empleado_id: "",
    fecha_inicio_jefatura: new Date().toISOString().split("T")[0],
  });

  // Modal y Formulario de Edición de Colaborador (Fase 3.2C.2 / Fase 3.2D.1)
  const [modalEditarEmpleadoAbierto, setModalEditarEmpleadoAbierto] = useState<boolean>(false);
  const [empleadoEditando, setEmpleadoEditando] = useState<EmpleadoResumen | EmpleadoDetalle | null>(null);
  const [formEditarEmpleado, setFormEditarEmpleado] = useState({
    nombre_completo: "",
    correo_laboral: "",
    telefono: "",
    departamento_id: "",
    puesto_id: "",
    jefatura_empleado_id: "",
    fecha_efectiva_jefatura: new Date().toISOString().split("T")[0],
    finalizar_jefatura_actual: false,
  });

  // Formulario Asignar Horario
  const [formAsigHorario, setFormAsigHorario] = useState({
    horario_id: "",
    fecha_inicio: new Date().toISOString().split("T")[0],
    fecha_fin: "",
  });

  // Formulario Asignar Jefatura
  const [formAsigJefe, setFormAsigJefe] = useState({
    jefatura_empleado_id: "",
    fecha_inicio: new Date().toISOString().split("T")[0],
    fecha_fin: "",
  });

  // Carga inicial y por pestaña
  const cargarCatalogosBase = async () => {
    try {
      if (puedeAdminOrganizacion || puedeVerEmpleados) {
        const [resDeptos, resPuestos] = await Promise.all([
          apiRequest<{ exito: boolean; datos: Departamento[] }>("/api/departamentos"),
          apiRequest<{ exito: boolean; datos: Puesto[] }>("/api/puestos"),
        ]);
        if (resDeptos?.exito) setDepartamentos(resDeptos.datos || []);
        if (resPuestos?.exito) setPuestos(resPuestos.datos || []);
      }
      if (puedeVerHorarios || puedeAdminHorarios) {
        const resH = await apiRequest<{ exito: boolean; datos: Horario[] }>("/api/horarios");
        if (resH?.exito) setHorarios(resH.datos || []);
      }
    } catch (err: any) {
      console.warn("Error cargando catálogos base:", err);
    }
  };

  const cargarDatosPestana = async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      await cargarCatalogosBase();

      if (pestana === "colaboradores" && puedeVerEmpleados) {
        const params = new URLSearchParams();
        if (filtroTexto) params.append("termino", filtroTexto);
        if (filtroDepto) params.append("departamento_id", filtroDepto);
        if (filtroEstado) params.append("estado", filtroEstado);

        const res = await apiRequest<{ exito: boolean; datos: EmpleadoResumen[] }>(
          `/api/empleados?${params.toString()}`
        );
        if (res?.exito) setEmpleados(res.datos || []);
      } else if (pestana === "departamentos" && (puedeAdminOrganizacion || puedeVerEmpleados)) {
        const res = await apiRequest<{ exito: boolean; datos: Departamento[] }>("/api/departamentos");
        if (res?.exito) setDepartamentos(res.datos || []);
      } else if (pestana === "puestos" && (puedeAdminOrganizacion || puedeVerEmpleados)) {
        const res = await apiRequest<{ exito: boolean; datos: Puesto[] }>("/api/puestos");
        if (res?.exito) setPuestos(res.datos || []);
      } else if (pestana === "horarios" && puedeVerHorarios) {
        const res = await apiRequest<{ exito: boolean; datos: Horario[] }>("/api/horarios");
        if (res?.exito) setHorarios(res.datos || []);
      } else if (pestana === "jefaturas" && puedeAdminJefaturas) {
        const [resJ, resE] = await Promise.all([
          apiRequest<{ exito: boolean; datos: AsignacionJefaturaItem[] }>("/api/jefaturas"),
          apiRequest<{ exito: boolean; datos: EmpleadoResumen[] }>("/api/empleados"),
        ]);
        if (resJ?.exito) setJefaturasVigentes(resJ.datos || []);
        if (resE?.exito) setEmpleados(resE.datos || []);
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatosPestana();
  }, [pestana]);

  const cargarDetalleEmpleado = async (id: string) => {
    try {
      const res = await apiRequest<{ exito: boolean; datos: EmpleadoDetalle }>(`/api/empleados/${id}`);
      if (res?.exito && res.datos) {
        setEmpleadoSeleccionado(res.datos);
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`Error cargando expediente: ${friendly.descripcion}`);
    }
  };

  // Manejador Alta de Colaborador (Transaccional)
  const handleAltaColaborador = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setMensajeExito(null);
    try {
      const res = await apiRequest<{ exito: boolean; mensaje: string; acceso_sistema: string; datos: any }>(
        "/api/empleados",
        {
          method: "POST",
          body: formAlta,
        }
      );

      if (res?.exito) {
        setMensajeExito(`${res.mensaje} (${res.acceso_sistema})`);
        setModalAltaColabAbierto(false);
        // Reset form
        setFormAlta({
          cedula: "",
          nombre_completo: "",
          correo_laboral: "",
          telefono: "",
          departamento_id: "",
          puesto_id: "",
          horario_id: "",
          fecha_inicio_horario: new Date().toISOString().split("T")[0],
          jefatura_empleado_id: "",
          fecha_inicio_jefatura: new Date().toISOString().split("T")[0],
        });
        cargarDatosPestana();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Manejador Asignar Horario
  const handleAsignarHorario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empleadoSeleccionado) return;
    setErrorMsg(null);
    setMensajeExito(null);
    try {
      const res = await apiRequest<{ exito: boolean; mensaje: string; datos: any }>(
        `/api/empleados/${empleadoSeleccionado.id}/horarios`,
        {
          method: "POST",
          body: {
            horario_id: formAsigHorario.horario_id,
            fecha_inicio: formAsigHorario.fecha_inicio,
            fecha_fin: formAsigHorario.fecha_fin || undefined,
          },
        }
      );
      if (res?.exito) {
        setMensajeExito(res.mensaje);
        setModalAsignarHorarioAbierto(false);
        await cargarDetalleEmpleado(empleadoSeleccionado.id);
        cargarDatosPestana();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Manejador Asignar Jefatura Directa
  const handleAsignarJefe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empleadoSeleccionado) return;
    setErrorMsg(null);
    setMensajeExito(null);
    try {
      const res = await apiRequest<{ exito: boolean; mensaje: string; datos: any }>(
        `/api/empleados/${empleadoSeleccionado.id}/jefatura`,
        {
          method: "POST",
          body: {
            jefatura_empleado_id: formAsigJefe.jefatura_empleado_id,
            fecha_inicio: formAsigJefe.fecha_inicio,
            fecha_fin: formAsigJefe.fecha_fin || undefined,
          },
        }
      );
      if (res?.exito) {
        setMensajeExito(res.mensaje);
        setModalAsignarJefeAbierto(false);
        await cargarDetalleEmpleado(empleadoSeleccionado.id);
        cargarDatosPestana();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Baja lógica / Reactivación de empleado
  const handleCambiarEstadoEmpleado = async (emp: EmpleadoResumen | EmpleadoDetalle, nuevoEstado: "ACTIVO" | "INACTIVO") => {
    setErrorMsg(null);
    setMensajeExito(null);
    setAdvertenciaMsg(null);
    try {
      const res = await apiRequest<{ exito: boolean; mensaje: string; advertencia?: string; datos: any }>(
        `/api/empleados/${emp.id}/estado`,
        {
          method: "PATCH",
          body: { estado: nuevoEstado },
        }
      );
      if (res?.exito) {
        setMensajeExito(res.mensaje);
        if (res.advertencia) setAdvertenciaMsg(res.advertencia);
        if (empleadoSeleccionado && empleadoSeleccionado.id === emp.id) {
          await cargarDetalleEmpleado(emp.id);
        }
        cargarDatosPestana();
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Guardar Departamento
  const handleGuardarDepto = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      if (deptoEditando) {
        await apiRequest(`/api/departamentos/${deptoEditando.id}`, {
          method: "PUT",
          body: { nombre: formDepto.nombre },
        });
        setMensajeExito("Departamento actualizado correctamente.");
      } else {
        await apiRequest("/api/departamentos", {
          method: "POST",
          body: formDepto,
        });
        setMensajeExito("Departamento creado correctamente.");
      }
      setModalDeptoAbierto(false);
      setDeptoEditando(null);
      setFormDepto({ codigo: "", nombre: "" });
      cargarDatosPestana();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Activar/Desactivar Departamento
  const handleToggleEstadoDepto = async (depto: Departamento) => {
    try {
      await apiRequest(`/api/departamentos/${depto.id}/estado`, {
        method: "PATCH",
        body: { activo: !depto.activo },
      });
      setMensajeExito(`Departamento ${!depto.activo ? "activado" : "desactivado"} exitosamente.`);
      cargarDatosPestana();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Guardar Puesto
  const handleGuardarPuesto = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      if (puestoEditando) {
        await apiRequest(`/api/puestos/${puestoEditando.id}`, {
          method: "PUT",
          body: { departamento_id: formPuesto.departamento_id, nombre: formPuesto.nombre },
        });
        setMensajeExito("Puesto actualizado correctamente.");
      } else {
        await apiRequest("/api/puestos", {
          method: "POST",
          body: formPuesto,
        });
        setMensajeExito("Puesto creado correctamente.");
      }
      setModalPuestoAbierto(false);
      setPuestoEditando(null);
      setFormPuesto({ departamento_id: "", codigo: "", nombre: "" });
      cargarDatosPestana();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Activar/Desactivar Puesto
  const handleToggleEstadoPuesto = async (puesto: Puesto) => {
    try {
      await apiRequest(`/api/puestos/${puesto.id}/estado`, {
        method: "PATCH",
        body: { activo: !puesto.activo },
      });
      setMensajeExito(`Puesto ${!puesto.activo ? "activado" : "desactivado"} exitosamente.`);
      cargarDatosPestana();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Guardar Horario (Crear / Editar con matriz semanal)
  const handleGuardarHorario = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const payloadHorario = {
        ...formHorario,
        detalles_dia: normalizarDiasSemana(formHorario.detalles_dia),
      };

      if (horarioEditando) {
        await apiRequest(`/api/horarios/${horarioEditando.id}`, {
          method: "PUT",
          body: payloadHorario,
        });
        setMensajeExito("Horario actualizado correctamente.");
      } else {
        await apiRequest("/api/horarios", {
          method: "POST",
          body: payloadHorario,
        });
        setMensajeExito("Horario creado correctamente con su matriz semanal de días.");
      }
      setModalHorarioFormAbierto(false);
      setHorarioEditando(null);
      cargarDatosPestana();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Activar/Desactivar Horario
  const handleToggleEstadoHorario = async (h: Horario) => {
    try {
      const nuevoEstado = h.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
      await apiRequest(`/api/horarios/${h.id}/estado`, {
        method: "PATCH",
        body: { estado: nuevoEstado },
      });
      setMensajeExito(`Horario ${nuevoEstado === "ACTIVO" ? "activado" : "desactivado"} exitosamente.`);
      cargarDatosPestana();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Guardar Asignación Directa de Jefatura (desde pestaña Jefaturas)
  const handleCrearJefatura = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiRequest("/api/jefaturas", {
        method: "POST",
        body: {
          subordinado_empleado_id: formNuevaJefatura.subordinado_empleado_id,
          jefatura_empleado_id: formNuevaJefatura.jefatura_empleado_id,
          fecha_inicio: formNuevaJefatura.fecha_inicio,
          fecha_fin: formNuevaJefatura.fecha_fin || undefined,
        },
      });
      setMensajeExito("Relación de jefatura directa asignada correctamente. El alcance ABAC fue actualizado de inmediato.");
      setModalNuevaJefaturaAbierto(false);
      cargarDatosPestana();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  // Manejador central de confirmaciones explícitas de eliminación y finalización
  const handleEjecutarConfirmacion = async () => {
    if (!modalConfirmacion) return;
    setErrorMsg(null);
    setMensajeExito(null);
    const { tipo, id, fecha_fin } = modalConfirmacion;

    try {
      if (tipo === "eliminar_depto") {
        await apiRequest(`/api/departamentos/${id}`, { method: "DELETE" });
        setMensajeExito("Departamento eliminado permanentemente.");
      } else if (tipo === "eliminar_puesto") {
        await apiRequest(`/api/puestos/${id}`, { method: "DELETE" });
        setMensajeExito("Puesto eliminado permanentemente.");
      } else if (tipo === "eliminar_horario") {
        await apiRequest(`/api/horarios/${id}`, { method: "DELETE" });
        setMensajeExito("Horario eliminado permanentemente.");
      } else if (tipo === "finalizar_jefatura") {
        await apiRequest(`/api/jefaturas/${id}/finalizar`, {
          method: "PATCH",
          body: { fecha_fin: fecha_fin || new Date().toISOString().split("T")[0] },
        });
        setMensajeExito("Asignación de jefatura finalizada exitosamente conservando el historial y actualizando el alcance ABAC.");
      } else if (tipo === "eliminar_jefatura") {
        await apiRequest(`/api/jefaturas/${id}`, { method: "DELETE" });
        setMensajeExito("Asignación de jefatura eliminada permanentemente del sistema.");
      }

      setModalConfirmacion(null);
      cargarDatosPestana();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
      setModalConfirmacion(null);
    }
  };

  // Puestos filtrados por depto en formulario de alta
  const puestosDelDeptoSeleccionado = puestos.filter(
    (p) => p.activo && (!formAlta.departamento_id || p.departamento_id === formAlta.departamento_id)
  );

  // Puestos filtrados por depto en formulario de edición (Fase 3.2C.2)
  const puestosDelDeptoEditando = puestos.filter(
    (p) => p.activo && (!formEditarEmpleado.departamento_id || p.departamento_id === formEditarEmpleado.departamento_id)
  );

  // Abrir modal de edición de colaborador con sus datos actuales
  const abrirModalEditarEmpleado = (emp: EmpleadoResumen | EmpleadoDetalle) => {
    setEmpleadoEditando(emp);
    const jefeVigenteId = emp.jefatura_vigente?.jefatura_empleado_id || "";
    setFormEditarEmpleado({
      nombre_completo: emp.nombre_completo || "",
      correo_laboral: emp.correo_laboral || "",
      telefono: emp.telefono || "",
      departamento_id: emp.departamento_id || "",
      puesto_id: emp.puesto_id || "",
      jefatura_empleado_id: jefeVigenteId,
      fecha_efectiva_jefatura: new Date().toISOString().split("T")[0],
      finalizar_jefatura_actual: false,
    });
    setModalEditarEmpleadoAbierto(true);
  };

  // Guardar cambios en colaborador (PUT /api/empleados/:id + Jefaturas si corresponde)
  const handleGuardarEdicionEmpleado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empleadoEditando) return;
    setErrorMsg(null);
    setMensajeExito(null);

    // Validación de integridad puesto-departamento
    if (formEditarEmpleado.puesto_id) {
      const puestoObj = puestos.find((p) => p.id === formEditarEmpleado.puesto_id);
      if (puestoObj && puestoObj.departamento_id !== formEditarEmpleado.departamento_id) {
        setErrorMsg("Inconsistencia organizacional: El puesto seleccionado no pertenece al departamento del colaborador.");
        return;
      }
    }

    try {
      // 1. Actualizar datos organizacionales del colaborador
      await apiRequest(`/api/empleados/${empleadoEditando.id}`, {
        method: "PUT",
        body: {
          nombre_completo: formEditarEmpleado.nombre_completo.trim(),
          correo_laboral: formEditarEmpleado.correo_laboral.trim() || undefined,
          telefono: formEditarEmpleado.telefono.trim() || undefined,
          departamento_id: formEditarEmpleado.departamento_id,
          puesto_id: formEditarEmpleado.puesto_id,
        },
      });

      // 2. Gestionar cambio de jefatura directa si el usuario tiene permiso JEFATURAS_ADMINISTRAR
      let mensajeJefatura = "";
      if (puedeAdminJefaturas) {
        const jefeOriginalId = empleadoEditando.jefatura_vigente?.jefatura_empleado_id || "";
        const fechaEf = formEditarEmpleado.fecha_efectiva_jefatura || new Date().toISOString().split("T")[0];

        if (formEditarEmpleado.finalizar_jefatura_actual && empleadoEditando.jefatura_vigente) {
          // Finalizar asignación de jefatura vigente
          await apiRequest(`/api/empleados/${empleadoEditando.id}/jefatura/finalizar`, {
            method: "PATCH",
            body: { fecha_fin: fechaEf },
          });
          mensajeJefatura = " Asignación de jefatura anterior finalizada.";
        } else if (
          formEditarEmpleado.jefatura_empleado_id &&
          formEditarEmpleado.jefatura_empleado_id !== jefeOriginalId
        ) {
          // Asignar o cambiar a nueva jefatura directa
          await apiRequest(`/api/empleados/${empleadoEditando.id}/jefatura`, {
            method: "POST",
            body: {
              jefatura_empleado_id: formEditarEmpleado.jefatura_empleado_id,
              fecha_inicio: fechaEf,
            },
          });
          mensajeJefatura = " Jefatura directa actualizada correctamente.";
        }
      }

      setMensajeExito(`Datos del colaborador actualizados correctamente.${mensajeJefatura}`);
      setModalEditarEmpleadoAbierto(false);
      setEmpleadoEditando(null);

      // Si el expediente estaba abierto, recargarlo
      if (empleadoSeleccionado && empleadoSeleccionado.id === empleadoEditando.id) {
        await cargarDetalleEmpleado(empleadoEditando.id);
      }
      cargarDatosPestana();
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(err);
      setErrorMsg(`${friendly.titulo}: ${friendly.descripcion}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-[#009944]" />
            Gestión de Estructura Organizacional y Personal
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Administración centralizada de colaboradores, departamentos, puestos, horarios laborales y jerarquías ABAC.
          </p>
        </div>

        {/* Acciones Rápidas según pestaña */}
        <div className="flex items-center gap-2">
          {pestana === "colaboradores" && puedeAdminEmpleados && (
            <button
              type="button"
              id="btn-alta-colaborador"
              onClick={() => {
                setErrorMsg(null);
                setModalAltaColabAbierto(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-[#009944] text-white rounded-lg hover:bg-[#008038] text-sm font-medium transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo Colaborador
            </button>
          )}

          {pestana === "departamentos" && puedeAdminOrganizacion && (
            <button
              type="button"
              id="btn-nuevo-departamento"
              onClick={() => {
                setDeptoEditando(null);
                setFormDepto({ codigo: "", nombre: "" });
                setModalDeptoAbierto(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-[#009944] text-white rounded-lg hover:bg-[#008038] text-sm font-medium transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo Departamento
            </button>
          )}

          {pestana === "puestos" && puedeAdminOrganizacion && (
            <button
              type="button"
              id="btn-nuevo-puesto"
              onClick={() => {
                setPuestoEditando(null);
                setFormPuesto({
                  departamento_id: departamentos[0]?.id || "",
                  codigo: "",
                  nombre: "",
                });
                setModalPuestoAbierto(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-[#009944] text-white rounded-lg hover:bg-[#008038] text-sm font-medium transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo Puesto
            </button>
          )}

          {pestana === "horarios" && puedeAdminHorarios && (
            <button
              type="button"
              id="btn-nuevo-horario"
              onClick={() => {
                setHorarioEditando(null);
                setFormHorario({
                  codigo: "",
                  nombre: "",
                  tolerancia_entrada_minutos: 15,
                  minutos_semanales_referencia: 2400,
                  minutos_desayuno_max: 15,
                  minutos_almuerzo_max: 30,
                  minutos_cafe_max: 15,
                  detalles_dia: normalizarDiasSemana(),
                });
                setModalHorarioFormAbierto(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-[#009944] text-white rounded-lg hover:bg-[#008038] text-sm font-medium transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo Horario
            </button>
          )}

          {pestana === "jefaturas" && puedeAdminJefaturas && (
            <button
              type="button"
              id="btn-nueva-jefatura"
              onClick={() => {
                const empsActivos = empleados.filter((e) => e.estado === "ACTIVO");
                setFormNuevaJefatura({
                  subordinado_empleado_id: empsActivos[0]?.id || "",
                  jefatura_empleado_id: empsActivos[1]?.id || "",
                  fecha_inicio: new Date().toISOString().split("T")[0],
                  fecha_fin: "",
                });
                setModalNuevaJefaturaAbierto(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-[#009944] text-white rounded-lg hover:bg-[#008038] text-sm font-medium transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Nueva Asignación de Jefatura
            </button>
          )}
        </div>
      </div>

      {/* Alertas Globales */}
      {mensajeExito && (
        <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-emerald-800 font-medium">{mensajeExito}</div>
          <button onClick={() => setMensajeExito(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {advertenciaMsg && (
        <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-amber-800 font-medium">{advertenciaMsg}</div>
          <button onClick={() => setAdvertenciaMsg(null)} className="text-amber-500 hover:text-amber-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="mt-4 p-4 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-rose-800 font-medium">{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navegación por Sub-pestañas */}
      <div className="mt-6 flex border-b border-slate-200 space-x-1 sm:space-x-4 overflow-x-auto">
        {(puedeVerEmpleados || puedeAdminEmpleados) && (
          <button
            type="button"
            id="tab-colaboradores"
            onClick={() => setPestana("colaboradores")}
            className={`py-3 px-3 sm:px-4 font-semibold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              pestana === "colaboradores"
                ? "border-[#009944] text-[#009944]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Users className="w-4 h-4" />
            Colaboradores
          </button>
        )}

        {(puedeAdminOrganizacion || puedeVerEmpleados) && (
          <button
            type="button"
            id="tab-departamentos"
            onClick={() => setPestana("departamentos")}
            className={`py-3 px-3 sm:px-4 font-semibold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              pestana === "departamentos"
                ? "border-[#009944] text-[#009944]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Departamentos
          </button>
        )}

        {(puedeAdminOrganizacion || puedeVerEmpleados) && (
          <button
            type="button"
            id="tab-puestos"
            onClick={() => setPestana("puestos")}
            className={`py-3 px-3 sm:px-4 font-semibold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              pestana === "puestos"
                ? "border-[#009944] text-[#009944]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Puestos
          </button>
        )}

        {(puedeVerHorarios || puedeAdminHorarios) && (
          <button
            type="button"
            id="tab-horarios"
            onClick={() => setPestana("horarios")}
            className={`py-3 px-3 sm:px-4 font-semibold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              pestana === "horarios"
                ? "border-[#009944] text-[#009944]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Clock className="w-4 h-4" />
            Horarios
          </button>
        )}

        {(puedeAdminJefaturas || puedeVerEmpleados) && (
          <button
            type="button"
            id="tab-jefaturas"
            onClick={() => setPestana("jefaturas")}
            className={`py-3 px-3 sm:px-4 font-semibold text-sm border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              pestana === "jefaturas"
                ? "border-[#009944] text-[#009944]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <GitBranch className="w-4 h-4" />
            Jefaturas
          </button>
        )}
      </div>

      {/* Contenido según pestaña */}
      <div className="mt-6">
        {cargando ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <div className="w-8 h-8 border-3 border-[#009944] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Cargando registros organizacionales...
          </div>
        ) : (
          <>
            {/* PESTAÑA: COLABORADORES */}
            {pestana === "colaboradores" && (
              <div className="space-y-4">
                {/* Barra de Filtros */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por cédula, nombre o correo..."
                      value={filtroTexto}
                      onChange={(e) => setFiltroTexto(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && cargarDatosPestana()}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009944]"
                    />
                  </div>

                  <select
                    value={filtroDepto}
                    onChange={(e) => {
                      setFiltroDepto(e.target.value);
                      setTimeout(cargarDatosPestana, 0);
                    }}
                    className="py-2 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009944]"
                  >
                    <option value="">Todos los departamentos</option>
                    {departamentos.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filtroEstado}
                    onChange={(e) => {
                      setFiltroEstado(e.target.value);
                      setTimeout(cargarDatosPestana, 0);
                    }}
                    className="py-2 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#009944]"
                  >
                    <option value="">Todos los estados</option>
                    <option value="ACTIVO">Activos</option>
                    <option value="INACTIVO">Inactivos</option>
                  </select>

                  <button
                    type="button"
                    onClick={cargarDatosPestana}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                  >
                    Filtrar
                  </button>
                </div>

                {/* Tabla de Colaboradores */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Cédula / Código</th>
                          <th className="px-4 py-3">Nombre Completo</th>
                          <th className="px-4 py-3">Departamento / Puesto</th>
                          <th className="px-4 py-3">Horario Vigente</th>
                          <th className="px-4 py-3">Jefatura Vigente</th>
                          <th className="px-4 py-3">Acceso Sistema</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {empleados.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                              No se encontraron colaboradores con los criterios seleccionados.
                            </td>
                          </tr>
                        ) : (
                          empleados.map((emp) => (
                            <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3 font-mono font-medium text-slate-700">
                                {emp.cedula}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-800">{emp.nombre_completo}</div>
                                {emp.correo_laboral && (
                                  <div className="text-xs text-slate-400">{emp.correo_laboral}</div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-slate-800 font-medium">{emp.departamento_nombre || "—"}</div>
                                <div className="text-xs text-slate-500">{emp.puesto_nombre || "—"}</div>
                              </td>
                              <td className="px-4 py-3">
                                {emp.horario_vigente ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    {emp.horario_vigente.codigo}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">Sin horario</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {emp.jefatura_vigente ? (
                                  <div>
                                    <div className="text-xs text-slate-800 font-semibold">
                                      {emp.jefatura_vigente.nombre_completo}
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-mono">
                                      Cédula: {emp.jefatura_vigente.cedula} &bull; Desde: {emp.jefatura_vigente.fecha_inicio}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">Sin jefatura asignada</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {emp.tiene_usuario ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                    Usuario activo
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                    Sin acceso al sistema
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    emp.estado === "ACTIVO"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  }`}
                                >
                                  {emp.estado}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => cargarDetalleEmpleado(emp.id)}
                                  className="text-xs text-[#009944] hover:text-[#008038] font-semibold px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 transition-colors mr-2"
                                >
                                  Ver Expediente
                                </button>
                                {puedeAdminEmpleados && (
                                  <>
                                    <button
                                      type="button"
                                      id={`btn-editar-empleado-${emp.id}`}
                                      onClick={() => abrirModalEditarEmpleado(emp)}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors mr-2"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCambiarEstadoEmpleado(
                                          emp,
                                          emp.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO"
                                        )
                                      }
                                      className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                                        emp.estado === "ACTIVO"
                                          ? "text-rose-600 bg-rose-50 hover:bg-rose-100"
                                          : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                      }`}
                                    >
                                      {emp.estado === "ACTIVO" ? "Baja" : "Reactivar"}
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA: DEPARTAMENTOS */}
            {pestana === "departamentos" && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departamentos.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono font-medium text-slate-700">{d.codigo}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{d.nombre}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              d.activo
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {d.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {puedeAdminOrganizacion && (
                            <>
                              <button
                                type="button"
                                id={`btn-editar-depto-${d.id}`}
                                onClick={() => {
                                  setDeptoEditando(d);
                                  setFormDepto({ codigo: d.codigo, nombre: d.nombre });
                                  setModalDeptoAbierto(true);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 mr-2"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                id={`btn-estado-depto-${d.id}`}
                                onClick={() => handleToggleEstadoDepto(d)}
                                className={`text-xs font-medium px-2 py-1 rounded mr-2 ${
                                  d.activo
                                    ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                                    : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                }`}
                              >
                                {d.activo ? "Desactivar" : "Activar"}
                              </button>
                              <button
                                type="button"
                                id={`btn-eliminar-depto-${d.id}`}
                                onClick={() =>
                                  setModalConfirmacion({
                                    abierto: true,
                                    tipo: "eliminar_depto",
                                    id: d.id,
                                    nombre: `${d.codigo} - ${d.nombre}`,
                                  })
                                }
                                className="text-xs text-rose-600 hover:text-rose-800 font-medium px-2 py-1 rounded bg-rose-50 hover:bg-rose-100"
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* PESTAÑA: PUESTOS */}
            {pestana === "puestos" && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Nombre del Puesto</th>
                      <th className="px-4 py-3">Departamento Perteneciente</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {puestos.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono font-medium text-slate-700">{p.codigo}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{p.nombre}</td>
                        <td className="px-4 py-3 text-slate-600">{p.departamento_nombre || "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              p.activo
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {p.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {puedeAdminOrganizacion && (
                            <>
                              <button
                                type="button"
                                id={`btn-editar-puesto-${p.id}`}
                                onClick={() => {
                                  setPuestoEditando(p);
                                  setFormPuesto({
                                    departamento_id: p.departamento_id,
                                    codigo: p.codigo,
                                    nombre: p.nombre,
                                  });
                                  setModalPuestoAbierto(true);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 mr-2"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                id={`btn-estado-puesto-${p.id}`}
                                onClick={() => handleToggleEstadoPuesto(p)}
                                className={`text-xs font-medium px-2 py-1 rounded mr-2 ${
                                  p.activo
                                    ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                                    : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                }`}
                              >
                                {p.activo ? "Desactivar" : "Activar"}
                              </button>
                              <button
                                type="button"
                                id={`btn-eliminar-puesto-${p.id}`}
                                onClick={() =>
                                  setModalConfirmacion({
                                    abierto: true,
                                    tipo: "eliminar_puesto",
                                    id: p.id,
                                    nombre: `${p.codigo} - ${p.nombre}`,
                                  })
                                }
                                className="text-xs text-rose-600 hover:text-rose-800 font-medium px-2 py-1 rounded bg-rose-50 hover:bg-rose-100"
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* PESTAÑA: HORARIOS */}
            {pestana === "horarios" && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Tolerancia Entrada</th>
                      <th className="px-4 py-3">Descansos Max</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {horarios.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono font-medium text-slate-700">{h.codigo}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{h.nombre}</td>
                        <td className="px-4 py-3 text-slate-600">{h.tolerancia_entrada_minutos} min</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          Desayuno {h.minutos_desayuno_max}m &bull; Almuerzo {h.minutos_almuerzo_max}m &bull; Café {h.minutos_cafe_max}m
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              h.estado === "ACTIVO"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {h.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setModalHorarioDetalle(h)}
                            className="text-xs text-slate-700 hover:text-slate-900 font-semibold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 transition-colors mr-2"
                          >
                            Ver Semana
                          </button>
                          {puedeAdminHorarios && (
                            <>
                              <button
                                type="button"
                                id={`btn-editar-horario-${h.id}`}
                                onClick={() => {
                                  setHorarioEditando(h);
                                  setFormHorario({
                                    codigo: h.codigo,
                                    nombre: h.nombre,
                                    tolerancia_entrada_minutos: h.tolerancia_entrada_minutos,
                                    minutos_semanales_referencia: h.minutos_semanales_referencia || 2400,
                                    minutos_desayuno_max: h.minutos_desayuno_max || 15,
                                    minutos_almuerzo_max: h.minutos_almuerzo_max || 30,
                                    minutos_cafe_max: h.minutos_cafe_max || 15,
                                    detalles_dia: normalizarDiasSemana(h.detalles_dia),
                                  });
                                  setModalHorarioFormAbierto(true);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 mr-2"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                id={`btn-estado-horario-${h.id}`}
                                onClick={() => handleToggleEstadoHorario(h)}
                                className={`text-xs font-medium px-2 py-1 rounded mr-2 ${
                                  h.estado === "ACTIVO"
                                    ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                                    : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                }`}
                              >
                                {h.estado === "ACTIVO" ? "Desactivar" : "Activar"}
                              </button>
                              <button
                                type="button"
                                id={`btn-eliminar-horario-${h.id}`}
                                onClick={() =>
                                  setModalConfirmacion({
                                    abierto: true,
                                    tipo: "eliminar_horario",
                                    id: h.id,
                                    nombre: `${h.codigo} - ${h.nombre}`,
                                  })
                                }
                                className="text-xs text-rose-600 hover:text-rose-800 font-medium px-2 py-1 rounded bg-rose-50 hover:bg-rose-100"
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* PESTAÑA: JEFATURAS VIGENTES */}
            {pestana === "jefaturas" && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 font-medium">
                  Relaciones de jefatura directa vigentes en la organización (motor ABAC de autorizaciones).
                </div>
                <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Jefatura Directa</th>
                      <th className="px-4 py-3">Colaborador Subordinado</th>
                      <th className="px-4 py-3">Fecha Inicio</th>
                      <th className="px-4 py-3">Fecha Fin</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jefaturasVigentes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          No hay asignaciones de jefatura vigentes registradas.
                        </td>
                      </tr>
                    ) : (
                      jefaturasVigentes.map((j) => (
                        <tr key={j.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{j.jefatura_nombre}</div>
                            <div className="text-xs text-slate-400 font-mono">{j.jefatura_cedula}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{j.subordinado_nombre}</div>
                            <div className="text-xs text-slate-400 font-mono">{j.subordinado_cedula}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600">{j.fecha_inicio}</td>
                          <td className="px-4 py-3 font-mono text-slate-500">
                            {j.fecha_fin || "Indefinida (Vigente)"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                              {j.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {puedeAdminJefaturas && (
                              <>
                                <button
                                  type="button"
                                  id={`btn-finalizar-jefatura-${j.id}`}
                                  onClick={() =>
                                    setModalConfirmacion({
                                      abierto: true,
                                      tipo: "finalizar_jefatura",
                                      id: j.id,
                                      nombre: `${j.jefatura_nombre} → ${j.subordinado_nombre}`,
                                      fecha_fin: new Date().toISOString().split("T")[0],
                                    })
                                  }
                                  className="text-xs text-purple-700 hover:text-purple-900 font-medium px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 mr-2"
                                >
                                  Finalizar
                                </button>
                                <button
                                  type="button"
                                  id={`btn-eliminar-jefatura-${j.id}`}
                                  onClick={() =>
                                    setModalConfirmacion({
                                      abierto: true,
                                      tipo: "eliminar_jefatura",
                                      id: j.id,
                                      nombre: `${j.jefatura_nombre} → ${j.subordinado_nombre}`,
                                    })
                                  }
                                  className="text-xs text-rose-600 hover:text-rose-800 font-medium px-2 py-1 rounded bg-rose-50 hover:bg-rose-100"
                                >
                                  Eliminar
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL EXPEDIENTE COMPLETO DEL COLABORADOR */}
      {/* ======================================================== */}
      {empleadoSeleccionado && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => setEmpleadoSeleccionado(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-4 pb-4 border-b border-slate-200">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-[#009944] font-bold text-xl flex items-center justify-center shrink-0">
                {empleadoSeleccionado.nombre_completo.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-800">{empleadoSeleccionado.nombre_completo}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        empleadoSeleccionado.estado === "ACTIVO"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {empleadoSeleccionado.estado}
                    </span>
                  </div>
                  {puedeAdminEmpleados && (
                    <button
                      type="button"
                      id="btn-editar-expediente-empleado"
                      onClick={() => abrirModalEditarEmpleado(empleadoSeleccionado)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Editar Datos
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Cédula: {empleadoSeleccionado.cedula} &bull; {empleadoSeleccionado.correo_laboral || "Sin correo"} &bull; {empleadoSeleccionado.telefono || "Sin teléfono"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
                    Depto: {empleadoSeleccionado.departamento_nombre}
                  </span>
                  <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
                    Puesto: {empleadoSeleccionado.puesto_nombre}
                  </span>
                  <span
                    className={`px-2 py-1 rounded font-medium ${
                      empleadoSeleccionado.usuario
                        ? "bg-purple-100 text-purple-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {empleadoSeleccionado.usuario
                      ? `Usuario: ${empleadoSeleccionado.usuario.identificador} (${empleadoSeleccionado.usuario.rol})`
                      : "Sin acceso al sistema"}
                  </span>
                </div>
              </div>
            </div>

            {/* Secciones de Horario y Jefatura con Botones de Cambio */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
              {/* Bloque Horario */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" /> Horario Vigente
                  </span>
                  {puedeAdminHorarios && (
                    <button
                      type="button"
                      id="btn-asignar-horario"
                      onClick={() => {
                        setFormAsigHorario({
                          horario_id: horarios[0]?.id || "",
                          fecha_inicio: new Date().toISOString().split("T")[0],
                          fecha_fin: "",
                        });
                        setModalAsignarHorarioAbierto(true);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      Asignar Horario
                    </button>
                  )}
                </div>
                {empleadoSeleccionado.horario_vigente ? (
                  <div className="text-sm">
                    <div className="font-bold text-slate-800">
                      {empleadoSeleccionado.horario_vigente.codigo} - {empleadoSeleccionado.horario_vigente.nombre}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Vigente desde: {empleadoSeleccionado.horario_vigente.fecha_inicio}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 italic">No tiene horario vigente asignado.</div>
                )}
              </div>

              {/* Bloque Jefatura */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4 text-emerald-600" /> Jefatura Directa Vigente
                  </span>
                  {puedeAdminJefaturas && (
                    <button
                      type="button"
                      id="btn-asignar-jefatura"
                      onClick={() => {
                        // Excluir al propio empleado de las opciones de jefatura
                        const jefesDisponibles = empleados.filter((e) => e.id !== empleadoSeleccionado.id && e.estado === "ACTIVO");
                        setFormAsigJefe({
                          jefatura_empleado_id: jefesDisponibles[0]?.id || "",
                          fecha_inicio: new Date().toISOString().split("T")[0],
                          fecha_fin: "",
                        });
                        setModalAsignarJefeAbierto(true);
                      }}
                      className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
                    >
                      Asignar Jefatura
                    </button>
                  )}
                </div>
                {empleadoSeleccionado.jefatura_vigente ? (
                  <div className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        {empleadoSeleccionado.jefatura_vigente.nombre_completo}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {empleadoSeleccionado.jefatura_vigente.estado || "ACTIVA"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">
                      Cédula: {empleadoSeleccionado.jefatura_vigente.cedula} &bull; Desde: {empleadoSeleccionado.jefatura_vigente.fecha_inicio}
                      {empleadoSeleccionado.jefatura_vigente.fecha_fin ? ` Hasta: ${empleadoSeleccionado.jefatura_vigente.fecha_fin}` : ""}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 italic">Sin jefatura asignada</div>
                )}
              </div>
            </div>

            {/* Sección: Acceso al Sistema (Fase 3.2D) */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-purple-600" /> Acceso al Sistema
                </span>
                {puedeAdminUsuarios && onNavegarAUsuarios && (
                  <button
                    type="button"
                    id="btn-ir-usuarios-expediente"
                    onClick={() => {
                      const empId = empleadoSeleccionado.id;
                      setEmpleadoSeleccionado(null);
                      onNavegarAUsuarios(empId);
                    }}
                    className="text-xs text-purple-700 hover:text-purple-900 font-semibold flex items-center gap-1 hover:underline"
                  >
                    {empleadoSeleccionado.usuario ? "Administrar Acceso →" : "Crear Acceso →"}
                  </button>
                )}
              </div>
              {empleadoSeleccionado.usuario ? (
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 font-mono">
                      {empleadoSeleccionado.usuario.identificador}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                      {empleadoSeleccionado.usuario.rol}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        empleadoSeleccionado.usuario.estado === "ACTIVO"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {empleadoSeleccionado.usuario.estado}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Cuenta personal para autenticación y autoservicio.
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 italic">Sin acceso al sistema</span>
                  {puedeAdminUsuarios && onNavegarAUsuarios && (
                    <span className="text-slate-500">
                      Haga clic en &quot;Crear Acceso&quot; para registrar credenciales y permisos.
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Historiales de Horarios y Jefaturas */}
            <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <History className="w-3.5 h-3.5" /> Historial de Asignaciones de Horario
                </h4>
                {empleadoSeleccionado.historial_horarios.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Sin historial de horarios previo.</p>
                ) : (
                  <div className="space-y-1.5">
                    {empleadoSeleccionado.historial_horarios.map((h) => (
                      <div
                        key={h.id}
                        className="text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{h.codigo}</span> - {h.nombre}
                        </div>
                        <div className="font-mono text-slate-500">
                          {h.fecha_inicio} &rarr; {h.fecha_fin || "Presente (Vigente)"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <History className="w-3.5 h-3.5" /> Historial de Relaciones de Jefatura
                </h4>
                {empleadoSeleccionado.historial_jefaturas.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Sin historial de jefaturas previo.</p>
                ) : (
                  <div className="space-y-1.5">
                    {empleadoSeleccionado.historial_jefaturas.map((j) => (
                      <div
                        key={j.id}
                        className="text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{j.nombre_jefatura}</span> (Cédula: {j.cedula_jefatura})
                        </div>
                        <div className="font-mono text-slate-500">
                          {j.fecha_inicio} &rarr; {j.fecha_fin || "Presente (Vigente)"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
              {puedeAdminEmpleados && (
                <button
                  type="button"
                  onClick={() => abrirModalEditarEmpleado(empleadoSeleccionado)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Edit className="w-4 h-4" />
                  Editar Colaborador
                </button>
              )}
              <button
                type="button"
                onClick={() => setEmpleadoSeleccionado(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
              >
                Cerrar Expediente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL EDICIÓN DE COLABORADOR (Fase 3.2C.2) */}
      {/* ======================================================== */}
      {modalEditarEmpleadoAbierto && empleadoEditando && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl relative border border-slate-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setModalEditarEmpleadoAbierto(false);
                setEmpleadoEditando(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar Colaborador: {empleadoEditando.nombre_completo}
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Actualice los datos personales y adscripción organizacional. Por seguridad e integridad histórica, la cédula y los identificadores primarios no son modificables.
            </p>

            <form onSubmit={handleGuardarEdicionEmpleado} className="space-y-4">
              {/* Cédula de solo lectura */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Cédula / Identificación (Inmutable)
                </label>
                <input
                  type="text"
                  disabled
                  value={empleadoEditando.cedula}
                  className="w-full px-3 py-2 text-sm border border-slate-200 bg-slate-100 text-slate-500 rounded-lg cursor-not-allowed font-mono"
                />
              </div>

              {/* Nombre Completo */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formEditarEmpleado.nombre_completo}
                  onChange={(e) =>
                    setFormEditarEmpleado({ ...formEditarEmpleado, nombre_completo: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
              </div>

              {/* Correo Laboral y Teléfono */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Correo Laboral
                  </label>
                  <input
                    type="email"
                    value={formEditarEmpleado.correo_laboral}
                    onChange={(e) =>
                      setFormEditarEmpleado({ ...formEditarEmpleado, correo_laboral: e.target.value })
                    }
                    placeholder="ejemplo@rimac.cr"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={formEditarEmpleado.telefono}
                    onChange={(e) =>
                      setFormEditarEmpleado({ ...formEditarEmpleado, telefono: e.target.value })
                    }
                    placeholder="8888-0000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                  />
                </div>
              </div>

              {/* Departamento y Puesto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Departamento *
                  </label>
                  <select
                    required
                    value={formEditarEmpleado.departamento_id}
                    onChange={(e) => {
                      const deptoId = e.target.value;
                      setFormEditarEmpleado({
                        ...formEditarEmpleado,
                        departamento_id: deptoId,
                        puesto_id: "",
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                  >
                    <option value="">Seleccione Departamento</option>
                    {departamentos.filter((d) => d.activo).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre} ({d.codigo})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Puesto *
                  </label>
                  <select
                    required
                    disabled={!formEditarEmpleado.departamento_id}
                    value={formEditarEmpleado.puesto_id}
                    onChange={(e) =>
                      setFormEditarEmpleado({ ...formEditarEmpleado, puesto_id: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">Seleccione Puesto</option>
                    {puestosDelDeptoEditando.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({p.codigo})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Jefatura Directa (Fase 3.2D.1) */}
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-emerald-600" />
                    Jefatura Directa (Línea de Mando ABAC)
                  </label>
                  {!puedeAdminJefaturas && (
                    <span className="text-[11px] text-slate-400 italic">
                      Requiere permiso JEFATURAS_ADMINISTRAR para modificar
                    </span>
                  )}
                </div>

                {puedeAdminJefaturas ? (
                  <div className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-600">
                          Colaborador que ejercerá la Jefatura
                        </span>
                        {empleadoEditando.jefatura_vigente && !formEditarEmpleado.finalizar_jefatura_actual && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormEditarEmpleado({
                                ...formEditarEmpleado,
                                finalizar_jefatura_actual: true,
                                jefatura_empleado_id: "",
                              })
                            }
                            className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold hover:underline"
                          >
                            Finalizar asignación actual
                          </button>
                        )}
                        {formEditarEmpleado.finalizar_jefatura_actual && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormEditarEmpleado({
                                ...formEditarEmpleado,
                                finalizar_jefatura_actual: false,
                                jefatura_empleado_id: empleadoEditando.jefatura_vigente?.jefatura_empleado_id || "",
                              })
                            }
                            className="text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold hover:underline"
                          >
                            Restaurar selección
                          </button>
                        )}
                      </div>

                      {formEditarEmpleado.finalizar_jefatura_actual ? (
                        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                          <span className="font-semibold">Acción seleccionada:</span> Se cerrará la asignación de jefatura vigente y el colaborador quedará <em>sin jefatura asignada</em>. Se preservará todo el historial en PostgreSQL.
                        </div>
                      ) : (
                        <select
                          id="select-editar-empleado-jefatura"
                          value={formEditarEmpleado.jefatura_empleado_id}
                          onChange={(e) =>
                            setFormEditarEmpleado({
                              ...formEditarEmpleado,
                              jefatura_empleado_id: e.target.value,
                              finalizar_jefatura_actual: false,
                            })
                          }
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none bg-white"
                        >
                          <option value="">Sin jefatura asignada</option>
                          {empleados
                            .filter((e) => e.id !== empleadoEditando.id && e.estado === "ACTIVO")
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.nombre_completo} ({e.cedula}) - {e.departamento_nombre || "Sin Depto"}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Fecha Efectiva del Cambio *
                      </label>
                      <input
                        type="date"
                        required
                        id="input-fecha-efectiva-jefatura"
                        value={formEditarEmpleado.fecha_efectiva_jefatura}
                        onChange={(e) =>
                          setFormEditarEmpleado({
                            ...formEditarEmpleado,
                            fecha_efectiva_jefatura: e.target.value,
                          })
                        }
                        className="w-full sm:w-1/2 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none bg-white"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        La asignación anterior se cerrará sin solapamientos conservando el historial y el alcance ABAC.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-100 text-xs text-slate-600">
                    {empleadoEditando.jefatura_vigente ? (
                      <div>
                        Jefatura asignada:{" "}
                        <span className="font-semibold text-slate-800">
                          {empleadoEditando.jefatura_vigente.nombre_completo}
                        </span>{" "}
                        ({empleadoEditando.jefatura_vigente.cedula}) desde{" "}
                        <span className="font-mono">{empleadoEditando.jefatura_vigente.fecha_inicio}</span>
                      </div>
                    ) : (
                      <span className="italic text-slate-500">Sin jefatura asignada</span>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalEditarEmpleadoAbierto(false);
                    setEmpleadoEditando(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-guardar-edicion-empleado"
                  className="px-5 py-2 bg-[#009944] text-white text-sm font-medium rounded-lg hover:bg-[#008038] transition-colors shadow-xs"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL ALTA DE COLABORADOR (Flujo de 4 Secciones) */}
      {/* ======================================================== */}
      {modalAltaColabAbierto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl relative border border-slate-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setModalAltaColabAbierto(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Users className="w-6 h-6 text-[#009944]" />
              Alta de Nuevo Colaborador
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Complete los datos personales, adscripción organizacional, horario y jefatura. La cuenta de acceso al sistema se configurará posteriormente en el módulo de usuarios.
            </p>

            <form onSubmit={handleAltaColaborador} className="space-y-6">
              {/* Sección 1: Datos Personales */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  1. Datos Personales
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Cédula / Identificación *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. DEMO-1009 o 115000888"
                      value={formAlta.cedula}
                      onChange={(e) => setFormAlta({ ...formAlta, cedula: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Juan Pérez Soto"
                      value={formAlta.nombre_completo}
                      onChange={(e) => setFormAlta({ ...formAlta, nombre_completo: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Correo Laboral
                    </label>
                    <input
                      type="email"
                      placeholder="jperez@rimac.cr"
                      value={formAlta.correo_laboral}
                      onChange={(e) => setFormAlta({ ...formAlta, correo_laboral: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="text"
                      placeholder="8888-0000"
                      value={formAlta.telefono}
                      onChange={(e) => setFormAlta({ ...formAlta, telefono: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Organización */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  2. Organización (Departamento y Puesto)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Departamento *
                    </label>
                    <select
                      required
                      value={formAlta.departamento_id}
                      onChange={(e) => {
                        const deptoId = e.target.value;
                        setFormAlta({
                          ...formAlta,
                          departamento_id: deptoId,
                          puesto_id: "",
                        });
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    >
                      <option value="">Seleccione Departamento</option>
                      {departamentos.filter((d) => d.activo).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nombre} ({d.codigo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Puesto *
                    </label>
                    <select
                      required
                      disabled={!formAlta.departamento_id}
                      value={formAlta.puesto_id}
                      onChange={(e) => setFormAlta({ ...formAlta, puesto_id: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">Seleccione Puesto</option>
                      {puestosDelDeptoSeleccionado.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} ({p.codigo})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sección 3: Horario Laboral */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  3. Asignación de Horario
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Horario Asignado
                    </label>
                    <select
                      value={formAlta.horario_id}
                      onChange={(e) => setFormAlta({ ...formAlta, horario_id: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    >
                      <option value="">Sin horario inicial</option>
                      {horarios.filter((h) => h.estado === "ACTIVO").map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.codigo} - {h.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Fecha Inicio de Vigencia
                    </label>
                    <input
                      type="date"
                      value={formAlta.fecha_inicio_horario}
                      onChange={(e) => setFormAlta({ ...formAlta, fecha_inicio_horario: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 4: Jefatura Directa */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  4. Relación de Jefatura Directa (ABAC)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Superior Jerárquico Directo
                    </label>
                    <select
                      value={formAlta.jefatura_empleado_id}
                      onChange={(e) => setFormAlta({ ...formAlta, jefatura_empleado_id: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    >
                      <option value="">Sin jefatura directa inicial</option>
                      {empleados.filter((e) => e.estado === "ACTIVO").map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre_completo} ({e.cedula}) - {e.puesto_nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Fecha Inicio de Jefatura
                    </label>
                    <input
                      type="date"
                      value={formAlta.fecha_inicio_jefatura}
                      onChange={(e) => setFormAlta({ ...formAlta, fecha_inicio_jefatura: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalAltaColabAbierto(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-guardar-alta"
                  className="px-5 py-2 bg-[#009944] text-white text-sm font-medium rounded-lg hover:bg-[#008038] transition-colors shadow-xs"
                >
                  Guardar Colaborador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL ASIGNAR HORARIO A EMPLEADO */}
      {/* ======================================================== */}
      {modalAsignarHorarioAbierto && empleadoSeleccionado && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => setModalAsignarHorarioAbierto(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Asignar Horario a Colaborador
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Colaborador: <span className="font-semibold text-slate-700">{empleadoSeleccionado.nombre_completo}</span>
            </p>

            <form onSubmit={handleAsignarHorario} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Horario *
                </label>
                <select
                  required
                  value={formAsigHorario.horario_id}
                  onChange={(e) => setFormAsigHorario({ ...formAsigHorario, horario_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                >
                  <option value="">Seleccione Horario</option>
                  {horarios.filter((h) => h.estado === "ACTIVO").map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.codigo} - {h.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fecha Inicio de Vigencia *
                </label>
                <input
                  type="date"
                  required
                  value={formAsigHorario.fecha_inicio}
                  onChange={(e) => setFormAsigHorario({ ...formAsigHorario, fecha_inicio: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  La asignación previa abierta se cerrará automáticamente el día anterior.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fecha Fin (Opcional)
                </label>
                <input
                  type="date"
                  value={formAsigHorario.fecha_fin}
                  onChange={(e) => setFormAsigHorario({ ...formAsigHorario, fecha_fin: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalAsignarHorarioAbierto(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Guardar Asignación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL ASIGNAR JEFATURA A EMPLEADO */}
      {/* ======================================================== */}
      {modalAsignarJefeAbierto && empleadoSeleccionado && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => setModalAsignarJefeAbierto(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-emerald-600" />
              Asignar Jefatura Directa (ABAC)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Subordinado: <span className="font-semibold text-slate-700">{empleadoSeleccionado.nombre_completo}</span>
            </p>

            <form onSubmit={handleAsignarJefe} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Superior Jerárquico *
                </label>
                <select
                  required
                  value={formAsigJefe.jefatura_empleado_id}
                  onChange={(e) => setFormAsigJefe({ ...formAsigJefe, jefatura_empleado_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                >
                  <option value="">Seleccione Jefatura</option>
                  {empleados
                    .filter((e) => e.id !== empleadoSeleccionado.id && e.estado === "ACTIVO")
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre_completo} ({e.cedula}) - {e.puesto_nombre}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fecha Inicio de Relación *
                </label>
                <input
                  type="date"
                  required
                  value={formAsigJefe.fecha_inicio}
                  onChange={(e) => setFormAsigJefe({ ...formAsigJefe, fecha_inicio: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Se verificará automáticamente la ausencia de relaciones circulares (A→B→A).
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalAsignarJefeAbierto(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#009944] text-white text-sm font-medium rounded-lg hover:bg-[#008038] transition-colors"
                >
                  Guardar Jefatura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL CREAR / EDITAR DEPARTAMENTO */}
      {/* ======================================================== */}
      {modalDeptoAbierto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => setModalDeptoAbierto(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#009944]" />
              {deptoEditando ? "Editar Departamento" : "Nuevo Departamento"}
            </h3>

            <form onSubmit={handleGuardarDepto} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Código *
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(deptoEditando)}
                  placeholder="Ej. DTH o FIN"
                  value={formDepto.codigo}
                  onChange={(e) => setFormDepto({ ...formDepto, codigo: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre del Departamento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Talento Humano"
                  value={formDepto.nombre}
                  onChange={(e) => setFormDepto({ ...formDepto, nombre: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalDeptoAbierto(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#009944] text-white text-sm font-medium rounded-lg hover:bg-[#008038] transition-colors"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL CREAR / EDITAR PUESTO */}
      {/* ======================================================== */}
      {modalPuestoAbierto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => setModalPuestoAbierto(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-[#009944]" />
              {puestoEditando ? "Editar Puesto" : "Nuevo Puesto"}
            </h3>

            <form onSubmit={handleGuardarPuesto} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Departamento Perteneciente *
                </label>
                <select
                  required
                  value={formPuesto.departamento_id}
                  onChange={(e) => setFormPuesto({ ...formPuesto, departamento_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                >
                  <option value="">Seleccione Departamento</option>
                  {departamentos.filter((d) => d.activo).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre} ({d.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Código de Puesto *
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(puestoEditando)}
                  placeholder="Ej. PST-DTH-01"
                  value={formPuesto.codigo}
                  onChange={(e) => setFormPuesto({ ...formPuesto, codigo: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre del Puesto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Analista de Recursos Humanos"
                  value={formPuesto.nombre}
                  onChange={(e) => setFormPuesto({ ...formPuesto, nombre: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalPuestoAbierto(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#009944] text-white text-sm font-medium rounded-lg hover:bg-[#008038] transition-colors"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DETALLE SEMANAL DE HORARIO */}
      {/* ======================================================== */}
      {modalHorarioDetalle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => setModalHorarioDetalle(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Detalle Semanal del Horario: {modalHorarioDetalle.codigo}
            </h3>
            <p className="text-xs text-slate-500 mb-4">{modalHorarioDetalle.nombre}</p>

            <div className="space-y-2">
              {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((diaNombre, idx) => {
                const diaNum = idx + 1;
                const d = modalHorarioDetalle.detalles_dia.find((det) => det.dia_semana === diaNum);
                return (
                  <div
                    key={diaNum}
                    className={`p-2.5 rounded-lg border text-xs flex justify-between items-center ${
                      d?.es_laborable
                        ? "bg-emerald-50/50 border-emerald-200"
                        : "bg-slate-50 border-slate-200 text-slate-400"
                    }`}
                  >
                    <span className="font-semibold text-slate-700">{diaNombre}</span>
                    {d?.es_laborable ? (
                      <span className="font-mono text-emerald-800 font-medium">
                        {d.hora_entrada} &rarr; {d.hora_salida} ({d.minutos_esperados} min)
                      </span>
                    ) : (
                      <span className="italic text-slate-400">Descanso semanal</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setModalHorarioDetalle(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL CREAR / EDITAR HORARIO CON DETALLE SEMANAL */}
      {/* ======================================================== */}
      {modalHorarioFormAbierto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl relative border border-slate-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setModalHorarioFormAbierto(false);
                setHorarioEditando(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Clock className="w-6 h-6 text-[#009944]" />
              {horarioEditando ? "Editar Horario Laboral" : "Crear Nuevo Horario Laboral"}
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Configure el código, tolerancias de entrada, tiempos máximos de descanso y la matriz semanal de los 7 días.
            </p>

            <form onSubmit={handleGuardarHorario} className="space-y-6">
              {/* Datos Generales */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  1. Configuración General y Tolerancias
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Código del Horario *
                    </label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(horarioEditando)}
                      placeholder="Ej. HOR-ADM-01"
                      value={formHorario.codigo}
                      onChange={(e) => setFormHorario({ ...formHorario, codigo: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nombre Descriptivo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Horario Oficina Lunes a Viernes"
                      value={formHorario.nombre}
                      onChange={(e) => setFormHorario({ ...formHorario, nombre: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tolerancia Entrada (minutos)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={formHorario.tolerancia_entrada_minutos}
                      onChange={(e) =>
                        setFormHorario({ ...formHorario, tolerancia_entrada_minutos: parseInt(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Minutos Semanales Referencia
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formHorario.minutos_semanales_referencia}
                      onChange={(e) =>
                        setFormHorario({
                          ...formHorario,
                          minutos_semanales_referencia: parseInt(e.target.value) || 2400,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Max Desayuno (min)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formHorario.minutos_desayuno_max}
                      onChange={(e) =>
                        setFormHorario({ ...formHorario, minutos_desayuno_max: parseInt(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Max Almuerzo (min)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formHorario.minutos_almuerzo_max}
                      onChange={(e) =>
                        setFormHorario({ ...formHorario, minutos_almuerzo_max: parseInt(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Max Café (min)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formHorario.minutos_cafe_max}
                      onChange={(e) =>
                        setFormHorario({ ...formHorario, minutos_cafe_max: parseInt(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Matriz Semanal de Días */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  2. Detalle Semanal de Días (Lunes a Domingo)
                </h4>
                <div className="space-y-2">
                  {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((diaNom, idx) => {
                    const diaNum = idx + 1;
                    const d = formHorario.detalles_dia.find((x) => x.dia_semana === diaNum) || {
                      dia_semana: diaNum,
                      es_laborable: false,
                      hora_entrada: "",
                      hora_salida: "",
                      cruza_medianoche: false,
                      minutos_esperados: 0,
                    };

                    return (
                      <div
                        key={diaNum}
                        data-testid={`dia-row-${diaNum}`}
                        className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs transition-colors ${
                          d.es_laborable
                            ? "bg-white border-slate-300 shadow-2xs"
                            : "bg-slate-100/70 border-slate-200 text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-3 w-32 select-none">
                          <input
                            type="checkbox"
                            id={`check-lab-${diaNum}`}
                            data-testid={`check-lab-${diaNum}`}
                            checked={Boolean(d.es_laborable)}
                            onChange={(e) => handleToggleDiaLaborable(diaNum, e.target.checked)}
                            className="w-4 h-4 rounded text-[#009944] focus:ring-[#009944] cursor-pointer"
                          />
                          <label
                            htmlFor={`check-lab-${diaNum}`}
                            className={`font-semibold cursor-pointer ${
                              d.es_laborable ? "text-slate-800" : "text-slate-500"
                            }`}
                          >
                            {diaNom}
                          </label>
                        </div>

                        {d.es_laborable ? (
                          <div className="flex flex-wrap items-center gap-2 flex-1">
                            <div>
                              <span className="text-[11px] text-slate-500 mr-1">Entrada:</span>
                              <input
                                type="time"
                                required={d.es_laborable}
                                data-testid={`input-entrada-${diaNum}`}
                                value={d.hora_entrada || "08:00"}
                                onChange={(e) => handleActualizarCampoDia(diaNum, "hora_entrada", e.target.value)}
                                className="px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-[#009944] bg-white text-slate-800"
                              />
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500 mr-1">Salida:</span>
                              <input
                                type="time"
                                required={d.es_laborable}
                                data-testid={`input-salida-${diaNum}`}
                                value={d.hora_salida || "17:00"}
                                onChange={(e) => handleActualizarCampoDia(diaNum, "hora_salida", e.target.value)}
                                className="px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-[#009944] bg-white text-slate-800"
                              />
                            </div>
                            <div>
                              <span className="text-[11px] text-slate-500 mr-1">Minutos:</span>
                              <input
                                type="number"
                                min={0}
                                data-testid={`input-minutos-${diaNum}`}
                                value={d.minutos_esperados}
                                onChange={(e) =>
                                  handleActualizarCampoDia(diaNum, "minutos_esperados", parseInt(e.target.value) || 0)
                                }
                                className="w-16 px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-[#009944] bg-white text-slate-800"
                              />
                            </div>
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 ml-auto cursor-pointer select-none">
                              <input
                                type="checkbox"
                                data-testid={`check-cruza-noche-${diaNum}`}
                                checked={Boolean(d.cruza_medianoche)}
                                onChange={(e) => handleActualizarCampoDia(diaNum, "cruza_medianoche", e.target.checked)}
                                className="w-3.5 h-3.5 rounded text-[#009944] focus:ring-[#009944] cursor-pointer"
                              />
                              Cruza noche
                            </label>
                          </div>
                        ) : (
                          <div className="italic text-slate-400 text-xs flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-slate-300"></span>
                            Día no laborable (Descanso)
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalHorarioFormAbierto(false);
                    setHorarioEditando(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-guardar-horario"
                  className="px-5 py-2 bg-[#009944] text-white text-sm font-medium rounded-lg hover:bg-[#008038] transition-colors shadow-xs"
                >
                  {horarioEditando ? "Guardar Cambios" : "Crear Horario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL NUEVA ASIGNACIÓN DE JEFATURA (Desde pestaña Jefaturas) */}
      {/* ======================================================== */}
      {modalNuevaJefaturaAbierto && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => setModalNuevaJefaturaAbierto(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-[#009944]" />
              Nueva Asignación de Jefatura Directa
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Seleccione el colaborador subordinado y su superior jerárquico. La relación otorga alcance ABAC de aprobación inmediato.
            </p>

            <form onSubmit={handleCrearJefatura} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Colaborador Subordinado *
                </label>
                <select
                  required
                  value={formNuevaJefatura.subordinado_empleado_id}
                  onChange={(e) =>
                    setFormNuevaJefatura({ ...formNuevaJefatura, subordinado_empleado_id: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                >
                  <option value="">Seleccione Colaborador</option>
                  {empleados.filter((e) => e.estado === "ACTIVO").map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre_completo} ({e.cedula})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Superior Jerárquico Directo (Jefatura) *
                </label>
                <select
                  required
                  value={formNuevaJefatura.jefatura_empleado_id}
                  onChange={(e) =>
                    setFormNuevaJefatura({ ...formNuevaJefatura, jefatura_empleado_id: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                >
                  <option value="">Seleccione Jefatura Directa</option>
                  {empleados
                    .filter((e) => e.estado === "ACTIVO" && e.id !== formNuevaJefatura.subordinado_empleado_id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre_completo} ({e.cedula}) - {e.puesto_nombre || "Puesto"}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fecha Inicio de Vigencia *
                </label>
                <input
                  type="date"
                  required
                  value={formNuevaJefatura.fecha_inicio}
                  onChange={(e) =>
                    setFormNuevaJefatura({ ...formNuevaJefatura, fecha_inicio: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fecha Fin de Vigencia (Opcional)
                </label>
                <input
                  type="date"
                  value={formNuevaJefatura.fecha_fin}
                  onChange={(e) =>
                    setFormNuevaJefatura({ ...formNuevaJefatura, fecha_fin: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944] focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalNuevaJefaturaAbierto(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-guardar-jefatura"
                  className="px-5 py-2 bg-[#009944] text-white text-sm font-medium rounded-lg hover:bg-[#008038] transition-colors shadow-xs"
                >
                  Asignar Jefatura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE CONFIRMACIÓN EXPLÍCITA (Eliminación / Finalización) */}
      {/* ======================================================== */}
      {modalConfirmacion && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative border border-slate-200">
            <button
              onClick={() => setModalConfirmacion(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  modalConfirmacion.tipo.startsWith("eliminar")
                    ? "bg-rose-100 text-rose-600"
                    : "bg-purple-100 text-purple-600"
                }`}
              >
                {modalConfirmacion.tipo.startsWith("eliminar") ? (
                  <Trash2 className="w-5 h-5" />
                ) : (
                  <GitBranch className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {modalConfirmacion.tipo === "finalizar_jefatura"
                    ? "Finalizar Asignación de Jefatura"
                    : "¿Desea eliminar permanentemente este registro?"}
                </h3>
                <p className="text-xs text-slate-500 font-medium">{modalConfirmacion.nombre}</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2 mb-4">
              {modalConfirmacion.tipo === "eliminar_depto" && (
                <p>
                  Esta operación intentará eliminar físicamente el departamento. Si posee puestos o empleados vinculados, el sistema rechazará la acción y le solicitará <strong>desactivarlo</strong> para conservar el historial.
                </p>
              )}
              {modalConfirmacion.tipo === "eliminar_puesto" && (
                <p>
                  Esta operación intentará eliminar físicamente el puesto. Si existen colaboradores asociados, el sistema rechazará la eliminación y requerirá <strong>desactivarlo</strong>.
                </p>
              )}
              {modalConfirmacion.tipo === "eliminar_horario" && (
                <p>
                  Esta operación intentará eliminar el horario. Si alguna vez fue asignado o utilizado en jornadas pasadas, el sistema rechazará la acción y requerirá <strong>desactivarlo</strong> para proteger la integridad operativa.
                </p>
              )}
              {modalConfirmacion.tipo === "eliminar_jefatura" && (
                <p>
                  La eliminación física de una jefatura solo está permitida si fue creada por error y no posee decisiones operativas vinculadas ni relevancia histórica. De lo contrario, debe utilizar <strong>Finalizar asignación</strong>.
                </p>
              )}
              {modalConfirmacion.tipo === "finalizar_jefatura" && (
                <div>
                  <p className="mb-2">
                    Establezca la fecha fin para cerrar la vigencia de la jefatura. El historial permanecerá intacto y el alcance ABAC se actualizará de inmediato.
                  </p>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha Fin de Vigencia:
                  </label>
                  <input
                    type="date"
                    required
                    value={modalConfirmacion.fecha_fin || new Date().toISOString().split("T")[0]}
                    onChange={(e) =>
                      setModalConfirmacion({ ...modalConfirmacion, fecha_fin: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#009944]"
                  />
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalConfirmacion(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirmar-modal"
                onClick={handleEjecutarConfirmacion}
                className={`px-4 py-2 text-white text-xs font-medium rounded-lg transition-colors shadow-xs ${
                  modalConfirmacion.tipo.startsWith("eliminar")
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-purple-600 hover:bg-purple-700"
                }`}
              >
                {modalConfirmacion.tipo === "finalizar_jefatura"
                  ? "Confirmar Finalización"
                  : "Confirmar Eliminación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
