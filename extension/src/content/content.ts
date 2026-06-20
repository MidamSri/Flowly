import { buildAccessibilityTree } from './parser/accessibilityTree';

console.log('%c[Flowly] Perception Layer Content Script Loaded', 'color: #6366f1; font-weight: bold; font-size: 14px;');

try {
  // Execute the semantic accessibility tree extraction
  const semanticNodes = buildAccessibilityTree();

  // Print a formatted, readable semantic list
  let output = '\nFLOWLY PARSER\n\n';
  semanticNodes.forEach((node, index) => {
    const typePadded = node.type.padEnd(10);
    const displayName = node.text || node.ariaLabel || node.placeholder || `<${node.id}>`;
    output += `[${index}] ${typePadded} "${displayName}"\n`;
  });

  console.log(output);
  console.log('[Flowly] Extracted Semantic Nodes Array:', semanticNodes);
} catch (error) {
  console.error('[Flowly] Parser Execution Failed:', error);
}
