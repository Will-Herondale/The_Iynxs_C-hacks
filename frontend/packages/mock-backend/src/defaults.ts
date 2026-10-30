import { loadMockConfigFromEnvironment, resetMockConfig } from './config.js';
import type { MockRelay, ScenarioRules } from './scenario.js';
import { scenarioRules } from './seed/index.js';
import { MockStore } from './store.js';

/** The scenario the shared singleton uses (H2's seed by default; override via setScenarioRules()). */
let rules: ScenarioRules = scenarioRules;
let singleton: MockStore | undefined;

export function setScenarioRules(next: ScenarioRules): void {
  rules = next;
  singleton?.close();
  singleton = undefined;
}

export function getMockStore(opts: { relay?: MockRelay } = {}): MockStore {
  if (!singleton) {
    loadMockConfigFromEnvironment();
    singleton = new MockStore({ rules, relay: opts.relay });
  }
  return singleton;
}

/** Test hook: close the singleton, wipe persisted state and restore default failure config. */
export function resetMock(): void {
  const s = singleton ?? new MockStore({ rules, channel: false });
  s.reset();
  s.close();
  singleton = undefined;
  resetMockConfig();
}

/** Test hook: apply every pending accepted event immediately (skips the delay). */
export function flushMock(): number {
  return getMockStore().applyDue(true);
}
