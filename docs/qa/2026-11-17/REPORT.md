# Prueba operativa JavaFX — 17 de noviembre de 2026

## Estado después de las correcciones

Los 11 fallos reproducidos se corrigieron y verificaron: **35/35 escenarios y 41 pruebas de regresión**, todos aprobados. Detalles, comportamiento final y límites en [POST-FIX.md](POST-FIX.md). No se publicó en producción ni se modificó la base real.

## Resultado de la auditoría inicial (antes de corregir)

La aplicación todavía presenta fallas reproducidas que impiden considerar verificados todos los flujos para producción. Jornada diagnóstica: **35 escenarios, 24 PASS y 11 FAIL**. Son 11 comprobaciones fallidas, algunas comparten causa (por ejemplo efectivo y arqueo digital).

La suite de regresión convencional pasó **30 pruebas, cero fallos ni errores**, con `gradlew :desktop:compileJava :desktop:test --offline`. Esa suite no cubría todas las brechas; por eso no equivale a una jornada operativa sin fallas.

## Prueba manual de la aplicación real

Se ejecutó la aplicación completa JavaFX con un launcher que fuerza `user.home`, SQLite y respaldos a una carpeta nueva bajo `desktop/build/qa`. Los usuarios, clientes y números usados son ficticios. No se utilizó la base de oficina real ni se publicó en producción.

1. Se comprobó el rechazo de credenciales incorrectas y el acceso del administrador ficticio.
2. Se registró **QA Ana Cliente Ficticio**, documento de prueba 990000001, en QA NORTE, desde la pantalla de clientes.
3. Se concedió su primer crédito: capital 300.000, interés 20%, papelería 15.000, neto 285.000, deuda 360.000, 30 cuotas de 12.000.
4. Desde Supervisión de Cobros se registró un abono parcial de **5.000 en efectivo**. El recibo mostró **saldo restante 355.000**. La base confirmó Payment APLICADO y el saldo de cuotas exacto.
5. Se liquidó la jornada por 5.000 entregados, diferencia cero. La UI mostró **LIQUIDADA / CERRADA**, mensaje de éxito y botón de cierre deshabilitado; SQLite confirmó un registro CERRADO por 5.000.
6. Se revisaron las pantallas de reportes y auditoría: figuran LOGIN, CREAR_CLIENTE, REGISTRAR_COBRO, LIQUIDACION_DIARIA_CERRADA y CREAR_BACKUP.
7. Se revisaron las opciones de configuración/respaldos. El respaldo automático generado por ese cierre contenía **cero cierres**, aunque la base original ya tenía uno: fallo confirmado también fuera del runner diagnóstico.

El formulario de gasto se abrió y se cerró sin guardar durante la prueba manual; su registro y bloqueo tras cierre se verificaron mediante servicios reales en la jornada automática. No se debe describir ese gasto como guardado desde la UI.

Base UI de evidencia: `desktop/build/qa/ui-office-10210455390650594616/.sistema-cartera/cartera.db`. Base diagnóstica final: `desktop/build/qa/service-journey-1517164280169072492/.sistema-cartera/cartera.db`. Son artefactos locales ignorados por Git. La corrida diagnóstica guardó 20+ clientes ficticios, créditos, pagos, movimientos y un cierre; no son mocks de repositorios.

## Fallas reproducidas y prioridad

| Escenario | Prioridad | Esperado | Observado |
|---|---|---|---|
| QA-11: Nequi y efectivo | Alta | Un cobro digital no incrementa efectivo físico | Un cobro Nequi de 10.000 incrementó el saldo de caja en 10.000 |
| QA-12: cobro sin sesión | Alta | Rechazo antes de escribir | El servicio aceptó y persistió el cobro suministrando un cobrador válido |
| QA-14: historial del reverso | Alta | Conservar las imputaciones originales | Se borraron PaymentAllocation al anular |
| QA-18: identidad de cuota móvil | Alta | Cobrar una cuota con ID textual móvil | UUID.fromString lanzó UUID string too large |
| QA-23: cancelar migración | Alta | Sin ingreso de efectivo si no hubo desembolso real | La caja pasó de 2.000.000 a 2.300.000 al cancelar una cartulina migrada |
| QA-24: tasa y deuda inconsistente | Alta | Rechazar principal 300.000, tasa 20% y deuda 400.000 | El servicio aceptó términos contradictorios |
| QA-25: renovación importada | Alta | Descontar 340.000 de Base (305.000 neto + 35.000 papelería) | La caja permaneció en -285.000 en lugar de -625.000; la importación sí guardó la renovación |
| QA-26: jornada de segunda ruta | Alta | Sesión en route-sur | Se creó en route-norte para su cobrador |
| QA-28: arqueo digital | Alta | Efectivo esperado 395.000, sin el Nequi | Mostró 405.000 |
| QA-32: respaldo automático de cierre | Alta | Recuperar el cierre recién confirmado | La copia no contenía ese cierre |
| QA-33: cobro después del cierre | Alta | No introducir nuevos cobros en la jornada cerrada sin corrección explícita | El servicio aceptó otro cobro con la fecha cerrada |

Evidencia completa por escenario en [journey-results.json](journey-results.json). Referencias de código y otras brechas de auditoría en [la auditoría financiera](../../../specs/002-renovacion-resumen/audit.md).

## Fallo de arranque corregido para continuar

Se reprodujo un cierre antes del login por `MotionUtil.OVERSHOOT`: la spline de JavaFX usaba 1.56, fuera de su rango permitido. Se corrigió a 1.0 y se añadió MotionUtilTest. Después arrancó la aplicación completa y se completó el flujo manual anterior. Este fue el único cambio de comportamiento realizado durante la auditoría inicial, antes de la tanda de correcciones documentada en POST-FIX.md.

## Cobertura y límites

- Ejecutados con persistencia real aislada: altas, validaciones, cronograma, abonos parciales, adelantados y totales, reintentos, reversos, caja, renovación nativa, importación de renovación, cancelación normal y migrada, historial, exportación móvil, Excel, gastos, arqueo, cierre y respaldos.
- La cuota móvil de QA-18 se preparó con el formato de identidad usado por el generador móvil. Ese escenario no pretende ser una sincronización física; QA-25 sí ejecuta importPackage con un paquete de renovación real.
- Pendientes de aceptación externa: sincronización LAN con un teléfono real, envíos por WhatsApp, apertura de mapas, impresión y ejecución de un instalador en otro PC. No se enviaron mensajes a terceros.
- Restauración completa de una oficina desde respaldo: no verificada. Se comprobó integridad de una copia manual y se detectó la omisión de cierre en la automática; eso no acredita recuperación completa.
- Configuración y credenciales: se inspeccionaron sus pantallas, pero no se cambiaron contraseñas ni se certificaron todas las combinaciones de parámetros.
- Rol cobrador: verificado visualmente en otra oficina ficticia nueva. `qacobrador` inició sesión como COBRADOR QA NORTE; el menú mostró únicamente Mi Ruta de Hoy, Mis Clientes e Historial Crediticio, y el selector quedó deshabilitado en Mi Ruta: QA NORTE. Se verificó la presentación y selección de ruta; esto no acredita autorización de todos los servicios, cuyo fallo de cobro sin sesión se reprodujo en QA-12.

## Repetir las pruebas

Desde la raíz del repositorio:

```powershell
.\gradlew.bat :desktop:officeQa --offline
.\gradlew.bat :desktop:officeJourneyQa --offline
.\gradlew.bat :desktop:compileJava :desktop:test --offline
```

`officeQa` abre una oficina ficticia nueva: usuario **qaadmin** o **qacobrador**, clave de prueba **QaLocal2026!**. No son credenciales de producción. `officeJourneyQa` crea otra base nueva y escribe journey-results.json; devuelve código **2 si hay fallas** para evitar un resultado engañosamente verde. La suite convencional es independiente del runner diagnóstico.

## Tratamiento posterior

Las correcciones y la repetición de escenarios se completaron en esta misma fecha. Véase [POST-FIX.md](POST-FIX.md). Las aceptaciones externas enumeradas siguen pendientes.
