-- Admin users migration
-- Creates the admin_users table for storing admin panel users

SET search_path = terminal_utopia;

-- Admin users table for levelzero admin panel
CREATE TABLE IF NOT EXISTS terminal_utopia.admin_users (
    id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for admin_users
CREATE INDEX IF NOT EXISTS idx_admin_users_firebase_uid ON terminal_utopia.admin_users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON terminal_utopia.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON terminal_utopia.admin_users(is_active);

-- Add check constraint for role values
ALTER TABLE terminal_utopia.admin_users
ADD CONSTRAINT admin_users_role_check
CHECK (role IN ('admin', 'editor', 'viewer'));

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION terminal_utopia.update_admin_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_admin_users_updated_at
    BEFORE UPDATE ON terminal_utopia.admin_users
    FOR EACH ROW
    EXECUTE FUNCTION terminal_utopia.update_admin_users_updated_at();

-- Record this migration
INSERT INTO terminal_utopia.schema_migrations (version) VALUES ('004_admin_users') ON CONFLICT (version) DO NOTHING;
