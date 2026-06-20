import { chromium } from 'playwright';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
  const extensionPath = resolve(__dirname, '../../extension/dist');
  console.log(`Loading extension from: ${extensionPath}`);

  // Launch browser with extension loaded (Extensions require persistent context and headful mode)
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const page = await context.newPage();
  
  // Setup console log listener
  page.on('console', msg => {
    if (msg.text().includes('FLOWLY PARSER') || msg.text().includes('[Flowly]')) {
      console.log(`\n--- BROWSER CONSOLE LOG ---\n${msg.text()}\n---------------------------\n`);
    }
  });

  console.log('Navigating to Wikipedia Main Page to test perception...');
  await page.goto('https://en.wikipedia.org/wiki/Main_Page', { waitUntil: 'load' });

  // Give the document_idle content script time to run and complete parsing
  await page.waitForTimeout(1500).catch(() => {});

  let testNode: any = null;
  try {
    // Check if DOM elements got flowly-node attributes
    testNode = await page.evaluate(() => {
      const el = document.querySelector('[data-flowly-id^="flowly-node-"]');
      return el ? { id: el.getAttribute('data-flowly-id'), tag: el.tagName, text: el.textContent?.trim().substring(0, 30) } : null;
    });
  } catch (err: any) {
    console.log('Could not evaluate DOM, browser context might have been closed:', err.message);
  }

  console.log('Detected flowly ID attribute in DOM:', testNode);

  try {
    await context.close();
  } catch (e) {}

  if (testNode) {
    console.log('✅ Extension loaded and successfully parsed the page!');
    process.exit(0);
  } else {
    console.error('❌ Extension loaded but failed to parse page elements.');
    process.exit(1);
  }
}

run().catch(e => {
  console.error('Test script crashed:', e);
  process.exit(1);
});
