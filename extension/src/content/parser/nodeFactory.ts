import { SemanticNode, SemanticNodeType } from '@flowly/shared';

/**
 * Builds a SemanticNode interface instance from an HTML element, mapping rich accessibility data.
 */
export function createSemanticNode(
  el: HTMLElement,
  flowlyId: string,
  role: SemanticNodeType,
  text: string,
  parentId?: string
): SemanticNode {
  const rect = el.getBoundingClientRect();

  // 1. Resolve interactive disabled status
  const disabled = !!((el as any).disabled || el.getAttribute('aria-disabled') === 'true');

  // 2. Resolve checked states (for checkbox / radio inputs)
  let checked: boolean | undefined = undefined;
  const ariaChecked = el.getAttribute('aria-checked');
  if (ariaChecked === 'true') {
    checked = true;
  } else if (ariaChecked === 'false') {
    checked = false;
  } else if (el.tagName.toLowerCase() === 'input' && (el as any).checked !== undefined) {
    checked = !!(el as any).checked;
  }

  // 3. Resolve expanded status (e.g. accordions, dropdowns)
  let expanded: boolean | undefined = undefined;
  const ariaExpanded = el.getAttribute('aria-expanded');
  if (ariaExpanded === 'true') {
    expanded = true;
  } else if (ariaExpanded === 'false') {
    expanded = false;
  }

  // 4. Resolve selected status (e.g. tabs, list items)
  let selected: boolean | undefined = undefined;
  const ariaSelected = el.getAttribute('aria-selected');
  if (ariaSelected === 'true') {
    selected = true;
  } else if (ariaSelected === 'false') {
    selected = false;
  } else if ((el as any).selected !== undefined) {
    selected = !!(el as any).selected;
  }

  return {
    id: flowlyId,
    type: role,
    text,
    placeholder: el.getAttribute('placeholder') || undefined,
    ariaLabel: el.getAttribute('aria-label') || el.getAttribute('title') || undefined,
    disabled,
    checked,
    expanded,
    selected,
    parentId,
    rect: {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
  };
}
