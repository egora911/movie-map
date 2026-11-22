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
       const header=document.getElementById('catalogToolbar');
       const catalogTitle=document.getElementById('catalogTitle');
       const sort=header.querySelector(':scope > .section-sort');
       const cat=header.querySelector('#cat');
       const firstCategory=cat.querySelector('button');
       const titleBox=catalogTitle.getBoundingClientRect();
       const sortBox=sort.getBoundingClientRect();
       const catBox=cat.getBoundingClientRect();
       const firstCatBox=firstCategory.getBoundingClientRect();
       const firstCard=document.querySelector('#allRegistry .card');
       const firstTitle=firstCard.querySelector('.title');
       const titleCss=getComputedStyle(firstTitle);
       const watch=firstCard.querySelector('.score .watch');
       const forecast=firstCard.querySelector('.score > .lab:not(.c):not(.fact)');
       const ext=firstCard.querySelector('.score .score-ext-values');
       const fact=firstCard.querySelector('.score .c.fact');
       const meta=firstCard.querySelector('.meta');
       const membership=firstCard.querySelector('.card-memberships');
       const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
       const sentimental=[...document.querySelectorAll('#allRegistry .card[data-cat="films"]')].find(c=>c.querySelector('.title')?.textContent?.includes('Sentimental Value'));
       const membershipSent=sentimental?.querySelector('.card-memberships');
       const crossSent=membershipSent?.querySelector('.crosslists');
       const starsSent=sentimental?.querySelector('.row1 .stars');
       const root=document.documentElement;
       return {
         viewport:innerWidth,
         scrollWidth:root.scrollWidth,
         tagHeight:Math.round(tag.getBoundingClientRect().height),
         titleHeight:Math.round(title.getBoundingClientRect().height),
         firstColor:getComputedStyle(main).color,
         secondColor:getComputedStyle(personal).color,
         sortOffset:Math.round(sortBox.left-titleBox.right),
         sortLine:Math.round(sortBox.top-titleBox.top),
         categoryOffset:Math.round(firstCatBox.left-sortBox.right),
         categoryLine:Math.round(firstCatBox.top-sortBox.top),
         catLeft:Math.round(catBox.left),
         catTop:Math.round(catBox.top),
         count:document.getElementById('catalogCount').textContent,
         titleText:document.getElementById('catalogTitleText').textContent,
         filterChipCount:cat.querySelectorAll('button').length,
         oldHeaderCatPresent:!!document.querySelector('.top #cat'),
         listCopies:document.querySelectorAll('section[data-sec] .card .pre .copy-icon,section[data-sec] .card .post .copy-icon').length,
         indexStatusStacks:document.querySelectorAll('#allRegistry .card .card-index > .state-mark').length,
         allRows:document.querySelectorAll('#allRegistry .card').length,
         originTags:document.querySelectorAll('#allRegistry .card-origin').length,
         categorySectionsVisible:[...document.querySelectorAll('section[data-sec]')].filter(x=>x.id!=='allRegistry'&&!x.classList.contains('hidden')).length,
         movieFontSize:titleCss.fontSize,
         movieFontWeight:titleCss.fontWeight,
         movieLineHeight:titleCss.lineHeight,
         watchRect:rect(watch),
         forecastRect:rect(forecast),
         factRect:rect(fact),
         externalRect:rect(ext),
         membershipRect:rect(membership),
         metaRect:rect(meta),
         membershipText:membership.textContent,
         sentimentalMembershipText:membershipSent?.textContent||'',
         sentimentalMembershipRect:membershipSent?rect(membershipSent):null,
         sentimentalCrossRect:crossSent?rect(crossSent):null,
         sentimentalStars:starsSent?.textContent||'',
         titleWatchExists:!!firstCard.querySelector('.row1 .watch'),
         leftRatingsExists:!!firstCard.querySelector('.left .external-ratings'),
         scoreRatingsCount:firstCard.querySelectorAll('.score .external-rating').length,
         shortlistCount:document.querySelectorAll('#allRegistry .score .watch').length
       };
     });
     console.log('VISUAL',cfg.name,JSON.stringify(result));
     // WCAG contrast with current nearly-black body, without changing typography or placement.
     const lum=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
     const rgb=str=>(str.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
     const bg=lum([13,15,18]);
     const contrastOf=str=>(lum(rgb(str))+.05)/(bg+.05);
     const ratio=contrastOf(result.secondColor)/contrastOf(result.firstColor);
     assert(ratio>=.80&&ratio<=.85,'tagline second part should be 15-20% less contrast, got '+ratio);
     assert(result.tagHeight>0,'tagline must remain visible');
     assert(result.scrollWidth<=cfg.width+2,'horizontal overflow '+cfg.name+' '+result.scrollWidth+' > '+cfg.width);
     assert(result.tagHeight<95,'tagline too tall '+cfg.name);
     assert.notEqual(result.firstColor,result.secondColor,'tagline parts must differ');
     assert.equal(result.count,'(85/85)');
     assert.equal(result.titleText,'Все');
     assert.equal(result.filterChipCount,6,'all 6 category chips remain');
     assert.equal(result.oldHeaderCatPresent,false,'old top category row removed');
     assert.equal(result.indexStatusStacks,85,'status must sit below each row number');
     assert.equal(result.listCopies,0,'no copy icons in collapsed list rows');
     assert.equal(result.allRows,85,'All must contain 85 real cards');
     assert.equal(result.originTags,85,'All must show each card category');
     assert.equal(result.categorySectionsVisible,0,'no other list sections should show in All');
     assert(Number.parseFloat(result.movieFontSize)<=12.5,'movie title must be reduced by one font unit');
     assert(Number.parseFloat(result.movieFontWeight)<720,'movie title must be lighter');
     assert.equal(result.titleWatchExists,false,'tomorrow must be removed from movie title');
     assert.equal(result.leftRatingsExists,false,'aggregator ratings must be moved from under title');
     assert.equal(result.shortlistCount,85,'all 85 shortlist actions preserved');
     assert.equal(result.scoreRatingsCount,2,'Saltburn must show KP and IMDb below personal scores');
     assert(result.watchRect.bottom<=result.forecastRect.top+1.5,'tomorrow must sit directly above forecast label');
     assert(result.externalRect.top>=result.factRect.bottom-2,'aggregators must be under actual score cells');
     assert(result.membershipRect.top>=result.metaRect.top,'membership must follow year and type');
     assert(result.membershipText.includes('Фильмы 2х'),'category origin visible in next line');
     assert(result.sentimentalMembershipText.includes('Фильмы 2х')&&result.sentimentalMembershipText.includes('ещё:')&&result.sentimentalMembershipText.includes('Для Анны'),'Sentimental Value must show current list before cross-list');
     assert(result.sentimentalStars.includes('⭐'),'stars must remain alongside title, at old tomorrow position');
     if(cfg.name==='desktop'){
       assert(result.sortOffset>=3&&result.sortOffset<24,'sort must follow title directly: '+result.sortOffset);
       assert(Math.abs(result.sortLine)<18,'sort must be on title line');
       assert(result.categoryOffset>=3&&result.categoryOffset<28,'category tabs must follow sort on same row');
       assert(Math.abs(result.categoryLine)<20,'category nav should be alongside sort on desktop');
       assert(Math.abs(result.sentimentalMembershipRect.top-result.sentimentalCrossRect.top)<14,'origin and cross category must share a single line on desktop');
     }
     await page.screenshot({path:'ux-'+cfg.name+'.png',fullPage:false});
     const firstWatch=page.locator('#allRegistry .score .watch').first();
     await firstWatch.click();
     assert.equal(await page.locator('#allRegistry .card').first().getAttribute('data-tomorrow'),'1','shortlist toggles in score column');
     await firstWatch.click();
     assert.equal(await page.locator('#allRegistry .card').first().getAttribute('data-tomorrow'),'0','shortlist toggles off');
     await page.locator('#allRegistry .movie-title-trigger').first().click();
     await page.waitForSelector('#movieOverlay.open');
     const detail=await page.evaluate(()=>{
       const el=document.querySelector('#movieShell'),r=el.getBoundingClientRect();
       return {shellWidth:r.width,left:r.left,right:r.right,viewport:innerWidth,screenHeight:innerHeight};
     });
     console.log('DETAIL',cfg.name,JSON.stringify(detail));
     assert(detail.left>=-2&&detail.right<=cfg.width+2,'movie shell outside viewport '+cfg.name);
     await page.locator('#movieClose').click();
     // Disclaimer acceptance: history of Egor, GPT Egor, and joint GPT.
     await page.locator('#allRegistry .card[data-key="33233b1d276d"] .fact-review-trigger[data-person="egor"]').first().click();
     await page.waitForSelector('#reviewOverlay.open');
     assert.equal(await page.locator('#historyToggle').textContent(),'🕰 История · 1');
     const currentReview=await page.locator('#reviewBody').textContent();
     assert(currentReview.includes('Фильм быстро завлекает'));
     await page.locator('#historyToggle').click();
     assert.equal(await page.locator('#historyPanel [data-history-index]').count(),1);
     assert((await page.locator('#historyPanel').textContent()).includes('Зафиксированный текущий отзыв'));
     await page.locator('#historyPanel [data-history-index="0"]').click();
     assert((await page.locator('#reviewBody').textContent()).includes('Фильм быстро завлекает'));
     await page.locator('#historyShowCurrent').click();
     assert.equal(await page.locator('#reviewBody').textContent(),currentReview);
     await page.locator('#reviewNavChips [data-review-mode="ai"][data-review-person-target="egor"]').click();
     assert((await page.locator('#historyStatus').textContent()).includes('v1'));
     await page.locator('#historyToggle').click();
     assert((await page.locator('#historyPanel').textContent()).includes('Перенесённая текущая версия'));
     await page.locator('#reviewNavChips [data-review-mode="together"]').click();
     assert.equal(await page.locator('#historyToggle').textContent(),'🕰 История · 1');
     const shellReview=await page.locator('#reviewShell').boundingBox();
     assert(shellReview&&shellReview.x>=-2&&shellReview.x+shellReview.width<=cfg.width+2,'review popup must fit viewport');
     await page.screenshot({path:'ux-history-'+cfg.name+'.png',fullPage:false});
     await page.locator('#reviewClose').click();

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
         count:document.getElementById('catalogCount')?.textContent
       }));
       console.log('STANDALONE',n,'cards, state',JSON.stringify(fileState),'errors',JSON.stringify(fileErrors),'saved HTML bytes',html.length);
       assert.equal(n,85,'standalone must show 85 cards');
       assert.equal(fileState.visible,85,'standalone must show 85 visible cards');
       assert.equal(await filePage.locator('#allRegistry .card').count(),85,'standalone All should be a single register');
       assert.equal(fileState.count,'(85/85)');
       await filePage.locator('[data-k="cat"][data-v="films"]').click();
       assert.equal(await filePage.locator('section[data-sec="films"] .card:not(.hidden)').count(),20,'standalone category navigation must work');
       assert.equal(await filePage.locator('#catalogCount').textContent(),'(20/85)');
       await filePage.locator('[data-k="cat"][data-v="all"]').click();
       assert.equal(await filePage.locator('#allRegistry .card:not(.hidden)').count(),85,'standalone must restore flat All');
       assert.equal(await filePage.locator('#catalogCount').textContent(),'(85/85)');
       await filePage.locator('#allRegistry .card[data-key="33233b1d276d"] .fact-review-trigger[data-person="egor"]').first().click();
       await filePage.waitForSelector('#reviewOverlay.open');
       assert.equal(await filePage.locator('#historyToggle').textContent(),'🕰 История · 1','offline history retained');
       await filePage.locator('#historyToggle').click();
       assert.equal(await filePage.locator('#historyPanel [data-history-index]').count(),1);
       await filePage.locator('#reviewClose').click();
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
