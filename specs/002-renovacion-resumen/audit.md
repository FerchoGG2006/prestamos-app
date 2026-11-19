# Auditoría financiera JavaFX — 2026-11-17

Alcance: revisión estática de altas, pagos, reversos, cancelaciones, renovaciones, indicadores, cierres, sincronización y respaldos. Prioridades: P1 requiere resolución antes de entregar los flujos afectados; P2 requiere tratamiento posterior. No constituye auditoría contable/legal ni certifica el producto completo. La evidencia corresponde al código revisado; no se ejecutaron operaciones con datos reales.

## Resuelto en esta entrega: renovación nativa

- El servicio registraba solamente el neto, dejando papelería en la Base. Ahora comparte el cálculo con la vista previa y crea dos egresos trazables. Caso exacto: Base 500.000 → 420.000, cartera 620.000 → 980.000, Administrativo 1.120.000 → 1.400.000; neto 45.000 y papelería 35.000.
- Antes aceptaba autor arbitrario y no era idempotente. Ahora exige sesión activa, autor coincidente y rol/propiedad del crédito; conserva el cobrador asignado aunque confirme un administrador. Una renovación por crédito anterior con restricción única y replay de términos coincidentes.
- Comparación de snapshot antes de guardar y rechazo si cambian saldo o caja. Rechaza jornada actual cerrada. Auditoría y egresos en la misma transacción.
- `TodayCollectionsService` ya no oculta caja negativa al calcular Administrativo. La vista previa advierte ese caso sin inventar una política de concesión de créditos.
- No se corrigen silenciosamente renovaciones históricas ni cierres. La migración V2 solo agrega unicidad; si existen duplicados históricos falla para requerir revisión auditable.

## Pendientes confirmados

| ID | Prioridad | Hallazgo y efecto | Evidencia | Tratamiento recomendado |
|---|---|---|---|---|
| A01 | P1 | La importación de renovación cierra el anterior y guarda Renewal, pero no genera egresos de neto/papelería; además descarta RENEWAL_DISBURSEMENT. Puede dejar Base intacta al sincronizar. | `desktop/src/main/java/com/cartera/sync/application/MobileSyncProcessorService.java`, bloque 306–368 y 457–469 revisado. | Aplicar la misma regla financiera en importación con idempotencia y pruebas de doble sincronización. |
| A02 | P1 | Nequi/transferencias se registran como ingreso genérico y se suman con efectivo en indicadores y arqueo. El saldo actual no representa exclusivamente efectivo físico. | `payments/application/RecordPaymentUseCase.java`, movimiento PAGO_CUOTA; `collections/application/TodayCollectionsService.java`, bucle de caja; `settlement/application/SettlementUseCase.java`, bloque totalCollected/netExpectedCash. | Separar saldos por medio y arqueo físico, incluyendo reversos y conciliación digital; definir migración de históricos sin alterar cierres. |
| A03 | P1 | El pago convierte el ID de cuota con UUID.fromString, pero importación y móvil usan IDs de texto como loanId-iN o loanId-cuota-N. Cobrar después puede fallar. | `payments/application/RecordPaymentUseCase.java`, mapeo a Installment; `sync/application/MobileSyncProcessorService.java`, generación de cuotas; `mobile/src/core/domain/calculator.ts`, generateInstallments. | Aceptar identidad textual de forma coherente o mapearla al importar sin romper referencias; prueba importar → cobrar. |
| A04 | P1 | Alta de crédito, gastos y cierre aceptan autores sin validar la sesión en el servicio; alta genera UUID nuevo por llamada sin clave de idempotencia. | `loans/application/CreateLoanUseCase.java`, execute; `settlement/application/SettlementUseCase.java`, registerRouteExpense y closeSettlement. | Autorización de aplicación independiente de UI; claves de operación y pruebas de reintento. |
| A05 | P1 | El respaldo automático se copia antes del commit del cierre mediante Files.copy de la DB principal. No garantiza incluir el cierre o WAL. | `settlement/application/SettlementUseCase.java`, createBackup en closeSettlement; `infrastructure/backup/DatabaseBackupService.java`, createBackup. | Snapshot consistente SQLite tras commit; probar recuperación real y PRAGMA integrity_check. |
| A06 | P1 | Cancelar cartulina migrada sin desembolso original usa principal como reintegro; puede crear caja sin devolución real. | `loans/application/CancelLoanUseCase.java`, fallback por principal; `loans/application/CreateLoanUseCase.java`, rama isMigration sin desembolso. | Diferenciar migración de desembolso real y exigir corrección trazable; probar migración → cancelación. |
| A07 | P2 | Si no existe DB, backup crea archivo de texto con extensión .db y lo lista como copia. Sin verificación ni restauración implementada en ese servicio. | `infrastructure/backup/DatabaseBackupService.java`, placeholder y listBackups. | Fallar de forma explícita; verificar formato/integridad antes de ofrecer respaldo recuperable. |
| A08 | P2 | Reversión borra asignaciones originales; no bloquea reversar pagos de créditos ya renovados. Puede reabrir saldos del anterior sin ajustar el nuevo. | `payments/application/ReversePaymentUseCase.java`, delete de allocations y actualización de cuotas. | Conservar asignaciones originales y registrar compensación; definir corrección de crédito renovado sin reescribir historia. |

Las ubicaciones abreviadas de A02–A08 están bajo `desktop/src/main/java/com/cartera/`.

## Controles existentes observados

- Montos de servicios revisados usan BigDecimal. Payment y PaymentAllocation se persisten separadamente en transacción.
- CashMovementUseCase valida sesión ADMIN/SUPERVISOR y permite identificar reintentos.
- Reversión y cancelación exigen rol/motivo y generan auditoría y compensación de caja.
- La liquidación tiene unicidad por sesión, bloquea cierres repetidos y DailySettlementEntity no ofrece setters.
- LAN limita tamaño y frecuencia. El PIN opcional de oficina no sustituye autorización individual del cobrador.

## Orden sugerido de siguientes entregas

1. A01–A03: importación, identidad de cuotas y separación efectivo/digital, con escenarios equivalentes al escritorio.
2. A04, A06 y A08: permisos, idempotencia y correcciones financieras conservando historia.
3. A05 y A07: respaldo/restauración consistente y ensayo de recuperación antes de distribuir.

Esta entrega implementa el resumen y la paridad de nuevas renovaciones nativas. Los hallazgos anteriores son resultado de la auditoría solicitada, no cambios ya implementados.
