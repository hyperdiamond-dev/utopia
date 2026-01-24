-- Participants migration
-- Creates the participants table for anonymous study participants

SET search_path = terminal_utopia;

-- Participants table for study participants
CREATE TABLE IF NOT EXISTS terminal_utopia.participants (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    friendly_alias VARCHAR(100) NOT NULL UNIQUE,
    firebase_uid VARCHAR(128),
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    current_module_id INTEGER,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for participants
CREATE INDEX IF NOT EXISTS idx_participants_uuid ON terminal_utopia.participants(uuid);
CREATE INDEX IF NOT EXISTS idx_participants_friendly_alias ON terminal_utopia.participants(friendly_alias);
CREATE INDEX IF NOT EXISTS idx_participants_firebase_uid ON terminal_utopia.participants(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_participants_status ON terminal_utopia.participants(status);

-- Add check constraint for status values
ALTER TABLE terminal_utopia.participants
ADD CONSTRAINT participants_status_check
CHECK (status IN ('ACTIVE', 'COMPLETED', 'EXPIRED', 'DISABLED'));

-- Add foreign key to modules table
ALTER TABLE terminal_utopia.participants
ADD CONSTRAINT fk_participants_current_module
FOREIGN KEY (current_module_id) REFERENCES terminal_utopia.modules(id)
ON DELETE SET NULL;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION terminal_utopia.update_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_participants_updated_at
    BEFORE UPDATE ON terminal_utopia.participants
    FOR EACH ROW
    EXECUTE FUNCTION terminal_utopia.update_participants_updated_at();

-- Record this migration
INSERT INTO terminal_utopia.schema_migrations (version) VALUES ('005_participants') ON CONFLICT (version) DO NOTHING;
