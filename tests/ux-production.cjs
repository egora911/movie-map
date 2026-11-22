const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const db=require('../movies.json');
const totalCards=db.works.reduce((n,work)=>n+work.placements.length,0);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:850}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let ready=false,last='';
   for(let attempt=0;attempt<12;attempt++){
    try{
     await page.goto('https://movie-map-rho.vercel.app/',{waitUntil:'domcontentloaded',timeout:15000});
     await page.waitForSelector('#allRegistry .card',{timeout:8000});
     const state=await page.evaluate(()=>({
       rows:document.querySelectorAll('#allRegistry .card').length,
       visible:document.querySelectorAll('#allRegistry .card:not(.hidden)').length,
       origin:!!document.querySelector('#originMode'),
       yearPicker:!!document.querySelector('#yearPickerToggle'),
       review:!!document.querySelector('#reviewMode'),
       width:document.documentElement.scrollWidth,
       viewport:window.innerWidth
     }));
     if(state.origin&&state.yearPicker&&state.rows===totalCards&&state.visible===totalCards&&state.width<=state.viewport+2){
       console.log('PRODUCTION LIVE',width,JSON.stringify(state));ready=true;break;
     }
     last=JSON.stringify(state);
    }catch(e){last=String(e.message).slice(0,260)}
    await new Promise(r=>setTimeout(r,8000));
   }
   assert(ready,'Production did not serve new renderer in time: '+last);
   assert.deepEqual(errors,[],'Production runtime errors');
   await page.locator('#originMode').click();
   assert.equal(await page.locator('#originMode').getAttribute('data-mode'),'gpt');
   await page.locator('#reset').click();
   await page.locator('#yearPickerToggle').click();
   await page.locator('input[data-year-choice][value="2025"]').check();
   const remaining=await page.locator('#allRegistry .card:not(.hidden)').count();
   assert(remaining>0&&remaining<totalCards,'Year filter should narrow production results');
   await page.locator('#reset').click();
   assert.equal(await page.locator('#allRegistry .card:not(.hidden)').count(),totalCards);
   await page.locator('#allRegistry .movie-title-trigger').first().click();
   await page.waitForSelector('#movieOverlay.open');
   await page.locator('#movieClose').click();
   await page.locator('#allRegistry .card[data-key="33233b1d276d"] .fact-review-trigger[data-person="egor"]').first().click();
   await page.waitForSelector('#reviewOverlay.open');
   assert.equal(await page.locator('#historyToggle').textContent(),'🕰 История · 1');
   await page.locator('#historyToggle').click();
   assert.equal(await page.locator('#historyPanel [data-history-index]').count(),1);
   await page.locator('#historyPanel [data-history-index="0"]').click();
   assert((await page.locator('#reviewBody').textContent()).includes('Фильм быстро завлекает'));
   await page.locator('#historyShowCurrent').click();
   await page.locator('#reviewNavChips [data-review-mode="ai"][data-review-person-target="egor"]').click();
   assert(/v\d+/.test(await page.locator('#historyStatus').textContent()),'current GPT version must be shown');
   await page.locator('#reviewNavChips [data-review-mode="together"]').click();
   assert.equal(await page.locator('#historyToggle').textContent(),'🕰 История · 1');
   await page.locator('#reviewClose').click();
   await page.locator('#allRegistry .score .watch').first().click();
   assert.equal(await page.locator('#allRegistry .card').first().getAttribute('data-tomorrow'),'1');
   await page.locator('#allRegistry .score .watch').first().click();
   await page.close();
   console.log('PRODUCTION LIVE SMOKE PASSED',width);
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
