import { Action } from '@flowly/shared';

/**
 * Utility to pause execution for a given duration.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Finds an element by its data-flowly-id attribute.
 */
function findElement(elementId: string): HTMLElement {
  const el = document.querySelector(`[data-flowly-id="${elementId}"]`);
  if (!el) {
    throw new Error(`Element with flowly-id "${elementId}" not found in current page DOM`);
  }
  return el as HTMLElement;
}

/**
 * Clicks the element specified by elementId.
 */
export async function click(elementId: string): Promise<void> {
  const el = findElement(elementId);
  
  // Scroll into view
  el.scrollIntoView({ block: 'center', inline: 'center' });
  await wait(150); // Wait for scrolling to settle
  
  // Focus and trigger standard click
  el.focus();
  
  // Standard click method
  el.click();
  
  // Dispatch bubble mouse events for dynamic single-page-app compatibility
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  el.dispatchEvent(clickEvent);
}

/**
 * Types a value into the element specified by elementId.
 * Supports standard inputs, textareas, and contenteditable elements.
 * Also handles dispatching input events to trigger React/framework observers.
 */
export async function type(elementId: string, value: string, action: Action): Promise<void> {
  const el = findElement(elementId);
  
  el.scrollIntoView({ block: 'center', inline: 'center' });
  await wait(150);
  
  el.focus();

  if (el.hasAttribute('contenteditable') || (el as any).isContentEditable) {
    el.innerText = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
    
    // Attempt React state input setter trigger
    const prototype = Object.getPrototypeOf(inputEl);
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (valueSetter) {
      valueSetter.call(inputEl, value);
    } else {
      inputEl.value = value;
    }
    
    // Dispatch input and change events
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Check if we need to simulate Enter key (often needed for searches)
  const shouldPressEnter = action.reasoning?.toLowerCase().includes('search') ||
                            action.reasoning?.toLowerCase().includes('press enter');
  
  if (shouldPressEnter) {
    await wait(100);
    const keydown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
    const keyup = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
    el.dispatchEvent(keydown);
    el.dispatchEvent(keyup);
  }
}

/**
 * Scrolls the window up or down.
 */
export async function scroll(direction: 'up' | 'down'): Promise<void> {
  const offset = direction === 'up' ? -500 : 500;
  window.scrollBy({
    top: offset,
    behavior: 'smooth'
  });
  await wait(500); // Wait for smooth scroll animation to finish
}
