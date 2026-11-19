# Bug Assessment: Fallo de inicio JavaFX por curva de animación

- Slug: javafx-motion-startup (derivado del fallo encontrado durante la prueba operativa autorizada).
- Created: 2026-11-17
- Source: ejecución aislada de OfficeQaLauncher.
- Verdict: valid
- Severity: critical

## Symptom and Reproduction

Abrir CarteraApplication mediante el launcher de QA contra SQLite aislada. La aplicación termina antes del login: ExceptionInInitializerError, causada por IllegalArgumentException: Control point coordinates must all be in range [0,1].

## Root Cause

MotionUtil.OVERSHOOT llama Interpolator.SPLINE(0.34, 1.56, 0.64, 1.0). JavaFX exige los cuatro valores dentro de [0,1]; inicializar cualquier utilidad de movimiento falla.

## Preferred Remediation

Usar una curva válida (0.34, 1.0, 0.64, 1.0); el feedback de escala existente sigue funcionando. Añadir prueba de inicialización de MotionUtil y reabrir aplicación real. No cambiar reglas financieras.
