-- Audits migration
-- Creates the audits table for compliance and access tracking

SET search_path = terminal_utopia;

-- Audits table for tracking all significant events
CREATE TABLE IF NOT EXISTS terminal_utopia.audits (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    participant_id INTEGER,
    admin_user_id INTEGER,
    actor_identifier VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for audits
CREATE INDEX IF NOT EXISTS idx_audits_event_type ON terminal_utopia.audits(event_type);
CREATE INDEX IF NOT EXISTS idx_audits_participant_id ON terminal_utopia.audits(participant_id);
CREATE INDEX IF NOT EXISTS idx_audits_admin_user_id ON terminal_utopia.audits(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON terminal_utopia.audits(created_at);

-- Add check constraint for event_type values
ALTER TABLE terminal_utopia.audits
ADD CONSTRAINT audits_event_type_check
CHECK (event_type IN (
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'REGISTER_SUCCESS',
    'MODULE_ACCESS_GRANTED',
    'MODULE_ACCESS_DENIED',
    'MODULE_STARTED',
    'MODULE_COMPLETED',
    'RESPONSE_SUBMITTED',
    'ADMIN_LOGIN',
    'ADMIN_ACTION',
    'TOKEN_EXPIRED',
    'ACCOUNT_DISABLED'
));

-- Add foreign keys (optional, allowing null for flexibility)
ALTER TABLE terminal_utopia.audits
ADD CONSTRAINT fk_audits_participant
FOREIGN KEY (participant_id) REFERENCES terminal_utopia.participants(id)
ON DELETE SET NULL;

ALTER TABLE terminal_utopia.audits
ADD CONSTRAINT fk_audits_admin_user
FOREIGN KEY (admin_user_id) REFERENCES terminal_utopia.admin_users(id)
ON DELETE SET NULL;

-- Record this migration
INSERT INTO terminal_utopia.schema_migrations (version) VALUES ('007_audits') ON CONFLICT (version) DO NOTHING;
