# Validación y convergencia — 2026-11-17

## Resultado de la entrega

FR-001–FR-007 y SC-001–SC-004 implementados o documentados según su alcance. Auditoría del resto del producto en [audit.md](audit.md). No se publicó, empaquetó ni modificó la base real de oficina.

## Evidencia

- Gradle `:desktop:compileJava :desktop:test --offline`: compilación y 25 pruebas exitosas durante la implementación. Se verificaron el caso exacto, snapshot desactualizado, autorización, replay, fallo de auditoría, papelería cero y cierres.
- Después de la revisión final se añadieron neto cero, caja negativa, agregados fraccionarios y varias sesiones en ruta/fecha. El código final completo (main y test) compiló con `javac` Java 21.
- Suite final ejecutada con JUnit Platform Launcher, Mockito como javaagent y dependencias binarias locales (sin sources/javadoc ni versiones duplicadas por artefacto), resources de pruebas antes que resources de aplicación: **29 pruebas iniciadas, 29 exitosas, cero fallos/abortadas/omitidas**, exit 0.
- Evidencia reproducible de esa ejecución en `desktop/build/isolated-validation/javac-final.args`, `java-final.args` y `results.log` (archivos locales ignorados por Git). La configuración de tests utiliza SQLite temporales.
- Se intentó repetir Gradle tras los últimos casos: la revisión automática del permiso expiró antes de ejecutar el comando. La alternativa con caché aislada no pudo conectar al daemon por la restricción de sockets del sandbox; por eso se usó javac/JUnit directamente. Antes de empaquetar, repetir el comando Gradle normal en el IDE.
- Demo JavaFX real abierta con una DB temporal: CUA verificó capital 700.000, tasa TOTAL 40%, 2 cuotas MENSUAL, saldo 620.000, papelería 35.000, neto 45.000, nueva deuda 980.000; tabla antes/después: Base 500.000 → 420.000, cartera 620.000 → 980.000, Administrativo 1.120.000 → 1.400.000. Se cerró sin confirmar una operación.
- `git diff --check`: sin errores de whitespace; avisos de normalización LF/CRLF propios del repositorio.

## Revisión adicional

Dos hallazgos nuevos de la revisión se corrigieron y cubrieron con pruebas:

1. Money redondea a pesos enteros; los datos previos pueden contener centavos. Se rechazan explícitamente saldos/agregados fraccionarios en vez de convertirlos y persistir una renovación inconsistente. No se reescribe la historia.
2. Una ruta/fecha puede tener varias sesiones. Se consulta lista y se comprueba cualquier cierre del cobrador asignado en esa ruta/fecha, sin asumir unicidad ni bloquear por la sesión de otro cobrador.

## Convergencia

Revisados 7 requisitos funcionales, 4 criterios de éxito, los escenarios y casos límite del spec, las decisiones de plan y los 8 tasks de esta entrega. No quedan faltantes dentro del alcance de resumen y nuevas renovaciones; tasks.md se conserva sin fase vacía de convergencia.

La conformidad es de esta entrega acotada. Los 8 hallazgos previos del producto, la separación efectivo/digital, las renovaciones importadas y la recuperación de respaldos permanecen pendientes como indica audit.md. El motor de cuotas que genera centavos también requiere revisión transversal. No implica aprobación de producción.
