# Tasks: Auditoría y resumen de renovación

## Phase 1: Setup

- [x] T001 Documentar alcance, reglas y aclaraciones en specs/002-renovacion-resumen/spec.md y plan.md.

## Phase 2: User Story 1

- [x] T002 [US1] Añadir pruebas del caso exacto y límites en desktop/src/test/java/com/cartera/renewals/domain/RenewalCalculatorTest.java.
- [x] T003 [US1] Compartir cálculo y proyección monetaria en desktop/src/main/java/com/cartera/renewals/domain/RenewalCalculator.java.
- [x] T004 [US1] Añadir integración de preview, autorización, replay, rollback y saldo desactualizado en desktop/src/test/java/com/cartera/renewals/application/RenewLoanUseCaseTest.java.
- [x] T005 [US1] Implementar preview y guardado coherente, dos egresos, autorización y unicidad en desktop/src/main/java/com/cartera/renewals/application/RenewLoanUseCase.java y repository/RenewalRepository.java; migración V2__unique_renewal_per_loan.sql.
- [x] T006 [US1] Mostrar resumen y confirmación nativa en desktop/src/main/java/com/cartera/ui/views/RenewLoanDialog.java.

## Phase 3: User Story 2

- [x] T007 [US2] Registrar hallazgos con referencias, prioridad y límites en specs/002-renovacion-resumen/audit.md.

## Phase 4: Validation

- [x] T008 Compilar y ejecutar suite Java en desktop; registrar resultado y convergencia en specs/002-renovacion-resumen/validation.md.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T008. T007 es independiente de implementación de UI; auditoría revisada en T008. MVP: US1.
