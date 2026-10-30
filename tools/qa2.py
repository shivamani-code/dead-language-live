
import asyncio, json, sys, base64, time
from playwright.async_api import async_playwright
URL=sys.argv[1]; OUT=sys.argv[2]
UA="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
async def run_case(page, label, action, shot_at=1.5):
    await page.evaluate("""() => { window.__log=[]; const V=window.Voice; if(!V.__wrapped){ const orig=V.speak; V.speak=function(a,o){ const os=o.onSyllable, of=o.onFrame; o.onSyllable=(i)=>{window.__log.push(['syl',performance.now(),i]); os&&os(i)}; o.onFrame=(t,i,info)=>{ if(!window.__info) window.__info=info; window.__lastT=t; of&&of(t,i,info)}; window.__info=null; return orig.call(V,a,o).then(r=>{window.__done=performance.now(); return r;}); }; V.__wrapped=1;} window.__done=0; }""")
    await action()
    t0=time.time()
    # wait for audio to start
    for _ in range(300):
        if await page.evaluate("()=>!!window.__info"): break
        await asyncio.sleep(0.1)
    start=time.time()
    await asyncio.sleep(shot_at)
    await page.screenshot(path=OUT+f'-{label}-playing.png', full_page=False)
    for _ in range(400):
        if await page.evaluate("()=>window.__done>0"): break
        await asyncio.sleep(0.1)
    res=await page.evaluate("""async () => { const b=window.Voice.lastBlob; const ab=b?await b.arrayBuffer():null; let s=''; if(ab){const u=new Uint8Array(ab); for(let i=0;i<u.length;i+=8192) s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));} return {log:window.__log, info:window.__info, wav: ab?btoa(s):null, status: document.getElementById('voice-status').textContent, deva: document.getElementById('result-devanagari').textContent}; }""")
    if res['wav']: open(OUT+f'-{label}.wav','wb').write(base64.b64decode(res['wav']))
    res['wav']=bool(res['wav']); res['wait_s']=round(start-t0,2)
    return res
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required','--no-sandbox'])
        ctx=await b.new_context(viewport={'width':412,'height':915}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=UA)
        page=await ctx.new_page()
        errs=[]; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
        await page.goto(URL, wait_until='networkidle')
        await page.screenshot(path=OUT+'-top.png')
        out={}
        async def chip():
            await page.locator('.phrase-chip').first.tap()
        out['rv']=await run_case(page,'rv',chip,3.0)
        await page.locator('#result-card').scroll_into_view_if_needed()
        async def friends():
            await page.fill('#source-text','May my friends be safe'); await page.tap('#translate-button')
        out['friends']=await run_case(page,'friends',friends,1.2)
        async def live():
            await page.fill('#source-text','The river flows to the sea'); await page.tap('#translate-button')
        out['live']=await run_case(page,'live',live,1.5)
        async def plainplay():
            await page.locator('#accent-toggle').set_checked(False, force=True); await page.locator('#room-toggle').set_checked(True, force=True)
            await page.locator('.phrase-chip').nth(3).tap()
        out['plain_room']=await run_case(page,'plainroom',plainplay,1.0)
        d=await b.new_page(viewport={'width':1366,'height':900})
        await d.goto(URL, wait_until='networkidle'); await d.locator('.phrase-chip').first.click(); await asyncio.sleep(6)
        await d.locator('#result-card').screenshot(path=OUT+'-desktop-card.png')
        out['errors']=errs
        json.dump(out,open(OUT+'-qa.json','w'),ensure_ascii=False,indent=1)
        await b.close()
asyncio.run(main())
