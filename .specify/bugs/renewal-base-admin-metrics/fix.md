# Bug Fix: Desfase en Base y Administrativo tras Renovación de Crédito

- **Slug**: renewal-base-admin-metrics
- **Fixed**: 2026-11-16T18:56:00-05:00
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Se corrigió el orden de inserción de `newLoan` en `recordRenewal` y se aisló el cálculo del capital desembolsado por renovaciones en `getDailyRouteMetrics`, dejando intacta la lógica existente para préstamos regulares, cartulinas migradas, cobros, gastos, inyecciones y retiros.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `mobile/src/infrastructure/storage/local-store.ts` | modified | En `getDailyRouteMetrics`, las renovaciones (`l.previousLoanId`) dejan de depender de `runningBaselineCash` y se suman aparte en `totalRenewalCapitalOut` como `newPrincipal - previousBalanceDeducted` (`actualCashDisbursed + paperworkDeducted`). En `recordRenewal`, `newLoan` se inserta al inicio de `this.loans` consistente con `createLoan`. |
| `mobile/src/infrastructure/storage/__tests__/renewal-metrics.test.ts` | added test | Valida el escenario exacto: antes (`Base: 500.000`, `Cartera: 620.000`, `Admin: 1.120.000`) y después de renovar (`Base: 340.000`, `Cartera: 1.060.000`, `Admin: 1.400.000`). |

## Diff Highlights (optional)

```ts
// local-store.ts (getDailyRouteMetrics)
const validLoanIds = new Set(validLoans.map((l) => l.id));
const totalRenewalCapitalOut = this.renewals
  .filter((r) => validLoanIds.has(r.newLoanId))
  .reduce((sum, r) => sum + Math.max(0, r.newPrincipal - r.previousBalanceDeducted), 0);

const totalCapitalOut = fixedHistoricalCapitalDisbursed + totalRenewalCapitalOut;
```

```ts
// local-store.ts (recordRenewal)
this.loans = [newLoan, ...this.loans.map((l) => (l.id === prevLoan.id ? updatedPrevLoan : l))];
```

## Tests Added or Updated

- `mobile/src/infrastructure/storage/__tests__/renewal-metrics.test.ts::runRenewalMetricsTest` — valida que la Base baje exactamente `$160.000` (`$125.000` efectivo + `$35.000` papelería), la Cartera suba `$440.000` y el Administrativo suba únicamente `$280.000` de interés.

## Local Verification

- Commands run: `npm run typecheck` (en `mobile/`) → exit code 0.
- Commands run: compilación con `tsc` + ejecución en Node de `renewal-metrics.test.js` y `calculator.test.js` → ambos superados.

## Deviations from Assessment

Ninguna.

## Follow-ups

- Si se va a probar inmediatamente en el servidor web estático (`localhost:8082` sirviendo `mobile\dist`), regenerar el bundle `mobile\dist` con Expo export antes de abrir en navegador.

## Seguimiento local — 2026-11-17

Slug reutilizado por contexto: `renewal-base-admin-metrics`. Se conserva el informe original.

El usuario confirmó que reproduce en localhost:8082 desde Antigravity. El bundle local anterior, generado el 16 de noviembre a las 12:53, todavía contenía el cálculo con tope y la inserción con concat; no incluía el arreglo de las 18:56. Se regeneró mobile/dist sin publicar en producción.

- Se añadió el caso exacto: principal 700.000, saldo anterior 620.000, interés 40%, papelería 35.000. Esperados: entrega 45.000, Base 420.000, cartera 980.000, Administrativo 1.400.000.
- Se verifica además reapertura de datos en el orden usado por la versión antigua, sin duplicar créditos ni renovaciones y sin sumar la compensación al recaudo.
- Se añadió `npm run test:finance`, con almacenamiento aislado en memoria. Las aserciones de la suite antigua ahora fallan realmente el proceso. Se corrigió su fecha de prueba de pagos múltiples: la primera cuota vence el día del pago y la segunda sigue siendo futura, como exige su expectativa PAGADA/ADELANTADA. No se cambió el algoritmo de pagos.
- Etiqueta del paquete de pruebas: `web 1.2.14 LOCAL (2026-11-17)`.

Expansión del alcance respecto de assessment.md: runner reproducible, fixture de regresión y etiqueta de versión para identificar el paquete regenerado. Se preservan los cambios previos del formulario de renovación. La validación visual con la sesión real del usuario sigue pendiente; el navegador de comprobación tiene otra sesión.
