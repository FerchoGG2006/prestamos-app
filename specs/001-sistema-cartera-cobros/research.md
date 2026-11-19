# Research & Architectural Decisions: Sistema de Cartera y Cobros

## 1. Runtime de Escritorio Nativo
- **Decision**: Java 21 LTS + JavaFX 21 empaquetado mediante `jpackage` con JRE embebido.
- **Rationale**: Cumple la regla absoluta de negocio de entregar un ejecutable nativo `.exe` para Windows sin requerir navegador, servidor web externo ni instalación previa de Java en las oficinas.
- **Alternatives considered**: Electron + Expo Web (descartado expresamente por la Constitución del proyecto y por depender de localhost/WebView).

## 2. Motor de Base de Datos y Migraciones
- **Decision**: SQLite local en `%USERPROFILE%\.sistema-cartera\cartera.db` con Spring Data JPA (Hibernate Community Dialects) y migraciones versionadas en Flyway (`V1__initial_financial_schema.sql`).
- **Rationale**: Permite operación 100% offline con transacciones ACID, respaldos de archivo único (`DatabaseBackupService`) y evolución controlada del esquema.
- **Alternatives considered**: AsyncStorage JSON plano (descartado por carecer de transacciones, claves foráneas, índices de idempotencia e integridad referencial).

## 3. Representación Monetaria e Imputación de Pagos
- **Decision**: Clase de valor `Money` sobre `BigDecimal` con escala fija `2` y `RoundingMode.HALF_UP`, persistiendo `PaymentEntity` y `PaymentAllocationEntity` en tablas separadas.
- **Rationale**: Evita errores de coma flotante binaria (`double`/`float`) y asegura que cada peso abonado quede trazado a la cuota exacta (`InstallmentEntity`) que cubre (`PARCIAL`, `PAGADA` o `ADELANTADA`).
- **Alternatives considered**: Columna JSON embebida en el pago (descartada por impedir consultas relacionales de auditoría por cuota).

## 4. Seguridad de Credenciales y Sincronización LAN
- **Decision**: Derivación `PBKDF2WithHmacSHA256` (sal de 128 bits, comparación en tiempo constante en `PasswordHasher`) y servidor HTTP embebido ligero (`com.sun.net.httpserver.HttpServer` en `LanSyncServerService`) exclusivo para sincronización JSON con dispositivos móviles en la red local de la oficina.
- **Rationale**: Permite que los cobradores sincronicen su ruta por Wi-Fi local sin exponer datos en la nube ni depender de internet, validando PIN de oficina (`X-Office-Sync-Pin`), límite de payload (2 MB) y rate-limiting por IP.
- **Alternatives considered**: Sincronización obligatoria por servidor en la nube (descartada como requisito bloqueante para garantizar autonomía offline en cada oficina).
