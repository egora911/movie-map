const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');

(async()=>{
 const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try{
   await new Promise(r=>setTimeout(r,850));
   browser=await chromium.launch({headless:true,args:['--no-sandbox']});
   const sizes=[
     {name:'desktop',width:1440,height:900},
     {name:'mobile',width:390,height:844},
     {name:'small-mobile',width:320,height:700}
   ];
   for(const cfg of sizes){
     const context=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});
     const page=await context.newPage();
     const errors=[];
     page.on('pageerror',e=>errors.push(e.message));
     await page.goto('http://127.0.0.1:8765/');
     await page.waitForSelector('section[data-sec="films"] .card');
     const result=await page.evaluate(()=>{
       const title=document.querySelector('h1');
       const tag=document.querySelector('.tagline');
       const main=document.querySelector('.tagline-main'),personal=document.querySelector('.tagline-personal');
       const sort=document.querySelector('section[data-sec="films"] .section-sort');
       const h=document.querySelector('section[data-sec="films"] h2');
       const sortBox=sort.getBoundingClientRect(),hBox=h.getBoundingClientRect();
       const root=document.documentElement;
       return {
         viewport:innerWidth,
         scrollWidth:root.scrollWidth,
         tagHeight:Math.round(tag.getBoundingClientRect().height),
         titleHeight:Math.round(title.getBoundingClientRect().height),
         firstColor:getComputedStyle(main).color,
         secondColor:getComputedStyle(personal).color,
         sortOffset:Math.round(sortBox.left-hBox.right),
         sortLine:Math.round(sortBox.top-hBox.top),
         count:document.querySelector('section[data-sec="films"] [data-section-count]').textContent
       };
     });
     console.log('VISUAL',cfg.name,JSON.stringify(result));
     assert(result.scrollWidth<=cfg.width+2,'horizontal overflow '+cfg.name+' '+result.scrollWidth+' > '+cfg.width);
     assert(result.tagHeight<95,'tagline too tall '+cfg.name);
     assert.notEqual(result.firstColor,result.secondColor,'tagline parts must differ');
     assert.equal(result.count,'(20/85)');
     if(cfg.name==='desktop'){
       assert(result.sortOffset>=-5&&result.sortOffset<30,'sort not next to heading: '+result.sortOffset);
     }
     await page.screenshot({path:'ux-'+cfg.name+'.png',fullPage:false});
     await page.locator('section[data-sec="films"] .movie-title-trigger').first().click();
     await page.waitForSelector('#movieOverlay.open');
     const detail=await page.evaluate(()=>{
       const el=document.querySelector('#movieShell'),r=el.getBoundingClientRect();
       return {shellWidth:r.width,left:r.left,right:r.right,viewport:innerWidth,screenHeight:innerHeight};
     });
     console.log('DETAIL',cfg.name,JSON.stringify(detail));
     assert(detail.left>=-2&&detail.right<=cfg.width+2,'movie shell outside viewport '+cfg.name);
     await page.locator('#movieClose').click();

     if(cfg.name==='desktop'){
       // Verify autonomous save functionality with a real browser download.
       await page.locator('#saveStandalone').click();
       const promise=page.waitForEvent('download');
       await page.locator('#saveConfirm').click();
       const download=await promise;
       const savedPath=await download.path();
       const html=fs.readFileSync(savedPath,'utf8');
       assert(html.includes('id="embeddedMovieData"'),'embedded data missing in save');
       assert(html.includes('Отзывы и копирование'),'new copy UI missing in save');
       const filePage=await context.newPage();
       const fileErrors=[];filePage.on('pageerror',e=>fileErrors.push(e.message));
       await filePage.goto('file://'+savedPath);
       await filePage.waitForSelector('section[data-sec="films"] .card',{state:'attached',timeout:4000});
       await filePage.waitForTimeout(150);
       const n=await filePage.locator('section[data-sec] .card').count();
       const fileState=await filePage.evaluate(()=>({
         visible:document.querySelectorAll('section[data-sec] .card:not(.hidden)').length,
         firstCard:document.querySelector('section[data-sec] .card')?.className,
         firstSection:document.querySelector('section[data-sec]')?.className,
         error:document.querySelector('#empty')?.textContent,
         count:document.querySelector('section[data-sec] [data-section-count]')?.textContent
       }));
       console.log('STANDALONE',n,'cards, state',JSON.stringify(fileState),'errors',JSON.stringify(fileErrors),'saved HTML bytes',html.length);
       assert.equal(n,85,'standalone must show 85 cards');
       assert.equal(fileState.visible,85,'standalone must show 85 visible cards');
       assert.deepEqual(fileErrors,[],'standalone JavaScript errors');
       await filePage.close();
     }
     assert.deepEqual(errors,[],'browser JS errors '+cfg.name);
     await context.close();
     console.log('PASS',cfg.name);
   }
 }finally{
   if(browser)await browser.close();
   server.kill('SIGTERM');
 }
})().catch(err=>{console.error(err);process.exit(1)});
