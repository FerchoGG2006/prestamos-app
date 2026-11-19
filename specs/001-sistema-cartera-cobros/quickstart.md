# Quickstart & Validation Guide: Sistema de Cartera y Cobros

## 1. Requisitos de Desarrollo
- **Sistema Operativo**: Windows 10 / 11 (x64).
- **JDK**: Eclipse Temurin JDK 21 LTS (`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`).
- **Build Tool**: Gradle Wrapper incluido (`.\gradlew.bat`).

## 2. Ejecución de Pruebas Automatizadas (Verificación de Dominio y Persistencia)
Desde la raíz del proyecto o dentro de `desktop/`:
```powershell
cd C:\Users\ASUS\prestamos-app-1\desktop
.\gradlew.bat test --console=plain
```
Verifica:
- `LoanCalculatorTest`: Cálculo de interés plano, generación de cuotas, distribución de pagos parciales/múltiples y renovaciones con papelería.
- `RecordPaymentUseCaseTest` & `PaymentApplicationServiceTest`: Persistencia separada de `Payment` y `PaymentAllocation`, actualización de cuotas y clave de idempotencia.
- `AuditFixesTest`: Reglas de auditoría, seguridad y validaciones financieras.
- `CurrencyInputUtilTest`: Formateo y parseo de moneda sin pérdida de precisión.
- `CarteraInfrastructureApplicationTest`: Arranque del contexto Spring Boot + SQLite + Flyway.

## 3. Ejecución en Modo Desarrollo (JavaFX Desktop)
```powershell
cd C:\Users\ASUS\prestamos-app-1
.\ejecutar.bat
```

## 4. Generación de Instalador y Paquete Nativo Windows (`jpackage`)
```powershell
cd C:\Users\ASUS\prestamos-app-1
.\empaquetar-windows.bat
```
Artefactos resultantes:
- Ejecutable nativo autocontenido: `dist/SistemaCartera/SistemaCartera.exe`
- Paquete portable ZIP: `dist/SistemaCartera-v1.0.0-Windows-x64.zip`
- Instalador oficial Windows: `dist/Instalador-SistemaCartera-v1.0.0.exe`
