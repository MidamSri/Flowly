import { compressSemanticTree } from './agent/parser.js';
import { SemanticNode } from '@flowly/shared';

const mockElements: SemanticNode[] = [
  { id: 'el-0', type: 'container', text: 'Post Feed', disabled: false },
  { id: 'el-1', type: 'container', text: '', parentId: 'el-0', disabled: false }, // Empty wrapper - should be pruned
  { id: 'el-2', type: 'link', text: '@MrBeast', parentId: 'el-0', disabled: false },
  { id: 'el-3', type: 'button', text: 'Subscribe', parentId: 'el-0', disabled: false }
];

console.log('🧪 Running Semantic Node Parser unit test...');
const result = compressSemanticTree(mockElements);
console.log('\n--- Compressed Output ---');
console.log(result);
console.log('-------------------------\n');

const expected = `[el-0] Container (Post Feed)
  [el-2] Link "@MrBeast"
  [el-3] Button "Subscribe"`;

if (result.trim() === expected.trim()) {
  console.log('✅ Unit Test Passed: Semantic tree correctly pruned and structured!\n');
  process.exit(0);
} else {
  console.error('❌ Unit Test Failed: Output does not match expectation.');
  console.error('Expected:\n', expected);
  process.exit(1);
}
