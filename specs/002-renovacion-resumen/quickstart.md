# Validation

Desde la raíz: `.\gradlew.bat :desktop:compileJava :desktop:test`.

La configuración de tests usa SQLite temporal y clientes ficticios; nunca la base real de oficina.

Caso: Base 500.000, cartera 620.000, nuevo capital 700.000, tasa total 40%, dos cuotas mensuales, papelería 35.000. Preview y guardado: neto 45.000, Base 420.000, cartera 980.000, Administrativo 1.400.000. Compensación no suma recaudo. Cada cuota debe sumar al nuevo total 980.000.

Verificar consulta sin writes, replay, cambio de condiciones, saldo desactualizado, papelería cero, importes inválidos, autorización, jornada cerrada y rollback ante fallo de auditoría.

Para inspección manual aislada, lanzar JavaFX con datasource temporal/demo, abrir Clientes o Préstamos y Renovar. No registrar operaciones en base real para probar. No publicar ni reemplazar instaladores en esta entrega.

Demo reproducible con el caso exacto ya cargado: `.\gradlew.bat :desktop:renewalPreviewDemo --offline`. Abre únicamente el diálogo nativo contra una nueva SQLite temporal, identificado como DEMO AISLADA. Cerrar la ventana termina la demo.

Si un saldo histórico o agregado de la ruta contiene fracciones de peso, el resumen rechaza la renovación para revisión; no redondea silenciosamente ni altera el saldo. Los calendarios existentes pueden generar centavos y necesitan una decisión global de precisión en una entrega posterior.
