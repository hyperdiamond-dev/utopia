import { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { ModuleService } from '../services/moduleService.ts';
import { userRepository } from '../db/index.ts';
import { User } from '../db/users.ts';

type ModuleContext = {
  Variables: {
    user?: { id: string; name: string };
    userRecord?: User;
    moduleAccess?: {
      moduleName: string;
      accessible: boolean;
      reason?: string;
    };
  };
};

/**
 * Middleware to check if a user can access a specific module
 * Expects module name to be in the URL path as :moduleName
 */
export const moduleAccessMiddleware = createMiddleware(async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Get module name from URL parameters
  const moduleName = c.req.param('moduleName');
  if (!moduleName) {
    return c.json({ error: 'Module name required' }, 400);
  }

  try {
    // Get user record from database
    const userRecord = await userRepository.findByUuid(user.id);
    if (!userRecord) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Check module access
    const accessResult = await ModuleService.checkModuleAccess(userRecord.id, moduleName);

    if (!accessResult.accessible) {
      // Log the access denial
      await ModuleService.logAccessDenied(userRecord.id, moduleName, accessResult.reason || 'Unknown');

      return c.json({
        error: 'Module access denied',
        reason: accessResult.reason,
        next_module: accessResult.nextModule?.name,
        message: accessResult.nextModule
          ? `Please complete "${accessResult.nextModule.title}" first`
          : 'Complete previous modules to unlock this content'
      }, 403);
    }

    // Store access information in context for use in route handlers
    c.set('userRecord', userRecord);
    c.set('moduleAccess', {
      moduleName,
      accessible: true
    });

    await next();
  } catch (_error) {
    console.error('Module access check failed:', _error);
    return c.json({ error: 'Failed to check module access' }, 500);
  }
});

/**
 * Middleware specifically for module completion endpoints
 * Ensures user has started the module before allowing completion
 */
export const moduleCompletionMiddleware = async (c: Context & ModuleContext, next: Next) => {
  const userRecord = c.get('userRecord');
  const moduleAccess = c.get('moduleAccess');

  if (!userRecord || !moduleAccess) {
    return c.json({ error: 'Module access validation required' }, 400);
  }

  try {
    // Get module data to check current progress
    const moduleData = await ModuleService.getModuleForUser(userRecord.id, moduleAccess.moduleName);

    if (!moduleData) {
      return c.json({ error: 'Module not found' }, 404);
    }

    // Check if module has been started
    if (!moduleData.progress || moduleData.progress.status === 'NOT_STARTED') {
      return c.json({
        error: 'Module not started',
        message: 'Please start the module before attempting to complete it'
      }, 400);
    }

    // Check if module is already completed
    if (moduleData.isCompleted) {
      return c.json({
        error: 'Module already completed',
        message: 'This module has already been completed and cannot be resubmitted'
      }, 400);
    }

    await next();
  } catch (_error) {
    console.error('Module completion check failed:', _error);
    return c.json({ error: 'Failed to validate module completion' }, 500);
  }
};

/**
 * Middleware for read-only access to completed modules
 * Allows viewing but not modification of completed modules
 */
export const moduleReviewMiddleware = async (c: Context & ModuleContext, next: Next) => {
  const userRecord = c.get('userRecord');
  const moduleAccess = c.get('moduleAccess');

  if (!userRecord || !moduleAccess) {
    return c.json({ error: 'Module access validation required' }, 400);
  }

  try {
    const moduleData = await ModuleService.getModuleForUser(userRecord.id, moduleAccess.moduleName);

    if (!moduleData) {
      return c.json({ error: 'Module not found' }, 404);
    }

    // For review access, module must be completed or at least accessible
    if (!moduleData.accessible && !moduleData.isCompleted) {
      return c.json({
        error: 'Module not accessible',
        message: 'Complete previous modules to access this content'
      }, 403);
    }

    await next();
  } catch (_error) {
    console.error('Module review check failed:', _error);
    return c.json({ error: 'Failed to validate module access' }, 500);
  }
};

/**
 * Middleware to enforce sequential access and redirect to current module
 */
export const enforceSequentialAccess = async (c: Context & ModuleContext, next: Next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  try {
    const userRecord = await userRepository.findByUuid(user.id);
    if (!userRecord) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get user's current module
    const currentModule = await ModuleService.getCurrentModule(userRecord.id);

    if (currentModule) {
      // Get the requested module name from the URL
      const requestedModule = c.req.param('moduleName');

      // If they're trying to access a different module than their current one
      if (requestedModule && requestedModule !== currentModule.name) {
        const moduleData = await ModuleService.getModuleForUser(userRecord.id, requestedModule);

        // If the requested module is not accessible, redirect to current module
        if (!moduleData?.accessible) {
          return c.json({
            error: 'Sequential access required',
            current_module: currentModule.name,
            message: `Please complete "${currentModule.title}" before accessing other modules`,
            redirect_to: `/api/modules/${currentModule.name}`
          }, 302);
        }
      }
    }

    c.set('userRecord', userRecord);
    await next();
  } catch (_error) {
    console.error('Sequential access enforcement failed:', _error);
    return c.json({ error: 'Failed to enforce sequential access' }, 500);
  }
};