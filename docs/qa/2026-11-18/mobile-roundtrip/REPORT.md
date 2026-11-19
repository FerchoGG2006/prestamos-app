# Prueba de ida y vuelta con el motor real del móvil

**Fecha: 18 de noviembre de 2026. Resultado: aprobado en entorno aislado.**

Se ejecutó el código real local-store.ts y sus cálculos, con AsyncStorage sustituido por una memoria nueva del proceso. Se conectó por HTTP al servidor JavaFX con SQLite temporal. No fue una simulación con fórmulas copiadas: se llamaron pullRouteFromOfficeServer, recordPayment, recordRenewal y pushSyncToOfficeServer del propio motor móvil.

| Paso | Efectivo | Cartera | Digital | Administrativo |
|---|---:|---:|---:|---:|
| Oficina ficticia inicial | $500.000 | $620.000 | $0 | $1.120.000 |
| Cobro de $20.000 en efectivo | $520.000 | $600.000 | $0 | $1.120.000 |
| Renovación a $700.000 al 40% | $420.000 | $980.000 | $0 | $1.400.000 |
| Cobro de $10.000 por Nequi | $420.000 | $970.000 | $10.000 | $1.400.000 |

La renovación descuenta $600.000 de deuda anterior y $35.000 de papelería; entrega $65.000 al cliente. Se envió dos veces el mismo lote: permanecieron **dos pagos y una renovación**, sin duplicados. Después se descargó la respuesta del desktop y se comprobó también la reconstrucción desde una memoria vacía, con los mismos valores.

## Corrección encontrada durante esta prueba

El desktop enviaba ACTIVO/MENSUAL y amount; el motor móvil requiere ACTIVE/MONTHLY y expectedAmount. Se corrigió la exportación de JavaFX, incluyendo campos necesarios, historial de créditos, renovaciones y pagos/asignaciones. La identidad original del pago móvil se preserva mediante un vínculo auditado; la respuesta de oficina ya no crea otra copia del mismo pago.

**Regresión final: 59 pruebas aprobadas y 35/35 escenarios operativos.** La evidencia está en result.json, tests.json y journey-results.json.

## Protección de tus datos y límites

No se modificó el código de la aplicación móvil ni se reinstaló/reconfiguró el teléfono. Solo se añadió un ejecutor de pruebas en mobile/scripts. No se abrió ni modificó la base real de clientes para probar. La prueba física confirmada por el usuario fue únicamente abrir el endpoint de estado desde el navegador del teléfono.

El usuario confirmó que solo dispone del teléfono con sus clientes reales. Por eso no se hicieron cobros, renovaciones, descargas de rutas ni envíos de cartera dentro de esa aplicación. La prueba de transacciones dentro de Android sigue pendiente de un entorno separado. No hay emulador Android instalado en este PC.

Este caso de cartulina usa un saldo inicial conocido y no certifica la reconciliación de cualquier cartera histórica, todos los modelos de base inicial, correcciones/reversos ni cambios de perfil/media. Esas limitaciones permanecen expresas; no se adivinan ni se modifican saldos históricos.

## Paquete preparado

Se generaron el instalador y el ZIP Windows **1.1.1** en desktop/build/release-roundtrip-111, sin instalarlos ni reemplazar versiones existentes. El JAR empaquetado coincide por SHA-256 con el código verificado y el runtime incluye jdk.httpserver. Los tamaños y hashes están en artifacts.json. Este paquete incorpora la corrección del contrato de descarga descubierta durante el recorrido real del motor móvil.
