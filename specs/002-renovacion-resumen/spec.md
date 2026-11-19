# Feature Specification: Auditoría financiera y resumen previo de renovación

**Feature Branch**: rama actual (sin cambio de rama)
**Created**: 2026-11-17
**Status**: Ready for implementation
**Input**: Auditar los flujos financieros de escritorio y mostrar el resumen previo de renovación con las reglas validadas por el usuario.

## User Scenarios & Testing

### User Story 1 - Revisar antes de renovar (Priority: P1)

El operador revisa capital, saldo anterior, interés total del plazo, papelería, neto entregado y los indicadores antes y después de renovar. Cancelar no registra nada.

**Why this priority**: Evita aprobar una operación cuyos indicadores no coinciden con sus condiciones.
**Independent Test**: Base 500.000, cartera 620.000, nuevo capital 700.000, tasa total 40%, papelería 35.000: neto 45.000, Base final 420.000, cartera 980.000, Administrativo 1.400.000.

**Acceptance Scenarios**:
1. Given los valores del caso, When se revisa la operación, Then se muestran los importes anteriores sin persistir movimientos.
2. Given un resumen revisado, When se confirma, Then se registra exactamente ese resultado, con dos salidas separadas: neto y papelería.
3. Given un cambio de saldo o caja desde la vista previa, When se confirma, Then se rechaza y se exige revisar los valores actualizados.
4. Given una operación ya registrada, When se repite la misma solicitud, Then no se duplica; condiciones diferentes para el mismo crédito se rechazan.
5. Given una sesión sin permiso sobre el crédito, When se intenta renovar, Then no se escribe nada.

### User Story 2 - Conocer las brechas financieras (Priority: P2)

El responsable recibe un informe trazable sobre créditos, pagos, reversos, renovaciones, caja, cierres, sincronización y respaldos, con diferencias confirmadas y prioridades.

**Independent Test**: Cada hallazgo del informe identifica código, efecto y siguiente acción; distingue lo resuelto de lo pendiente.
**Acceptance Scenarios**:
1. Given el código actual, When termina la auditoría, Then se documentan las brechas sin afirmar que todo el producto está listo para producción.

### Edge Cases

- Capital o papelería negativos, capital cero, cuotas inválidas, tasa negativa, total pactado incompatible y desembolso negativo: rechazo previo a escritura.
- Papelería cero y neto cero: se muestran de forma explícita; las cantidades nunca se ocultan mediante truncamiento a cero.
- Cuotas con abonos parciales: se descuenta su saldo pendiente real.
- Cualquier fallo de auditoría o persistencia revierte toda la operación.

## Requirements

### Functional Requirements

- **FR-001**: La vista previa y el registro deben usar las mismas reglas: interés = capital × tasa total; deuda = capital + interés; neto = capital − saldo − papelería.
- **FR-002**: La Base disminuye neto + papelería; la cartera reemplaza saldo anterior por deuda nueva; el Administrativo aumenta solo el interés nuevo, sin otras operaciones.
- **FR-003**: Mostrar un resumen antes de confirmar, con alcance de ruta explícito y tasa identificada como total del plazo.
- **FR-004**: No persistir en la vista previa; revalidar saldo, caja y condiciones al confirmar.
- **FR-005**: Registrar salidas de neto y papelería por separado en una transacción con auditoría; no inventar un recaudo por la compensación.
- **FR-006**: Autorizar al usuario autenticado y evitar duplicación de la misma renovación.
- **FR-007**: Entregar una auditoría trazable de los flujos financieros, preservando datos y cierres existentes.

### Key Entities

- Resumen de renovación: términos, saldo compensado, neto, interés, indicadores antes/después y ruta.
- Renovación: vínculo entre crédito anterior y nuevo; el crédito anterior solo se renueva una vez.
- Movimiento: salida del neto o de papelería, vinculada al nuevo crédito.

## Success Criteria

### Measurable Outcomes

- **SC-001**: El caso exacto del usuario coincide en vista previa y datos persistidos, con cero pesos de diferencia.
- **SC-002**: Repetir una solicitud produce una sola renovación y un único conjunto de salidas.
- **SC-003**: Rechazar una vista previa desactualizada o una escritura fallida deja cero cambios parciales.
- **SC-004**: Todos los hallazgos de la auditoría contienen evidencia y prioridad.

## Assumptions

- Aclaraciones ya respondidas en esta conversación: 20% mensual por dos meses se ingresa como tasa total 40%; papelería sale de la Base operativa y se registra separadamente.
- No se recalculan ni se corrigen silenciosamente operaciones históricas o liquidaciones cerradas.
- El alcance implementado es resumen y paridad de nuevas renovaciones de escritorio. Otras brechas descubiertas se documentan para su tratamiento específico.
- Se conserva la granularidad existente en pesos enteros; no se cambian tasas ni mora.
