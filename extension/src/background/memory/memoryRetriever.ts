import { DomainMemory } from '@flowly/shared';
import * as store from '../state/store';

/**
 * Retrieves the DomainMemory for the given domain.
 * Sorts successful patterns and failure patterns by timestamp in descending order (recency-first).
 */
export function getRelevantMemories(domain: string): DomainMemory | null {
  const normalizedDomain = domain.toLowerCase().trim();
  const memories = store.getState().memories || [];
  const domainMem = memories.find(m => m.domain.toLowerCase() === normalizedDomain);
  
  if (!domainMem) {
    return null;
  }

  // Ensure successful patterns are sorted by recency
  const sortedSuccess = [...domainMem.successfulPatterns].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  // Ensure failure patterns are sorted by recency
  const sortedFailures = [...domainMem.failures].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return {
    version: domainMem.version || 1,
    domain: domainMem.domain,
    successfulPatterns: sortedSuccess,
    failures: sortedFailures
  };
}
