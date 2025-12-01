-- Migration: 003_branching_submodules.sql
-- Description: Add support for submodules, questions, and branching logic
-- Created: 2025-11-29

-- ============================================================================
-- 1. UPDATE EXISTING MODULES TABLE
-- ============================================================================

ALTER TABLE terminal_utopia.modules
ADD COLUMN requires_all_submodules BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN allows_branching BOOLEAN NOT NULL DEFAULT false;

-- Update consent module to not allow branching
UPDATE terminal_utopia.modules
SET allows_branching = false
WHERE name = 'consent';

-- ============================================================================
-- 2. CREATE SUBMODULES TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.submodules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    module_id INTEGER NOT NULL REFERENCES terminal_utopia.modules(id) ON DELETE CASCADE,
    parent_submodule_id INTEGER REFERENCES terminal_utopia.submodules(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    branch_name VARCHAR(255), -- e.g., 'experienced_path', 'beginner_path', null for non-branching
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Ensure unique name within a module
    CONSTRAINT unique_submodule_name_per_module UNIQUE (module_id, name),

    -- Ensure unique sequence order within a module and branch
    CONSTRAINT unique_sequence_per_module_branch UNIQUE (module_id, parent_submodule_id, branch_name, sequence_order)
);

-- Indexes for performance
CREATE INDEX idx_submodules_module_id ON terminal_utopia.submodules(module_id);
CREATE INDEX idx_submodules_parent_id ON terminal_utopia.submodules(parent_submodule_id);
CREATE INDEX idx_submodules_branch_name ON terminal_utopia.submodules(branch_name);
CREATE INDEX idx_submodules_sequence ON terminal_utopia.submodules(module_id, sequence_order);

-- ============================================================================
-- 3. CREATE QUESTION TYPES ENUM
-- ============================================================================

CREATE TYPE terminal_utopia.question_type AS ENUM (
    'true_false',
    'multiple_choice',
    'fill_blank',
    'free_form'
);

-- ============================================================================
-- 4. CREATE QUESTIONS TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.questions (
    id SERIAL PRIMARY KEY,
    question_text TEXT NOT NULL,
    question_type terminal_utopia.question_type NOT NULL,
    module_id INTEGER REFERENCES terminal_utopia.modules(id) ON DELETE CASCADE,
    submodule_id INTEGER REFERENCES terminal_utopia.submodules(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}', -- Stores choices for multiple choice, validation rules, etc.
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Question must belong to either a module or submodule (or both)
    CONSTRAINT question_belongs_to_module_or_submodule CHECK (
        module_id IS NOT NULL OR submodule_id IS NOT NULL
    )
);

-- Indexes for performance
CREATE INDEX idx_questions_module_id ON terminal_utopia.questions(module_id);
CREATE INDEX idx_questions_submodule_id ON terminal_utopia.questions(submodule_id);
CREATE INDEX idx_questions_sequence ON terminal_utopia.questions(module_id, submodule_id, sequence_order);
CREATE INDEX idx_questions_metadata ON terminal_utopia.questions USING GIN(metadata);

-- ============================================================================
-- 5. CREATE USER SUBMODULE PROGRESS TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.user_submodule_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES terminal_utopia.users(id) ON DELETE CASCADE,
    submodule_id INTEGER NOT NULL REFERENCES terminal_utopia.submodules(id) ON DELETE CASCADE,
    status terminal_utopia.module_status NOT NULL DEFAULT 'NOT_STARTED',
    started_at TIMESTAMP WITHOUT TIME ZONE,
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    response_data JSONB, -- Legacy support for storing all responses as JSON
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Ensure one progress record per user per submodule
    CONSTRAINT unique_user_submodule_progress UNIQUE (user_id, submodule_id),

    -- Status validation
    CONSTRAINT valid_submodule_status CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),

    -- Ensure started_at is set when status is not NOT_STARTED
    CONSTRAINT started_at_with_progress CHECK (
        (status = 'NOT_STARTED' AND started_at IS NULL) OR
        (status != 'NOT_STARTED' AND started_at IS NOT NULL)
    ),

    -- Ensure completed_at is set only when status is COMPLETED
    CONSTRAINT completed_at_with_status CHECK (
        (status = 'COMPLETED' AND completed_at IS NOT NULL) OR
        (status != 'COMPLETED' AND completed_at IS NULL)
    )
);

-- Indexes for performance
CREATE INDEX idx_user_submodule_progress_user_id ON terminal_utopia.user_submodule_progress(user_id);
CREATE INDEX idx_user_submodule_progress_submodule_id ON terminal_utopia.user_submodule_progress(submodule_id);
CREATE INDEX idx_user_submodule_progress_status ON terminal_utopia.user_submodule_progress(status);

-- ============================================================================
-- 6. CREATE USER QUESTION RESPONSES TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.user_question_responses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES terminal_utopia.users(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES terminal_utopia.questions(id) ON DELETE CASCADE,
    module_id INTEGER REFERENCES terminal_utopia.modules(id) ON DELETE CASCADE,
    submodule_id INTEGER REFERENCES terminal_utopia.submodules(id) ON DELETE CASCADE,
    response_value JSONB NOT NULL, -- Flexible storage for any answer type
    answered_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Ensure one response per user per question (can be updated)
    CONSTRAINT unique_user_question_response UNIQUE (user_id, question_id)
);

-- Indexes for performance
CREATE INDEX idx_user_question_responses_user_id ON terminal_utopia.user_question_responses(user_id);
CREATE INDEX idx_user_question_responses_question_id ON terminal_utopia.user_question_responses(question_id);
CREATE INDEX idx_user_question_responses_module_id ON terminal_utopia.user_question_responses(module_id);
CREATE INDEX idx_user_question_responses_submodule_id ON terminal_utopia.user_question_responses(submodule_id);
CREATE INDEX idx_user_question_responses_value ON terminal_utopia.user_question_responses USING GIN(response_value);

-- ============================================================================
-- 7. CREATE BRANCHING RULES TABLE
-- ============================================================================

CREATE TABLE terminal_utopia.branching_rules (
    id SERIAL PRIMARY KEY,
    source_module_id INTEGER NOT NULL REFERENCES terminal_utopia.modules(id) ON DELETE CASCADE,
    source_submodule_id INTEGER REFERENCES terminal_utopia.submodules(id) ON DELETE CASCADE,
    target_submodule_id INTEGER NOT NULL REFERENCES terminal_utopia.submodules(id) ON DELETE CASCADE,
    condition_type VARCHAR(50) NOT NULL, -- 'question_answer', 'all_complete', 'any_complete', etc.
    condition_config JSONB NOT NULL, -- Stores question_id, expected values, operators, etc.
    priority INTEGER NOT NULL DEFAULT 0, -- Higher priority rules evaluated first
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),

    -- Prevent duplicate rules
    CONSTRAINT unique_branching_rule UNIQUE (
        source_module_id,
        source_submodule_id,
        target_submodule_id,
        condition_type
    )
);

-- Indexes for performance
CREATE INDEX idx_branching_rules_source_module ON terminal_utopia.branching_rules(source_module_id);
CREATE INDEX idx_branching_rules_source_submodule ON terminal_utopia.branching_rules(source_submodule_id);
CREATE INDEX idx_branching_rules_target_submodule ON terminal_utopia.branching_rules(target_submodule_id);
CREATE INDEX idx_branching_rules_priority ON terminal_utopia.branching_rules(priority DESC);
CREATE INDEX idx_branching_rules_config ON terminal_utopia.branching_rules USING GIN(condition_config);

-- ============================================================================
-- 8. CREATE UPDATED_AT TRIGGER FUNCTIONS
-- ============================================================================

-- Trigger function for submodules
CREATE OR REPLACE FUNCTION terminal_utopia.update_submodules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'utc');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER submodules_updated_at_trigger
BEFORE UPDATE ON terminal_utopia.submodules
FOR EACH ROW
EXECUTE FUNCTION terminal_utopia.update_submodules_updated_at();

-- Trigger function for questions
CREATE OR REPLACE FUNCTION terminal_utopia.update_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'utc');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER questions_updated_at_trigger
BEFORE UPDATE ON terminal_utopia.questions
FOR EACH ROW
EXECUTE FUNCTION terminal_utopia.update_questions_updated_at();

-- Trigger function for user_submodule_progress
CREATE OR REPLACE FUNCTION terminal_utopia.update_user_submodule_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'utc');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_submodule_progress_updated_at_trigger
BEFORE UPDATE ON terminal_utopia.user_submodule_progress
FOR EACH ROW
EXECUTE FUNCTION terminal_utopia.update_user_submodule_progress_updated_at();

-- Trigger function for user_question_responses
CREATE OR REPLACE FUNCTION terminal_utopia.update_user_question_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'utc');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_question_responses_updated_at_trigger
BEFORE UPDATE ON terminal_utopia.user_question_responses
FOR EACH ROW
EXECUTE FUNCTION terminal_utopia.update_user_question_responses_updated_at();

-- Trigger function for branching_rules
CREATE OR REPLACE FUNCTION terminal_utopia.update_branching_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'utc');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER branching_rules_updated_at_trigger
BEFORE UPDATE ON terminal_utopia.branching_rules
FOR EACH ROW
EXECUTE FUNCTION terminal_utopia.update_branching_rules_updated_at();

-- ============================================================================
-- 9. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE terminal_utopia.submodules IS 'Stores submodules that can exist within modules, supporting branching paths';
COMMENT ON TABLE terminal_utopia.questions IS 'Stores questions that belong to modules or submodules';
COMMENT ON TABLE terminal_utopia.user_submodule_progress IS 'Tracks user progress through submodules';
COMMENT ON TABLE terminal_utopia.user_question_responses IS 'Stores individual user responses to questions';
COMMENT ON TABLE terminal_utopia.branching_rules IS 'Defines conditional logic for unlocking submodules based on responses';

COMMENT ON COLUMN terminal_utopia.modules.requires_all_submodules IS 'If true, all submodules in active branch must be completed to complete module';
COMMENT ON COLUMN terminal_utopia.modules.allows_branching IS 'If true, module supports branching paths via submodules';
COMMENT ON COLUMN terminal_utopia.submodules.branch_name IS 'Identifies which branch this submodule belongs to (null for non-branching)';
COMMENT ON COLUMN terminal_utopia.questions.metadata IS 'JSON storing question-specific data like choices, validation rules, etc.';
COMMENT ON COLUMN terminal_utopia.branching_rules.condition_config IS 'JSON defining the condition logic for rule evaluation';
