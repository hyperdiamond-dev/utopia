-- Consent versions migration
-- Adds consent version management with status tracking

-- Set the schema to terminal_utopia
SET search_path = terminal_utopia;

-- Create consent version status enum
CREATE TYPE terminal_utopia.consent_version_status AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- Consent versions table - defines available consent versions
CREATE TABLE IF NOT EXISTS terminal_utopia.consent_versions (
    id SERIAL PRIMARY KEY,
    version VARCHAR NOT NULL UNIQUE,
    title VARCHAR NOT NULL,
    content_text TEXT,
    content_url VARCHAR,
    status terminal_utopia.consent_version_status NOT NULL DEFAULT 'DRAFT',
    effective_date TIMESTAMP WITHOUT TIME ZONE,
    deprecated_date TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for consent_versions
CREATE INDEX IF NOT EXISTS idx_consent_versions_status ON terminal_utopia.consent_versions(status);
CREATE INDEX IF NOT EXISTS idx_consent_versions_effective_date ON terminal_utopia.consent_versions(effective_date);

-- Add foreign key constraint from consents to consent_versions
-- Note: We use ON DELETE RESTRICT to prevent deletion of versions that have been consented to
ALTER TABLE terminal_utopia.consents
ADD CONSTRAINT fk_consents_version
FOREIGN KEY (version) REFERENCES terminal_utopia.consent_versions(version)
ON DELETE RESTRICT;

-- Insert initial consent version
INSERT INTO terminal_utopia.consent_versions (version, title, content_text, status, effective_date)
VALUES (
    'v1.0',
    'Initial Study Consent',
    'Backrooms Ethnography Study - Initial Participant Consent Form',
    'ACTIVE',
    NOW()
) ON CONFLICT (version) DO NOTHING;

-- Create trigger for updated_at column
CREATE TRIGGER update_consent_versions_updated_at
    BEFORE UPDATE ON terminal_utopia.consent_versions
    FOR EACH ROW EXECUTE FUNCTION terminal_utopia.update_updated_at_column();

-- Record this migration
INSERT INTO terminal_utopia.schema_migrations (version) VALUES ('003_consent_versions') ON CONFLICT (version) DO NOTHING;
