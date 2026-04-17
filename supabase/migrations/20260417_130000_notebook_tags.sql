-- Notebook: přidání sloupce tags (pole řetězců) do notebook_notes
-- Aplikuj v Neon SQL Editoru

ALTER TABLE app.notebook_notes
    ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
