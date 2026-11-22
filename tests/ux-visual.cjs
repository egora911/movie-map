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
     await page.waitForSelector('#allRegistry .card');
     const result=await page.evaluate(()=>{
       const title=document.querySelector('h1');
       const tag=document.querySelector('.tagline');
       const main=document.querySelector('.tagline-main'),personal=document.querySelector('.tagline-personal');
       const sort=document.querySelector('#allRegistry h2 .section-sort');
       const counter=document.querySelector('#allRegistry [data-section-count]');
       const sortBox=sort.getBoundingClientRect(),counterBox=counter.getBoundingClientRect();
       const firstTitle=document.querySelector('#allRegistry .card .title');
       const titleCss=getComputedStyle(firstTitle);
       const root=document.documentElement;
       return {
         viewport:innerWidth,
         scrollWidth:root.scrollWidth,
         tagHeight:Math.round(tag.getBoundingClientRect().height),
         titleHeight:Math.round(title.getBoundingClientRect().height),
         firstColor:getComputedStyle(main).color,
         secondColor:getComputedStyle(personal).color,
         sortOffset:Math.round(sortBox.left-counterBox.right),
         sortLine:Math.round(sortBox.top-counterBox.top),
         count:counter.textContent,
         allRows:document.querySelectorAll('#allRegistry .card').length,
         originTags:document.querySelectorAll('#allRegistry .card-origin').length,
         categorySectionsVisible:[...document.querySelectorAll('section[data-sec]')].filter(x=>x.id!=='allRegistry'&&!x.classList.contains('hidden')).length,
         movieFontSize:titleCss.fontSize,
         movieFontWeight:titleCss.fontWeight,
         movieLineHeight:titleCss.lineHeight
       };
     });
     console.log('VISUAL',cfg.name,JSON.stringify(result));
     assert(result.scrollWidth<=cfg.width+2,'horizontal overflow '+cfg.name+' '+result.scrollWidth+' > '+cfg.width);
     assert(result.tagHeight<95,'tagline too tall '+cfg.name);
     assert.notEqual(result.firstColor,result.secondColor,'tagline parts must differ');
     assert.equal(result.count,'(85/85)');
     assert.equal(result.allRows,85,'All must contain 85 real cards');
     assert.equal(result.originTags,85,'All must show each card category');
     assert.equal(result.categorySectionsVisible,0,'no other list sections should show in All');
     assert(Number.parseFloat(result.movieFontSize)<=12.5,'movie title must be reduced by one font unit');
     assert(Number.parseFloat(result.movieFontWeight)<720,'movie title must be lighter');
     if(cfg.name==='desktop'||cfg.name==='mobile'){
       assert(result.sortOffset>=3&&result.sortOffset<24,'sort must sit immediately after counter: '+result.sortOffset);
     }
     await page.screenshot({path:'ux-'+cfg.name+'.png',fullPage:false});
     await page.locator('#allRegistry .movie-title-trigger').first().click();
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
       // Playwright stores downloads as extensionless UUIDs; Chromium treats those as text on file://.
       // Restore the expected .html extension before testing the standalone document.
       const savedHtmlPath=savedPath+'.html';
       fs.copyFileSync(savedPath,savedHtmlPath);
       const html=fs.readFileSync(savedHtmlPath,'utf8');
       assert(html.includes('id="embeddedMovieData"'),'embedded data missing in save');
       assert(html.includes('Отзывы и копирование'),'new copy UI missing in save');
       const filePage=await context.newPage();
       const fileErrors=[];filePage.on('pageerror',e=>fileErrors.push(e.message));
       await filePage.goto('file://'+savedHtmlPath);
       await filePage.waitForTimeout(300);
       console.log('SAVED FILE CHECK',JSON.stringify({
         filePath:savedPath,
         fileBytes:html.length,
         embeddedCardTags:(html.match(/<article\\b[^>]*class="card/g)||[]).length,
         embeddedDataStart:html.includes('id="embeddedMovieData"'),
         title:await filePage.title(),
         location:filePage.url(),
         htmlLength:(await filePage.content()).length,
         browserErrors:fileErrors
       }));
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
       assert.equal(await filePage.locator('#allRegistry .card').count(),85,'standalone All should be a single register');
       await filePage.locator('[data-k="cat"][data-v="films"]').click();
       assert.equal(await filePage.locator('section[data-sec="films"] .card:not(.hidden)').count(),20,'standalone category navigation must work');
       await filePage.locator('[data-k="cat"][data-v="all"]').click();
       assert.equal(await filePage.locator('#allRegistry .card:not(.hidden)').count(),85,'standalone must restore flat All');
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
