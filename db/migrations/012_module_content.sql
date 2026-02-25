-- Migration: 012_module_content.sql
-- Description: Add support for media content (video, image, audio) in modules and submodules
-- Created: 2026-02-03

-- ============================================================================
-- 1. CREATE CONTENT_TYPE ENUM
-- ============================================================================

CREATE TYPE terminal_utopia.content_type AS ENUM ('video', 'image', 'audio');

-- ============================================================================
-- 2. CREATE MODULE_CONTENT TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.module_content (
    id SERIAL PRIMARY KEY,
    module_id INTEGER REFERENCES terminal_utopia.modules(id) ON DELETE CASCADE,
    submodule_id INTEGER REFERENCES terminal_utopia.submodules(id) ON DELETE CASCADE,
    content_type terminal_utopia.content_type NOT NULL,
    title VARCHAR(255),
    description TEXT,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    sequence_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_external BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Content must belong to either a module or submodule
    CONSTRAINT content_belongs_to_module_or_submodule CHECK (
        module_id IS NOT NULL OR submodule_id IS NOT NULL
    ),

    -- Duration only applies to video and audio
    CONSTRAINT duration_for_media CHECK (
        duration_seconds IS NULL OR content_type IN ('video', 'audio')
    )
);

-- ============================================================================
-- 3. CREATE INDEXES
-- ============================================================================

CREATE INDEX idx_module_content_module_id ON terminal_utopia.module_content(module_id);
CREATE INDEX idx_module_content_submodule_id ON terminal_utopia.module_content(submodule_id);
CREATE INDEX idx_module_content_type ON terminal_utopia.module_content(content_type);
CREATE INDEX idx_module_content_sequence ON terminal_utopia.module_content(module_id, sequence_order);
CREATE INDEX idx_module_content_submodule_sequence ON terminal_utopia.module_content(submodule_id, sequence_order);
CREATE INDEX idx_module_content_is_active ON terminal_utopia.module_content(is_active);

-- ============================================================================
-- 4. CREATE UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION terminal_utopia.update_module_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'utc');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER module_content_updated_at_trigger
BEFORE UPDATE ON terminal_utopia.module_content
FOR EACH ROW
EXECUTE FUNCTION terminal_utopia.update_module_content_updated_at();

-- ============================================================================
-- 5. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE terminal_utopia.module_content IS 'Stores media content (videos, images, audio) associated with modules and submodules';
COMMENT ON COLUMN terminal_utopia.module_content.module_id IS 'Reference to parent module (nullable if submodule_id is set)';
COMMENT ON COLUMN terminal_utopia.module_content.submodule_id IS 'Reference to parent submodule (nullable if module_id is set)';
COMMENT ON COLUMN terminal_utopia.module_content.content_type IS 'Type of media content: video, image, or audio';
COMMENT ON COLUMN terminal_utopia.module_content.url IS 'URL to the content - can be R2 storage or external (YouTube, Vimeo)';
COMMENT ON COLUMN terminal_utopia.module_content.thumbnail_url IS 'Optional thumbnail image URL for video/audio content';
COMMENT ON COLUMN terminal_utopia.module_content.duration_seconds IS 'Duration in seconds for video/audio content';
COMMENT ON COLUMN terminal_utopia.module_content.sequence_order IS 'Display order of content within the module/submodule';
COMMENT ON COLUMN terminal_utopia.module_content.is_external IS 'True if URL points to external service (YouTube, Vimeo), false for R2 storage';
COMMENT ON COLUMN terminal_utopia.module_content.metadata IS 'Additional metadata (e.g., embed settings, alt text, captions)';

-- ============================================================================
-- 6. RECORD MIGRATION
-- ============================================================================

INSERT INTO terminal_utopia.schema_migrations (version)
VALUES ('012_module_content')
ON CONFLICT (version) DO NOTHING;
