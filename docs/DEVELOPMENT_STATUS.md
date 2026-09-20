# Estado de desarrollo

**Actualizado:** 2026-09-20

| Fase | Estado | Evidencia |
|---|---|---|
| 0. Auditoría | Completada | `PROJECT_AUDIT.md`, `DOMAIN_MODEL.md`, `BUSINESS_RULES.md` |
| 1. Base Java / JavaFX | Iniciada | `desktop/build.gradle`, `CarteraApplication`, tema nativo y Spring sin web |
| 2. Modelo de datos | Iniciado | Migración Flyway `V1__initial_financial_schema.sql` |
| 3–11. Flujos financieros y operación | Pendiente | Requiere repositorios, casos de uso y pantallas JavaFX conectadas |
| 12. Reportes | Pendiente | — |
| 13. Offline y sincronización | Diseñado, no implementado | Tabla `sync_operation`; faltan cola/motor/protocolo central |
| 14. Testing | Iniciado | JUnit para interés y asignación de pagos |
| 15. Packaging Windows | Pendiente | Requiere JDK 21 y `jpackage` en el equipo de compilación |

## Próximo incremento

Implementar `Customer`, `Loan`, `Installment`, `Payment` y `PaymentAllocation` como entidades/repositorios SQLite, con transacciones e idempotencia, y conectar el flujo JavaFX **Cobros de hoy → Registrar pago → Confirmar → Volver a ruta**.

## Validación pendiente de entorno

La máquina actual no tiene `java`, `gradle` ni `jpackage` disponibles en `PATH`; por ello no se ejecutó compilación. Cuando se disponga de JDK 21 LTS y Gradle 8.10+, ejecutar desde `desktop`:

```powershell
gradle test
gradle run
```
