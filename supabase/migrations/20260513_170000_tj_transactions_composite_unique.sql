-- Oprava: unikátní klíč na import_fin_tj_transactions byl jen na doc_number.
-- Jeden doklad (IN) může pokrývat více účtů, takže skutečný klíč je (doc_number, account_code).

ALTER TABLE app.import_fin_tj_transactions
    DROP CONSTRAINT IF EXISTS import_fin_tj_transactions_doc_number_key;

ALTER TABLE app.import_fin_tj_transactions
    ADD CONSTRAINT import_fin_tj_transactions_doc_number_account_code_key
    UNIQUE (doc_number, account_code);
