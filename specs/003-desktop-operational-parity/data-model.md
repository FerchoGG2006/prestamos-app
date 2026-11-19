# Data model
Customer lifecycle: ACTIVO -> INACTIVO, retaining all contracts and audit. No physical deletion.
PaymentPromise existing table: id operation identity; customer/loan; BigDecimal amount; promisedDate; PENDIENTE -> CUMPLIDA or CANCELADA, transition audited with no synthetic Payment.
Visits: immutable NON_PAYMENT_VISIT audit records containing loan/customer and reason.
CustomerAttachment (V3): id, customer_id, original_name, stored_name, media_type, byte_size, sha256, created_at; bytes in <office>/attachments unique managed names. No arbitrary path execution or remote URL.
Pairing capability: in-memory random token, route/collector/creator, expiry. Token never persisted in financial rows or logs; revoked by new pairing or expiry.
Recovery package: committed SQLite snapshot + attachments archive. Validation checks schema/integrity/FK and referenced attachment hashes before publishing recovered directory.
