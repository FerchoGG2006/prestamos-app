/**
 * PALETA DE COLORES Y TOKENS DE DISEÑO
 * 
 * Principio:
 * - Profesional, financiero, sobrio, alta legibilidad bajo el sol.
 * - Sin gradientes excesivos ni efectos que reduzcan el rendimiento en móviles.
 */

export const COLORS = {
  // Fondos
  bgPrimary: '#0f172a',      // Slate 900 (Fondo principal elegante)
  bgSecondary: '#1e293b',    // Slate 800 (Cards y contenedores)
  bgTertiary: '#334155',     // Slate 700 (Bordes y separadores)
  bgLight: '#f8fafc',        // Para componentes claros si aplica
  
  // Textos
  textPrimary: '#f8fafc',    // Blanco suave de alto contraste
  textSecondary: '#94a3b8',  // Gris claro para metadatos
  textMuted: '#64748b',      // Gris atenuado

  // Acciones y Marca
  primary: '#2563eb',        // Azul financiero sólido
  primaryHover: '#1d4ed8',
  primaryLight: '#dbeafe',
  
  // Estados Financieros (Semáforo operativo)
  success: '#10b981',        // Esmeralda: Al día, Pagada, Cobro exitoso
  successLight: 'rgba(16, 185, 129, 0.15)',
  
  danger: '#ef4444',         // Rojo: Mora, Atrasada, Salida de caja
  dangerLight: 'rgba(239, 68, 68, 0.15)',
  
  warning: '#f59e0b',        // Ámbar: Pago parcial, Promesa pendiente
  warningLight: 'rgba(245, 158, 11, 0.15)',
  
  info: '#0ea5e9',           // Celeste: Cuota adelantada, Información
  infoLight: 'rgba(14, 165, 233, 0.15)',
  
  purple: '#8b5cf6',         // Púrpura: Renovación
  purpleLight: 'rgba(139, 92, 246, 0.15)',
};
