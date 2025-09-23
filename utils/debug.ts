// Debug utilities for the Utopia API
export const DEBUG = Deno.env.get("DEBUG") === "true" || Deno.env.get("NODE_ENV") === "development";

export function debugLog(category: string, ...args: unknown[]) {
  if (DEBUG) {
    console.log(`🐛 [${category}]`, ...args);
  }
}

export function debugError(category: string, error: Error, context?: Record<string, unknown>) {
  if (DEBUG) {
    console.error(`❌ [${category}] Error:`, error.message);
    console.error(`📍 Stack:`, error.stack);
    if (context) {
      console.error(`📋 Context:`, context);
    }
  }
}

export function debugRequest(method: string, url: string, headers: Record<string, string>, body?: unknown) {
  if (DEBUG) {
    console.log(`🔍 === REQUEST DEBUG ===`);
    console.log(`📥 ${method} ${url}`);
    console.log(`📋 Headers:`, headers);
    if (body) {
      console.log(`📦 Body:`, typeof body === "string" ? body : JSON.stringify(body, null, 2));
    }
    console.log(`🔍 === END REQUEST ===`);
  }
}

export function debugResponse(status: number, body?: unknown, duration?: number) {
  if (DEBUG) {
    console.log(`🔍 === RESPONSE DEBUG ===`);
    console.log(`📤 Status: ${status}`);
    if (body) {
      console.log(`📦 Body:`, typeof body === "string" ? body : JSON.stringify(body, null, 2));
    }
    if (duration) {
      console.log(`⏱️ Duration: ${duration}ms`);
    }
    console.log(`🔍 === END RESPONSE ===`);
  }
}

// Performance timing utility
export function createTimer() {
  const start = performance.now();
  return {
    end: () => Math.round(performance.now() - start),
  };
}

// Database query debug helper
export function debugQuery(query: string, params?: unknown[]) {
  if (DEBUG) {
    console.log(`🗃️ [DB] Query:`, query);
    if (params && params.length > 0) {
      console.log(`🗃️ [DB] Params:`, params);
    }
  }
}

// Environment variable checker
export function checkRequiredEnvVars(vars: string[]) {
  const missing = vars.filter(varName => !Deno.env.get(varName));
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
    return false;
  }
  return true;
}
