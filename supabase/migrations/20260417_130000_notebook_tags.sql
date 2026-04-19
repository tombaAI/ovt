-- Notebook: přidání sloupce categories (pole řetězců) do notebook_notes
-- Aplikuj v Neon SQL Editoru

ALTER TABLE app.notebook_notes
    ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';
