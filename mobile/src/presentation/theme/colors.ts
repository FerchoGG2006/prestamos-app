/**
 * PALETA DE COLORES Y TOKENS DE DISEÑO — CLEAN FINTECH MINIMALISTA
 * Paleta disciplinada de 2 a 3 colores principales:
 * 1. Base Neutra: Slate 900/600/500 sobre superficies Blanco (#FFFFFF) y Slate Ultra-Suave (#F8FAFC).
 * 2. Color Primario (Marca): Azul Cobalto Fintech (#2563EB) para acciones, selecciones y acentos.
 * 3. Color Secundario (Operativo): Verde Esmeralda (#059669) para cobros, abonos positivos y caja al día.
 * 
 * Funcional estricto: Rojo (#DC2626) exclusivamente para alertas de mora o cuotas vencidas.
 * Se eliminan por completo los púrpuras, lavandas y colores chillones no coordinados.
 */

export const COLORS = {
  // 1. NEUTRO BASE (Superficies y Fondos)
  bgPrimary: '#F8FAFC',       // Slate 50 ultra limpio y descansado para la vista
  bgSecondary: '#FFFFFF',     // Blanco puro para tarjetas Bento, listas y Bottom Sheets
  bgTertiary: '#E2E8F0',      // Separadores sutiles y pistas de progreso
  bgElevated: '#F1F5F9',      // Slate 100 para Filled Inputs
  bgLight: '#F8FAFC',
  surfaceSoft: '#F1F5F9',     // Slate suave para bloques secundarios
  surfaceLavender: '#F1F5F9', // Redirigido a superficie neutra limpia (sin lavanda)
  receiptPaper: '#FFFFFF',

  // Tipografía y Jerarquía
  textPrimary: '#0F172A',     // Slate 900 (Montos clave y encabezados)
  textSecondary: '#475569',   // Slate 600 (Subtítulos e indicadores)
  textMuted: '#64748B',       // Slate 500 (Labels y metadatos)
  textOnPrimary: '#FFFFFF',   // Texto blanco sobre botones y dock

  // 2. COLOR PRIMARIO DE MARCA (Azul Cobalto Fintech)
  primary: '#2563EB',         // Azul principal de acción y navegación
  primaryHover: '#1D4ED8',
  primaryLight: '#EFF6FF',    // Fondo azul pastel suave
  primaryBorder: '#BFDBFE',
  heroGradientStart: '#0F172A', // Slate 900 sobrio y ejecutivo
  heroGradientEnd: '#1E293B',   // Slate 800 elegante
  heroSubCardBg: 'rgba(255, 255, 255, 0.08)',
  heroTrackBg: 'rgba(255, 255, 255, 0.16)',
  heroBarFill: '#10B981',

  // Floating Bottom Dock (Elegante Negro Pizarra Slate 900)
  dockBg: '#0F172A',          // Negro pizarra sobrio (adiós al púrpura)
  dockBorder: 'rgba(255, 255, 255, 0.08)',
  dockInactive: '#94A3B8',
  dockActive: '#FFFFFF',
  fabBg: '#059669',           // Esmeralda financiero para el botón (+) de Cobro Rápido
  fabRing: '#FFFFFF',

  // 3. COLOR SECUNDARIO FINANCIERO (Verde Esmeralda - Recaudo / Éxito)
  success: '#059669',         // Esmeralda corporativo
  successBright: '#10B981',
  successLight: '#ECFDF5',    // Fondo menta suave
  successBorder: '#A7F3D0',

  // Informativo unificado con Azul Primario
  info: '#2563EB',
  infoBright: '#1D4ED8',
  infoLight: '#EFF6FF',
  infoBorder: '#BFDBFE',

  // Estados de Alerta Semafórica (Estrictamente funcionales)
  warning: '#D97706',         // Ámbar sobrio
  warningLight: '#FFFBEB',
  warningBorder: '#FDE68A',

  danger: '#DC2626',          // Rojo carmesí para cuotas en mora
  dangerLight: '#FEF2F2',
  dangerBorder: '#FECACA',

  // Alias de compatibilidad: redirigidos a la paleta Azul Primaria / Neutra
  purple: '#2563EB',
  purpleBright: '#1D4ED8',
  purpleLight: '#EFF6FF',
  purpleBorder: '#BFDBFE',

  // Micro-bordes y Sombras sutiles
  microBorder: 'rgba(15, 23, 42, 0.06)',
  inputBorder: 'rgba(15, 23, 42, 0.08)',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  overlayBackdrop: 'rgba(15, 23, 42, 0.45)',
};
