# Data Model

## RenewalQuote (inmutable, transitorio)

Capital nuevo, saldo anterior, papelería, neto, interés, deuda nueva, Base/cartera/Administrativo antes y después. Todos los importes son Money/BigDecimal en pesos enteros. Neto y papelería no negativos; capital positivo; tasa no negativa.

## RenewalPreview (transitorio)

Quote y ruta explícita; se incluye como estado esperado en RenewLoanCommand desde la UI. Ninguna tabla se escribe al consultar.

## RenewalEntity (existente)

Un crédito anterior tiene como máximo una renovación. V2 agrega índice único sobre previous_loan_id; no elimina duplicados históricos si existen: la migración falla y requiere corrección auditable.

## CashMovementEntity (existente)

DESEMBOLSO_RENOVACION por neto positivo y PAPELERIA_RENOVACION por papelería positiva. Referencia al nuevo crédito; mismo instante, autor autenticado, ruta y transacción. No se generan ingresos por compensación.
