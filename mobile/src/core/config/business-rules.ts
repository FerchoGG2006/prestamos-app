/**
 * CONFIGURACIÓN DE REGLAS DE NEGOCIO Y DECISIONES PENDIENTES
 * 
 * Regla de Oro:
 * - NO hardcodear tasas ni valores comerciales.
 * - Las reglas financieras están centralizadas aquí.
 * - Si una regla de negocio aún no está definida, NO inventarla:
 *   se documenta como decisión pendiente y se deja parametrizable.
 */

import { InterestType, LoanFrequency } from '../domain/types';

export interface LoanBusinessConfig {
  defaultInterestRate: number;         // 0.20 (20%)
  interestType: InterestType;          // 'FLAT_INITIAL_CAPITAL'
  defaultInstallmentsCount: number;    // 30
  defaultFrequency: LoanFrequency;     // 'DAILY'
  excludeSundays: boolean;             // True si no se cobra los domingos
}

export interface PaperworkConfig {
  rate: number;                        // 5000 COP
  base: number;                        // Por cada 100000 COP
  calculationMode: 'PROPORTIONAL' | 'STEP_CEIL' | 'STEP_FLOOR';
}

/**
 * DECISIÓN PENDIENTE: FÓRMULA DE MORA
 * 
 * Estado: Pendiente de definición por el negocio.
 * 
 * La arquitectura registra:
 * - Días de mora reales.
 * - Cuotas vencidas reales.
 * - Saldo vencido real.
 * 
 * El cálculo de recargos/intereses moratorios se mantiene en 0 por defecto
 * y se delega a esta configuración para cuando el negocio entregue la fórmula oficial.
 */
export interface DelinquencyStrategyConfig {
  isSurchargeEnabled: boolean;         // Por defecto false (sin recargo inventado)
  graceDays: number;                   // Días de gracia antes de considerar mora (por defecto 0)
  surchargeType: 'FIXED' | 'PERCENTAGE_DAILY' | 'NONE';
  surchargeValue: number;              // 0 mientras no esté definida
  maxSurchargeCap?: number;            // Tope máximo de mora
  notes: string;
}

export const DEFAULT_BUSINESS_CONFIG = {
  loan: {
    defaultInterestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL' as InterestType,
    defaultInstallmentsCount: 30,
    defaultFrequency: 'DAILY' as LoanFrequency,
    excludeSundays: true,
  } as LoanBusinessConfig,

  paperwork: {
    rate: 5000,
    base: 100000,
    calculationMode: 'PROPORTIONAL', // 5.000 por cada 100.000 proporcional (ej. 150.000 -> 7.500)
  } as PaperworkConfig,

  delinquency: {
    isSurchargeEnabled: false,
    graceDays: 0,
    surchargeType: 'NONE',
    surchargeValue: 0,
    notes: 'DECISIÓN PENDIENTE: La fórmula y tasa de mora no han sido definidas por el negocio. Se registran días y montos vencidos sin recargos inventados.',
  } as DelinquencyStrategyConfig,
};

/**
 * Formateador oficial de moneda colombiana (COP)
 * Ejemplos:
 * formatCOP(150000) -> "$ 150.000"
 * formatCOP(1250000) -> "$ 1.250.000"
 */
export function formatCOP(amount: number): string {
  const rounded = Math.round(amount || 0);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(rounded);
}

/**
 * Suma días a una fecha en formato YYYY-MM-DD sin desajustes por zona horaria
 */
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Obtiene la fecha del próximo lunes a partir de una fecha YYYY-MM-DD
 */
export function getNextMonday(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const currentDayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysUntilMonday = currentDayOfWeek === 0 ? 1 : 8 - currentDayOfWeek;
  return addDays(dateStr, daysUntilMonday);
}

/**
 * Obtiene la fecha del fin de semana (sábado) a partir de una fecha YYYY-MM-DD
 */
export function getNextWeekend(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const currentDayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (currentDayOfWeek === 6) {
    return dateStr; // Hoy ya es sábado
  }
  const daysUntilSaturday = (6 - currentDayOfWeek + 7) % 7 || 7;
  return addDays(dateStr, daysUntilSaturday);
}

