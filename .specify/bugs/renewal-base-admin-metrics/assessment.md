# Bug Assessment: Desfase en Base y Administrativo tras Renovación de Crédito

- **Slug**: renewal-base-admin-metrics
- **Created**: 2026-11-16T15:02:00-05:00
- **Source**: pasted text (conversación `835a42f7-596e-470a-8f71-81817d81a087` y validación matemática del usuario)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> "hice una renovacion en el localhost y las formulas no cuadran, desglosame por qué da un administrativo de 1.560.000 y por qué la base no bajó? ... el administrativo que nosotros teníamos era de 1.120.000. Ese administrativo debía subir los 280.000 de interés nada más. La base tenía que bajar lo que se le iba a entregar a la persona en efectivo o donde sea que estuviese, pero el total que se le iba a entregar a la persona para la renovación, incluida la papelería... si le vamos a entregar 125 más 35 papelería, eso daba 160... probemos con estos valores: administrativo 1.120.000, base 500.000, cartera en calle 620.000."

## Symptom

Al registrar una renovación de crédito (`recordRenewal`), la **Cartera en Calle** sube correctamente en $(T_{\text{nuevo}} - S_{\text{ant}})$ (ej. de $\$620.000$ a $\$1.060.000$), pero la **Base en Mano** (`cashAvailableInHand`) no descuenta el desembolso total de la renovación ($E_{\text{neto}} + \text{Pap} = P_{\text{nuevo}} - S_{\text{ant}} = \$160.000$), permaneciendo en $\$500.000$. Como resultado, el **Administrativo** (`totalAdministrativeCapital`) suma $\$1.060.000 + \$500.000 = \$1.560.000$ en lugar de subir únicamente el interés nuevo ($\$1.120.000 + \$280.000 = \$1.400.000$).

## Reproduction

1. Iniciar con una ruta cuyo estado previo sea: Base $= \$500.000$, Cartera en calle $= \$620.000$, Administrativo $= \$1.120.000$ (donde la base proviene de cobros de cartulinas migradas o cobros en la app, con `manualBaseCapital = 0`).
2. Registrar una renovación (`recordRenewal`) con desembolso neto en efectivo de $\$125.000$, papelería de $\$35.000$ (total salido de base $= P_{\text{nuevo}} - S_{\text{ant}} = \$160.000$) e interés nuevo de $\$280.000$.
3. Consultar `getDailyRouteMetrics`.
4. **Observado**: Base sigue en $\$500.000$ y Administrativo sube a $\$1.560.000$.
5. **Esperado**: Base baja a $\$340.000$ ($\$500.000 - \$160.000$), Cartera en calle sube a $\$1.060.000$, y Administrativo sube únicamente el interés a $\$1.400.000$.

## Suspected Code Paths

- `mobile/src/infrastructure/storage/local-store.ts:2385` (`recordRenewal`) — usa `.concat(newLoan)` al final de `this.loans`, mientras `createLoan` (línea 2207) usa `this.loans.unshift(newLoan)`.
- `mobile/src/infrastructure/storage/local-store.ts:1589-1637` (`getDailyRouteMetrics`) — construye `chronologicalLoans = [...validLoans].reverse()`, colocando el préstamo renovado al inicio del bucle cuando `runningBaselineCash` aún es `0`, por lo que `Math.min(Math.max(0, runningBaselineCash), netCapitalOut)` resulta en `0`. Además, `runningBaselineCash` no incluye cobros hechos en la app (`inAppOnThisLoan`), por lo que depender de `runningBaselineCash` para renovaciones falla si el efectivo disponible proviene de recaudos en la app.

## Root Cause Hypothesis

`recordRenewal` agrega el nuevo préstamo al final de `this.loans` (`.concat(newLoan)`) en lugar del inicio, rompiendo el orden cronológico inverso asumido por `getDailyRouteMetrics` (`[...validLoans].reverse()`). Al quedar la renovación antes que los créditos migrados en `chronologicalLoans`, `runningBaselineCash` vale `0` al evaluarla y `deducted` queda truncado en `0`. Adicionalmente, acoplar las renovaciones al acumulador `runningBaselineCash` (que excluye pagos in-app) impide descontar correctamente renovaciones financiadas con recaudo del día. Confianza: **high**.

## Proposed Remediation

**Preferred**: Mantener intacta la lógica actual de `getDailyRouteMetrics` para créditos regulares, cartulinas migradas, cobros, gastos, inyecciones y retiros, y aislar el cálculo de renovaciones:
1. En `recordRenewal` (`local-store.ts:2385`), insertar `newLoan` al inicio del arreglo (`[newLoan, ...this.loans.map(...)]`), consistente con `createLoan`.
2. En `getDailyRouteMetrics` (`local-store.ts:1589-1638`), excluir los créditos de renovación (`Boolean(l.previousLoanId)`) del descuento con tope `runningBaselineCash` y calcular el capital desembolsado por renovaciones de forma aislada sumando `Math.max(0, r.newPrincipal - r.previousBalanceDeducted)` (equivalente a `actualCashDisbursed + paperworkDeducted`) para todas las renovaciones válidas de la ruta (`validLoanIds.has(r.newLoanId)`), sumándolo a `totalCapitalOut`.

**Files likely to change**:
- `mobile/src/infrastructure/storage/local-store.ts`
- `mobile/src/core/domain/__tests__/renewal-metrics.test.ts` (nuevo test unitario o script de verificación)

**Tests to add or update**:
- Caso exacto del usuario: Admin inicial `1.120.000`, Base `500.000`, Cartera `620.000`, renovación con `actualCashDisbursed = 125.000`, `paperworkDeducted = 35.000` (`netOut = 160.000`), `interestAmount = 280.000` -> verificar Base `340.000`, Cartera `1.060.000`, Admin `1.400.000`.
- Caso sin renovaciones: verificar que el resultado para créditos regulares y migrados no cambia.

## Risks & Considerations

- Ningún riesgo de regresión para créditos regulares, cartulinas migradas, cobros, gastos o retiros, ya que la rama `!l.previousLoanId` permanece idéntica y cuando no hay renovaciones válidas `totalRenewalCapitalOut = 0`.

## Open Questions

- Ninguna. Fórmulas y valores validados matemáticamente con el usuario.
