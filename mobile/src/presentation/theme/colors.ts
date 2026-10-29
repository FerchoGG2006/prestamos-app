/**
 * PALETA DE COLORES Y DESIGN TOKENS UNIFICADOS — CUADRA / KREDIA
 * Estética limpia Fintech (Nubank / Revolut Light):
 * - Fondo: #F6F7F9
 * - Superficie: #FFFFFF
 * - Texto Principal: #0F172A (Contraste 14.5:1 contra blanco)
 * - Texto Secundario: #64748B (Contraste 4.6:1 contra blanco - WCAG AA certificado)
 * - Borde tenue: 1px #E8EAEE
 * - Acento de Interacción: Azul Marino #12263F y Azul Fintech #2563EB / #0284C7
 * - Estados Semánticos: Puntos y badges sutiles, nunca fondos completos saturados.
 */

export const COLORS = {
  // 1. SUPERFICIES Y FONDOS NEUTROS
  bgPrimary: '#F6F7F9',       // Fondo de aplicación minimalista
  bgSecondary: '#FFFFFF',     // Superficie blanca pura para tarjetas y modales
  bgTertiary: '#E8EAEE',      // Separadores finos y pistas de progreso sutiles
  bgElevated: '#F1F5F9',      // Fondo sutil para chips o inputs
  bgLight: '#F6F7F9',
  surfaceCard: '#FFFFFF',     // Tarjetas blancas
  surfaceSoft: '#F8FAFC',     // Fondos neutros alternos
  surfaceLavender: '#F0F9FF', // Azul sutil
  receiptPaper: '#FFFFFF',

  // 2. TIPOGRAFÍA Y JERARQUÍA (WCAG AA Cumplido)
  textPrimary: '#0F172A',     // Pizarra oscura profunda para títulos y montos
  textSecondary: '#64748B',   // Gris slate para subtítulos y metadatos
  textMuted: '#94A3B8',       // Gris auxiliar
  textOnPrimary: '#FFFFFF',   // Texto blanco sobre acentos oscuros

  // 3. IDENTIDAD Y ACENTOS FINTECH
  primary: '#12263F',         // Azul marino ejecutivo
  primaryHover: '#1B365D',
  primaryLight: '#EFF6FF',    // Fondo azul tenue
  primaryBorder: '#BFDBFE',
  brandBlue: '#2563EB',       // Azul de interacción
  brandCyan: '#0284C7',

  navy: '#12263F',
  ochre: '#C9892B',
  ochreDark: '#9A6318',
  ochreBorder: '#F3D5A3',

  accent: '#2563EB',
  accentHover: '#1D4ED8',
  accentLight: '#EFF6FF',
  accentBorder: '#BFDBFE',

  heroGradientStart: '#12263F',
  heroGradientEnd: '#1B365D',
  heroSubCardBg: 'rgba(255, 255, 255, 0.08)',
  heroTrackBg: 'rgba(255, 255, 255, 0.18)',
  heroBarFill: '#2563EB',

  // 4. NAVEGACIÓN INFERIOR & BOTONES DE ACCIÓN (Azul Tinta #12263F)
  dockBg: '#12263F',
  dockBorder: '#E8EAEE',
  dockInactive: '#64748B',
  dockActive: '#2563EB',
  fabBg: '#12263F',
  fabRing: '#FFFFFF',

  // 5. ESTADOS SEMÁNTICOS (Puntos, badges e iconos sutiles)
  success: '#16A34A',
  successBright: '#15803D',
  successLight: '#F0FDF4',
  successBorder: '#BBF7D0',

  warning: '#D97706',
  warningLight: '#FFFBEB',
  warningBorder: '#FDE68A',

  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  dangerBorder: '#FECACA',

  info: '#0284C7',
  infoBright: '#0369A1',
  infoLight: '#F0F9FF',
  infoBorder: '#BAE6FD',

  purple: '#7C3AED',
  purpleBright: '#6D28D9',
  purpleLight: '#F5F3FF',
  purpleBorder: '#DDD6FE',

  // 6. BORDES Y SOMBRAS
  microBorder: '#E8EAEE',
  inputBorder: '#CBD5E1',
  border: '#E8EAEE',          // Borde estándar 1px sutil
  borderStrong: '#CBD5E1',
  overlayBackdrop: 'rgba(15, 23, 42, 0.40)',
};

export const RADIUS = {
  card: 16,
  button: 12,
  chip: 12,
  pill: 9999,
  sm: 8,
};

export const SPACING = {
  screenPadding: 20,
  sectionGap: 28,
  itemGap: 16,
  sm: 8,
  xs: 4,
};

export { TYPOGRAPHY, FONT_FAMILY, FONT_FAMILY_MONO } from './typography';
