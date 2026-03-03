#!/usr/bin/env tsx

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  unlinkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import { cwd } from "node:process";
import { createServer } from "node:net";

type AriaSnapshotResult = {
  snapshot: string;
  refToElement: Map<string, { role: string; name: string }>;
};

type ScreenshotPair = {
  pngPath: string;
  htmlPath: string;
  baseName: string;
};

type CdpTarget = {
  id: string;
  title: string;
  url: string;
  type: "page";
  webSocketDebuggerUrl: string;
};

const SESSION_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

function getRepoRoot(): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
  });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return cwd();
}

const REPO_ROOT = getRepoRoot();
const STATE_DIR = join(REPO_ROOT, "tmp", "playwright");
const PROFILES_DIR = join(REPO_ROOT, ".playwright", "profiles");

const SESSION_DEFAULT = "default";

type SessionState = {
  port: number;
  session: string;
  startedAt: string;
  external?: boolean;
};

function validateSessionName(session: string): void {
  if (
    !SESSION_NAME_PATTERN.test(session) ||
    session.includes("..") ||
    session.includes("/") ||
    session.includes("\\")
  ) {
    throw new Error(
      "Invalid session name. Use only letters, numbers, dots, underscores, and dashes.",
    );
  }
}

function getStateFilePath(session: string): string {
  validateSessionName(session);
  mkdirSync(STATE_DIR, { recursive: true });
  return join(STATE_DIR, `${session}.json`);
}

function readSessionState(session: string): SessionState | null {
  const stateFile = getStateFilePath(session);
  if (!existsSync(stateFile)) {
    return null;
  }
  try {
    const content = readFileSync(stateFile, "utf-8");
    return JSON.parse(content) as SessionState;
  } catch {
    return null;
  }
}

function listActiveSessions(): string[] {
  if (!existsSync(STATE_DIR)) {
    return [];
  }
  return readdirSync(STATE_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

function getSessionStateOrThrow(session: string): SessionState {
  const stateFile = getStateFilePath(session);
  if (!existsSync(stateFile)) {
    const active = listActiveSessions();
    const lines = [`No session "${session}" found.`];
    if (active.length > 0) {
      lines.push("", "Active sessions:");
      for (const name of active) {
        lines.push(`  ${name}`);
      }
      lines.push("", "Run commands against a session with:");
      lines.push(`  playwright exec "<code>" --session <name>`);
    } else {
      lines.push("", "No active sessions. Start one with:");
      lines.push("  playwright open <url>");
      lines.push("  playwright connect <cdp-url>");
    }
    throw new Error(lines.join("\n"));
  }

  try {
    const content = readFileSync(stateFile, "utf-8");
    return JSON.parse(content) as SessionState;
  } catch {
    throw new Error(
      `Session state at ${stateFile} could not be parsed. Delete the file and retry.`,
    );
  }
}

function writeSessionState(state: SessionState): void {
  const stateFile = getStateFilePath(state.session);
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function clearSessionState(session: string): void {
  const stateFile = getStateFilePath(session);
  if (existsSync(stateFile)) {
    unlinkSync(stateFile);
  }
}

async function pickFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        server.close(() => resolve(addr.port));
      } else {
        server.close(() => reject(new Error("Failed to get port")));
      }
    });
  });
}

async function getAriaSnapshot(page: Page): Promise<AriaSnapshotResult> {
  const url = page.url();
  const title = await page.title();

  const scrollY = await page.evaluate(() => window.scrollY);
  const docHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  const viewportHeight = await page.evaluate(() => window.innerHeight);

  let scrollInfo = "";
  if (docHeight > viewportHeight) {
    const scrollMax = docHeight - viewportHeight;
    const hasMore = scrollY < scrollMax - 100;
    scrollInfo = `scroll: ${Math.round(scrollY)}/${Math.round(scrollMax)}px${hasMore ? " (more below)" : ""}`;
  }

  const ariaSnapshot = await page.locator("body").ariaSnapshot();

  const headingPositions = await page.evaluate((vpHeight) => {
    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3, h4, h5, h6"),
    );
    return headings.map((h) => {
      const rect = h.getBoundingClientRect();
      return {
        text: h.textContent?.trim() || "",
        inView: rect.top >= 0 && rect.top < vpHeight,
      };
    });
  }, viewportHeight);

  const collapsedElements = await page.evaluate(() => {
    const collapsed = Array.from(
      document.querySelectorAll("[aria-expanded='false']"),
    );
    return collapsed.map((el) => ({
      label: el.getAttribute("aria-label") || el.textContent?.trim() || "",
      role: el.getAttribute("role") || el.tagName.toLowerCase(),
    }));
  });

  const regionMap = buildRegionMap(
    ariaSnapshot,
    headingPositions,
    collapsedElements,
  );
  const actionDeck = buildActionDeck(ariaSnapshot);

  let snapshot = `url: ${url}\ntitle: ${title}\n`;
  if (scrollInfo) {
    snapshot += `${scrollInfo}\n`;
  }
  snapshot += `\n${regionMap}\n`;
  if (actionDeck) {
    snapshot += `\nactions:\n${actionDeck}\n`;
  }
  snapshot += `\n${ariaSnapshot}`;

  const refToElement = new Map<string, { role: string; name: string }>();
  return { snapshot, refToElement };
}

function buildRegionMap(
  ariaSnapshot: string,
  headingPositions: Array<{ text: string; inView: boolean }>,
  collapsedElements: Array<{ label: string; role: string }>,
): string {
  const lines = ariaSnapshot.split("\n");
  const regions: string[] = [];
  let currentLandmark: string | null = null;
  let landmarkContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = line.length - line.trimStart().length;
    const depth = Math.floor(indent / 2);

    const landmarkMatch = trimmed.match(
      /^- (banner|navigation|main|contentinfo|complementary|region)(?:\s+"([^"]+)")?:/,
    );
    if (landmarkMatch && depth === 0) {
      if (currentLandmark) {
        regions.push(formatLandmark(currentLandmark, landmarkContent));
      }
      const role = landmarkMatch[1];
      const label = landmarkMatch[2] || "";
      currentLandmark = label ? `[${role}] "${label}"` : `[${role}]`;
      landmarkContent = [];
      continue;
    }

    if (currentLandmark) {
      const headingMatch = trimmed.match(/^- heading "([^"]+)"/);
      if (headingMatch) {
        const headingText = headingMatch[1]!;
        const position = headingPositions.find((h) => h.text === headingText);
        const viewMarker = position
          ? position.inView
            ? " ← in view"
            : " (below)"
          : "";

        const headingIndent = "  ".repeat(depth - 1);
        landmarkContent.push(`${headingIndent}h "${headingText}"${viewMarker}`);
      }
    }
  }

  if (currentLandmark) {
    regions.push(formatLandmark(currentLandmark, landmarkContent));
  }

  if (collapsedElements.length > 0) {
    const collapsed = collapsedElements
      .slice(0, 5)
      .map((el) => `▸ ${el.role} "${el.label}" (collapsed)`)
      .join("\n");
    if (collapsed) {
      regions.push(`\n${collapsed}`);
    }
  }

  return regions.length > 0 ? regions.join("\n") : "";
}

function formatLandmark(landmark: string, content: string[]): string {
  if (content.length === 0) {
    return landmark;
  }
  return `${landmark}\n${content.join("\n")}`;
}

function buildActionDeck(ariaSnapshot: string): string {
  const lines = ariaSnapshot.split("\n");
  const actions: Array<{ role: string; name: string; priority: number }> = [];

  const primaryRoles = new Set([
    "button",
    "link",
    "textbox",
    "searchbox",
    "combobox",
  ]);
  const actionKeywords = /submit|continue|next|save|apply|create|sign/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(
      /^- (button|link|textbox|searchbox|combobox)(?: "([^"]+)")?/,
    );
    if (match) {
      const role = match[1]!;
      const name = match[2] || "";

      if (!primaryRoles.has(role)) continue;

      let priority = 0;
      if (role === "button") priority += 10;
      if (actionKeywords.test(name)) priority += 5;
      if (name.toLowerCase().includes("demo")) priority += 3;

      actions.push({ role, name, priority });
    }
  }

  actions.sort((a, b) => b.priority - a.priority);
  const topActions = actions.slice(0, 8);

  const nameCounts = new Map<string, number>();
  const nameIndices = new Map<string, number>();

  for (const action of topActions) {
    const key = `${action.role}:${action.name}`;
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  return topActions
    .map((action) => {
      const key = `${action.role}:${action.name}`;
      const count = nameCounts.get(key) || 0;
      const name = action.name ? ` "${action.name}"` : "";

      if (count > 1) {
        const idx = nameIndices.get(key) || 0;
        nameIndices.set(key, idx + 1);
        return `  [${idx}] ${action.role}${name}`;
      }

      return `  ${action.role}${name}`;
    })
    .join("\n");
}

function normalizeUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(normalizeUrl(url));
    let domain = parsed.hostname;
    if (domain.startsWith("www.")) {
      domain = domain.slice(4);
    }
    return domain;
  } catch {
    return url;
  }
}

function getProfilePath(domain: string): string {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true });
  }
  return join(PROFILES_DIR, `${domain}.json`);
}

function hasProfile(domain: string): boolean {
  return existsSync(getProfilePath(domain));
}

async function tryConnectToPort(
  port: number,
  timeoutMs: number = 5000,
): Promise<Browser | null> {
  const endpoint = `http://127.0.0.1:${port}`;
  try {
    const connectPromise = chromium.connectOverCDP(endpoint);
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs),
    );
    return await Promise.race([connectPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

async function tryConnect(
  session: string,
  timeoutMs: number = 5000,
): Promise<Browser | null> {
  const state = readSessionState(session);
  if (!state) {
    return null;
  }
  const browser = await tryConnectToPort(state.port, timeoutMs);
  if (!browser) {
    clearSessionState(session);
    return null;
  }
  return browser;
}

// Connect to the browser via CDP and return the browser, context, and page.
// IMPORTANT: Commands that call this function MUST call browser.close() when done.
// When connected via CDP, browser.close() disconnects the CDP connection without
// actually killing the browser process. This prevents commands from hanging.
async function connect(
  session: string,
  timeoutMs: number = 10000,
): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const state = getSessionStateOrThrow(session);
  const browser = await tryConnectToPort(state.port, timeoutMs);
  if (!browser) {
    clearSessionState(session);
    throw new Error(
      `No browser running for session "${session}". Run 'playwright open <url> --session ${session}' first.`,
    );
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error("No browser context found.");
  }

  let pages: Page[] = [];
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const allPages = contexts.flatMap((c) => c.pages());
    pages = allPages.filter((p) => {
      const url = p.url();
      if (url.startsWith("devtools://")) return false;
      if (url.startsWith("chrome-error://")) return false;
      return true;
    });
    if (pages.length > 0) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (pages.length === 0) {
    throw new Error("No pages found.");
  }

  const page = pages[pages.length - 1]!;
  const context = page.context();

  return { browser, context, page };
}

async function runOpen(
  rawUrl: string,
  headed: boolean,
  session: string,
): Promise<string> {
  const output: string[] = [];
  const url = normalizeUrl(rawUrl);
  const existing = await tryConnect(session);
  if (existing) {
    try {
      const page = existing.contexts()[0]?.pages()[0];
      if (page) {
        await page.goto(url);
        output.push(`Navigated to: ${url}`);
        return output.join("\n");
      }
    } finally {
      await existing.close();
    }
  }

  const port = await pickFreePort();
  const mode = headed ? "headed" : "headless";
  const domain = normalizeDomain(url);
  const profilePath = getProfilePath(domain);
  const useProfile = hasProfile(domain);

  if (useProfile) {
    output.push(`📂 Loading saved profile for ${domain}`);
  }
  output.push(`Launching ${mode} browser (session: ${session})...`);

  const escapedProfilePath = profilePath
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
  const escapedUrl = url.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const storageStateCode = useProfile
    ? `storageState: '${escapedProfilePath}',`
    : "";

  const launcherCode = `
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
	headless: ${!headed},
	args: ['--remote-debugging-port=${port}', '--remote-debugging-address=127.0.0.1', '--no-focus-on-check'],
});

const context = await browser.newContext({
	${storageStateCode}
	viewport: { width: 1366, height: 768 },
	userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
});

const page = await context.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(45000);

await page.goto('${escapedUrl}');

// Wait indefinitely until user closes the window, then shut down Chromium
await page.waitForEvent('close', { timeout: 0 });
await browser.close();
`;

  const child = spawn(
    "node",
    ["--import", "tsx", "--input-type=module", "-e", launcherCode],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const ready = await fetch(`http://127.0.0.1:${port}/json/version`)
      .then(() => true)
      .catch(() => false);
    if (ready) {
      writeSessionState({
        port,
        session,
        startedAt: new Date().toISOString(),
      });
      output.push(`Browser open (${mode}): ${url}`);

      // Wait a bit longer for the page to load
      await new Promise((r) => setTimeout(r, 2000));
      return output.join("\n");
    }
  }

  throw new Error("Failed to connect to browser.");
}

async function runExec(code: string, session: string): Promise<string> {
  const output: string[] = [];
  const { browser, context, page } = await connect(session);

  try {
    const execState: Record<string, unknown> = {};

    const snapshot = async (
      opts: { page?: Page; search?: string | RegExp } = {},
    ) => {
      const targetPage = opts.page || page;
      const result = await getAriaSnapshot(targetPage);
      let snap = result.snapshot;
      if (opts.search) {
        const regex =
          typeof opts.search === "string"
            ? new RegExp(opts.search, "i")
            : opts.search;
        snap = snap
          .split("\n")
          .filter((line: string) => regex.test(line))
          .slice(0, 10)
          .join("\n");
      }
      return snap;
    };

    const helpers = {
      page,
      context,
      state: execState,
      browser,
      snapshot,
      console,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      fetch,
      URL,
      Buffer,
    };

    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const fn = new AsyncFunction(...Object.keys(helpers), code);

    const result = await fn(...Object.values(helpers));
    if (result !== undefined) {
      output.push(
        typeof result === "string" ? result : JSON.stringify(result, null, 2),
      );
    }
  } finally {
    await browser.close();
  }
  return output.join("\n");
}

async function captureScreenshot(session: string): Promise<ScreenshotPair> {
  const { browser, page } = await connect(session);

  try {
    const title = await page.title();
    const sanitizedTitle = title
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 50);

    const screenshotsDir = join(REPO_ROOT, "tmp", "playwright-screenshots");
    mkdirSync(screenshotsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `${sanitizedTitle}-${timestamp}`;

    const pngPath = join(screenshotsDir, `${baseName}.png`);
    const htmlPath = join(screenshotsDir, `${baseName}.html`);

    await page.screenshot({ path: pngPath, fullPage: true });

    const htmlContent = await page.content();
    const fs = await import("node:fs/promises");
    await fs.writeFile(htmlPath, htmlContent);

    return { pngPath, htmlPath, baseName };
  } finally {
    await browser.close();
  }
}

async function runSnapshot(session: string): Promise<string> {
  const output: string[] = [];
  const { pngPath, htmlPath } = await captureScreenshot(session);

  output.push(`Screenshot saved:`);
  output.push(`  PNG:  ${pngPath}`);
  output.push(`  HTML: ${htmlPath}`);

  return output.join("\n");
}

async function runSave(urlOrDomain: string, session: string): Promise<string> {
  const output: string[] = [];
  const { browser, context, page } = await connect(session);

  try {
    await new Promise((r) => setTimeout(r, 500));

    const domain = normalizeDomain(urlOrDomain);
    const profilePath = getProfilePath(domain);

    let cookies: Array<Record<string, unknown>> = [];
    try {
      const cdpSession = await context.newCDPSession(page);
      const { cookies: rawCookies } = (await cdpSession.send(
        "Network.getAllCookies",
      )) as { cookies: Array<Record<string, unknown>> };
      cookies = rawCookies.map((c: Record<string, unknown>) => {
        const cookie = { ...c };
        if (cookie.partitionKey && typeof cookie.partitionKey === "object") {
          delete cookie.partitionKey;
        }
        return cookie;
      });
      await cdpSession.detach();
    } catch {
      output.push(
        "⚠ Warning: CDP cookie retrieval failed; falling back to document.cookie which cannot capture HttpOnly cookies.",
      );
      const cookieStr = await page.evaluate(() => document.cookie);
      if (cookieStr) {
        const pageUrl = page.url();
        const pageDomain = new URL(pageUrl).hostname;
        cookies = cookieStr.split(";").map((pair) => {
          const [name, ...rest] = pair.trim().split("=");
          return {
            name: name ?? "",
            value: rest.join("="),
            domain: pageDomain,
            path: "/",
          };
        });
      }
    }

    const origins: Array<{
      origin: string;
      localStorage: Array<{ name: string; value: string }>;
    }> = [];

    for (const ctx of browser.contexts()) {
      for (const pg of ctx.pages()) {
        try {
          const origin = new URL(pg.url()).origin;
          const localStorage = await pg.evaluate(() => {
            const items: Array<{
              name: string;
              value: string;
            }> = [];
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i);
              if (key) {
                items.push({
                  name: key,
                  value: window.localStorage.getItem(key) || "",
                });
              }
            }
            return items;
          });
          if (localStorage.length > 0) {
            origins.push({ origin, localStorage });
          }
        } catch {
          // Skip pages that can't be accessed
        }
      }
    }

    const state = { cookies, origins };
    const fs = await import("node:fs/promises");
    await fs.writeFile(profilePath, JSON.stringify(state, null, 2));

    output.push(`✅ Profile saved for ${domain}`);
    output.push(`   Location: ${profilePath}`);
    output.push(`   Cookies: ${cookies.length}, Origins: ${origins.length}`);
  } finally {
    await browser.close();
  }
  return output.join("\n");
}

async function runList(session: string): Promise<string> {
  const output: string[] = [];
  const state = readSessionState(session);

  if (state?.external) {
    const targets = await fetch(`http://127.0.0.1:${state.port}/json/list`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to list targets: ${res.status}`);
        }
        return (await res.json()) as CdpTarget[];
      })
      .catch(() => null);

    if (targets) {
      if (targets.length === 0) {
        return "No pages found.";
      }
      for (const [index, target] of targets.entries()) {
        output.push(`${index + 1}. ${target.title} - ${target.url}`);
      }
      return output.join("\n");
    }
  }

  const { browser } = await connect(session);

  try {
    const pages = browser
      .contexts()
      .flatMap((context) => context.pages())
      .filter((page) => {
        const url = page.url();
        if (url.startsWith("devtools://")) return false;
        if (url.startsWith("chrome-error://")) return false;
        return true;
      });

    if (pages.length === 0) {
      return "No pages found.";
    }

    for (const [index, page] of pages.entries()) {
      const title = await page.title();
      output.push(`${index + 1}. ${title} - ${page.url()}`);
    }
  } finally {
    await browser.close();
  }

  return output.join("\n");
}

async function runConnect(cdpUrl: string, session: string): Promise<string> {
  const output: string[] = [];
  const existing = readSessionState(session);
  if (existing) {
    const browser = await tryConnectToPort(existing.port);
    if (browser) {
      await browser.close();
      output.push(`Session "${session}" already connected. Reconnecting...`);
    }
  }

  let port: number;
  try {
    const parsed = new URL(cdpUrl);
    port = parseInt(parsed.port, 10);
    if (!port) {
      throw new Error("No port in URL");
    }
    if (parsed.hostname === "localhost") {
      output.push(
        `⚠️  Warning: Using "localhost" may cause connection issues. Try "127.0.0.1" instead.`,
      );
    }
  } catch {
    throw new Error(
      `Invalid CDP URL: ${cdpUrl}. Expected format: http://127.0.0.1:9222`,
    );
  }

  const browser = await tryConnectToPort(port);
  if (!browser) {
    throw new Error(
      `Could not connect to CDP endpoint at ${cdpUrl}. Is the browser running with --remote-debugging-port?`,
    );
  }

  const contexts = browser.contexts();
  let pages: Page[] = [];
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const allPages = contexts.flatMap((c) => c.pages());
    pages = allPages.filter((p) => {
      const url = p.url();
      if (url.startsWith("devtools://")) return false;
      if (url.startsWith("chrome-error://")) return false;
      return true;
    });
    if (pages.length > 0) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  await browser.close();

  writeSessionState({
    port,
    session,
    startedAt: new Date().toISOString(),
    external: true,
  });

  output.push(`✅ Connected to CDP at ${cdpUrl}`);
  output.push(`   Session: ${session}`);
  output.push(`   Pages: ${pages.length}`);
  output.push(`\nUse --session ${session} with other commands:`);
  output.push(
    `   playwright exec "return await page.title()" --session ${session}`,
  );
  output.push(`   playwright snapshot --session ${session}`);
  return output.join("\n");
}

async function runClose(session: string): Promise<string> {
  const output: string[] = [];
  const browser = await tryConnect(session);
  if (!browser) {
    output.push(`No browser running for session "${session}".`);
    clearSessionState(session);
    return output.join("\n");
  }

  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      await page.close();
    }
  }

  await new Promise((r) => setTimeout(r, 1000));

  clearSessionState(session);
  output.push(`Browser closed (session: ${session}).`);
  return output.join("\n");
}

function printUsage(): void {
  console.log(`Usage: playwright <command> [--session <name>]

Commands:
  open <url> [--headless] Launch browser and open URL (headed by default)
                          Automatically loads saved profile if available
  connect <cdp-url>       Connect to an existing browser via CDP endpoint
                          (e.g., http://localhost:9222 for Electron apps)
  save <url|domain>       Save current browser session (cookies, localStorage, etc.)
  exec <code>             Execute Playwright typescript code
  snapshot                Save PNG + HTML screenshot
  list                    List open tabs in the connected session
  close                   Close the browser (or disconnect from external browser)

Options:
  --session <name>        Use a named session (default: "default")

Examples:
  playwright open https://linkedin.com
  # ... manually log in ...
  playwright save linkedin.com
  # Next time you open linkedin.com, you'll be logged in automatically

  # Connect to an Electron app with --remote-debugging-port=9222
  playwright connect http://localhost:9222 --session electron
  playwright exec "return await page.title()" --session electron
  playwright snapshot --session electron

  playwright exec "await page.locator('button:has-text(\"Sign in\")').click()"
  playwright exec "await page.fill('input[name=\"email\"]', 'test@example.com')"
  playwright snapshot
  playwright close

  # Multiple sessions
  playwright open https://site1.com --session test1
  playwright open https://site2.com --session test2
  playwright exec "return await page.title()" --session test1

Available in exec:
  page, context, state, browser, snapshot

Profiles:
  Profiles are saved to .playwright/profiles/<domain>.json (git-ignored)
  They persist cookies, localStorage, and session data across browser launches.

Sessions:
  Session state is stored in tmp/playwright/<session>.json
  Each session runs an isolated browser instance on a dynamic port.
`);
}

const CLI_COMMANDS = new Set([
  "open",
  "connect",
  "save",
  "exec",
  "snapshot",
  "list",
  "close",
  "--help",
  "-h",
  "help",
]);

function parseSession(args: string[]): string {
  const idx = args.indexOf("--session");
  if (idx >= 0) {
    const value = args[idx + 1];
    if (!value || value.startsWith("--") || CLI_COMMANDS.has(value)) {
      throw new Error(
        "Usage: playwright <command> [--session <name>]\nInvalid or missing --session value.",
      );
    }
    validateSessionName(value);
    return value;
  }
  return SESSION_DEFAULT;
}

function filterSessionArgs(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session") {
      i++; // Skip the session value too
    } else {
      result.push(args[i]!);
    }
  }
  return result;
}

export async function runPlaywrightCLI(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const session = parseSession(rawArgs);
  const args = filterSessionArgs(rawArgs);
  const command = args[0];

  try {
    switch (command) {
      case "open": {
        const headless = args.includes("--headless");
        const url = args.slice(1).find((a) => !a.startsWith("--"));
        if (!url) {
          console.error(
            "Usage: playwright open <url> [--headless] [--session <name>]",
          );
          process.exit(1);
        }
        const result = await runOpen(url, !headless, session);
        if (result) console.log(result);
        break;
      }
      case "connect": {
        const cdpUrl = args[1];
        if (!cdpUrl) {
          console.error(
            "Usage: playwright connect <cdp-url> [--session <name>]",
          );
          process.exit(1);
        }
        const result = await runConnect(cdpUrl, session);
        if (result) console.log(result);
        break;
      }
      case "save": {
        const urlOrDomain = args[1];
        if (!urlOrDomain) {
          console.error(
            "Usage: playwright save <url|domain> [--session <name>]",
          );
          process.exit(1);
        }
        const result = await runSave(urlOrDomain, session);
        if (result) console.log(result);
        break;
      }
      case "exec": {
        const code = args
          .slice(1)
          .filter((a) => !a.startsWith("--"))
          .join(" ");
        if (!code) {
          console.error("Usage: playwright exec <code> [--session <name>]");
          process.exit(1);
        }
        const result = await runExec(code, session);
        if (result) console.log(result);
        break;
      }
      case "snapshot": {
        const result = await runSnapshot(session);
        if (result) console.log(result);
        break;
      }
      case "list": {
        const result = await runList(session);
        if (result) console.log(result);
        break;
      }
      case "close": {
        const result = await runClose(session);
        if (result) console.log(result);
        break;
      }
      case "--help":
      case "-h":
      case "help":
        printUsage();
        break;
      default:
        if (command) console.error(`Unknown command: ${command}\n`);
        printUsage();
        process.exit(command ? 1 : 0);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
}
