/**
 * PALETA DE COLORES Y TOKENS DE DISEÑO — KREDIA LIGHT FINTECH
 * Paleta unificada entre Login, Dashboard, Hoja de Ruta y Configuración:
 * 1. Base Neutra Luminosa: #F3F7FA y Blanco Puro (#FFFFFF) con texto Slate (#0F172A / #475569).
 * 2. Color Primario Kredia (Teal Financiero): #0D9488 para acciones principales, navegación activa y botones primarios.
 * 3. Color Secundario Kredia (Índigo / Esmeralda): #4F46E5 para acentos informativos y #059669 para recaudos exitosos.
 */

export const COLORS = {
  // 1. NEUTRO BASE (Superficies y Fondos)
  bgPrimary: '#F3F7FA',       // Fondo Kredia Light Fintech descansado y moderno
  bgSecondary: '#FFFFFF',     // Blanco puro para tarjetas Bento, listas y Bottom Sheets
  bgTertiary: '#E2E8F0',      // Separadores sutiles y pistas de progreso
  bgElevated: '#F1F5F9',      // Slate 100 para Filled Inputs
  bgLight: '#F3F7FA',
  surfaceSoft: '#F1F5F9',     // Slate suave para bloques secundarios
  surfaceLavender: '#EEF2FF', // Índigo ultra suave para acentos Kredia
  receiptPaper: '#FFFFFF',

  // Tipografía y Jerarquía
  textPrimary: '#0F172A',     // Slate 900 (Montos clave y encabezados)
  textSecondary: '#475569',   // Slate 600 (Subtítulos e indicadores)
  textMuted: '#64748B',       // Slate 500 (Labels y metadatos)
  textOnPrimary: '#FFFFFF',   // Texto blanco sobre botones y dock

  // 2. COLOR PRIMARIO DE MARCA KREDIA (Teal Financiero)
  primary: '#0D9488',         // Teal Kredia principal de acción y navegación
  primaryHover: '#0F766E',
  primaryLight: '#F0FDFA',    // Fondo Teal pastel suave
  primaryBorder: '#99F6E4',
  heroGradientStart: '#0F172A', // Slate 900 sobrio y ejecutivo
  heroGradientEnd: '#1E293B',   // Slate 800 elegante
  heroSubCardBg: 'rgba(255, 255, 255, 0.08)',
  heroTrackBg: 'rgba(255, 255, 255, 0.16)',
  heroBarFill: '#14B8A6',

  // Floating Bottom Dock (Elegante Slate 900 con acento Kredia)
  dockBg: '#0F172A',
  dockBorder: 'rgba(255, 255, 255, 0.08)',
  dockInactive: '#94A3B8',
  dockActive: '#2DD4BF',
  fabBg: '#0D9488',
  fabRing: '#FFFFFF',

  // 3. COLOR SECUNDARIO FINANCIERO (Verde Esmeralda - Recaudo / Éxito)
  success: '#059669',
  successBright: '#10B981',
  successLight: '#ECFDF5',
  successBorder: '#A7F3D0',

  // Acento Ejecutivo Kredia (Índigo Fintech)
  info: '#4F46E5',
  infoBright: '#4338CA',
  infoLight: '#EEF2FF',
  infoBorder: '#C7D2FE',

  // Estados de Alerta Semafórica (Estrictamente funcionales)
  warning: '#D97706',
  warningLight: '#FFFBEB',
  warningBorder: '#FDE68A',

  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  dangerBorder: '#FECACA',

  // Alias de compatibilidad: redirigidos al Índigo Kredia
  purple: '#4F46E5',
  purpleBright: '#4338CA',
  purpleLight: '#EEF2FF',
  purpleBorder: '#C7D2FE',

  // Micro-bordes y Sombras sutiles
  microBorder: 'rgba(15, 23, 42, 0.06)',
  inputBorder: '#CBD5E1',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  overlayBackdrop: 'rgba(15, 23, 42, 0.45)',
};

export { TYPOGRAPHY, FONT_FAMILY, FONT_FAMILY_MONO } from './typography';
