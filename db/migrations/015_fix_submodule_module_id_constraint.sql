-- Migration: 015_fix_submodule_module_id_constraint.sql
-- Description: Drop spurious single-column unique constraint on submodules.module_id
-- that prevents multiple submodules per module
-- Created: 2026-03-17

-- Drop the incorrect single-column unique constraint
-- (The correct composite constraints unique_submodule_name_per_module and
-- unique_sequence_per_module_branch remain intact)
ALTER TABLE terminal_utopia.submodules
DROP CONSTRAINT IF EXISTS submodules_module_id_key;
