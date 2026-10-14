import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Genera un hash criptográfico seguro para almacenamiento de contraseñas
 * utilizando el algoritmo estándar scrypt con sal aleatoria de 16 bytes.
 * Formato resultante: salt:hash (en hexadecimal).
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verifica una contraseña contra su hash de forma segura frente a ataques de tiempo (timing-safe).
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;

  const [salt, expectedHash] = parts;
  const actualHashBuffer = scryptSync(password, salt, 64);
  const expectedHashBuffer = Buffer.from(expectedHash, "hex");

  if (actualHashBuffer.length !== expectedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualHashBuffer, expectedHashBuffer);
}

/**
 * Genera un token criptográfico opaco de alta entropía (64 caracteres hexadecimales).
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Valida la política corporativa de contraseñas de RIMAC:
 * - Longitud mínima 8 caracteres, máxima 100 caracteres.
 * - Al menos una mayúscula, una minúscula y un número.
 * - Rechaza contraseñas vacías o de sólo espacios en blanco.
 */
export function validarPoliticaPassword(password: string): { valida: boolean; mensaje?: string } {
  if (!password || typeof password !== "string" || !password.trim()) {
    return { valida: false, mensaje: "La contraseña no puede estar vacía." };
  }
  if (password.length < 8) {
    return { valida: false, mensaje: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password.length > 100) {
    return { valida: false, mensaje: "La contraseña no puede exceder 100 caracteres." };
  }
  const tieneMayus = /[A-Z]/.test(password);
  const tieneMinus = /[a-z]/.test(password);
  const tieneNumero = /[0-9]/.test(password);
  if (!tieneMayus || !tieneMinus || !tieneNumero) {
    return {
      valida: false,
      mensaje: "La contraseña debe contener al menos una mayúscula, una minúscula y un número.",
    };
  }
  return { valida: true };
}
