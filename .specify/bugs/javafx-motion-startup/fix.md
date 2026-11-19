# Bug Fix: Inicio JavaFX

- Slug: javafx-motion-startup
- Fixed: 2026-11-17
- Assessment: ./assessment.md
- Status: applied

Se cambió exclusivamente el control inválido 1.56 por 1.0 en la spline de retorno. Se agregó MotionUtilTest para detectar el fallo de inicialización antes de abrir la UI. Verificación operativa en test.md al finalizar la jornada QA.
