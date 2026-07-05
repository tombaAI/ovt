# Tři scope v audit_log (event / event_registration / event_expense) a princip rekonstruovatelnosti

Rozšíření auditu akcí a vyúčtování (`zadani/ZADANI_AUDIT_AKCE_MEZERY.md`) zavádí třetí `entityType` scope, `event_expense` (`entityId = expenseId`), vedle dosavadních `event` a `event_registration`. Náklad je stejně časově proměnlivý subjekt mutací jako přihláška (viz i poslední čtyři commity o výměně/reanalýze přílohy) — bez vlastního scope by tyto mutace anonymně spadly pod "celá akce" v `getEventFullAuditLog`, přesně tam, kde je audit nejvíc potřeba. Vyžaduje join na `eventExpenses` v `getEventFullAuditLog` a `metadata.purposeText` snapshot jako fallback pro smazané náklady.

Zápis se řídí principem **rekonstruovatelnosti**: cíl je, aby šlo z `audit_log` složit zpět kompletní flow akce (např. pro reprodukci scénáře v automatizovaném testu). Skalární pole (částka, stav, boolean, jediná hodnota) diff `changes: { pole: {old, new} }` rekonstruuje beze zbytku. Mapová/vícehodnotová pole (`participantCoefficients`, `eventExpenseAllocations`) a destruktivní vedlejší efekty (smazání řádků při přepnutí `updateExpenseAllocationMethod` na `split_all`) navíc dostávají plný snapshot v `metadata` (`coefficientsAfter`, `allocationsAfter`, `deletedAllocations`) — diff samotný je křehký, jeden vynechaný/chybějící řádek by znehodnotil rekonstrukci od toho bodu dál.

Zablokované pokusy (gate/zámek odmítl akci, HTTP 409) se logují stejně důsledně jako úspěšné mutace (`action: "blocked"`, `metadata.attemptedAction`) napříč celým rozsahem tohoto zadání — nejen u citlivých míst, kde už tenhle vzor existoval (`event-settlement.ts`). Kvůli tomu se `logBlockedAttempt`/`BlockedAttempt` (dřív privátní jen v `event-settlement.ts`) vytahuje do sdíleného `src/lib/audit.ts`, protože poprvé ho potřebují volat i API routy (`attach-file`, `reanalyze`), ne jen server actions.

## Zamítnuté alternativy

- Nechat náklady pod `entityType: "event"` (původní návrh zadání) — zamítnuto, viz výše.
- Logovat u map jen diff, bez snapshotu — zamítnuto, nesplňuje cíl rekonstruovatelnosti.
- Nechat `logBlockedAttempt` duplikovaný inline v API routách (jako zbytek repa dělá u běžných `db.insert(auditLog)`) — zamítnuto jen pro tenhle jeden vzor, protože "blocked" záznam má přesně daný, opakovaný tvar a riziko rozjetí formátu je reálné.
