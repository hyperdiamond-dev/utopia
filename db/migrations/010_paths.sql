-- Migration: 010_paths.sql
-- Description: Add support for paths - containers for modules with many-to-many relationships
-- Created: 2026-02-01

-- ============================================================================
-- 1. CREATE PATHS TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.paths (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    parent_path_id INTEGER REFERENCES terminal_utopia.paths(id) ON DELETE SET NULL,
    sequence_order INTEGER NOT NULL DEFAULT 0,
    is_common BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);

-- Indexes for performance
CREATE INDEX idx_paths_parent_id ON terminal_utopia.paths(parent_path_id);
CREATE INDEX idx_paths_sequence ON terminal_utopia.paths(sequence_order);
CREATE INDEX idx_paths_is_common ON terminal_utopia.paths(is_common);
CREATE INDEX idx_paths_name ON terminal_utopia.paths(name);
CREATE INDEX idx_paths_is_active ON terminal_utopia.paths(is_active);

-- ============================================================================
-- 2. CREATE PATH_MODULES JUNCTION TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.path_modules (
    id SERIAL PRIMARY KEY,
    path_id INTEGER NOT NULL REFERENCES terminal_utopia.paths(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES terminal_utopia.modules(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    is_required BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Prevent duplicate assignments
    CONSTRAINT unique_path_module UNIQUE (path_id, module_id)
);

-- Indexes for performance
CREATE INDEX idx_path_modules_path_id ON terminal_utopia.path_modules(path_id);
CREATE INDEX idx_path_modules_module_id ON terminal_utopia.path_modules(module_id);
CREATE INDEX idx_path_modules_sequence ON terminal_utopia.path_modules(path_id, sequence_order);

-- ============================================================================
-- 3. CREATE QUESTION_PATHS JUNCTION TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.question_paths (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES terminal_utopia.questions(id) ON DELETE CASCADE,
    path_id INTEGER NOT NULL REFERENCES terminal_utopia.paths(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Prevent duplicate assignments
    CONSTRAINT unique_question_path UNIQUE (question_id, path_id)
);

-- Indexes for performance
CREATE INDEX idx_question_paths_question_id ON terminal_utopia.question_paths(question_id);
CREATE INDEX idx_question_paths_path_id ON terminal_utopia.question_paths(path_id);
CREATE INDEX idx_question_paths_sequence ON terminal_utopia.question_paths(path_id, sequence_order);

-- ============================================================================
-- 4. CREATE USER_PATH_PROGRESS TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.user_path_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES terminal_utopia.users(id) ON DELETE CASCADE,
    path_id INTEGER NOT NULL REFERENCES terminal_utopia.paths(id) ON DELETE CASCADE,
    status terminal_utopia.module_status NOT NULL DEFAULT 'NOT_STARTED',
    unlocked_by_rule_id INTEGER REFERENCES terminal_utopia.branching_rules(id) ON DELETE SET NULL,
    started_at TIMESTAMP WITHOUT TIME ZONE,
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Ensure one progress record per user per path
    CONSTRAINT unique_user_path_progress UNIQUE (user_id, path_id),

    -- Status validation
    CONSTRAINT valid_path_status CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),

    -- Ensure started_at is set when status is not NOT_STARTED
    CONSTRAINT path_started_at_with_progress CHECK (
        (status = 'NOT_STARTED' AND started_at IS NULL) OR
        (status != 'NOT_STARTED' AND started_at IS NOT NULL)
    ),

    -- Ensure completed_at is set only when status is COMPLETED
    CONSTRAINT path_completed_at_with_status CHECK (
        (status = 'COMPLETED' AND completed_at IS NOT NULL) OR
        (status != 'COMPLETED' AND completed_at IS NULL)
    )
);

-- Indexes for performance
CREATE INDEX idx_user_path_progress_user_id ON terminal_utopia.user_path_progress(user_id);
CREATE INDEX idx_user_path_progress_path_id ON terminal_utopia.user_path_progress(path_id);
CREATE INDEX idx_user_path_progress_status ON terminal_utopia.user_path_progress(status);

-- ============================================================================
-- 5. EXTEND BRANCHING_RULES FOR PATHS
-- ============================================================================

-- Add path-related columns to branching_rules
ALTER TABLE terminal_utopia.branching_rules
ADD COLUMN source_path_id INTEGER REFERENCES terminal_utopia.paths(id) ON DELETE CASCADE,
ADD COLUMN target_path_id INTEGER REFERENCES terminal_utopia.paths(id) ON DELETE CASCADE;

-- Create indexes for path columns
CREATE INDEX idx_branching_rules_source_path ON terminal_utopia.branching_rules(source_path_id);
CREATE INDEX idx_branching_rules_target_path ON terminal_utopia.branching_rules(target_path_id);

-- Drop old unique constraint
ALTER TABLE terminal_utopia.branching_rules
DROP CONSTRAINT IF EXISTS unique_branching_rule;

-- Create new unique constraint that includes path columns
-- Using NULLS NOT DISTINCT to treat NULL values as equal for uniqueness
ALTER TABLE terminal_utopia.branching_rules
ADD CONSTRAINT unique_branching_rule UNIQUE NULLS NOT DISTINCT (
    source_module_id,
    source_submodule_id,
    source_path_id,
    target_submodule_id,
    target_path_id,
    condition_type
);

-- ============================================================================
-- 6. CREATE UPDATED_AT TRIGGER FUNCTIONS
-- ============================================================================

-- Trigger function for paths
CREATE OR REPLACE FUNCTION terminal_utopia.update_paths_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'utc');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER paths_updated_at_trigger
BEFORE UPDATE ON terminal_utopia.paths
FOR EACH ROW
EXECUTE FUNCTION terminal_utopia.update_paths_updated_at();

-- Trigger function for user_path_progress
CREATE OR REPLACE FUNCTION terminal_utopia.update_user_path_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'utc');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_path_progress_updated_at_trigger
BEFORE UPDATE ON terminal_utopia.user_path_progress
FOR EACH ROW
EXECUTE FUNCTION terminal_utopia.update_user_path_progress_updated_at();

-- ============================================================================
-- 7. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE terminal_utopia.paths IS 'Container for modules, supporting nested paths (sub-paths) and many-to-many module relationships';
COMMENT ON TABLE terminal_utopia.path_modules IS 'Junction table for many-to-many relationship between paths and modules';
COMMENT ON TABLE terminal_utopia.question_paths IS 'Junction table for many-to-many relationship between questions and paths';
COMMENT ON TABLE terminal_utopia.user_path_progress IS 'Tracks user progress through paths';

COMMENT ON COLUMN terminal_utopia.paths.parent_path_id IS 'Self-reference for nested paths (sub-paths)';
COMMENT ON COLUMN terminal_utopia.paths.is_common IS 'If true, this path is always accessible regardless of branching rules';
COMMENT ON COLUMN terminal_utopia.paths.sequence_order IS 'Display order among sibling paths';
COMMENT ON COLUMN terminal_utopia.path_modules.is_required IS 'If true, module must be completed to complete the path';
COMMENT ON COLUMN terminal_utopia.path_modules.sequence_order IS 'Order of module within the path';
COMMENT ON COLUMN terminal_utopia.question_paths.sequence_order IS 'Display order of question within the path';
COMMENT ON COLUMN terminal_utopia.user_path_progress.unlocked_by_rule_id IS 'Reference to the branching rule that unlocked this path for the user';
COMMENT ON COLUMN terminal_utopia.branching_rules.source_path_id IS 'Path that triggers this rule when completed';
COMMENT ON COLUMN terminal_utopia.branching_rules.target_path_id IS 'Path to unlock when rule conditions are met';
