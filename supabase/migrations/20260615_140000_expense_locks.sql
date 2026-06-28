-- Dvojí zámek nákladů akce
-- lock_for_participants: zamkne částky a rozdělení (předpisy pro účastníky)
-- lock_for_reimbursement: zamkne metadata nákladů (kategorie, popis, příjemce, soubory) pro proplacení TJ

ALTER TABLE app.events
  ADD COLUMN lock_for_participants   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN lock_for_reimbursement  BOOLEAN NOT NULL DEFAULT false;

-- Existující zamčené akce (billing_status = 'prescribed') dostávají příjmový zámek
UPDATE app.events SET lock_for_participants = true WHERE billing_status = 'prescribed';
