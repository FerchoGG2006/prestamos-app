# Bug Verification: Inicio JavaFX

- Slug: javafx-motion-startup
- Tested: 2026-11-17
- Assessment: ./assessment.md
- Fix: ./fix.md
- Result: verified

## Checks

- Reproducción original: OfficeQaLauncher falló antes del login con ExceptionInInitializerError / coordenadas fuera de [0,1].
- Post-fix: aplicación completa abrió login; se inició sesión, creó cliente/crédito, cobró 5.000 y cerró una liquidación por 5.000 desde la UI, todo contra una oficina ficticia aislada.
- MotionUtilTest comprueba inicialización y extremos de la interpolación sin excepción.
- `gradlew :desktop:compileJava :desktop:test --offline`: BUILD SUCCESSFUL, 30 pruebas, cero fallos/errores.

## Limits

Este resultado verifica el fallo de arranque, no la salud de todos los procesos financieros. La jornada diagnóstica reprodujo 11 comprobaciones fallidas de 35: ver docs/qa/2026-11-17/REPORT.md y journey-results.json.
