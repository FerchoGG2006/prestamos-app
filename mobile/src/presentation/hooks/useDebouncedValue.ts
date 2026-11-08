import { useState, useEffect } from 'react';

/**
 * Punto 04: Hook de Debounce para búsquedas y autocompletado.
 * Evita recalcular filtros pesados o disparar consultas en cada pulsación de tecla.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 180): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    if (value === '' || value === null || value === undefined) {
      setDebouncedValue(value);
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
