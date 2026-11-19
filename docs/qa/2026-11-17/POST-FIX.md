# Correcciones verificadas en JavaFX — 17 de noviembre de 2026

Los **11 fallos reproducidos** de la auditoría inicial quedaron corregidos. La jornada original, sin cambiar sus 35 comprobaciones, ahora pasa **35/35**. La suite de regresión ampliada pasa **41 pruebas**, sin fallos, errores ni pruebas omitidas.

## Qué se corrigió

- **Efectivo y Nequi:** los cobros digitales dejan de incrementar el efectivo físico o el efectivo a rendir. Siguen formando parte del patrimonio. Dashboard y arqueo muestran ambos importes por separado; Caja muestra movimientos físicos.
- **Autorización y cierres:** los servicios validan sesión activa, usuario habilitado y permiso sobre el cobrador. Cobros, créditos, renovaciones y gastos importados no alteran una jornada cerrada. Un reintento idéntico de un pago ya registrado devuelve su comprobante sin volver a escribir; una clave reutilizada con otros datos se rechaza.
- **Reversos:** conservan PaymentAllocation originales y su auditoría; el historial aplicado excluye pagos anulados. No se reversan pagos de contratos renovados ni jornadas cerradas por esta operación simple.
- **Cuotas importadas:** los identificadores textuales móviles ya se admiten en cobros nativos.
- **Cancelaciones:** solo se reintegra un desembolso registrado. Cancelar una migración sin desembolso no crea entrada de dinero.
- **Tasa y total:** se rechazan capital, tasa y deuda contradictorios. Las tasas importadas en fracción o porcentaje se aceptan únicamente si concilian con el total pactado.
- **Renovaciones importadas:** registran una sola vez el neto entregado y la papelería, validan el saldo anterior y conservan identidades. Un paquete financiero inválido revierte la operación completa.
- **Ruta de jornada:** se resuelve a partir de las rutas activas asignadas al cobrador; la segunda ruta ya no se crea en route-norte.
- **Respaldo:** se genera después del commit desde la base SQLite activa, con copia consistente e integridad verificada. Incluye el cierre recién confirmado, usa nombres únicos y nunca crea texto disfrazado de .db. Un fallo de respaldo queda registrado y se advierte en pantalla sin fingir que el cierre confirmado se revirtió.

## Validación realizada

```powershell
.\gradlew.bat :desktop:test :desktop:officeJourneyQa --offline --console=plain
```

Resultado: `BUILD SUCCESSFUL`; 41 pruebas JUnit y `QA_RESULT total=35 pass=35 fail=0`. Evidencia por escenario: [journey-results-post-fix.json](journey-results-post-fix.json). La evidencia anterior de 24 PASS y 11 FAIL permanece en journey-results.json.

Se abrió la aplicación JavaFX actualizada en una oficina ficticia nueva. Se verificaron visualmente el acceso del administrador, las tarjetas separadas de efectivo/fondos digitales y el desglose efectivo/digital del arqueo. Esta revisión visual no repitió las transacciones completas desde pantallas; la jornada de operaciones se ejecutó mediante los servicios reales con SQLite aislada.

La regresión adicional verifica asignaciones conservadas, reversión digital, actor inactivo, cobro sin sesión o sobre otro cobrador, idempotencia con datos distintos, bloqueo de operaciones e importación de gastos después del cierre, rechazo de renovación inválida sin escrituras parciales, respaldo con el cierre, integridad SQLite, nombres únicos, ausencia de copia automática tras rollback y rechazo de base inexistente sin crear un archivo falso.

## Límites

Solo se utilizaron oficinas ficticias bajo desktop/build/qa y bases temporales de pruebas. No se modificaron saldos reales ni cierres históricos, ni se publicó en producción. Los movimientos erróneos previos requieren una corrección auditable aparte; este arreglo previene nuevas operaciones incorrectas.

Siguen pendientes la aceptación LAN con teléfono físico, restauración integral de una oficina, instalación en otro PC, impresión, mapas y WhatsApp. El resultado verifica los fallos reproducidos y no certifica todos los entornos externos.

Informe Spec Kit: [test.md](../../../.specify/bugs/desktop-financial-journey/test.md).
