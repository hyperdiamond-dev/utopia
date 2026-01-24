-- User Module Progress migration
-- Tracks participant progress through study modules

SET search_path = terminal_utopia;

-- User module progress table
CREATE TABLE IF NOT EXISTS terminal_utopia.user_module_progress (
    id SERIAL PRIMARY KEY,
    participant_id INTEGER NOT NULL,
    module_id INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(participant_id, module_id)
);

-- Create indexes for user_module_progress
CREATE INDEX IF NOT EXISTS idx_user_module_progress_participant ON terminal_utopia.user_module_progress(participant_id);
CREATE INDEX IF NOT EXISTS idx_user_module_progress_module ON terminal_utopia.user_module_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_user_module_progress_status ON terminal_utopia.user_module_progress(status);

-- Add check constraint for status values
ALTER TABLE terminal_utopia.user_module_progress
ADD CONSTRAINT user_module_progress_status_check
CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'));

-- Add foreign keys
ALTER TABLE terminal_utopia.user_module_progress
ADD CONSTRAINT fk_user_module_progress_participant
FOREIGN KEY (participant_id) REFERENCES terminal_utopia.participants(id)
ON DELETE CASCADE;

ALTER TABLE terminal_utopia.user_module_progress
ADD CONSTRAINT fk_user_module_progress_module
FOREIGN KEY (module_id) REFERENCES terminal_utopia.modules(id)
ON DELETE CASCADE;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION terminal_utopia.update_user_module_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_module_progress_updated_at
    BEFORE UPDATE ON terminal_utopia.user_module_progress
    FOR EACH ROW
    EXECUTE FUNCTION terminal_utopia.update_user_module_progress_updated_at();

-- Record this migration
INSERT INTO terminal_utopia.schema_migrations (version) VALUES ('006_user_module_progress') ON CONFLICT (version) DO NOTHING;
