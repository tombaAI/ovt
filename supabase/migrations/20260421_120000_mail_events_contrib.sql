-- Extend mail_events with contribution/member context for conversation history
ALTER TABLE app.mail_events
    ADD COLUMN IF NOT EXISTS member_id  INTEGER REFERENCES app.members(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contrib_id INTEGER REFERENCES app.member_contributions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS period_id  INTEGER REFERENCES app.contribution_periods(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS email_type TEXT;     -- 'prescription' | 'reminder' | 'other'

CREATE INDEX IF NOT EXISTS mail_events_member_idx  ON app.mail_events(member_id);
CREATE INDEX IF NOT EXISTS mail_events_contrib_idx ON app.mail_events(contrib_id);
CREATE INDEX IF NOT EXISTS mail_events_period_idx  ON app.mail_events(period_id);
