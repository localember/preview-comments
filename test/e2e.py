import asyncio, json, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8700/amc-copperascove-design-preview/'
CFG = sys.argv[2] if len(sys.argv) > 2 else json.dumps({'endpoint': 'http://127.0.0.1:8701/exec', 'site': 'localember/amc-copperascove-design-preview', 'pageOrigin': 'https://localember.github.io'})
OUT = '/workspace/preview-comments/test-shots'
async def run(b, w, h, slug, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=(w < 600), is_mobile=(w < 600))
    if CFG != 'none': await ctx.add_init_script(f'window.LE_REVIEW_CONFIG = {CFG};')
    pg = await ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE + slug, wait_until='networkidle')
    assert await pg.locator('le-review .bar').count() == 1, 'toolbar missing'
    assert not await pg.locator('le-review .hint').is_visible(), 'mode should be off by default'
    await pg.locator('le-review button', has_text='Comment').click()
    assert await pg.locator('le-review .hint').is_visible()
    # a link click in comment mode must not navigate; it opens the box instead
    url0 = pg.url
    target = pg.locator('main h2').first
    await target.scroll_into_view_if_needed()
    if w < 600: await target.tap()
    else:
        await target.hover(); await pg.wait_for_timeout(150)
        assert await pg.locator('le-review .hl').is_visible(), 'hover highlight missing'
        await target.click(position={'x': 20, 'y': 10})
    assert pg.url == url0
    assert await pg.locator('le-review .box textarea').is_visible(), 'comment box missing'
    await pg.screenshot(path=f'{OUT}/{tag}-{w}-box.png')
    txt = f'TEST {tag} {w}px: automated check, please ignore'
    await pg.locator('le-review .box textarea').fill(txt)
    await pg.locator('le-review .box input').fill('DW3 test')
    await pg.locator('le-review .box .save').click()
    await pg.locator('le-review .toast', has_text='Comment saved').wait_for(timeout=15000)
    # links paused in comment mode
    link = pg.locator('main a[href]').first
    if await link.count():
        await link.scroll_into_view_if_needed(); 
        if w < 600: await link.tap()
        else: await link.click()
        await pg.wait_for_timeout(400); assert pg.url == url0, 'link navigated in comment mode'
        await pg.locator('le-review .box .cancel').click()
    await pg.locator('le-review button', has_text='Done').click()
    await pg.reload(wait_until='networkidle'); await pg.wait_for_timeout(800)
    pins = await pg.locator('le-review .pin').count()
    texts = await pg.locator('le-review .pin').evaluate_all('ps => ps.map(p => p.title)')
    assert any(txt[:60] in t for t in texts), f'pin for new comment not shown: {texts}'
    await pg.locator('main h2').first.scroll_into_view_if_needed(); await pg.wait_for_timeout(200)
    await pg.screenshot(path=f'{OUT}/{tag}-{w}-pins.png')
    # open the card for the pin
    pin = pg.locator('le-review .pin').last
    await pin.click()
    assert await pg.locator('le-review .card').is_visible()
    await pg.screenshot(path=f'{OUT}/{tag}-{w}-card.png')
    sw = await pg.evaluate('document.documentElement.scrollWidth')
    print(w, slug, 'ok pins', pins, 'scrollWidth', sw, 'errors', errs)
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        await run(b, 1440, 900, 'back-pain/', 'svc')
        await run(b, 390, 844, 'back-pain/', 'svc')
        await run(b, 1440, 900, '', 'home')
        await run(b, 390, 844, '', 'home')
        await b.close()
asyncio.run(main())
