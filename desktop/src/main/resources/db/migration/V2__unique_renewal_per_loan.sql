-- A loan may be renewed only once. Do not delete or rewrite historical duplicates.
CREATE UNIQUE INDEX ux_renewal_previous_loan ON renewal(previous_loan_id);
