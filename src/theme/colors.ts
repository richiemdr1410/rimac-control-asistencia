/**
 * Sistema de Diseño y Tokens de Color Corporativos RIMAC
 * Primario: #009944 (Verde RIMAC)
 * Acento: #F15F2A (Naranja RIMAC)
 */

export const RIMAC_COLORS = {
  primary: {
    DEFAULT: "#009944",
    hover: "#008039",
    active: "#00662d",
    light: "#e8f7ed",
    border: "#8ad8a8",
  },
  accent: {
    DEFAULT: "#F15F2A",
    hover: "#d94e1d",
    active: "#bf3f14",
    light: "#fef0eb",
    border: "#f8a887",
  },
  neutral: {
    background: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceMuted: "#F1F5F9",
    border: "#E2E8F0",
    borderDark: "#CBD5E1",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#64748B",
  },
  semantic: {
    success: {
      text: "#15803D",
      bg: "#F0FDF4",
      border: "#BBF7D0",
    },
    error: {
      text: "#B91C1C",
      bg: "#FEF2F2",
      border: "#FECACA",
    },
    warning: {
      text: "#B45309",
      bg: "#FFFBEB",
      border: "#FDE68A",
    },
    info: {
      text: "#0369A1",
      bg: "#F0F9FF",
      border: "#BAE6FD",
    },
  },
} as const;
