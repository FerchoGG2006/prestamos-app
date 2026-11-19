# Data Model: Sistema de Cartera y Cobros

## 1. Entidades Principales (`desktop/src/main/java/com/cartera/infrastructure/persistence/entity/`)

| Entidad JPA | Tabla SQLite | Campos Clave y Restricciones |
|---|---|---|
| `AppUserEntity` | `app_user` | `id` (PK), `username` (UNIQUE), `display_name`, `role` (`ADMIN`, `COLLECTOR`), `active` |
| `RouteEntity` | `route` | `id` (PK), `code` (UNIQUE), `name`, `collector_user_id` (FK `app_user`), `active` |
| `CustomerEntity` | `customer` | `id` (PK), `document_number` (UNIQUE), `full_name`, `phone`, `address`, `route_id` (FK `route`), `status` |
| `LoanEntity` | `loan` | `id` (PK), `code` (UNIQUE), `customer_id` (FK), `route_id` (FK), `principal_amount` (`BigDecimal`), `interest_rate` (`BigDecimal`), `interest_amount` (`BigDecimal`), `total_amount` (`BigDecimal`), `paid_amount` (`BigDecimal`), `balance_amount` (`BigDecimal`), `installments_count`, `frequency`, `loan_type` (`NUEVO`, `RENOVACION`), `previous_loan_id`, `status` (`ACTIVO`, `PAGADO`, `RENOVADO`, `ANULADO`) |
| `InstallmentEntity` | `installment` | `id` (PK), `loan_id` (FK `loan`), `installment_number`, `due_date` (`LocalDate`), `expected_amount` (`BigDecimal`), `paid_amount` (`BigDecimal`), `pending_amount` (`BigDecimal`), `status` (`PENDIENTE`, `PARCIAL`, `PAGADA`, `ADELANTADA`, `VENCIDA`) |
| `PaymentEntity` | `payment` | `id` (PK), `loan_id` (FK), `customer_id` (FK), `route_id` (FK), `collection_session_id` (FK), `amount` (`BigDecimal`), `payment_method`, `idempotency_key` (UNIQUE NOT NULL), `notes`, `created_at` |
| `PaymentAllocationEntity` | `payment_allocation` | `id` (PK), `payment_id` (FK `payment`), `installment_id` (FK `installment`), `allocated_amount` (`BigDecimal` > 0) |
| `RenewalEntity` | `renewal` | `id` (PK), `previous_loan_id` (FK), `new_loan_id` (FK), `new_principal_amount` (`BigDecimal`), `deducted_previous_balance` (`BigDecimal`), `stationery_fee` (`BigDecimal`), `net_cash_delivered` (`BigDecimal`), `created_at` |
| `PaymentPromiseEntity` | `payment_promise` | `id` (PK), `loan_id` (FK), `customer_id` (FK), `promised_date` (`LocalDate`), `promised_amount` (`BigDecimal`), `status` (`PENDIENTE`, `CUMPLIDA`, `INCUMPLIDA`, `CANCELADA`), `notes` |
| `CollectionSessionEntity` | `collection_session` | `id` (PK), `route_id` (FK), `collector_user_id` (FK), `session_date` (`LocalDate`), `expected_amount` (`BigDecimal`), `collected_amount` (`BigDecimal`), `status` (`ABIERTA`, `CERRADA`) |
| `CashMovementEntity` | `cash_movement` | `id` (PK), `route_id` (FK), `collection_session_id` (FK), `movement_type` (`ENTRADA`, `SALIDA`, `AJUSTE`), `category`, `amount` (`BigDecimal`), `reference_id`, `description`, `created_at` |
| `DailySettlementEntity` | `daily_settlement` | `id` (PK), `route_id` (FK), `collection_session_id` (FK), `settlement_date` (`LocalDate`), `expected_cash` (`BigDecimal`), `counted_cash` (`BigDecimal`), `difference_amount` (`BigDecimal`), `discrepancy_reason`, `status` (`CERRADA`), `closed_at` |
| `AuditLogEntity` | `audit_log` | `id` (PK), `actor_username`, `entity_type`, `entity_id`, `action`, `summary`, `created_at` |
| `SystemSettingEntity` | `system_setting` | `setting_key` (PK), `setting_value`, `updated_at` |

## 2. Invariantes de Dominio

1. **Suma exacta de asignaciones**: `PaymentEntity.amount == sum(PaymentAllocationEntity.allocatedAmount)`.
2. **Idempotencia estricta**: Índice único sobre `payment.idempotency_key`; si ya existe un pago con la misma clave, se retorna el resultado previo sin duplicar cargos ni movimientos de caja.
3. **Renovación transparente**: `net_cash_delivered = new_principal_amount - deducted_previous_balance - stationery_fee`.
4. **Inmutabilidad de liquidación cerrada**: Un registro en `daily_settlement` con estado `CERRADA` no puede editarse ni borrarse; si `counted_cash != expected_cash`, `discrepancy_reason` es obligatorio.
