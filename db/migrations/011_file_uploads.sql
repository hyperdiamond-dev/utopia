-- Migration: 011_file_uploads.sql
-- Description: Add support for file uploads in question responses
-- Created: 2026-02-03

-- ============================================================================
-- 1. CREATE FILE_UPLOADS TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.file_uploads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES terminal_utopia.users(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES terminal_utopia.questions(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    storage_url TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Ensure file_size is positive
    CONSTRAINT positive_file_size CHECK (file_size > 0)
);

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX idx_file_uploads_user_id ON terminal_utopia.file_uploads(user_id);
CREATE INDEX idx_file_uploads_question_id ON terminal_utopia.file_uploads(question_id);
CREATE INDEX idx_file_uploads_user_question ON terminal_utopia.file_uploads(user_id, question_id);
CREATE INDEX idx_file_uploads_mime_type ON terminal_utopia.file_uploads(mime_type);
CREATE INDEX idx_file_uploads_created_at ON terminal_utopia.file_uploads(created_at);

-- ============================================================================
-- 3. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE terminal_utopia.file_uploads IS 'Stores file upload metadata for question responses';
COMMENT ON COLUMN terminal_utopia.file_uploads.user_id IS 'Reference to the user who uploaded the file';
COMMENT ON COLUMN terminal_utopia.file_uploads.question_id IS 'Reference to the question this file answers';
COMMENT ON COLUMN terminal_utopia.file_uploads.original_filename IS 'Original filename as uploaded by user';
COMMENT ON COLUMN terminal_utopia.file_uploads.stored_filename IS 'Generated unique filename in storage';
COMMENT ON COLUMN terminal_utopia.file_uploads.mime_type IS 'MIME type of the uploaded file (e.g., image/png, application/pdf)';
COMMENT ON COLUMN terminal_utopia.file_uploads.file_size IS 'File size in bytes';
COMMENT ON COLUMN terminal_utopia.file_uploads.storage_url IS 'Full URL to access the file in cloud storage';

-- ============================================================================
-- 4. RECORD MIGRATION
-- ============================================================================

INSERT INTO terminal_utopia.schema_migrations (version)
VALUES ('011_file_uploads')
ON CONFLICT (version) DO NOTHING;
