import { TextStyle } from 'react-native';

/**
 * SISTEMA TIPOGRÁFICO UNIFICADO (FINTECH DESIGN SYSTEM)
 * 
 * Regla de Oro:
 * - Una única familia tipográfica moderna, sobria y limpia (System Sans-serif)
 *   (SF Pro en iOS, Roboto en Android, Segoe UI / Inter en Web).
 * - Cero mezclas caóticas de fuentes.
 * - Jerarquía tipográfica estandarizada para:
 *   1. Títulos de Pantalla / Modales (h1)
 *   2. Títulos de Secciones / Bento (h2)
 *   3. Títulos de Tarjetas / Nombres (h3)
 *   4. Párrafos y Textos Normales (body)
 *   5. Subtítulos y Metadatos (bodySmall)
 *   6. Indicadores y Etiquetas de Píldoras (label / badge)
 *   7. Cifras y Montos Financieros (currency)
 */

// Cargada desde assets por expo-font en App.tsx; variable para pesos 400–900 reales.
export const FONT_FAMILY = 'Manrope';

export const FONT_FAMILY_MONO = 'monospace';

export const TYPOGRAPHY = {
  // Familia base consistente
  fontFamily: FONT_FAMILY,
  fontFamilyMono: FONT_FAMILY_MONO,

  // 1. TÍTULOS (Encabezados con peso visual exacto)
  h1: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    letterSpacing: -0.3,
  } as TextStyle,

  h2: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: -0.2,
  } as TextStyle,

  h3: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: -0.1,
  } as TextStyle,

  // 2. PÁRRAFOS Y CUERPO DE TEXTO (Lectura descansada y legible)
  body: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  } as TextStyle,

  bodyBold: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  } as TextStyle,

  bodySmall: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  } as TextStyle,

  bodySmallBold: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  } as TextStyle,

  // 3. ETIQUETAS, BADGES Y METADATOS
  caption: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  } as TextStyle,

  badge: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  } as TextStyle,

  overline: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  } as TextStyle,

  // 4. MONTOS Y CIFRAS FINANCIERAS
  currencyHero: {
    fontFamily: FONT_FAMILY,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  } as TextStyle,

  currencyCard: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  } as TextStyle,

  currencySmall: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,
};
