# Reglas de negocio

## Reglas confirmadas

### Créditos e interés

- El interés se calcula sobre el capital inicial, no sobre el saldo.
- La tasa comercial actual es 20%, pero debe persistirse como configuración, no como constante de negocio.
- `interés = capital inicial × tasa`; `total pactado = capital inicial + interés`.
- Un crédito puede ser `NUEVO` o `RENOVACIÓN` y conserva vínculo con el crédito anterior cuando aplica.

### Cuotas y pagos

- Cada cuota tiene número, fecha, valor, abonado, pendiente y estado.
- Un pago parcial actualiza la misma cuota a `PARCIAL`; no crea ni elimina cuotas.
- Un pago puede cubrir varias cuotas; se crean asignaciones explícitas a cada cuota cubierta.
- Si se cubre una cuota futura, debe marcarse `ADELANTADA`; no debe cobrarse de nuevo.
- Las operaciones de pago deben ser idempotentes para impedir duplicación durante reintentos/sincronización.

### Renovación y papelería

- El capital del nuevo crédito es el monto solicitado completo, no el efectivo neto entregado.
- `efectivo entregado = capital nuevo − saldo anterior − papelería`.
- Capital nuevo, saldo anterior deducido, papelería y efectivo entregado se guardan por separado.
- La regla comercial actual de papelería es $5.000 por cada $100.000, pero debe ser configurable.

### Rutas, jornadas, caja y liquidación

- Ruta es una entidad de primer nivel con cobrador, clientes, créditos, jornadas, pagos, renovaciones y liquidaciones.
- Cambiar un cliente de ruta no elimina su historial.
- La jornada diaria se abre y cierra para una ruta/cobrador; registra esperado, realizado y actividad.
- Liquidación y arqueo son distintos: liquidación describe el movimiento de la ruta; arqueo, el efectivo físico.
- Una diferencia de arqueo requiere explicación.
- Una liquidación cerrada no se edita libremente.
- Caja registra entradas, salidas y ajustes; el capital pactado no se confunde con el dinero efectivamente desembolsado.

### Auditoría, seguridad y operación offline

- Toda operación financiera es trazable por usuario, fecha, entidad, acción, valores y motivo.
- No se eliminan silenciosamente operaciones financieras: usar anulación, cancelación o corrección auditada.
- El rol define la experiencia. No habrá selector de modo administrativo/cobrador visible en producción.
- La autorización se valida en servicios, además de ocultar acciones en UI.
- La aplicación funciona offline con SQLite local y cola de sincronización transaccional y auditable.

## Reglas pendientes — no implementar por inferencia

| Decisión | Pendiente de definir |
|---|---|
| Mora | Inicio, días de gracia, base, tasa/valor, topes, períodos y efecto de abonos parciales. |
| Papelería | Regla precisa de proporcionalidad y redondeo: proporcional, techo, piso u otra. |
| Calendario de cuotas | Día de inicio exacto, manejo de domingos/festivos y reglas por frecuencia. |
| Excedente de pago | Si un pago supera cuotas pendientes: crédito a favor, devolución, bloqueo u otra política. |
| Anulación / corrección | Quién puede hacerlo, ventanas de tiempo, contabilización de reversos y aprobación requerida. |
| Sincronización | Fuente de verdad ante conflicto, orden de aplicación, recuperación y política de reintento. |
| Identidad | Flujo de alta, recuperación, bloqueo y definición final de roles/permisos. |
| Reportes | Indicadores, formatos, períodos contables y exportaciones requeridas. |

## Comportamientos prohibidos

- Usar `double` o `float` para dinero.
- Inventar una fórmula de mora o activar una configuración hipotética.
- Duplicar pagos por reconexión o reintento.
- Reemplazar los assets existentes por placeholders durante la migración.
- Implementar la UI final como React, Electron, WebView, PWA, HTML/CSS, localhost o navegador embebido.

