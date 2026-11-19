# Bug Assessment: Descuadre FBV en desembolsos nuevos y reconstrucción de base

- **Slug**: fbv-production-reconciliation (generado para este diagnóstico)
- **Created**: 2026-11-19
- **Source**: relato y dos capturas aportadas por el usuario
- **Verdict**: valid para el defecto de cálculo reproducido; atribución individual en la cartera real pendiente de respaldo
- **Severity**: high — el tablero puede presentar base y patrimonio inflados después de un desembolso real
- **Scope**: diagnóstico únicamente; no corregir, desplegar, restaurar ni modificar datos del iPhone

## Report

Usuario identifica la primera captura como 17-11-2026: administrativo5851000, cartera5626000, base225000, recaudo del día75000, web1.2.13. Relata cobros del18 por8000+15000+10000+10000+12000=55000 y un crédito nuevo por200000 para cobrar230000. Segunda captura, web1.2.14: administrativo5955000, cartera5811000, base144000, recaudo45000. Fecha exacta de la segunda captura no está confirmada por metadata; no asumir que muestra todos los movimientos del18.

## Conciliación aritmética

Actualización del usuario,19-11-2026: el último cobro de10000 ocurrió DESPUÉS de la segunda captura. El recaudo45000 mostrado es correcto para ese corte; no hay un pago faltante por localizar. El usuario precisa que la sesión estaba bien antes de publicar en la tarde del18 y que los saldos cambiaron con la actualización. No disponemos de una captura inmediatamente anterior a publicar con los mismos registros de la segunda captura. Los valores esperados de este documento son una proyección desde el17 bajo supuestos, NO una lectura real antes del despliegue. La diferencia74000 NO está probada como efecto de la publicación ni como composición real del error; la reproducción sintética explica una posibilidad, no establece causalidad en el iPhone.

Suponiendo únicamente esos movimientos, desembolso efectivo200000, sin papelería, gastos, retiros, aportes ni otros movimientos:

| Estado | Administrativo | Cartera | Base |
|---|---:|---:|---:|
| Primera captura | 5851000 | 5626000 | 225000 |
| Tras cobrar55000 | 5851000 | 5571000 | 280000 |
| Tras prestar200000 para230000 | 5881000 | 5801000 | 80000 |
| Alternativa: cobros45000 + préstamo | 5881000 | 5811000 | 70000 |
| Segunda captura | 5955000 | 5811000 | 144000 |

Con cobros45000 la cartera concilia exactamente con la proyección. Base y administrativo exceden esa proyección por74000. El escenario55000 es posterior a la captura según la aclaración del usuario, por lo que no corresponde usarlo para evaluar esa imagen. No existe evidencia de un pago borrado o perdido.

## Reproducción aislada

Se ejecutó el local-store real de ambas revisiones git, compilado en memoria con TypeScript, sustituyendo AsyncStorage por un Map. No se abrió navegador, base real, sesión del iPhone ni conexión de sincronización. No se modificó código fuente.

- Anterior:79f4267250a55002f002fadfbcabda3d421c335e.
- Publicada:21a3864ba92648d8f077f95430772990a1f5fc47.
- Fixture explícitamente ficticio: ruta con base inicial0; un crédito migrado con total5851000, pendiente5626000, pagado225000; pagos en app previos99000 (24000 el16 y75000 el17). Esto deja cobros previos en papel126000. Sin renovaciones ni movimientos adicionales; papelería desactivada.
- Agregar pagos ficticios del18 por8000+15000+10000+12000=45000, reduciendo cuotas pendientes correspondientemente.
- Ejecutar createLoan con cliente ficticio distinto, principal200000, tasa0.15, una cuota, frecuenciaMONTHLY, fecha18-11-2026.
- En AMBAS revisiones: antes={admin:5851000,cartera:5626000,base:225000,recaudo:75000}; después={admin:5955000,cartera:5811000,base:144000,recaudo:45000}.
- En AMBAS revisiones: movimiento persistido LOAN_DISBURSEMENT.amount=200000; el resumen descuenta únicamente126000 por su límite histórico.

Esta reproducción coincide con todos los valores mostrados en las capturas, pero NO demuestra que los datos históricos reales tengan estos componentes sintéticos. No atribuir126000 a los registros reales hasta inspeccionarlos.

## Suspected Code Paths

Referencias a la copia aislada exacta publicada:

- `desktop/build/renewal-production-release/mobile/src/infrastructure/storage/local-store.ts:1586` — reconstruye desembolsos históricos recorriendo validLoans en orden inverso del arreglo.
- `desktop/build/renewal-production-release/mobile/src/infrastructure/storage/local-store.ts:1622` — deducted=Math.min(Math.max(0,runningBaselineCash),l.principal), permite deducir parcialmente un préstamo nuevo aun cuando el movimiento de desembolso ya registra todo el efectivo.
- `desktop/build/renewal-production-release/mobile/src/infrastructure/storage/local-store.ts:1637` — usa la reconstrucción como salida total en vez del movimiento de desembolso para préstamos nuevos.
- `desktop/build/renewal-production-release/mobile/src/infrastructure/storage/local-store.ts:1654` — administrativo deriva de cartera+base+digital; hereda la base inflada.
- `desktop/build/renewal-production-release/mobile/src/infrastructure/storage/local-store.ts:2211` — createLoan registra el movimiento neto de desembolso.
- `desktop/build/renewal-production-release/mobile/src/infrastructure/storage/local-store.ts:1344` — cartera suma pendientes de cuotas de créditos activos; este bloque no fue cambiado por el parche.
- `desktop/build/renewal-production-release/mobile/src/presentation/components/NewLoanModal.tsx:319` — crea cliente nuevo si procede; ambos modos de préstamo llaman al mismo createLoan en línea346.

## Root Cause Hypothesis

Confianza alta en el defecto reproducido: el resumen reconstruye la caja con un algoritmo histórico que limita desembolsos de préstamos regulares a fondos previos de papel/base inicial. Los cobros registrados en app no aumentan esa base histórica. Por tanto, disponer de efectivo real de cobros no garantiza que se reste todo el préstamo. El ejemplo reproduce un exceso74000 aunque el movimiento guarda200000 correctamente. No es prueba de pérdida ni modificación de los registros originales.

Confianza no determinada en causalidad exacta sobre el iPhone: falta el respaldo con cuotas, préstamos, pagos, movimientos y auditoría, y no hay lectura de la misma cartera inmediatamente antes/después del despliegue. El cambio21a3864 sí alteró la función general getDailyRouteMetrics y por ello su alcance excede nuevas renovaciones. Sin embargo, el defecto de préstamos regulares mostrado existe también en79f4267, y la reproducción no requiere renovaciones ni actualización. No afirmar que la publicación no tuvo otros efectos sobre históricos reales.

## Proposed Remediation (NO IMPLEMENTADA)

Conciliar una copia aislada de los registros reales con ambas versiones, localizar diferencias por operación y verificar fecha/corte del cobro10000. Después, distinguir estado inicial/importación de movimientos efectivos posteriores. Un desembolso real no debe ser limitado ni reconstruido parcialmente por una base histórica; la falta de caja debe resolverse al autorizar/registrar la operación, nunca ocultando parte de una salida ejecutada. Usar una sola regla financiera para un crédito nuevo, tanto para cliente nuevo como existente. No ajustar manualmente los tres totales para hacerlos coincidir: el cálculo debe derivar de registros auditables sin duplicaciones.

Migrar una cartulina representa un estado ya existente: no constituye un nuevo desembolso o recaudo del día. Incorporar pendiente y efectivo inicial verificable una sola vez, sin duplicar una cartera ya incluida ni convertir automáticamente todo lo cobrado históricamente en efectivo actual. Guardar solo un cliente no debe cambiar saldos.

Pruebas futuras: base formada por cobros posteriores a migración; diferencia entre cobros en papel/en app; nuevo crédito sobre cliente nuevo/existente; importación única de cartulina; orden/reapertura; cronología de varios días; caja/digital; papelería según destino acordado; comparativa de misma copia con ambas versiones. Ninguna corrección o despliegue autorizado en este diagnóstico.

## Risks & Open Questions

- [NEEDS CLARIFICATION] Respaldo real del iPhone y composición de la base225000.
- RESUELTO: la segunda captura antecede al último pago10000; su recaudo45000 es coherente con lo informado. Falta la lectura inmediatamente anterior al despliegue o una reconstrucción verificable con los mismos registros.
- [NEEDS CLARIFICATION] Desembolso efectivo a Joel, papelería aplicada/destino y otros movimientos entre capturas.
- No inventar un ajuste de74000 como reparación: la diferencia es demostrable bajo los supuestos y la reproducción, pero falta conciliación individual real.
- Las127 pruebas de renovación no cubrieron este escenario mixto de migración, cobros posteriores y nuevo crédito. Pasarlas no justificaba afirmar corrección integral de los saldos generales.

## Workflow

`.specify/extensions.yml` revisado: hooks={} antes del diagnóstico; no hooks aplicables. Siguiente etapa propuesta, tras conciliar evidencia y obtener autorización del usuario: corrección con slug=fbv-production-reconciliation. No se ejecutó corrección.
