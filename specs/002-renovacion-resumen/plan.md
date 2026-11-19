# Implementation Plan: Auditoría y resumen de renovación

**Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

## Summary

Implementar vista previa nativa en RenewLoanDialog, compartiendo un cálculo BigDecimal con RenewLoanUseCase; separar egresos del neto y papelería. Auditoría estática de los otros flujos documentada aparte, sin ampliar silenciosamente las reglas.

## Technical Context

Java 21, JavaFX 21, Spring Boot local, JPA/SQLite/Flyway; JUnit 5 y Gradle. Sin dependencias nuevas ni UI web. Escala: una renovación y su ruta por confirmación. La vista previa es de solo lectura y la confirmación revalida el estado.

## Constitution Check

- UI solo JavaFX; todo monto usa BigDecimal/Money y redondeo integral existente.
- Registro atómico con auditoría; autorización por sesión y ruta; unicidad por crédito anterior con Flyway e idempotencia natural.
- No se alteran liquidaciones cerradas ni datos históricos. Se bloquean renovaciones que afectarían la jornada actual cerrada.
- No se añade Payment por compensación. No se modifica mora.
- Verificar compileJava y test antes de entrega; sin empaquetar ni publicar.
- Brechas previas de otros flujos se evidencian en audit.md, sin declarar conformidad global.

## Project Structure

- desktop/src/main/java/com/cartera/renewals/domain/RenewalCalculator.java: cálculo compartido y proyección.
- desktop/src/main/java/com/cartera/renewals/application/RenewLoanUseCase.java: preview, autorización, replay y validación de snapshot.
- desktop/src/main/java/com/cartera/ui/views/RenewLoanDialog.java: resumen dinámico, tasa total del plazo y confirmación explícita.
- desktop/src/main/java/com/cartera/infrastructure/persistence/repository/RenewalRepository.java y db/migration/V2__unique_renewal_per_loan.sql: unicidad.
- desktop/src/test/java/com/cartera/renewals/: pruebas puras y de integración aisladas.

## Design Decisions

La identidad natural de la renovación es el crédito anterior (solo se renueva una vez). Replay exige mismos términos y devuelve el resultado persistido. Una restricción única impide duplicados concurrentes; la contención SQLite puede requerir reintento.

La vista previa usa los indicadores de la misma ruta del crédito, nunca el filtro global. Los montos se normalizan a pesos enteros y se compara el snapshot nuevamente antes de escribir. La papelería se registra como EGRESO/PAPELERIA_RENOVACION separado de DESEMBOLSO_RENOVACION.

El resumen muestra negativos con advertencia, sin inventar una regla nueva de préstamo por saldo insuficiente. No corrige operaciones históricas. No garantiza separar efectivo y digital porque el libro actual los agrupa; la auditoría registra esa limitación.
