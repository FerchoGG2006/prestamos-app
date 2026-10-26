/**
 * PALETA DE COLORES Y TOKENS DE DISEÑO UNIFICADOS — KREDIA (MÓVIL & ESCRITORIO)
 * Identidad visual unificada:
 * - Azul tinta: #12263F (Acción principal, encabezados ejecutivos, navegación inferior)
 * - Fondo cálido: #F6F4EE (Fondo general descansado y legible en exteriores)
 * - Ocre de acento: #C9892B (Acento de marca, indicadores activos, resaltados de ruta)
 * - Blanco puro: #FFFFFF (Superficies de tarjetas, hojas modales y tablas)
 * - Estados operativos reservados: Verde (#15803D), Rojo (#DC2626), Ámbar (#D97706)
 *   (Nunca usar el color como único indicador de estado; acompañar siempre de símbolo + etiqueta).
 */

export const COLORS = {
  // 1. SUPERFICIES Y FONDOS CÁLIDOS
  bgPrimary: '#F6F4EE',       // Fondo cálido principal
  bgSecondary: '#FFFFFF',     // Blanco puro para superficies, tarjetas y modales
  bgTertiary: '#E6E2D8',      // Separadores cálidos y pistas de progreso
  bgElevated: '#EFECE4',      // Superficie cálida para inputs rellenos
  bgLight: '#F6F4EE',
  surfaceCard: '#FFFFFF',     // Superficie de tarjetas
  surfaceSoft: '#F2EFE7',     // Bloques secundarios cálidos
  surfaceLavender: '#FDF6EA', // Superficie suave de acento ocre
  receiptPaper: '#FFFFFF',

  // 2. TIPOGRAFÍA Y JERARQUÍA (Alto contraste para lectura a plena luz del día)
  textPrimary: '#12263F',     // Azul tinta profundo para títulos y montos
  textSecondary: '#475569',   // Subtítulos y metadatos principales
  textMuted: '#64748B',       // Etiquetas auxiliares
  textOnPrimary: '#FFFFFF',   // Texto blanco sobre azul tinta

  // 3. IDENTIDAD DE MARCA: AZUL TINTA (#12263F) & OCRE DE ACENTO (#C9892B)
  primary: '#12263F',         // Azul tinta principal
  primaryHover: '#1B365D',
  primaryLight: '#EDF2F7',    // Fondo azul tinta suave
  primaryBorder: '#CBD5E1',

  navy: '#12263F',            // Azul tinta token
  ochre: '#C9892B',           // Ocre de acento token
  ochreDark: '#9A6318',       // Ocre oscuro para contraste de texto
  ochreBorder: '#F3D5A3',     // Borde suave de ocre

  accent: '#C9892B',          // Ocre de acento
  accentHover: '#B0741E',
  accentLight: '#FDF6EA',     // Fondo ocre cálido suave
  accentBorder: '#F3D5A3',

  heroGradientStart: '#12263F',
  heroGradientEnd: '#1B365D',
  heroSubCardBg: 'rgba(255, 255, 255, 0.08)',
  heroTrackBg: 'rgba(255, 255, 255, 0.18)',
  heroBarFill: '#C9892B',

  // 4. NAVEGACIÓN INFERIOR (Azul Tinta + Ocre de Acento)
  dockBg: '#12263F',
  dockBorder: 'rgba(255, 255, 255, 0.10)',
  dockInactive: '#94A3B8',
  dockActive: '#E5A93C',
  fabBg: '#C9892B',
  fabRing: '#FFFFFF',

  // 5. ESTADOS OPERATIVOS RESERVADOS (Verde, Rojo y Ámbar)
  success: '#15803D',
  successBright: '#16A34A',
  successLight: '#ECFDF5',
  successBorder: '#A7F3D0',

  warning: '#D97706',
  warningLight: '#FFFBEB',
  warningBorder: '#FDE68A',

  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  dangerBorder: '#FECACA',

  // Acentos informativos y compatibilidad redirigidos a Azul Tinta / Ocre
  info: '#12263F',
  infoBright: '#1B365D',
  infoLight: '#EDF2F7',
  infoBorder: '#CBD5E1',

  purple: '#C9892B',
  purpleBright: '#B0741E',
  purpleLight: '#FDF6EA',
  purpleBorder: '#F3D5A3',

  // 6. BORDES Y SOMBRAS
  microBorder: 'rgba(18, 38, 63, 0.08)',
  inputBorder: '#D6D1C4',
  border: '#E6E2D8',
  borderStrong: '#CFC9B8',
  overlayBackdrop: 'rgba(18, 38, 63, 0.48)',
};

export { TYPOGRAPHY, FONT_FAMILY, FONT_FAMILY_MONO } from './typography';
