import { SemanticNode } from '@flowly/shared';
import { isVisible } from './visibility';
import { determineRole, isMeaningfulContainer } from './roles';
import { getDirectText, getElementText } from './extractText';
import { createSemanticNode } from './nodeFactory';
import { getNextFlowlyId, resetIdCounter } from './idGenerator';

/**
 * Traverses a DOM subtree to extract a pruned semantic accessibility tree.
 * Mutates crawled nodes by injecting namespaced data-flowly-id attributes.
 * Accepts a root parameter to support incremental/subtree updates.
 */
export function buildAccessibilityTree(root: Element = document.body): SemanticNode[] {
  const elements: SemanticNode[] = [];
  resetIdCounter();

  function crawl(node: Element, parentId?: string) {
    if (!isVisible(node)) return;

    const htmlNode = node as HTMLElement;
    const { isInteractive, role } = determineRole(htmlNode);
    const directText = getDirectText(htmlNode);

    let nodeType = role;
    if (directText.length > 0 && !isInteractive) {
      nodeType = 'text';
    }

    const isContainer = nodeType === 'container' && isMeaningfulContainer(htmlNode);

    let flowlyId: string | undefined = undefined;

    // Only register nodes that have semantic relevance (interactive, meaningful container, or visual text)
    if (isInteractive || nodeType === 'text' || isContainer) {
      flowlyId = getNextFlowlyId();
      htmlNode.setAttribute('data-flowly-id', flowlyId);

      const text = isInteractive ? getElementText(htmlNode) : directText;
      const semanticNode = createSemanticNode(htmlNode, flowlyId, nodeType, text, parentId);
      elements.push(semanticNode);
    }

    // Traverse children recursively
    const nextParentId = flowlyId || parentId;
    const children = Array.from(htmlNode.children);
    for (const child of children) {
      crawl(child, nextParentId);
    }
  }

  if (root) {
    crawl(root);
  }
  return elements;
}
