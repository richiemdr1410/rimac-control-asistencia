import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiRequest, setCsrfToken, renovarCsrfToken, setSessionId, onAuthLost } from "../services/api";

export type RolUsuario =
  | "EMPLEADO"
  | "TALENTO_HUMANO"
  | "SEGURIDAD"
  | "SUPERVISOR_SEGURIDAD"
  | "ADMINISTRADOR";

export interface UsuarioAutenticado {
  id: string;
  identificador: string;
  nombre_completo: string;
  email: string;
  rol: RolUsuario;
  empleado_id?: string;
  departamento_id?: string;
  puesto_id?: string;
  permisos?: string[];
  tiene_subordinados?: boolean;
}

interface AuthContextValue {
  usuario: UsuarioAutenticado | null;
  isLoading: boolean;
  login: (identificador: string, contrasena: string) => Promise<UsuarioAutenticado>;
  logout: () => Promise<void>;
  recargarSesion: () => Promise<void>;
  tienePermiso: (codigo: string) => boolean;
  tieneSubordinados: boolean;
  puedeAccederGarita: boolean;
  puedeAccederAutoservicio: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Escuchar pérdidas de sesión emitidas por 401 en el cliente HTTP
  useEffect(() => {
    const unsubscribe = onAuthLost(() => {
      setUsuario(null);
      setCsrfToken(null);
      setSessionId(null);
    });
    return unsubscribe;
  }, []);

  // Inicialización de sesión al montar / recargar
  const inicializarSesion = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Validar sesión existente con GET /api/auth/me
      const meRes = await apiRequest<{ exito: boolean; datos: { usuario: UsuarioAutenticado; sesion_id?: string } }>("/api/auth/me");
      if (meRes.exito && meRes.datos?.usuario) {
        setUsuario(meRes.datos.usuario);
        if (meRes.datos.sesion_id) {
          setSessionId(meRes.datos.sesion_id);
        }
        // 2. Obtener y renovar token CSRF en memoria
        await renovarCsrfToken();
      } else {
        setUsuario(null);
        setCsrfToken(null);
        setSessionId(null);
      }
    } catch {
      // Sin sesión activa o cookie caducada
      setUsuario(null);
      setCsrfToken(null);
      setSessionId(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    inicializarSesion();
  }, [inicializarSesion]);

  const login = async (identificador: string, contrasena: string): Promise<UsuarioAutenticado> => {
    // 1. Iniciar sesión mediante POST /api/auth/login
    const loginRes = await apiRequest<{
      exito: boolean;
      datos: {
        usuario: UsuarioAutenticado;
        sesion_id?: string;
        token_csrf: string;
      };
    }>("/api/auth/login", {
      method: "POST",
      body: { identificador, contrasena },
    });

    if (!loginRes || !loginRes.datos || !loginRes.datos.usuario) {
      throw new Error("La respuesta de autenticación del servidor no contiene los datos del usuario.");
    }

    const user = loginRes.datos.usuario;
    const csrf = loginRes.datos.token_csrf;
    if (loginRes.datos.sesion_id) {
      setSessionId(loginRes.datos.sesion_id);
    }

    // 2. Guardar token CSRF en memoria y actualizar usuario
    setCsrfToken(csrf);
    setUsuario(user);
    return user;
  };

  const logout = async (): Promise<void> => {
    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
      });
    } catch (e) {
      console.warn("Fallo al cerrar sesión en backend:", e);
    } finally {
      setUsuario(null);
      setCsrfToken(null);
      setSessionId(null);
    }
  };

  const tienePermiso = useCallback(
    (codigo: string): boolean => {
      if (!usuario?.permisos) return false;
      return usuario.permisos.includes(codigo);
    },
    [usuario]
  );

  const tieneSubordinados = Boolean(usuario?.tiene_subordinados);

  // Derivar visibilidad operativa desde permisos y atributos ABAC
  const puedeAccederGarita = Boolean(
    usuario && tienePermiso("GARITA_OPERAR")
  );

  const puedeAccederAutoservicio = Boolean(
    usuario &&
      tienePermiso("AUTOSERVICIO_MARCAJE") &&
      Boolean(usuario.empleado_id)
  );

  return (
    <AuthContext.Provider
      value={{
        usuario,
        isLoading,
        login,
        logout,
        recargarSesion: inicializarSesion,
        tienePermiso,
        tieneSubordinados,
        puedeAccederGarita,
        puedeAccederAutoservicio,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser utilizado dentro de un AuthProvider");
  }
  return context;
}
