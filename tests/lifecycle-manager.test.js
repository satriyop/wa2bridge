/**
 * Lifecycle Manager Tests
 *
 * Tests for component lifecycle tracking and cleanup:
 * - Component registration
 * - Destroy order (LIFO)
 * - Fallback cleanup methods
 * - Error handling during cleanup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LifecycleManager } from '../src/lifecycle-manager.js';

// =============================================================================
// COMPONENT TRACKING TESTS
// =============================================================================

describe('LifecycleManager - Component Tracking', () => {
  let lifecycle;

  beforeEach(() => {
    lifecycle = new LifecycleManager();
  });

  it('should start with no components', () => {
    expect(lifecycle.size).toBe(0);
    expect(lifecycle.getTrackedNames()).toEqual([]);
  });

  it('should track a single component', () => {
    const component = { destroy: vi.fn() };
    lifecycle.track('testComponent', component);

    expect(lifecycle.size).toBe(1);
    expect(lifecycle.getTrackedNames()).toEqual(['testComponent']);
  });

  it('should track multiple components', () => {
    lifecycle.track('comp1', { destroy: vi.fn() });
    lifecycle.track('comp2', { destroy: vi.fn() });
    lifecycle.track('comp3', { destroy: vi.fn() });

    expect(lifecycle.size).toBe(3);
    expect(lifecycle.getTrackedNames()).toEqual(['comp1', 'comp2', 'comp3']);
  });

  it('should skip null components', () => {
    lifecycle.track('nullComp', null);

    expect(lifecycle.size).toBe(0);
  });

  it('should skip undefined components', () => {
    lifecycle.track('undefinedComp', undefined);

    expect(lifecycle.size).toBe(0);
  });

  it('should track custom destroy method names', () => {
    const component = { customCleanup: vi.fn() };
    lifecycle.track('customComp', component, 'customCleanup');

    expect(lifecycle.size).toBe(1);
  });
});

// =============================================================================
// DESTROY ALL TESTS
// =============================================================================

describe('LifecycleManager - destroyAll', () => {
  let lifecycle;

  beforeEach(() => {
    lifecycle = new LifecycleManager();
  });

  it('should call destroy method on components', async () => {
    const comp1 = { destroy: vi.fn() };
    const comp2 = { destroy: vi.fn() };

    lifecycle.track('comp1', comp1);
    lifecycle.track('comp2', comp2);

    await lifecycle.destroyAll();

    expect(comp1.destroy).toHaveBeenCalled();
    expect(comp2.destroy).toHaveBeenCalled();
  });

  it('should destroy components in reverse order (LIFO)', async () => {
    const callOrder = [];
    const comp1 = { destroy: vi.fn(() => callOrder.push('comp1')) };
    const comp2 = { destroy: vi.fn(() => callOrder.push('comp2')) };
    const comp3 = { destroy: vi.fn(() => callOrder.push('comp3')) };

    lifecycle.track('comp1', comp1);
    lifecycle.track('comp2', comp2);
    lifecycle.track('comp3', comp3);

    await lifecycle.destroyAll();

    // Reverse order: comp3 first, comp1 last
    expect(callOrder).toEqual(['comp3', 'comp2', 'comp1']);
  });

  it('should clear components after destroyAll', async () => {
    lifecycle.track('comp', { destroy: vi.fn() });

    await lifecycle.destroyAll();

    expect(lifecycle.size).toBe(0);
    expect(lifecycle.getTrackedNames()).toEqual([]);
  });

  it('should use custom destroy method when specified', async () => {
    const component = {
      customShutdown: vi.fn(),
      destroy: vi.fn(), // Should not be called
    };

    lifecycle.track('custom', component, 'customShutdown');
    await lifecycle.destroyAll();

    expect(component.customShutdown).toHaveBeenCalled();
    expect(component.destroy).not.toHaveBeenCalled();
  });

  it('should handle async destroy methods', async () => {
    let completed = false;
    const component = {
      destroy: vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        completed = true;
      }),
    };

    lifecycle.track('asyncComp', component);
    await lifecycle.destroyAll();

    expect(completed).toBe(true);
    expect(component.destroy).toHaveBeenCalled();
  });
});

// =============================================================================
// FALLBACK METHOD TESTS
// =============================================================================

describe('LifecycleManager - Fallback Methods', () => {
  let lifecycle;

  beforeEach(() => {
    lifecycle = new LifecycleManager();
  });

  it('should fallback to stop() if destroy method not found', async () => {
    const component = { stop: vi.fn() };

    lifecycle.track('comp', component);
    await lifecycle.destroyAll();

    expect(component.stop).toHaveBeenCalled();
  });

  it('should fallback to cleanup() if destroy/stop not found', async () => {
    const component = { cleanup: vi.fn() };

    lifecycle.track('comp', component);
    await lifecycle.destroyAll();

    expect(component.cleanup).toHaveBeenCalled();
  });

  it('should fallback to close() if other methods not found', async () => {
    const component = { close: vi.fn() };

    lifecycle.track('comp', component);
    await lifecycle.destroyAll();

    expect(component.close).toHaveBeenCalled();
  });

  it('should prefer configured method over fallbacks', async () => {
    const component = {
      myMethod: vi.fn(),
      stop: vi.fn(),
      cleanup: vi.fn(),
      close: vi.fn(),
    };

    lifecycle.track('comp', component, 'myMethod');
    await lifecycle.destroyAll();

    expect(component.myMethod).toHaveBeenCalled();
    expect(component.stop).not.toHaveBeenCalled();
    expect(component.cleanup).not.toHaveBeenCalled();
    expect(component.close).not.toHaveBeenCalled();
  });

  it('should handle components with no cleanup methods', async () => {
    const component = { someOtherMethod: vi.fn() };

    lifecycle.track('noCleanup', component);

    // Should not throw
    await expect(lifecycle.destroyAll()).resolves.not.toThrow();
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe('LifecycleManager - Error Handling', () => {
  let lifecycle;

  beforeEach(() => {
    lifecycle = new LifecycleManager();
  });

  it('should continue cleanup after one component fails', async () => {
    const comp1 = {
      destroy: vi.fn(() => {
        throw new Error('Comp1 failed');
      }),
    };
    const comp2 = { destroy: vi.fn() };
    const comp3 = { destroy: vi.fn() };

    lifecycle.track('comp1', comp1);
    lifecycle.track('comp2', comp2);
    lifecycle.track('comp3', comp3);

    // Should not throw, should continue to next component
    await expect(lifecycle.destroyAll()).resolves.not.toThrow();

    // All components should have been attempted
    expect(comp1.destroy).toHaveBeenCalled();
    expect(comp2.destroy).toHaveBeenCalled();
    expect(comp3.destroy).toHaveBeenCalled();
  });

  it('should handle async errors gracefully', async () => {
    const failingComp = {
      destroy: vi.fn(async () => {
        throw new Error('Async failure');
      }),
    };
    const successComp = { destroy: vi.fn() };

    lifecycle.track('failing', failingComp);
    lifecycle.track('success', successComp);

    await expect(lifecycle.destroyAll()).resolves.not.toThrow();
    expect(successComp.destroy).toHaveBeenCalled();
  });

  it('should log errors when logger is provided', async () => {
    const logger = { warn: vi.fn(), debug: vi.fn() };
    const failingComp = {
      destroy: vi.fn(() => {
        throw new Error('Test error');
      }),
    };

    lifecycle.track('failing', failingComp);
    await lifecycle.destroyAll(logger);

    expect(logger.warn).toHaveBeenCalled();
    expect(logger.warn.mock.calls[0][0]).toMatchObject({
      component: 'failing',
    });
  });

  it('should log successful cleanup when logger is provided', async () => {
    const logger = { warn: vi.fn(), debug: vi.fn() };
    const component = { destroy: vi.fn() };

    lifecycle.track('success', component);
    await lifecycle.destroyAll(logger);

    expect(logger.debug).toHaveBeenCalled();
    expect(logger.debug.mock.calls[0][0]).toMatchObject({
      component: 'success',
      method: 'destroy',
    });
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('LifecycleManager - Edge Cases', () => {
  let lifecycle;

  beforeEach(() => {
    lifecycle = new LifecycleManager();
  });

  it('should handle calling destroyAll multiple times', async () => {
    const component = { destroy: vi.fn() };

    lifecycle.track('comp', component);

    await lifecycle.destroyAll();
    await lifecycle.destroyAll();

    // Should only be called once (first destroyAll clears list)
    expect(component.destroy).toHaveBeenCalledTimes(1);
  });

  it('should handle empty destroyAll', async () => {
    await expect(lifecycle.destroyAll()).resolves.not.toThrow();
  });

  it('should handle components added after partial destroyAll', async () => {
    const comp1 = { destroy: vi.fn() };
    const comp2 = { destroy: vi.fn() };

    lifecycle.track('comp1', comp1);
    await lifecycle.destroyAll();

    lifecycle.track('comp2', comp2);

    expect(lifecycle.size).toBe(1);
    expect(lifecycle.getTrackedNames()).toEqual(['comp2']);
  });

  it('should handle method that returns a value', async () => {
    const component = {
      destroy: vi.fn(() => 'return value'),
    };

    lifecycle.track('comp', component);

    // Should not throw even if method returns something
    await expect(lifecycle.destroyAll()).resolves.not.toThrow();
  });

  it('should handle method that is a getter', async () => {
    const component = {
      get destroy() {
        return () => {};
      },
    };

    lifecycle.track('comp', component);
    await expect(lifecycle.destroyAll()).resolves.not.toThrow();
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('LifecycleManager - Integration', () => {
  it('should work with real-world component patterns', async () => {
    // Simulate real component cleanup patterns
    const presenceManager = {
      stopPresenceCycle: vi.fn(),
    };

    const rateLimiter = {
      saveStats: vi.fn(async () => {
        // Simulate file write
        await new Promise(resolve => setTimeout(resolve, 5));
      }),
    };

    const messageQueue = {
      destroy: vi.fn(),
    };

    const timerRegistry = {
      clearAll: vi.fn(),
    };

    const lifecycle = new LifecycleManager();

    // Track in order of dependency
    lifecycle.track('rateLimiter', rateLimiter, 'saveStats');
    lifecycle.track('presenceManager', presenceManager, 'stopPresenceCycle');
    lifecycle.track('messageQueue', messageQueue);
    lifecycle.track('timerRegistry', timerRegistry, 'clearAll');

    await lifecycle.destroyAll();

    // All should be called
    expect(presenceManager.stopPresenceCycle).toHaveBeenCalled();
    expect(rateLimiter.saveStats).toHaveBeenCalled();
    expect(messageQueue.destroy).toHaveBeenCalled();
    expect(timerRegistry.clearAll).toHaveBeenCalled();

    // Components should be empty
    expect(lifecycle.size).toBe(0);
  });
});
