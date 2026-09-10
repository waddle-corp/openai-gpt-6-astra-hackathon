// Headless Chrome over the Chrome DevTools Protocol. Node 22 ships a global
// WebSocket, so no Playwright/Puppeteer dependency is needed for the prototype.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
} as const;
export type Viewport = keyof typeof VIEWPORTS;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean) as string[];

type Json = Record<string, any>; // eslint-disable-line typescript/no-explicit-any -- CDP payloads are untyped
type Pending = { resolve: (value: Json) => void; reject: (error: Error) => void };

class Cdp {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(method: string, params: Json, sessionId?: string) => void>();
  private socket: WebSocket;
  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        this.listeners.forEach((listener) => listener(message.method, message.params, message.sessionId));
      }
    });
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise<Json>((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  once(method: string, sessionId: string, timeoutMs = 15_000) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, timeoutMs);
      const listener = (name: string, _params: Json, session?: string) => {
        if (name === method && session === sessionId) done();
      };
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.listeners.add(listener);
      // ponytail: resolve on timeout too; a slow page still gets screenshotted.
      setTimeout(() => this.listeners.delete(listener), timeoutMs + 10);
    });
  }
}

export class Browser {
  private process: ChildProcess;
  private cdp: Cdp;
  private profileDir: string;
  private constructor(process: ChildProcess, cdp: Cdp, profileDir: string) {
    this.process = process;
    this.cdp = cdp;
    this.profileDir = profileDir;
  }

  static async launch(): Promise<Browser> {
    const executable = CHROME_CANDIDATES.find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    if (!executable) throw new Error('No Chrome/Chromium found. Set CHROME_PATH.');
    const profileDir = mkdtempSync(join(tmpdir(), 'astra-chrome-'));
    const child = spawn(
      executable,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--enable-unsafe-swiftshader',
        '--hide-scrollbars',
        '--window-size=1280,800',
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    const wsUrl = await new Promise<string>((resolve, reject) => {
      let buffer = '';
      child.stderr!.on('data', (chunk) => {
        buffer += chunk;
        const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) resolve(match[1]);
      });
      child.on('exit', (code) => reject(new Error(`Chrome exited (${code}) before DevTools was ready.`)));
      setTimeout(() => reject(new Error('Chrome did not start in 20s.')), 20_000);
    });
    const socket = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve());
      socket.addEventListener('error', () => reject(new Error('Could not connect to Chrome DevTools.')));
    });
    return new Browser(child, new Cdp(socket), profileDir);
  }

  async newPage(viewport: Viewport = 'desktop') {
    const { targetId } = await this.cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this.cdp, sessionId, targetId);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.setViewport(viewport);
    return page;
  }

  async close() {
    this.process.kill();
    await new Promise((resolve) => this.process.once('exit', resolve).on('error', resolve));
    rmSync(this.profileDir, { recursive: true, force: true });
  }
}

export class Page {
  viewport: Viewport = 'desktop';
  private cdp: Cdp;
  private sessionId: string;
  private targetId: string;
  constructor(cdp: Cdp, sessionId: string, targetId: string) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.targetId = targetId;
  }

  send(method: string, params: Record<string, unknown> = {}) {
    return this.cdp.send(method, params, this.sessionId);
  }

  async setViewport(viewport: Viewport) {
    this.viewport = viewport;
    const { width, height, mobile } = VIEWPORTS[viewport];
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 });
    if (mobile) await this.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  }

  async goto(url: string) {
    const loaded = this.cdp.once('Page.loadEventFired', this.sessionId);
    await this.send('Page.navigate', { url });
    await loaded;
    await this.settle();
  }

  /** Give React hydration and layout a moment. */
  settle(ms = 400) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'Script failed.');
    }
    return result.value as T;
  }

  url() {
    return this.evaluate<string>('location.href');
  }

  async screenshot() {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    return `data:image/png;base64,${data}`;
  }

  async click(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left', clickCount = 1) {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'] as const) {
      await this.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount });
    }
  }

  async move(x: number, y: number) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }

  async scroll(x: number, y: number, deltaX: number, deltaY: number) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY });
  }

  async type(text: string) {
    await this.send('Input.insertText', { text });
  }

  async keypress(keys: string[]) {
    // ponytail: names map 1:1 to DOM key values; modifiers are held for the combo.
    const modifiers = { ALT: 1, CTRL: 2, META: 4, CMD: 4, SHIFT: 8 } as Record<string, number>;
    let held = 0;
    const plain: string[] = [];
    for (const key of keys) {
      const upper = key.toUpperCase();
      if (modifiers[upper]) held |= modifiers[upper];
      else plain.push(key);
    }
    for (const key of plain) {
      const named = { ENTER: 'Enter', RETURN: 'Enter', TAB: 'Tab', ESC: 'Escape', ESCAPE: 'Escape', SPACE: ' ', BACKSPACE: 'Backspace', DELETE: 'Delete', ARROWUP: 'ArrowUp', ARROWDOWN: 'ArrowDown', ARROWLEFT: 'ArrowLeft', ARROWRIGHT: 'ArrowRight', UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', HOME: 'Home', END: 'End', PAGEUP: 'PageUp', PAGEDOWN: 'PageDown' } as Record<string, string>;
      const value = named[key.toUpperCase()] ?? key;
      const code = value.length === 1 ? `Key${value.toUpperCase()}` : value;
      const text = value.length === 1 ? value : value === 'Enter' ? '\r' : undefined;
      await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: value, code, text, modifiers: held, windowsVirtualKeyCode: value === 'Enter' ? 13 : value === 'Tab' ? 9 : value === 'Escape' ? 27 : undefined });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, modifiers: held });
    }
  }

  async close() {
    await this.cdp.send('Target.closeTarget', { targetId: this.targetId });
  }
}
