import { Action, SuccessfulPattern, FailurePattern, DomainMemory } from '@flowly/shared';
import { computeSuccessfulPatternHash, computeFailurePatternHash, deduplicateAndAddSuccess, deduplicateAndAddFailure } from '../../extension/src/background/memory/deduplicator.js';
import { serializeDomainMemory, deserializeDomainMemory, serializeMemories, deserializeMemories } from '../../extension/src/background/memory/serializers/domainMemory.js';

console.log('🧪 Running Memory Subsystem Unit Tests...');

// 1. Test Hash generation
const goal = 'Search Python on Reddit';
const actions: Action[] = [
  { type: 'click', elementId: 'flowly-node-1', reasoning: 'Click input' },
  { type: 'type', elementId: 'flowly-node-1', value: 'Python', reasoning: 'Type Python' }
];

const hash1 = computeSuccessfulPatternHash(goal, actions);
const hash2 = computeSuccessfulPatternHash('  search python on reddit  ', actions);
if (hash1 !== hash2) {
  console.error('❌ Failed: Goal normalization hashing failed.');
  process.exit(1);
} else {
  console.log('✅ Hashing normalization passed.');
}

// 2. Test Deduplication for Successful Patterns
const initialSuccessPatterns: SuccessfulPattern[] = [
  {
    id: 'old-1',
    domain: 'reddit.com',
    goal: 'Search Python on Reddit',
    timestamp: '2026-06-20T00:00:00.000Z',
    actions: actions
  }
];

const newSuccessPattern: SuccessfulPattern = {
  id: 'new-1',
  domain: 'reddit.com',
  goal: 'Search Python on Reddit',
  timestamp: '2026-06-20T01:00:00.000Z',
  actions: actions
};

const updatedSuccessList = deduplicateAndAddSuccess(initialSuccessPatterns, newSuccessPattern);

if (updatedSuccessList.length !== 1) {
  console.error('❌ Failed: Successful pattern deduplication failed to prevent duplicates. Length is: ' + updatedSuccessList.length);
  process.exit(1);
}
if (updatedSuccessList[0].id !== 'old-1') {
  console.error('❌ Failed: Deduplication did not preserve the original ID.');
  process.exit(1);
}
if (updatedSuccessList[0].timestamp !== '2026-06-20T01:00:00.000Z') {
  console.error('❌ Failed: Deduplication failed to update pattern to the latest timestamp.');
  process.exit(1);
}
console.log('✅ Successful pattern deduplication (recency strengthening) passed.');

// 3. Test Deduplication for Failures
const initialFailures: FailurePattern[] = [
  {
    id: 'fail-1',
    domain: 'reddit.com',
    goal: 'Login on Reddit',
    failedStep: 2,
    error: 'Element not found',
    timestamp: '2026-06-20T00:00:00.000Z'
  }
];

const newFailurePattern: FailurePattern = {
  id: 'fail-2',
  domain: 'reddit.com',
  goal: 'Login on Reddit',
  failedStep: 2,
  error: 'Element not found',
  timestamp: '2026-06-20T01:00:00.000Z'
};

const updatedFailuresList = deduplicateAndAddFailure(initialFailures, newFailurePattern);

if (updatedFailuresList.length !== 1) {
  console.error('❌ Failed: Failure pattern deduplication failed. Length is: ' + updatedFailuresList.length);
  process.exit(1);
}
if (updatedFailuresList[0].timestamp !== '2026-06-20T01:00:00.000Z') {
  console.error('❌ Failed: Failure deduplication failed to update timestamp.');
  process.exit(1);
}
console.log('✅ Failure pattern deduplication passed.');

// 4. Test Serialization and Version 1 Deserialization/Migration
const testMemory: any = {
  domain: 'reddit.com',
  successfulPatterns: [newSuccessPattern],
  failures: [newFailurePattern],
  extraField: 'should-be-ignored'
};

const deserialized = deserializeDomainMemory(testMemory);

if (deserialized.version !== 1) {
  console.error('❌ Failed: Coercion to memory schema version 1 failed.');
  process.exit(1);
}
if (deserialized.domain !== 'reddit.com') {
  console.error('❌ Failed: Deserialization lost domain field.');
  process.exit(1);
}
if (deserialized.successfulPatterns.length !== 1 || deserialized.failures.length !== 1) {
  console.error('❌ Failed: Deserialization pattern counts incorrect.');
  process.exit(1);
}
console.log('✅ Serialization & version schema migration passed.');

console.log('🎉 All Memory Subsystem Unit Tests Passed Successfully!');
