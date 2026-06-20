/**
 * Formats and limits the inner text of interactive elements.
 */
export function getElementText(el: HTMLElement): string {
  let text = el.innerText || el.textContent || '';
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 150) {
    text = text.substring(0, 147) + '...';
  }
  return text;
}

/**
 * Returns text content directly owned by the element, ignoring text within child subtrees.
 */
export function getDirectText(el: HTMLElement): string {
  return Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim() || '')
    .join(' ')
    .trim();
}
