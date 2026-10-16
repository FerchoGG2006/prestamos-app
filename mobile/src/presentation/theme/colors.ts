/**
 * PALETA DE COLORES Y TOKENS DE DISEÑO — CLEAN FINTECH UI / SOFT MINIMALIST UI
 * Fusión de:
 * 1. Figma "Finance Management Mobile App UI UX Kit" (node-id=7020-3430)
 * 2. Análisis de Estilo Fintech UI (https://share.gemini.google/KjMOzkltAOCD — Nequi, Nu, Revolut Light Mode)
 *
 * Principios de Diseño Aplicados:
 * - Soft UI / Flat 2.0: contraste de superficies (#FFFFFF blanco puro sobre bloques #F4F5F7 gris ultra claro y #F5F3FF lavanda suave).
 * - Diferenciación de superficies (Mejora IA #3): micro-bordes sutiles de 1px (rgba(15, 23, 42, 0.07)) en tarjetas y Filled Inputs.
 * - Jerarquía tipográfica agresiva: montos financieros en #0F172A con peso 800/900 frente a etiquetas secundarias #64748B.
 * - Píldoras de estado semánticas (borderRadius: 9999) con fondos pastel y texto saturado del mismo matiz.
 * - Floating Bottom Dock: barra inferior flotante tipo píldora (#1E1B4B índigo/púrpura oscuro) con FAB central sobresaliente.
 */

export const COLORS = {
  // Fondos principales (Clean Fintech / Soft Minimalist UI)
  bgPrimary: '#F4F5F7',       // Soft gray de alto contraste suave con tarjetas blancas (#FFFFFF)
  bgSecondary: '#FFFFFF',     // Blanco puro (Tarjetas Bento, tarjetas de ruta y Bottom Sheets)
  bgTertiary: '#E2E8F0',      // Separadores y pistas de progreso
  bgElevated: '#F4F5F7',      // Superficie para Filled Inputs y bloques financieros internos
  bgLight: '#F8FAFC',
  surfaceSoft: '#F4F5F7',     // Bloque gris suave para inputs rellenos (Filled Inputs) y Bento secundario
  surfaceLavender: '#F5F3FF', // Bloque lavanda pálido para tarjetas destacadas / Nequi / Bento
  receiptPaper: '#FAFAFC',    // Fondo ligero tipo tirilla de datáfono para comprobante de cobro

  // Tipografía y Jerarquía Visual Agresiva
  textPrimary: '#0F172A',     // Slate 900 (Montos en negrita 800 y títulos principales)
  textSecondary: '#475569',   // Slate 600 (Subtítulos y etiquetas de sección)
  textMuted: '#64748B',       // Slate 500 (Floating labels internos y metadatos)
  textOnPrimary: '#FFFFFF',   // Texto sobre Hero Card, FAB y Floating Dock

  // Marca, Hero Balance Card y Acentos Fintech
  primary: '#2563EB',         // Azul Fintech primario
  primaryHover: '#1D4ED8',
  primaryLight: '#EFF6FF',    // Azul pastel
  primaryBorder: '#BFDBFE',
  heroGradientStart: '#1E1B4B', // Índigo profundo estilo Fintech moderno
  heroGradientEnd: '#2563EB',
  heroSubCardBg: 'rgba(255, 255, 255, 0.14)',
  heroTrackBg: 'rgba(255, 255, 255, 0.22)',
  heroBarFill: '#34D399',

  // Floating Bottom Dock con FAB Central (Patrón #3 del análisis Gemini)
  dockBg: '#1E1B4B',          // Púrpura/Índigo muy oscuro de alto contraste para la píldora flotante
  dockBorder: 'rgba(255, 255, 255, 0.12)',
  dockInactive: '#94A3B8',
  dockActive: '#FFFFFF',
  fabBg: '#10B981',           // Verde esmeralda vibrante para el botón central (+) de Cobro Rápido
  fabRing: '#FFFFFF',

  // Estados Financieros y Píldoras Semánticas (borderRadius: 9999)
  success: '#059669',         // Esmeralda oscuro (Texto Aprobado / Al día / Cobrar)
  successBright: '#10B981',   // Esmeralda brillante (Barras de Recaudo)
  successLight: '#ECFDF5',    // Fondo menta suave (.badge-aldia)
  successBorder: '#A7F3D0',

  info: '#1D4ED8',            // Azul intenso (.badge-hoy / Cobrar Hoy)
  infoBright: '#2563EB',
  infoLight: '#EFF6FF',       // Fondo azul pastel (.badge-hoy)
  infoBorder: '#BFDBFE',

  warning: '#D97706',         // Ámbar (Pago parcial / Promesa)
  warningLight: '#FFFBEB',
  warningBorder: '#FDE68A',

  danger: '#DC2626',          // Rojo mora (.badge-mora / Vencido)
  dangerLight: '#FEF2F2',     // Fondo rosa pálido (.badge-mora)
  dangerBorder: '#FECACA',

  purple: '#6D28D9',          // Púrpura Fintech (Nequi / Bento Favoritos)
  purpleBright: '#7C3AED',
  purpleLight: '#F5F3FF',
  purpleBorder: '#DDD6FE',

  // Micro-bordes de diferenciación de superficie (Mejora IA #3) y Sombras
  microBorder: 'rgba(15, 23, 42, 0.07)',
  inputBorder: 'rgba(15, 23, 42, 0.09)',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  overlayBackdrop: 'rgba(15, 23, 42, 0.48)',
};
