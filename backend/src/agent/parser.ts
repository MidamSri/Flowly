import { SemanticNode } from '@flowly/shared';

/**
 * Compresses a list of SemanticNode elements into a compact indented text tree.
 * Empty containers are automatically pruned to save context window tokens.
 */
export function compressSemanticTree(elements: SemanticNode[]): string {
  const childMap = new Map<string, SemanticNode[]>();
  const elementMap = new Map<string, SemanticNode>();

  // Map elements by ID for easy parent lookups
  for (const el of elements) {
    elementMap.set(el.id, el);
  }

  // Build the hierarchical tree structure mapping parents to children
  for (const el of elements) {
    if (el.parentId && elementMap.has(el.parentId)) {
      const list = childMap.get(el.parentId) || [];
      list.push(el);
      childMap.set(el.parentId, list);
    }
  }

  // Root nodes are elements that don't have a parent, or whose parent doesn't exist in our parsed set
  const roots = elements.filter(el => !el.parentId || !elementMap.has(el.parentId));

  function renderNode(el: SemanticNode, depth: number): string {
    const indent = '  '.repeat(depth);
    let line = `${indent}[${el.id}] `;

    const typeStr = el.type.charAt(0).toUpperCase() + el.type.slice(1);
    
    switch (el.type) {
      case 'button':
        line += `Button "${el.text}"`;
        if (el.disabled) line += ' (disabled)';
        break;
      case 'link':
        line += `Link "${el.text}"`;
        break;
      case 'textbox': {
        const valInfo = [];
        if (el.text) valInfo.push(`value: "${el.text}"`);
        if (el.placeholder) valInfo.push(`placeholder: "${el.placeholder}"`);
        line += `Textbox (${valInfo.join(', ') || 'empty'})`;
        break;
      }
      case 'checkbox':
        line += `Checkbox "${el.text}"${el.checked ? ' (checked)' : ''}`;
        break;
      case 'dropdown':
        line += `Dropdown "${el.text}"`;
        break;
      case 'container':
        line += `Container (${el.text || 'wrapper'})`;
        break;
      case 'text':
        line += `Text "${el.text}"`;
        break;
      default:
        line += `${typeStr} "${el.text}"`;
    }

    const children = childMap.get(el.id) || [];
    let childText = '';
    for (const child of children) {
      const renderedChild = renderNode(child, depth + 1);
      if (renderedChild.trim() !== '') {
        childText += '\n' + renderedChild;
      }
    }

    // Noise Reduction: If this is an empty container with no text and no valid children, prune it
    if (el.type === 'container' && !el.text && childText.trim() === '') {
      return '';
    }

    return line + childText;
  }

  const resultLines: string[] = [];
  for (const root of roots) {
    const rendered = renderNode(root, 0);
    if (rendered.trim() !== '') {
      resultLines.push(rendered);
    }
  }

  return resultLines.join('\n');
}
