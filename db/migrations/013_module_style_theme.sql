-- Migration 013: Add style_theme to modules
-- Allows each module to have a unique visual theme in the participant frontend

SET search_path = terminal_utopia;

ALTER TABLE terminal_utopia.modules
  ADD COLUMN style_theme VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN terminal_utopia.modules.style_theme IS 'Visual theme ID for participant frontend. NULL defaults to vhs theme.';

INSERT INTO terminal_utopia.schema_migrations (version)
VALUES ('013_module_style_theme') ON CONFLICT (version) DO NOTHING;
