-- Add todo_note column for task tracking on members and their contributions
ALTER TABLE app.members ADD COLUMN IF NOT EXISTS todo_note text;
ALTER TABLE app.member_contributions ADD COLUMN IF NOT EXISTS todo_note text;
