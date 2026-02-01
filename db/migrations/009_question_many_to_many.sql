-- Migration: 009_question_many_to_many.sql
-- Description: Convert questions from many-to-one to many-to-many relationship with modules/submodules
-- Created: 2026-01-31

-- ============================================================================
-- 1. CREATE JUNCTION TABLES
-- ============================================================================

-- Junction table for question-module relationships
CREATE TABLE terminal_utopia.question_modules (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES terminal_utopia.questions(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES terminal_utopia.modules(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Prevent duplicate assignments
    CONSTRAINT unique_question_module UNIQUE (question_id, module_id)
);

-- Junction table for question-submodule relationships
CREATE TABLE terminal_utopia.question_submodules (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES terminal_utopia.questions(id) ON DELETE CASCADE,
    submodule_id INTEGER NOT NULL REFERENCES terminal_utopia.submodules(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Prevent duplicate assignments
    CONSTRAINT unique_question_submodule UNIQUE (question_id, submodule_id)
);

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_question_modules_question_id ON terminal_utopia.question_modules(question_id);
CREATE INDEX idx_question_modules_module_id ON terminal_utopia.question_modules(module_id);
CREATE INDEX idx_question_modules_sequence ON terminal_utopia.question_modules(module_id, sequence_order);

CREATE INDEX idx_question_submodules_question_id ON terminal_utopia.question_submodules(question_id);
CREATE INDEX idx_question_submodules_submodule_id ON terminal_utopia.question_submodules(submodule_id);
CREATE INDEX idx_question_submodules_sequence ON terminal_utopia.question_submodules(submodule_id, sequence_order);

-- ============================================================================
-- 3. MIGRATE EXISTING DATA
-- ============================================================================

-- Migrate existing module assignments
INSERT INTO terminal_utopia.question_modules (question_id, module_id, sequence_order)
SELECT id, module_id, sequence_order
FROM terminal_utopia.questions
WHERE module_id IS NOT NULL;

-- Migrate existing submodule assignments
INSERT INTO terminal_utopia.question_submodules (question_id, submodule_id, sequence_order)
SELECT id, submodule_id, sequence_order
FROM terminal_utopia.questions
WHERE submodule_id IS NOT NULL;

-- ============================================================================
-- 4. DROP OLD COLUMNS AND CONSTRAINTS
-- ============================================================================

-- Drop the constraint requiring module_id or submodule_id
ALTER TABLE terminal_utopia.questions
DROP CONSTRAINT IF EXISTS question_belongs_to_module_or_submodule;

-- Drop old indexes
DROP INDEX IF EXISTS terminal_utopia.idx_questions_module_id;
DROP INDEX IF EXISTS terminal_utopia.idx_questions_submodule_id;
DROP INDEX IF EXISTS terminal_utopia.idx_questions_sequence;

-- Drop old columns
ALTER TABLE terminal_utopia.questions DROP COLUMN IF EXISTS module_id;
ALTER TABLE terminal_utopia.questions DROP COLUMN IF EXISTS submodule_id;

-- ============================================================================
-- 5. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE terminal_utopia.question_modules IS 'Junction table for many-to-many relationship between questions and modules';
COMMENT ON TABLE terminal_utopia.question_submodules IS 'Junction table for many-to-many relationship between questions and submodules';
COMMENT ON COLUMN terminal_utopia.question_modules.sequence_order IS 'Display order of question within the specific module';
COMMENT ON COLUMN terminal_utopia.question_submodules.sequence_order IS 'Display order of question within the specific submodule';
