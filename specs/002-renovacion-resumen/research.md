# Research

- Decision: compartir cálculo de renovación y proyección entre UI y persistencia. Rationale: evita divergencias como la papelería omitida del libro JavaFX. Alternative: fórmulas repetidas en el formulario, descartada.
- Decision: idempotencia por crédito anterior y términos verificados. Rationale: solo puede renovarse una vez, sin nuevas claves suministradas por UI; índice único además del control de aplicación.
- Decision: comparar snapshot al guardar. Rationale: un pago u otra operación desde que se abrió el diálogo cambia el importe a entregar. Rechazar y refrescar en vez de aprobar cifras no revisadas.
- Decision: auditoría estática separada de la remediación. Rationale: el producto contiene brechas de sincronización, efectivo digital, autorizaciones, reversos y respaldos que necesitan entregas propias; no inventar políticas para resolverlas aquí.
- No se requieren nuevas bibliotecas ni investigación externa: el contrato comercial está validado en esta conversación y las decisiones reutilizan los servicios locales existentes.
