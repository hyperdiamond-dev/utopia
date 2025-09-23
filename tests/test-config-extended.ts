// Extended test configuration for proper stub functionality
export * from "./test-config.ts";

// Helper function to create a stub that can be used without specific object/method targeting
export function createStub<T extends (...args: unknown[]) => unknown>(fn?: T) {
  let callCount = 0;
  const calls: unknown[][] = [];
  let resolvedValue: unknown = undefined;
  let rejectedValue: unknown = undefined;
  const callResults: unknown[] = [];

  const mockFn = (...args: unknown[]) => {
    callCount++;
    calls.push(args);

    if (callResults[callCount - 1] !== undefined) {
      return callResults[callCount - 1];
    }

    if (rejectedValue !== undefined) {
      return Promise.reject(rejectedValue);
    }

    if (resolvedValue !== undefined) {
      return Promise.resolve(resolvedValue);
    }

    return fn ? fn(...args) : undefined;
  };

  mockFn.callCount = () => callCount;
  mockFn.calls = calls;
  mockFn.onCall = (index: number) => ({
    resolves: (value: unknown) => {
      callResults[index] = Promise.resolve(value);
      return mockFn;
    },
    rejects: (error: unknown) => {
      callResults[index] = Promise.reject(error);
      return mockFn;
    },
  });
  mockFn.resolves = (value: unknown) => {
    resolvedValue = value;
    return mockFn;
  };
  mockFn.rejects = (error: unknown) => {
    rejectedValue = error;
    return mockFn;
  };

  return mockFn;
}
