-- Migration: 016_remove_paths.sql
-- Description: Remove paths system - every participant now goes through every module.
--              Branching happens within modules at the submodule level.
-- Created: 2026-03-18

-- ============================================================================
-- 1. REMOVE PATH COLUMNS FROM BRANCHING_RULES
-- ============================================================================

-- Drop the unique constraint that includes path columns
ALTER TABLE terminal_utopia.branching_rules
DROP CONSTRAINT IF EXISTS unique_branching_rule;

-- Drop path-related indexes
DROP INDEX IF EXISTS terminal_utopia.idx_branching_rules_source_path;
DROP INDEX IF EXISTS terminal_utopia.idx_branching_rules_target_path;

-- Drop path columns
ALTER TABLE terminal_utopia.branching_rules
DROP COLUMN IF EXISTS source_path_id,
DROP COLUMN IF EXISTS target_path_id;

-- Recreate unique constraint without path columns
ALTER TABLE terminal_utopia.branching_rules
ADD CONSTRAINT unique_branching_rule UNIQUE NULLS NOT DISTINCT (
    source_module_id,
    source_submodule_id,
    target_submodule_id,
    condition_type
);

-- ============================================================================
-- 2. DROP PATH-RELATED TABLES (dependency order)
-- ============================================================================

DROP TABLE IF EXISTS terminal_utopia.user_path_progress CASCADE;
DROP TABLE IF EXISTS terminal_utopia.question_paths CASCADE;
DROP TABLE IF EXISTS terminal_utopia.path_modules CASCADE;
DROP TABLE IF EXISTS terminal_utopia.paths CASCADE;

-- ============================================================================
-- 3. DROP TRIGGER FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS terminal_utopia.update_paths_updated_at() CASCADE;
DROP FUNCTION IF EXISTS terminal_utopia.update_user_path_progress_updated_at() CASCADE;
