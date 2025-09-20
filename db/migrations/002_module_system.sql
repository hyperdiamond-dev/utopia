-- Module system migration
-- Adds tables for tracking module progress and sequential access

-- Create module status enum
CREATE TYPE module_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- Modules table - defines the available modules and their sequence
CREATE TABLE IF NOT EXISTS modules (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE,
    title VARCHAR NOT NULL,
    description TEXT,
    sequence_order INTEGER NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for modules
CREATE INDEX IF NOT EXISTS idx_modules_sequence_order ON modules(sequence_order);
CREATE INDEX IF NOT EXISTS idx_modules_is_active ON modules(is_active);

-- User module progress table - tracks each user's progress through modules
CREATE TABLE IF NOT EXISTS user_module_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    status module_status NOT NULL DEFAULT 'NOT_STARTED',
    started_at TIMESTAMP WITHOUT TIME ZONE,
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    response_data JSON,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    -- Ensure one progress record per user per module
    UNIQUE(user_id, module_id)
);

-- Create indexes for user_module_progress
CREATE INDEX IF NOT EXISTS idx_user_module_progress_user_id ON user_module_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_progress_module_id ON user_module_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_user_module_progress_status ON user_module_progress(status);
CREATE INDEX IF NOT EXISTS idx_user_module_progress_completed_at ON user_module_progress(completed_at);

-- Insert initial modules for the Backrooms ethnography study
INSERT INTO modules (name, title, description, sequence_order) VALUES
('consent', 'Consent and Onboarding', 'Participant consent and study introduction', 1),
('module1', 'Module 1: Initial Survey', 'Baseline demographic and background information', 2),
('module2', 'Module 2: Backrooms Exploration', 'Guided exploration of Backrooms environments', 3),
('module3', 'Module 3: Experience Reflection', 'Reflective analysis of Backrooms experience', 4),
('module4', 'Module 4: Follow-up Interview', 'Final interview and study conclusion', 5)
ON CONFLICT (name) DO NOTHING;

-- Add new audit event types for module tracking
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'MODULE_ACCESS_DENIED';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'MODULE_UNLOCKED';

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_modules_updated_at
    BEFORE UPDATE ON modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_module_progress_updated_at
    BEFORE UPDATE ON user_module_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('002_module_system') ON CONFLICT (version) DO NOTHING;