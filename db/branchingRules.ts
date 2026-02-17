/**
 * Branching Rule Repository
 * Handles database operations for branching rules and evaluation logic
 */

import { sql } from "./connection.ts";
import { questionRepository, type ResponseValue } from "./questions.ts";

// ============================================================================
// Type Definitions
// ============================================================================

export type ConditionType =
  | "question_answer" // Unlock based on specific answer to a question
  | "all_complete" // Unlock when all submodules in source are complete
  | "any_complete" // Unlock when any submodule in source is complete
  | "always"; // Always unlock (no conditions)

export interface BranchingRule {
  id: number;
  source_module_id: number;
  source_submodule_id: number | null;
  source_path_id: number | null;
  target_submodule_id: number | null;
  target_path_id: number | null;
  condition_type: ConditionType;
  condition_config: ConditionConfig;
  priority: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ConditionConfig {
  // For question_answer type
  question_id?: number;
  expected_value?: ResponseValue;
  operator?:
    | "equals"
    | "not_equals"
    | "contains"
    | "greater_than"
    | "less_than";

  // For all_complete / any_complete types
  submodule_ids?: number[];
  path_ids?: number[];
  module_ids?: number[];

  // Custom condition (advanced)
  custom_condition?: string;

  [key: string]: unknown; // Allow additional fields
}

export interface RuleEvaluationResult {
  rule_id: number;
  target_submodule_id: number | null;
  target_path_id: number | null;
  unlocked: boolean;
  reason?: string;
}

// ============================================================================
// Repository Class
// ============================================================================

export class BranchingRuleRepository {
  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Get branching rule by ID
   */
  async getRuleById(ruleId: number): Promise<BranchingRule | null> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.branching_rules
      WHERE id = ${ruleId}
      AND is_active = true
    `;

    return result.length > 0 ? (result[0] as BranchingRule) : null;
  }

  /**
   * Get all rules for a source module
   */
  async getRulesBySourceModule(moduleId: number): Promise<BranchingRule[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.branching_rules
      WHERE source_module_id = ${moduleId}
      AND is_active = true
      ORDER BY priority DESC, id ASC
    `;

    return result as BranchingRule[];
  }

  /**
   * Get all rules for a source submodule
   */
  async getRulesBySourceSubmodule(
    submoduleId: number,
  ): Promise<BranchingRule[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.branching_rules
      WHERE source_submodule_id = ${submoduleId}
      AND is_active = true
      ORDER BY priority DESC, id ASC
    `;

    return result as BranchingRule[];
  }

  /**
   * Get all rules that target a specific submodule
   */
  async getRulesByTargetSubmodule(
    submoduleId: number,
  ): Promise<BranchingRule[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.branching_rules
      WHERE target_submodule_id = ${submoduleId}
      AND is_active = true
      ORDER BY priority DESC, id ASC
    `;

    return result as BranchingRule[];
  }

  /**
   * Get all rules for a source path
   */
  async getRulesBySourcePath(pathId: number): Promise<BranchingRule[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.branching_rules
      WHERE source_path_id = ${pathId}
      AND is_active = true
      ORDER BY priority DESC, id ASC
    `;

    return result as BranchingRule[];
  }

  /**
   * Get all rules that target a specific path
   */
  async getRulesByTargetPath(pathId: number): Promise<BranchingRule[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.branching_rules
      WHERE target_path_id = ${pathId}
      AND is_active = true
      ORDER BY priority DESC, id ASC
    `;

    return result as BranchingRule[];
  }

  /**
   * Get all applicable rules for a module/submodule completion
   */
  async getApplicableRules(
    moduleId: number,
    submoduleId?: number | null,
  ): Promise<BranchingRule[]> {
    if (submoduleId) {
      const result = await sql`
        SELECT *
        FROM terminal_utopia.branching_rules
        WHERE source_submodule_id = ${submoduleId}
        AND is_active = true
        ORDER BY priority DESC, id ASC
      `;
      return result as BranchingRule[];
    } else {
      const result = await sql`
        SELECT *
        FROM terminal_utopia.branching_rules
        WHERE source_module_id = ${moduleId}
        AND source_submodule_id IS NULL
        AND is_active = true
        ORDER BY priority DESC, id ASC
      `;
      return result as BranchingRule[];
    }
  }

  // ==========================================================================
  // Rule Evaluation
  // ==========================================================================

  /**
   * Evaluate all rules for a given context and return unlocked submodules/paths
   */
  async evaluateRules(
    userId: number,
    moduleId: number,
    submoduleId?: number | null,
  ): Promise<RuleEvaluationResult[]> {
    const rules = await this.getApplicableRules(moduleId, submoduleId);
    const results: RuleEvaluationResult[] = [];

    for (const rule of rules) {
      const result = await this.evaluateSingleRule(rule, userId);
      results.push({
        rule_id: rule.id,
        target_submodule_id: rule.target_submodule_id,
        target_path_id: rule.target_path_id,
        unlocked: result.unlocked,
        reason: result.reason,
      });
    }

    return results;
  }

  /**
   * Evaluate rules for a path completion context
   */
  async evaluatePathRules(
    userId: number,
    pathId: number,
  ): Promise<RuleEvaluationResult[]> {
    const rules = await this.getRulesBySourcePath(pathId);
    const results: RuleEvaluationResult[] = [];

    for (const rule of rules) {
      const result = await this.evaluateSingleRule(rule, userId);
      results.push({
        rule_id: rule.id,
        target_submodule_id: rule.target_submodule_id,
        target_path_id: rule.target_path_id,
        unlocked: result.unlocked,
        reason: result.reason,
      });
    }

    return results;
  }

  /**
   * Evaluate a single rule for a user
   * Returns an object with unlocked status and reason
   */
  async evaluateSingleRule(
    rule: BranchingRule,
    userId: number,
  ): Promise<{ unlocked: boolean; reason: string }> {
    switch (rule.condition_type) {
      case "always":
        return { unlocked: true, reason: "Always unlock" };

      case "question_answer": {
        const unlocked = await this.evaluateQuestionAnswer(userId, rule.condition_config);
        return { unlocked, reason: unlocked ? "Question answer matched" : "Question answer did not match" };
      }

      case "all_complete": {
        const unlocked = await this.evaluateAllComplete(userId, rule.condition_config);
        return { unlocked, reason: unlocked ? "All items completed" : "Not all items completed" };
      }

      case "any_complete": {
        const unlocked = await this.evaluateAnyComplete(userId, rule.condition_config);
        return { unlocked, reason: unlocked ? "At least one item completed" : "No items completed" };
      }

      default:
        console.warn(`Unknown condition type: ${rule.condition_type}`);
        return { unlocked: false, reason: `Unknown condition type: ${rule.condition_type}` };
    }
  }

  /**
   * Evaluate question_answer condition
   */
  private async evaluateQuestionAnswer(
    userId: number,
    config: ConditionConfig,
  ): Promise<boolean> {
    if (!config.question_id) {
      console.warn("question_answer condition missing question_id");
      return false;
    }

    const response = await questionRepository.getUserResponse(
      userId,
      config.question_id,
    );

    if (!response) return false;

    const operator = config.operator || "equals";
    const expectedValue = config.expected_value;
    const actualValue = response.response_value;

    // If expected value is undefined, we can't compare
    if (expectedValue === undefined) {
      console.warn("question_answer condition missing expected_value");
      return false;
    }

    return this.compareValues(actualValue, expectedValue, operator);
  }

  /**
   * Compare two values based on operator
   */
  private compareValues(
    actual: ResponseValue,
    expected: ResponseValue,
    operator: string,
  ): boolean {
    switch (operator) {
      case "equals":
        return this.deepEqual(actual, expected);

      case "not_equals":
        return !this.deepEqual(actual, expected);

      case "contains":
        if (Array.isArray(actual)) {
          return actual.some((item) => this.deepEqual(item, expected));
        }
        if (typeof actual === "string" && typeof expected === "string") {
          return actual.includes(expected);
        }
        return false;

      case "greater_than":
        if (typeof actual === "number" && typeof expected === "number") {
          return actual > expected;
        }
        return false;

      case "less_than":
        if (typeof actual === "number" && typeof expected === "number") {
          return actual < expected;
        }
        return false;

      default:
        console.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }

  /**
   * Deep equality check for values
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (typeof a === "object" && typeof b === "object") {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (const key of keysA) {
        if (
          !this.deepEqual(
            (a as Record<string, unknown>)[key],
            (b as Record<string, unknown>)[key],
          )
        ) return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Evaluate all_complete condition
   * Supports submodule_ids, path_ids, and module_ids
   */
  private async evaluateAllComplete(
    userId: number,
    config: ConditionConfig,
  ): Promise<boolean> {
    const submoduleIds = config.submodule_ids || [];
    const pathIds = config.path_ids || [];
    const moduleIds = config.module_ids || [];

    if (submoduleIds.length === 0 && pathIds.length === 0 && moduleIds.length === 0) {
      console.warn("all_complete condition missing submodule_ids, path_ids, or module_ids");
      return false;
    }

    // Check submodules
    if (submoduleIds.length > 0) {
      const result = await sql`
        SELECT COUNT(*) as incomplete_count
        FROM terminal_utopia.submodules s
        LEFT JOIN terminal_utopia.user_submodule_progress usp
          ON s.id = usp.submodule_id AND usp.user_id = ${userId}
        WHERE s.id = ANY(${submoduleIds})
        AND (usp.status IS NULL OR usp.status != 'COMPLETED')
      `;
      if (parseInt((result[0] as { incomplete_count: string }).incomplete_count, 10) > 0) {
        return false;
      }
    }

    // Check paths
    if (pathIds.length > 0) {
      const result = await sql`
        SELECT COUNT(*) as incomplete_count
        FROM terminal_utopia.paths p
        LEFT JOIN terminal_utopia.user_path_progress upp
          ON p.id = upp.path_id AND upp.user_id = ${userId}
        WHERE p.id = ANY(${pathIds})
        AND (upp.status IS NULL OR upp.status != 'COMPLETED')
      `;
      if (parseInt((result[0] as { incomplete_count: string }).incomplete_count, 10) > 0) {
        return false;
      }
    }

    // Check modules
    if (moduleIds.length > 0) {
      const result = await sql`
        SELECT COUNT(*) as incomplete_count
        FROM terminal_utopia.modules m
        LEFT JOIN terminal_utopia.user_module_progress ump
          ON m.id = ump.module_id AND ump.user_id = ${userId}
        WHERE m.id = ANY(${moduleIds})
        AND (ump.status IS NULL OR ump.status != 'COMPLETED')
      `;
      if (parseInt((result[0] as { incomplete_count: string }).incomplete_count, 10) > 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate any_complete condition
   * Supports submodule_ids, path_ids, and module_ids
   */
  private async evaluateAnyComplete(
    userId: number,
    config: ConditionConfig,
  ): Promise<boolean> {
    const submoduleIds = config.submodule_ids || [];
    const pathIds = config.path_ids || [];
    const moduleIds = config.module_ids || [];

    if (submoduleIds.length === 0 && pathIds.length === 0 && moduleIds.length === 0) {
      console.warn("any_complete condition missing submodule_ids, path_ids, or module_ids");
      return false;
    }

    // Check submodules
    if (submoduleIds.length > 0) {
      const result = await sql`
        SELECT COUNT(*) as complete_count
        FROM terminal_utopia.user_submodule_progress
        WHERE user_id = ${userId}
        AND submodule_id = ANY(${submoduleIds})
        AND status = 'COMPLETED'
      `;
      if (parseInt((result[0] as { complete_count: string }).complete_count, 10) > 0) {
        return true;
      }
    }

    // Check paths
    if (pathIds.length > 0) {
      const result = await sql`
        SELECT COUNT(*) as complete_count
        FROM terminal_utopia.user_path_progress
        WHERE user_id = ${userId}
        AND path_id = ANY(${pathIds})
        AND status = 'COMPLETED'
      `;
      if (parseInt((result[0] as { complete_count: string }).complete_count, 10) > 0) {
        return true;
      }
    }

    // Check modules
    if (moduleIds.length > 0) {
      const result = await sql`
        SELECT COUNT(*) as complete_count
        FROM terminal_utopia.user_module_progress
        WHERE user_id = ${userId}
        AND module_id = ANY(${moduleIds})
        AND status = 'COMPLETED'
      `;
      if (parseInt((result[0] as { complete_count: string }).complete_count, 10) > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get list of submodule IDs that should be unlocked for a user
   */
  async getUnlockedSubmodules(
    userId: number,
    moduleId: number,
    submoduleId?: number | null,
  ): Promise<number[]> {
    const results = await this.evaluateRules(userId, moduleId, submoduleId);
    return results
      ?.filter((r) => r.unlocked)
      ?.map((r) => r.target_submodule_id) ?? [] as number[];
  }

  /**
   * Check if a specific submodule is unlocked by branching rules
   */
  async isSubmoduleUnlockedByRules(
    userId: number,
    submoduleId: number,
  ): Promise<boolean> {
    const rules = await this.getRulesByTargetSubmodule(submoduleId);

    // If no rules target this submodule, it's not controlled by branching
    if (rules.length === 0) return true;

    // Check if ANY rule unlocks this submodule
    for (const rule of rules) {
      const result = await this.evaluateSingleRule(rule, userId);
      if (result.unlocked) return true;
    }

    return false;
  }

  /**
   * Get list of path IDs that should be unlocked for a user based on path completion
   */
  async getUnlockedPaths(
    userId: number,
    sourcePathId: number,
  ): Promise<number[]> {
    const results = await this.evaluatePathRules(userId, sourcePathId);
    return results
      .filter((r) => r.unlocked && r.target_path_id)
      .map((r) => r.target_path_id as number);
  }

  /**
   * Check if a specific path is unlocked by branching rules
   */
  async isPathUnlockedByRules(
    userId: number,
    pathId: number,
  ): Promise<boolean> {
    const rules = await this.getRulesByTargetPath(pathId);

    // If no rules target this path, it's not controlled by branching
    if (rules.length === 0) return true;

    // Check if ANY rule unlocks this path
    for (const rule of rules) {
      const result = await this.evaluateSingleRule(rule, userId);
      if (result.unlocked) return true;
    }

    return false;
  }

  // ==========================================================================
  // Administrative Operations
  // ==========================================================================

  /**
   * Create a new branching rule
   */
  async createRule(
    data: Omit<BranchingRule, "id" | "created_at" | "updated_at" | "is_active">,
  ): Promise<BranchingRule> {
    const result = await sql`
      INSERT INTO terminal_utopia.branching_rules (
        source_module_id,
        source_submodule_id,
        source_path_id,
        target_submodule_id,
        target_path_id,
        condition_type,
        condition_config,
        priority
      )
      VALUES (
        ${data.source_module_id},
        ${data.source_submodule_id},
        ${data.source_path_id},
        ${data.target_submodule_id},
        ${data.target_path_id},
        ${data.condition_type},
        ${JSON.stringify(data.condition_config)},
        ${data.priority}
      )
      RETURNING *
    `;

    return result[0] as BranchingRule;
  }

  /**
   * Update a branching rule
   */
  async updateRule(
    ruleId: number,
    data: Partial<Omit<BranchingRule, "id" | "created_at" | "updated_at">>,
  ): Promise<BranchingRule | null> {
    if (Object.keys(data).length === 0) {
      return this.getRuleById(ruleId);
    }

    // Build update object with JSON stringified condition_config
    const updateData: Record<string, unknown> = {};

    if (data.source_module_id !== undefined) {
      updateData.source_module_id = data.source_module_id;
    }
    if (data.source_submodule_id !== undefined) {
      updateData.source_submodule_id = data.source_submodule_id;
    }
    if (data.source_path_id !== undefined) {
      updateData.source_path_id = data.source_path_id;
    }
    if (data.target_submodule_id !== undefined) {
      updateData.target_submodule_id = data.target_submodule_id;
    }
    if (data.target_path_id !== undefined) {
      updateData.target_path_id = data.target_path_id;
    }
    if (data.condition_type !== undefined) {
      updateData.condition_type = data.condition_type;
    }
    if (data.condition_config !== undefined) {
      updateData.condition_config = JSON.stringify(data.condition_config);
    }
    if (data.priority !== undefined) {
      updateData.priority = data.priority;
    }
    if (data.is_active !== undefined) {
      updateData.is_active = data.is_active;
    }

    const entries = Object.entries(updateData);
    if (entries.length === 0) {
      return this.getRuleById(ruleId);
    }

    const setClause = entries.map(([key], index) => `${key} = $${index + 2}`)
      .join(", ");

    const result = await sql`
      UPDATE terminal_utopia.branching_rules
      SET ${sql.unsafe(setClause)}
      WHERE id = ${ruleId}
      RETURNING *
    `;

    return result.length > 0 ? (result[0] as BranchingRule) : null;
  }

  /**
   * Delete a branching rule (soft delete)
   */
  async deleteRule(ruleId: number): Promise<boolean> {
    const result = await sql`
      UPDATE terminal_utopia.branching_rules
      SET is_active = false
      WHERE id = ${ruleId}
    `;

    return (result as unknown as { count: number }).count > 0;
  }

  /**
   * Delete all rules for a module
   */
  async deleteRulesForModule(moduleId: number): Promise<number> {
    const result = await sql`
      UPDATE terminal_utopia.branching_rules
      SET is_active = false
      WHERE source_module_id = ${moduleId}
    `;

    return (result as unknown as { count: number }).count;
  }

  /**
   * Delete all rules for a submodule (both source and target)
   */
  async deleteRulesForSubmodule(submoduleId: number): Promise<number> {
    const result = await sql`
      UPDATE terminal_utopia.branching_rules
      SET is_active = false
      WHERE source_submodule_id = ${submoduleId}
         OR target_submodule_id = ${submoduleId}
    `;

    return (result as unknown as { count: number }).count;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Create a simple question-based rule
   */
  createQuestionRule(
    sourceModuleId: number,
    sourceSubmoduleId: number | null,
    targetSubmoduleId: number,
    questionId: number,
    expectedValue: ResponseValue,
    operator:
      | "equals"
      | "not_equals"
      | "contains"
      | "greater_than"
      | "less_than" = "equals",
    priority: number = 0,
  ): Promise<BranchingRule> {
    return this.createRule({
      source_module_id: sourceModuleId,
      source_submodule_id: sourceSubmoduleId,
      target_submodule_id: targetSubmoduleId,
      condition_type: "question_answer",
      condition_config: {
        question_id: questionId,
        expected_value: expectedValue,
        operator,
      },
      priority,
    });
  }

  /**
   * Create an always-unlock rule
   */
  createAlwaysRule(
    sourceModuleId: number,
    sourceSubmoduleId: number | null,
    targetSubmoduleId: number,
    priority: number = 0,
  ): Promise<BranchingRule> {
    return this.createRule({
      source_module_id: sourceModuleId,
      source_submodule_id: sourceSubmoduleId,
      source_path_id: null,
      target_submodule_id: targetSubmoduleId,
      target_path_id: null,
      condition_type: "always",
      condition_config: {},
      priority,
    });
  }

  /**
   * Create a path-to-path rule that unlocks a target path when a source path is completed
   */
  createPathRule(
    sourcePathId: number,
    targetPathId: number,
    conditionType: ConditionType = "always",
    conditionConfig: ConditionConfig = {},
    priority: number = 0,
  ): Promise<BranchingRule> {
    return this.createRule({
      source_module_id: 0, // Required field, set to 0 for path-only rules
      source_submodule_id: null,
      source_path_id: sourcePathId,
      target_submodule_id: null,
      target_path_id: targetPathId,
      condition_type: conditionType,
      condition_config: conditionConfig,
      priority,
    });
  }

  /**
   * Create a question-based path rule
   */
  createQuestionPathRule(
    sourcePathId: number,
    targetPathId: number,
    questionId: number,
    expectedValue: ResponseValue,
    operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" = "equals",
    priority: number = 0,
  ): Promise<BranchingRule> {
    return this.createPathRule(
      sourcePathId,
      targetPathId,
      "question_answer",
      {
        question_id: questionId,
        expected_value: expectedValue,
        operator,
      },
      priority,
    );
  }

  /**
   * Delete all rules for a path (both source and target)
   */
  async deleteRulesForPath(pathId: number): Promise<number> {
    const result = await sql`
      UPDATE terminal_utopia.branching_rules
      SET is_active = false
      WHERE source_path_id = ${pathId}
         OR target_path_id = ${pathId}
    `;

    return (result as unknown as { count: number }).count;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const branchingRuleRepository = new BranchingRuleRepository();
