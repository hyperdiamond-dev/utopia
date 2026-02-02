-- Safe DDL Script: Create question_modules and question_submodules tables
-- This script is idempotent (safe to run multiple times)
-- It does NOT delete any existing data or columns

-- ============================================================================
-- 1. CREATE JUNCTION TABLES (IF NOT EXISTS)
-- ============================================================================

-- Junction table for question-module relationships
CREATE TABLE IF NOT EXISTS terminal_utopia.question_modules (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES terminal_utopia.questions(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES terminal_utopia.modules(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Prevent duplicate assignments
    CONSTRAINT unique_question_module UNIQUE (question_id, module_id)
);

-- Junction table for question-submodule relationships
CREATE TABLE IF NOT EXISTS terminal_utopia.question_submodules (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES terminal_utopia.questions(id) ON DELETE CASCADE,
    submodule_id INTEGER NOT NULL REFERENCES terminal_utopia.submodules(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Prevent duplicate assignments
    CONSTRAINT unique_question_submodule UNIQUE (question_id, submodule_id)
);

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE (IF NOT EXISTS)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_question_modules_question_id ON terminal_utopia.question_modules(question_id);
CREATE INDEX IF NOT EXISTS idx_question_modules_module_id ON terminal_utopia.question_modules(module_id);
CREATE INDEX IF NOT EXISTS idx_question_modules_sequence ON terminal_utopia.question_modules(module_id, sequence_order);

CREATE INDEX IF NOT EXISTS idx_question_submodules_question_id ON terminal_utopia.question_submodules(question_id);
CREATE INDEX IF NOT EXISTS idx_question_submodules_submodule_id ON terminal_utopia.question_submodules(submodule_id);
CREATE INDEX IF NOT EXISTS idx_question_submodules_sequence ON terminal_utopia.question_submodules(submodule_id, sequence_order);

-- ============================================================================
-- 3. MIGRATE EXISTING DATA (SAFE - SKIPS DUPLICATES)
-- ============================================================================

-- Migrate existing module assignments (only if module_id column exists and data not already migrated)
INSERT INTO terminal_utopia.question_modules (question_id, module_id, sequence_order)
SELECT q.id, q.module_id, q.sequence_order
FROM terminal_utopia.questions q
WHERE q.module_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM terminal_utopia.question_modules qm
    WHERE qm.question_id = q.id AND qm.module_id = q.module_id
  );

-- Migrate existing submodule assignments (only if submodule_id column exists and data not already migrated)
INSERT INTO terminal_utopia.question_submodules (question_id, submodule_id, sequence_order)
SELECT q.id, q.submodule_id, q.sequence_order
FROM terminal_utopia.questions q
WHERE q.submodule_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM terminal_utopia.question_submodules qs
    WHERE qs.question_id = q.id AND qs.submodule_id = q.submodule_id
  );

-- ============================================================================
-- 4. DOCUMENTATION COMMENTS
-- ============================================================================

COMMENT ON TABLE terminal_utopia.question_modules IS 'Junction table for many-to-many relationship between questions and modules';
COMMENT ON TABLE terminal_utopia.question_submodules IS 'Junction table for many-to-many relationship between questions and submodules';
COMMENT ON COLUMN terminal_utopia.question_modules.sequence_order IS 'Display order of question within the specific module';
COMMENT ON COLUMN terminal_utopia.question_submodules.sequence_order IS 'Display order of question within the specific submodule';

-- ============================================================================
-- NOTE: The original migration also drops these columns from the questions table:
--   - module_id
--   - submodule_id
-- This script intentionally DOES NOT drop them to preserve existing data.
-- Once you've verified the migration worked, you can run the drops separately.
-- ============================================================================
