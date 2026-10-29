import { TextStyle } from 'react-native';

/**
 * SISTEMA TIPOGRÁFICO UNIFICADO (FINTECH DESIGN SYSTEM)
 * Escala limpia estilo Nubank / Revolut:
 * - Display: 36 / 40 bold (Patrimonio y héroes)
 * - Título: 20 bold / semibold (Secciones)
 * - Subtítulo / Tarjetas: 16-17 semibold
 * - Cuerpo: 15-16 regular/bold
 * - Caption / Metadatos: 12-13 medium (Mínimo 12px estricto)
 * - Tabular nums activado en todas las cifras monetarias
 */

// Cargada desde assets por expo-font en App.tsx; variable para pesos 400–900 reales.
export const FONT_FAMILY = 'Manrope';

export const FONT_FAMILY_MONO = 'monospace';

export const TYPOGRAPHY = {
  // Familia base consistente
  fontFamily: FONT_FAMILY,
  fontFamilyMono: FONT_FAMILY_MONO,

  // 1. DISPLAY Y TÍTULOS
  display: {
    fontFamily: FONT_FAMILY,
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  } as TextStyle,

  h1: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    letterSpacing: -0.3,
  } as TextStyle,

  h2: {
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    letterSpacing: -0.2,
  } as TextStyle,

  h3: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.1,
  } as TextStyle,

  // 2. CUERPO DE TEXTO (15-16px para máxima legibilidad sin esfuerzo visual)
  body: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  } as TextStyle,

  bodyBold: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  } as TextStyle,

  bodySmall: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  } as TextStyle,

  bodySmallBold: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  } as TextStyle,

  // 3. ETIQUETAS Y METADATOS (Mínimo 12px según especificación WCAG y sin mayúsculas forzadas)
  caption: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  } as TextStyle,

  captionBold: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  } as TextStyle,

  badge: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  } as TextStyle,

  overline: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  } as TextStyle,

  // 4. MONTOS Y CIFRAS FINANCIERAS (Tabular numbers siempre alineados)
  currencyHero: {
    fontFamily: FONT_FAMILY,
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  } as TextStyle,

  currencyCard: {
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  } as TextStyle,

  currencySmall: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  } as TextStyle,

  tabularNums: {
    fontVariant: ['tabular-nums'],
  } as TextStyle,
};
