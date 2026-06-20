import { chromium, Page } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import { SemanticNode, PageState, PlanRequest, ActionPlan, StepHistoryItem } from '@flowly/shared';

// 1. Simple CLI Argument Parser
const args = process.argv.slice(2);
let goal = '';
let startUrl = 'https://www.reddit.com';
let headless = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--goal' && args[i + 1]) {
    goal = args[i + 1];
    i++;
  } else if (args[i] === '--url' && args[i + 1]) {
    startUrl = args[i + 1];
    i++;
  } else if (args[i] === '--headful') {
    headless = false;
  }
}

if (!goal) {
  console.error('\n❌ Error: --goal is required.');
  console.log('Usage: pnpm --filter backend test:headless -- --goal "Your natural language goal" [--url "https://startpage.com"] [--headful]\n');
  process.exit(1);
}

// Helper to check and spawn backend automatically if it is offline
async function ensureBackendRunning(): Promise<ChildProcess | null> {
  try {
    const res = await fetch('http://localhost:3000/health');
    if (res.ok) {
      console.log('⚡ [Runner] Fastify backend is already online.');
      return null;
    }
  } catch (e) {
    console.log('🚀 [Runner] Fastify backend not detected. Spawning server subprocess...');
    const serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      stdio: 'ignore', // Keep runner stdout clean
      detached: false,
      shell: true,
    });

    // Clean up server if runner exits
    process.on('exit', () => {
      serverProcess.kill();
    });

    // Poll health endpoint until online
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const res = await fetch('http://localhost:3000/health');
        if (res.ok) {
          console.log('⚡ [Runner] Fastify backend has successfully booted.');
          return serverProcess;
        }
      } catch (err) {
        // Keep polling
      }
    }
    serverProcess.kill();
    throw new Error('Failed to connect to Fastify backend after spawning.');
  }
  return null;
}

// 2. DOM Crawler script to run inside browser context
async function scrapeSemanticNodes(page: Page): Promise<SemanticNode[]> {
  const code = `
    (() => {
      const elements = [];
      let idCounter = 0;

      function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }
        return true;
      }

      function getElementText(el) {
        let text = el.innerText || el.textContent || '';
        text = text.replace(/\\s+/g, ' ').trim();
        if (text.length > 150) {
          text = text.substring(0, 147) + '...';
        }
        return text;
      }

      function crawl(node, parentId) {
        if (!isVisible(node)) return;

        const htmlNode = node;
        const tagName = htmlNode.tagName.toLowerCase();
        const role = htmlNode.getAttribute('role') || '';
        const typeAttr = htmlNode.getAttribute('type') || '';
        
        let isInteractive = false;
        let nodeType = 'container';

        // 1. Identify interactive elements
        if (tagName === 'button' || role === 'button' || typeAttr === 'button' || typeAttr === 'submit') {
          isInteractive = true;
          nodeType = 'button';
        } else if (tagName === 'a' || role === 'link') {
          isInteractive = true;
          nodeType = 'link';
        } else if ((tagName === 'input' && (typeAttr === 'checkbox' || typeAttr === 'radio')) || role === 'checkbox') {
          isInteractive = true;
          nodeType = 'checkbox';
        } else if (tagName === 'input' || tagName === 'textarea' || role === 'textbox' || htmlNode.isContentEditable) {
          isInteractive = true;
          nodeType = 'textbox';
        } else if (tagName === 'select' || role === 'combobox') {
          isInteractive = true;
          nodeType = 'dropdown';
        } else if (htmlNode.onclick || window.getComputedStyle(htmlNode).cursor === 'pointer') {
          isInteractive = true;
          nodeType = 'button';
        }

        // 2. Identify text elements
        const directText = Array.from(htmlNode.childNodes)
          .filter((n) => n.nodeType === 3) // 3 = Node.TEXT_NODE
          .map((n) => n.textContent?.trim() || '')
          .join(' ')
          .trim();

        if (directText.length > 0 && !isInteractive) {
          nodeType = 'text';
        }

        let flowlyId = undefined;

        // Only store nodes that have semantic value (interactive or contains visual text)
        if (isInteractive || nodeType === 'text') {
          flowlyId = 'el-' + idCounter++;
          htmlNode.setAttribute('data-flowly-id', flowlyId);

          let selector = tagName;
          if (htmlNode.id) {
            selector = '#' + htmlNode.id;
          } else if (htmlNode.className) {
            const rawClass = htmlNode.className;
            const classStr = typeof rawClass === 'string' ? rawClass : (rawClass && typeof rawClass.baseVal === 'string' ? rawClass.baseVal : '');
            const classes = classStr.split(/\\s+/).filter((c) => c && !c.includes(':') && !c.includes('[')).join('.');
            if (classes) selector += '.' + classes;
          }
          selector += '[data-flowly-id="' + flowlyId + '"]';

          const rect = htmlNode.getBoundingClientRect();

          elements.push({
            id: flowlyId,
            type: nodeType,
            text: isInteractive ? getElementText(htmlNode) : directText,
            placeholder: htmlNode.getAttribute('placeholder') || undefined,
            ariaLabel: htmlNode.getAttribute('aria-label') || htmlNode.getAttribute('title') || undefined,
            disabled: htmlNode.disabled || htmlNode.getAttribute('aria-disabled') === 'true',
            checked: htmlNode.checked || htmlNode.getAttribute('aria-checked') === 'true' || undefined,
            parentId: parentId,
            selector: selector,
            rect: {
              x: rect.x + window.scrollX,
              y: rect.y + window.scrollY,
              width: rect.width,
              height: rect.height,
            },
          });
        }

        // Traverse children recursively
        const nextParentId = flowlyId || parentId;
        const children = Array.from(htmlNode.children);
        for (const child of children) {
          crawl(child, nextParentId);
        }
      }

      crawl(document.body);
      return elements;
    })()
  `;
  return page.evaluate(code) as Promise<SemanticNode[]>;
}

// 3. Main Agent execution loop
async function run() {
  const backendProc = await ensureBackendRunning();

  console.log(`\n🤖 [Agent] Initializing E2E session`);
  console.log(`🎯 Goal: "${goal}"`);
  console.log(`🌐 Start URL: ${startUrl}`);
  console.log(`🖥️ Mode: ${headless ? 'Headless' : 'Headful'}\n`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  
  // Set up navigations with standard timeouts
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  const history: StepHistoryItem[] = [];
  const maxIterations = 10;
  let success = false;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\n================= Iteration ${iteration}/${maxIterations} =================`);
    console.log(`Current URL: ${page.url()}`);

    // Wait for DOM stability
    await page.waitForTimeout(2000);

    // Observe
    console.log('[Observer] Traversing active page DOM...');
    const elements = await scrapeSemanticNodes(page);
    console.log(`[Observer] Scraped ${elements.length} semantic interactive/text elements.`);

    // Plan request payload
    const requestPayload: PlanRequest = {
      goal,
      url: page.url(),
      elements,
      history,
    };

    // Ask planner Fastify API
    console.log('[Planner] Querying planning server...');
    let plan: ActionPlan;
    try {
      const response = await fetch('http://localhost:3000/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server returned code ${response.status}: ${errText}`);
      }

      plan = await response.json() as ActionPlan;
    } catch (e: any) {
      console.error(`[Error] Planning failed: ${e.message}`);
      break;
    }

    console.log(`\n🧠 Strategic Reasoning:\n"${plan.reasoning}"`);
    console.log(`Confidence: ${(plan.confidence * 100).toFixed(0)}%`);
    console.log(`Is Goal Achieved: ${plan.isGoalAchieved}`);

    if (plan.isGoalAchieved) {
      console.log('\n🎉 [Success] Planner indicates the goal has been fully met!');
      success = true;
      break;
    }

    if (plan.steps.length === 0) {
      console.log('\n⚠️ [Runner] Goal not met, but planner returned empty steps. Aborting.');
      break;
    }

    // Act
    console.log(`\n🎬 [Executor] Running action plan sequence (${plan.steps.length} steps):`);
    for (const step of plan.steps) {
      const currentUrlBeforeAction = page.url();
      console.log(`   - Executing: ${step.type.toUpperCase()}${step.elementId ? ` on ${step.elementId}` : ''} | Reason: ${step.reasoning}`);

      try {
        // Pre-check: If element is required, make sure it is present
        if (step.elementId) {
          const elementExists = await page.evaluate((id) => {
            return !!document.querySelector(`[data-flowly-id="${id}"]`);
          }, step.elementId);

          if (!elementExists) {
            console.log(`     ⚠️ Target element ${step.elementId} missing on current page state. Re-evaluating...`);
            history.push({
              action: `${step.type} on ${step.elementId}`,
              status: 'failed',
              error: `Target element ${step.elementId} was not found on the page.`,
            });
            break;
          }
        }

        switch (step.type) {
          case 'click': {
            const locator = page.locator(`[data-flowly-id="${step.elementId}"]`);
            await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
            await locator.click({ timeout: 5000 });
            break;
          }
          case 'type': {
            const locator = page.locator(`[data-flowly-id="${step.elementId}"]`);
            await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
            await locator.click({ timeout: 5000 });
            await locator.fill(step.value || '');
            // If text input involves searching, check if it wants to press Enter
            if (step.value && (step.reasoning.toLowerCase().includes('search') || step.reasoning.toLowerCase().includes('press enter'))) {
              await page.keyboard.press('Enter');
            }
            break;
          }
          case 'scroll': {
            const scrollDistance = step.value === 'up' ? -500 : 500;
            await page.mouse.wheel(0, scrollDistance);
            break;
          }
          case 'wait': {
            await page.waitForTimeout(step.waitMs || 1000);
            break;
          }
          case 'navigate': {
            await page.goto(step.value || '', { waitUntil: 'domcontentloaded', timeout: 30000 });
            break;
          }
        }

        // Record execution success
        history.push({
          action: `${step.type} executed${step.elementId ? ` on element ${step.elementId}` : ''}${step.value ? ` with value "${step.value}"` : ''}`,
          status: 'success',
        });

        // Trigger dynamic wait for loading network/rendering transitions
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);

        // If action changed the URL, stop sequence to re-observe fresh elements
        if (page.url() !== currentUrlBeforeAction) {
          console.log(`     ℹ️ Page navigated to ${page.url()}. Ending step sequence to re-observe.`);
          break;
        }

      } catch (err: any) {
        console.error(`     ❌ Action execution failed: ${err.message}`);
        history.push({
          action: `${step.type} on ${step.elementId || 'viewport'}`,
          status: 'failed',
          error: err.message,
        });
        break; // Break sequential execution on first error to re-plan
      }
    }
  }

  // Cleanup
  await browser.close();
  if (backendProc) {
    backendProc.kill();
  }

  if (success) {
    console.log('\n⭐ E2E Execution Succeeded! Flowly successfully navigated and completed the instruction.\n');
    process.exit(0);
  } else {
    console.log('\n❌ E2E Execution failed or timed out without achieving the goal.\n');
    process.exit(1);
  }
}

run().catch(e => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
