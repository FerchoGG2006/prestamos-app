# Modelo de dominio objetivo

## Convenciones

- Identificadores: UUID; cada operación sincronizable tendrá también una clave idempotente única.
- Dinero: `BigDecimal`, con una escala y regla de redondeo centralizadas. Nunca `double`/`float`.
- Fechas: `LocalDate`; instantes auditables: `Instant`/UTC.
- Operaciones financieras: no se eliminan físicamente; se anulan, cancelan o corrigen con motivo y auditoría.

## Entidades

| Entidad | Responsabilidad y relaciones principales |
|---|---|
| `User` | Credenciales, estado y roles. Un cobrador puede estar asociado a rutas. |
| `Role` / permiso | Autoriza operaciones en la capa de aplicación, no sólo en UI. |
| `Customer` | Persona atendida; pertenece a una ruta actual y un cobrador actual; tiene referencias, créditos, promesas e historial. |
| `CustomerReference` | Referencia personal de un cliente. |
| `Route` | Ruta de recaudo; relaciona cobrador, clientes, créditos, jornadas y liquidaciones. Los cambios de ruta conservan historial. |
| `Loan` | Crédito nuevo o renovación; contiene capital inicial, interés, total, frecuencia, fechas, estado, ruta, cobrador y crédito anterior opcional. |
| `Installment` | Cuota numerada de un crédito: fecha, valor, abonado, pendiente y estado. |
| `Payment` | Evento de dinero recibido; pertenece a cliente, crédito, cobrador y jornada; tiene método, estado e idempotencia. |
| `PaymentAllocation` | Aplicación explícita de un `Payment` a una `Installment`. Un pago puede tener varias asignaciones. |
| `DelinquencyRecord` | Registro factual de vencimiento/mora. El cálculo del recargo depende de una estrategia configurada pendiente. |
| `PaymentPromise` | Compromiso de pago de cliente/crédito con fecha, monto, estado y observación. |
| `Renewal` | Vincula crédito anterior y nuevo; guarda capital nuevo, saldo deducido, papelería y efectivo realmente desembolsado. |
| `CollectionSession` | Jornada diaria de una ruta/cobrador: apertura/cierre, esperado, realizado y métricas operativas. |
| `CashMovement` | Entrada, salida o ajuste de dinero físico/registrado, con referencia a la operación originadora. |
| `DailySettlement` | Liquidación inmutable de una jornada; separa recaudo, colocación, desembolsos y arqueo. |
| `WeeklySettlement` | Consolidado de liquidaciones diarias, filtrable por fecha, ruta y cobrador. |
| `AuditLog` | Trazabilidad de acción, actor, fecha, entidad, antes/después y motivo. |
| `SystemSetting` | Parámetros comerciales y técnicos versionables: interés, papelería, calendario y futura estrategia de mora. |
| `SyncOperation` | Cola local de cambios: operación, agregado, payload, idempotency key, estado, reintentos y auditoría. |

## Relaciones

```text
User ──< UserRole >── Role
User (cobrador) ──< Route ──< Customer ──< CustomerReference
Customer ──< Loan ──< Installment
Loan ──< Payment ──< PaymentAllocation >── Installment
Loan ──0..1 Renewal (anterior) ──1 Loan (nuevo)
Route + User ──< CollectionSession ──0..1 DailySettlement ──< WeeklySettlement
CollectionSession ──< Payment / CashMovement
Customer + Loan ──< PaymentPromise / DelinquencyRecord
Toda operación financiera ──< AuditLog / SyncOperation
```

## Estados confirmados

| Concepto | Estados |
|---|---|
| Cuota | `PENDIENTE`, `PARCIAL`, `PAGADA`, `ADELANTADA`, `VENCIDA` |
| Promesa | `PENDIENTE`, `CUMPLIDA`, `INCUMPLIDA`, `CANCELADA` |
| Jornada | `ABIERTA`, `CERRADA` |
| Movimiento de caja | `ENTRADA`, `SALIDA`, `AJUSTE` |
| Tipo de préstamo | `NUEVO`, `RENOVACIÓN` |

Los estados definitivos de crédito, pago, liquidación, sincronización y usuario se concretarán durante la especificación de cada agregado, conservando cancelación/anulación/corrección con auditoría.

## Invariantes esenciales

1. `Payment.amount` es la suma exacta de sus `PaymentAllocation` (salvo un futuro manejo explícito de saldo no aplicado, si se aprueba).
2. Una asignación no supera el pendiente de la cuota y nunca reduce pagos acumulados existentes.
3. Una cuota parcial sigue siendo la misma cuota; no se crea otra.
4. Una renovación conserva el capital completo del crédito nuevo y separa deducciones del efectivo entregado.
5. Una liquidación cerrada es inmutable; las correcciones se registran como ajuste/auditoría.
6. Si el arqueo tiene diferencia, su explicación es obligatoria.
7. La misma idempotency key no puede generar dos movimientos financieros.

