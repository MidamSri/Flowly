import { DomainMemory, SuccessfulPattern, FailurePattern } from '@flowly/shared';
import * as store from '../state/store';
import { deserializeMemories, serializeMemories } from './serializers/domainMemory';
import { deduplicateAndAddSuccess, deduplicateAndAddFailure } from './deduplicator';

const MAX_PATTERNS_PER_DOMAIN = 10;
const MAX_DOMAINS = 50;

/**
 * Loads memories from chrome.storage.local and updates the store state.
 */
export function initMemoryStore(): void {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['flowly_memories'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('[Flowly MemoryStore] Error loading memories:', chrome.runtime.lastError);
        return;
      }
      if (result && result.flowly_memories) {
        try {
          const memories = deserializeMemories(result.flowly_memories);
          store.updateState({ memories });
          console.log(`[Flowly MemoryStore] Loaded ${memories.length} domain memories successfully.`);
        } catch (e) {
          console.error('[Flowly MemoryStore] Error deserializing memories:', e);
        }
      } else {
        store.updateState({ memories: [] });
      }
    });
  } else {
    store.updateState({ memories: [] });
  }
}

/**
 * Adds a pattern (success or failure) to a domain's memory, enforces capacity limits, and persists.
 */
export async function addPattern(
  domain: string,
  pattern: { success?: SuccessfulPattern; failure?: FailurePattern }
): Promise<void> {
  const normalizedDomain = domain.toLowerCase().trim();
  let memories = [...(store.getState().memories || [])];
  
  let domainMem = memories.find(m => m.domain.toLowerCase() === normalizedDomain);
  
  if (!domainMem) {
    domainMem = {
      version: 1,
      domain: domain.trim(),
      successfulPatterns: [],
      failures: []
    };
    memories.push(domainMem);
  } else {
    // Clone domainMem to avoid mutation
    domainMem = {
      ...domainMem,
      successfulPatterns: [...domainMem.successfulPatterns],
      failures: [...domainMem.failures]
    };
    memories = memories.map(m => m.domain.toLowerCase() === normalizedDomain ? domainMem! : m);
  }

  if (pattern.success) {
    domainMem.successfulPatterns = deduplicateAndAddSuccess(
      domainMem.successfulPatterns,
      pattern.success
    ).slice(0, MAX_PATTERNS_PER_DOMAIN);
  }

  if (pattern.failure) {
    domainMem.failures = deduplicateAndAddFailure(
      domainMem.failures,
      pattern.failure
    ).slice(0, MAX_PATTERNS_PER_DOMAIN);
  }

  // Prune domains if we exceed the MAX_DOMAINS limit
  if (memories.length > MAX_DOMAINS) {
    const getLatestTimestamp = (dm: DomainMemory) => {
      const timestamps = [
        ...dm.successfulPatterns.map(p => new Date(p.timestamp).getTime()),
        ...dm.failures.map(f => new Date(f.timestamp).getTime())
      ];
      return timestamps.length > 0 ? Math.max(...timestamps) : 0;
    };
    // Sort domains descending by recency
    memories.sort((a, b) => getLatestTimestamp(b) - getLatestTimestamp(a));
    memories = memories.slice(0, MAX_DOMAINS);
  }

  // Update runner state
  store.updateState({ memories });

  // Save to local storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ flowly_memories: memories }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Flowly MemoryStore] Error saving memories:', chrome.runtime.lastError);
      }
    });
  }
}
