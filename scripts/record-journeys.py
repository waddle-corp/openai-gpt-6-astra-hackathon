"""Replay each recorded shopper journey in a real browser with a visible cursor and save a .webm per feedback id.

Usage: python scripts/record-journeys.py [origin] [id ...]
Requires the storefront running (default http://localhost:3000) and python-playwright with chromium.
"""
import json
import shutil
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "media" / "journeys"
ORIGIN = next((a for a in sys.argv[1:] if a.startswith("http")), "http://localhost:3000")
ONLY = {a for a in sys.argv[1:] if not a.startswith("http")}

# A DOM cursor so the video shows a shopper-like pointer (the OS cursor is never captured).
CURSOR_JS = """
(() => {
  const pos = JSON.parse(sessionStorage.getItem('__cursor') || '{"x":640,"y":120}');
  const make = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 24 L9 18 L13 28 L17 26 L13 17 L21 17 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none',
      transform: `translate(${pos.x}px, ${pos.y}px)`, transition: 'transform 0.55s cubic-bezier(.2,.7,.2,1)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))' });
    document.documentElement.appendChild(c);
  };
  window.__moveCursor = (x, y) => { make(); sessionStorage.setItem('__cursor', JSON.stringify({ x, y }));
    document.getElementById('__cursor').style.transform = `translate(${x}px, ${y}px)`; };
  window.__clickCursor = () => { const p = JSON.parse(sessionStorage.getItem('__cursor')); const r = document.createElement('div');
    Object.assign(r.style, { position: 'fixed', left: p.x - 14 + 'px', top: p.y - 14 + 'px', width: '28px', height: '28px', borderRadius: '50%',
      border: '2px solid #ff5a36', zIndex: '2147483646', pointerEvents: 'none', animation: '__ripple .45s ease-out forwards' });
    if (!document.getElementById('__ripple-style')) { const s = document.createElement('style'); s.id = '__ripple-style';
      s.textContent = '@keyframes __ripple{from{transform:scale(.4);opacity:1}to{transform:scale(1.6);opacity:0}}'; document.head.appendChild(s); }
    document.documentElement.appendChild(r); setTimeout(() => r.remove(), 500); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', make); else make();
})();
"""

TEXT_TARGETS = [  # target phrase -> Playwright selector
    ("Add to cart", "button:has-text('Add to cart')"),
    ("Cart link", "a[href='/store/cart']"),
    ("Continue to demo checkout", "a:has-text('checkout'), button:has-text('checkout')"),
    ("Complete demo order", "button:has-text('Complete')"),
    ("Quantity input", "input[aria-label='Quantity']"),
    ("Search products link", "a[href='/store/search']"),
    ("Replacement charger link", ".product-description a[href*='/products/']"),
    ("Product gallery thumbnails", ".thumbnails"),
]


def locate(page, step):
    target = step.get("target") or ""
    to_path, path = step.get("destinationPath"), step.get("path")
    for phrase, selector in TEXT_TARGETS:
        if phrase.lower() in target.lower():
            loc = page.locator(selector).first
            if loc.count():
                return loc
    if to_path and to_path != path:
        loc = page.locator(f"a[href='{to_path}']").first
        if loc.count():
            return loc
        loc = page.locator(f"a[href^='{to_path.split('?')[0]}']").first
        if loc.count():
            return loc
    words = " ".join(target.replace(" product result", "").replace(" product card", "").replace(" collection link", "").replace(" page link", "").split()[:3])
    loc = page.get_by_text(words, exact=False).first
    return loc if loc.count() else None


def glide_to(page, loc):
    loc.scroll_into_view_if_needed()
    time.sleep(0.25)
    box = loc.bounding_box()
    x, y = box["x"] + min(box["width"] / 2, 160), box["y"] + box["height"] / 2
    page.evaluate("([x, y]) => window.__moveCursor(x, y)", [x, y])
    page.mouse.move(x, y, steps=12)
    time.sleep(0.6)
    return x, y


def click(page, loc):
    x, y = glide_to(page, loc)
    page.evaluate("() => window.__clickCursor()")
    time.sleep(0.15)
    page.mouse.click(x, y)


def replay(page, journey):
    start = journey.get("startPath") or journey["events"][0]["path"]
    page.goto(ORIGIN + start, wait_until="networkidle")
    time.sleep(1.2)
    for step in journey["events"]:
        action = step["type"]
        if action == "page_view":
            if step["path"] != page.url.replace(ORIGIN, ""):
                loc = page.locator(f"a[href='{step['path']}']").first
                if loc.count():
                    click(page, loc)
                    page.wait_for_load_state("networkidle")
                else:
                    page.goto(ORIGIN + step["path"], wait_until="networkidle")
        elif action == "variant_selected":
            option = page.get_by_text(step.get("value") or "", exact=True).first
            if step.get("value") and step["value"] != "Default Title" and option.count():
                click(page, option)
        elif action == "cart_added":
            loc = page.locator("button:has-text('Add to cart')").first
            if loc.count():
                click(page, loc)
        elif action == "click":
            loc = locate(page, step)
            if loc is None:
                page.goto(ORIGIN + (step.get("destinationPath") or step["path"]), wait_until="networkidle")
            else:
                click(page, loc)
                if step.get("destinationPath") and step["destinationPath"] != step["path"]:
                    page.wait_for_load_state("networkidle")
        elif action == "type":
            field = page.locator("input:focus").first
            if not field.count():
                field = page.locator("input[type='search'], input[name='q']").first
                click(page, field)
            page.keyboard.press("Control+A")
            page.keyboard.type(step.get("value") or "", delay=70)
        elif action == "keypress":
            keys = step.get("keys", [])
            if keys == ["ALT", "LEFT"]:
                page.go_back(wait_until="networkidle")
            else:
                page.keyboard.press("+".join(k.capitalize() for k in keys))
                page.wait_for_load_state("networkidle")
        elif action == "scroll":
            page.evaluate("() => window.__moveCursor(window.innerWidth * 0.55, window.innerHeight * 0.5)")
            for _ in range(6):
                page.mouse.wheel(0, step.get("scrollY", 600) / 6)
                time.sleep(0.12)
        elif action == "drag":
            loc = locate(page, step) or page.locator("body")
            x, y = glide_to(page, loc)
            page.mouse.down()
            for i in range(1, 9):
                nx = x - i * 28
                page.evaluate("([x, y]) => window.__moveCursor(x, y)", [nx, y])
                page.mouse.move(nx, y)
                time.sleep(0.05)
            page.mouse.up()
        time.sleep(1.1)
    time.sleep(1.6)


def main():
    records = json.loads((ROOT / "data" / "shopper-feedback.json").read_text()) + [
        r for r in json.loads((ROOT / "data" / "feedback" / "synthetic-submissions.json").read_text()) if r["id"] != "SYN-FB-01"
    ]
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for record in records:
            if ONLY and record["id"] not in ONLY:
                continue
            mobile = record["journey"]["viewport"] == "mobile"
            size = {"width": 390, "height": 760} if mobile else {"width": 1280, "height": 800}
            context = browser.new_context(viewport=size, record_video_dir=str(OUT / "_tmp"), record_video_size=size,
                                          device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
            context.add_init_script(CURSOR_JS)
            page = context.new_page()
            try:
                replay(page, record["journey"])
                status = "ok"
            except Exception as error:  # keep going; a partial clip still shows the journey
                status = f"partial: {type(error).__name__}: {str(error)[:80]}"
            video = page.video
            context.close()
            dest = OUT / f"{record['id']}.webm"
            shutil.move(video.path(), dest)
            print(f"{record['id']} {status} -> {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")
        browser.close()
    shutil.rmtree(OUT / "_tmp", ignore_errors=True)


if __name__ == "__main__":
    main()
