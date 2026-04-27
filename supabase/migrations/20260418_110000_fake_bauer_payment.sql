-- TEST DATA: Fake platba Tomáše Bauera přes TJ účetnictví
-- Spustit POUZE pro testování párování. Smazat viz DELETE na konci souboru.
--
-- INSERT:

WITH new_import AS (
    INSERT INTO app.import_fin_tj_imports
        (report_date, cost_center, filter_from, filter_to, filter_raw, file_name, imported_by)
    VALUES
        ('2025-12-31', '207', '2025-01-01', '2025-12-31',
         'Tisk vybraných záznamů: Středisko = 207, Datum >= 01.01.2025, Datum <= 31.12.2025',
         '[TEST] platby_clenove_2025.pdf', 'bautom@gmail.com')
    RETURNING id
),
new_tx AS (
    INSERT INTO app.import_fin_tj_transactions
        (import_id, doc_date, doc_number, source_code, description, account_code, account_name, debit, credit)
    SELECT
        id, '2025-04-15', 'TEST-BV-BAUER-2025', 'BV',
        'Bauer Tomáš - členský příspěvek OVT 2025',
        '682061', 'Příspěvky od členů OVT',
        0.00, 1500.00
    FROM new_import
    RETURNING id, import_id
)
INSERT INTO app.import_fin_tj_import_lines
    (import_id, transaction_id, doc_number, status, conflict_fields,
     doc_date, source_code, description, account_code, account_name, debit, credit)
SELECT
    tx.import_id, tx.id,
    'TEST-BV-BAUER-2025', 'added', '[]'::jsonb,
    '2025-04-15', 'BV',
    'Bauer Tomáš - členský příspěvek OVT 2025',
    '682061', 'Příspěvky od členů OVT',
    0.00, 1500.00
FROM new_tx tx;

-- Ověření:
-- SELECT * FROM app.import_fin_tj_imports WHERE file_name = '[TEST] platby_clenove_2025.pdf';
-- SELECT * FROM app.import_fin_tj_transactions WHERE doc_number = 'TEST-BV-BAUER-2025';

-- ============================================================
-- DELETE (spustit po dokončení testu):
-- DELETE FROM app.import_fin_tj_imports WHERE file_name = '[TEST] platby_clenove_2025.pdf';
-- (CASCADE automaticky smaže import_lines a transactions)
-- ============================================================
