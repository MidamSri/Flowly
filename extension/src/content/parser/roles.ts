import { SemanticNodeType } from '@flowly/shared';

/**
 * Determines whether the element behaves interactively and parses its standard semantic role.
 */
export function determineRole(el: HTMLElement): { isInteractive: boolean; role: SemanticNodeType } {
  const tagName = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || '';
  const typeAttr = el.getAttribute('type') || '';

  // 1. Buttons, Tabs, MenuItems
  if (
    tagName === 'button' ||
    role === 'button' ||
    role === 'tab' ||
    role === 'menuitem' ||
    typeAttr === 'button' ||
    typeAttr === 'submit'
  ) {
    return { isInteractive: true, role: 'button' };
  }

  // 2. Links
  if (tagName === 'a' || role === 'link') {
    return { isInteractive: true, role: 'link' };
  }

  // 3. Checkboxes and Radios
  if (
    (tagName === 'input' && (typeAttr === 'checkbox' || typeAttr === 'radio')) ||
    role === 'checkbox' ||
    role === 'radio'
  ) {
    return { isInteractive: true, role: 'checkbox' };
  }

  // 4. Textboxes, Textareas, Contenteditable fields
  if (
    tagName === 'input' ||
    tagName === 'textarea' ||
    role === 'textbox' ||
    role === 'searchbox' ||
    el.isContentEditable
  ) {
    return { isInteractive: true, role: 'textbox' };
  }

  // 5. Dropdowns and Comboboxes
  if (tagName === 'select' || role === 'combobox' || role === 'listbox') {
    return { isInteractive: true, role: 'dropdown' };
  }

  // 6. Elements with custom onclick event handlers or styled with cursor pointer
  if (el.onclick || window.getComputedStyle(el).cursor === 'pointer') {
    return { isInteractive: true, role: 'button' };
  }

  return { isInteractive: false, role: 'container' };
}

/**
 * Checks whether an element serves as a meaningful structural container rather than a generic wrapper.
 */
export function isMeaningfulContainer(el: HTMLElement): boolean {
  const tagName = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || '';

  // Specific semantic tags
  if (
    tagName === 'form' ||
    tagName === 'nav' ||
    tagName === 'dialog' ||
    tagName === 'main' ||
    tagName === 'header' ||
    tagName === 'footer' ||
    tagName === 'section' ||
    tagName === 'article' ||
    tagName === 'aside'
  ) {
    return true;
  }

  // Accessible container/structural roles
  const containerRoles = [
    'form',
    'dialog',
    'navigation',
    'main',
    'search',
    'feed',
    'article',
    'list',
    'listitem',
    'tabpanel',
    'region',
    'group',
    'menu',
    'menubar',
    'toolbar'
  ];
  if (containerRoles.includes(role)) {
    return true;
  }

  // Titled or labelled containers
  if (el.getAttribute('aria-label') || el.getAttribute('title')) {
    return true;
  }

  return false;
}
