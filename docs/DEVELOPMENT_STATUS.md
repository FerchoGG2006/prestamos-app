# Estado de desarrollo

**Actualizado:** 2026-10-11

| Fase | Estado | Evidencia |
|---|---|---|
| 0. Auditoría | Completada | `PROJECT_AUDIT.md`, `DOMAIN_MODEL.md`, `BUSINESS_RULES.md` |
| 1. Base Java / JavaFX | Completada | `desktop/build.gradle`, `CarteraApplication`, tema nativo y Spring Boot 3.4 sin web |
| 2. Modelo de datos y Persistencia | Completada | Flyway `V1__initial_financial_schema.sql`, entidades JPA (`AppUser`, `Route`, `Customer`, `Loan`, `Installment`, `Payment`, `PaymentAllocation`, `CollectionSession`, `CashMovement`) y repositorios SQLite |
| 3. Flujo financiero de Cobros | Completada | `RecordPaymentUseCase` transaccional con asignación inmutable, idempotencia, actualización de cuotas, finalización de crédito y movimiento de caja |
| 4. Inicializador de datos semilla | Completada | `DataInitializer` carga ruta, usuario, clientes y créditos iniciales realistas si la BD está vacía |
| 5. Interfaz Operativa JavaFX | Completada | Vistas interactivas conectadas: `DashboardView` con métricas en vivo, `TodayCollectionsView` con tabla de cobros y búsqueda, `PaymentDialog` modal para cobro con 1-clic, `CustomersView` y `LoansView` |
| 12. Reportes | Pendiente | — |
| 13. Offline y sincronización | Diseñado | Tabla `sync_operation` y base SQLite local activa |
| 14. Testing | Completado | JUnit 5 y SpringBootTest: `LoanCalculatorTest`, `PaymentApplicationServiceTest`, `CarteraInfrastructureApplicationTest`, `RecordPaymentUseCaseTest` |
| 15. Packaging Windows | Pendiente | Requiere configuración final con `jpackage` |

## Validación de entorno

- **JDK 21 LTS**: Eclipse Temurin 21.0.12.1 instalado y verificado.
- **Gradle**: Wrapper 8.10+ ejecutando pruebas limpias (`BUILD SUCCESSFUL`).
- **Ejecución de la app**:
  - Directo por script: `ejecutar-java.bat` o `iniciar-cartera.vbs`.
  - Vía Gradle: `./gradlew run` desde la carpeta `desktop`.
