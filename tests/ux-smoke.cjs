const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync('index.html','utf8');
const db = JSON.parse(fs.readFileSync('movies.json','utf8'));
const errors=[];
let copied = '';
const vc=new VirtualConsole();
vc.on('jsdomError', e=>errors.push(String(e&&e.message||e)));

const dom=new JSDOM(html,{
 url:'https://movie-map-rho.vercel.app/',
 runScripts:'dangerously',
 pretendToBeVisual:true,
 virtualConsole:vc,
 beforeParse(win){
   win.fetch=async url=>{
     if(String(url).includes('movies.json'))return {ok:true,json:async()=>structuredClone(db)};
     throw Error('Unexpected fetch: '+url);
   };
   Object.defineProperty(win.navigator,'clipboard',{configurable:true,value:{
     writeText:async value=>{copied=value}
   }});
   Object.defineProperty(win,'isSecureContext',{value:true,configurable:true});
 }
});
const {window:w}=dom;
const d=w.document;
const click=sel=>{
 const el=d.querySelector(sel);
 assert(el,'missing selector: '+sel);
 el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
 return el;
};
const tick=async()=>new Promise(r=>setTimeout(r,30));
const visible=()=>d.querySelectorAll('section[data-sec] .card:not(.hidden)').length;
const count=(sec)=>d.querySelector('section[data-sec="'+sec+'"] [data-section-count]')?.textContent;
const test=async(name,fn)=>{
 try{await fn();console.log('PASS '+name)}
 catch(e){console.error('FAIL '+name,e);process.exitCode=1}
};
async function init(){
 for(let i=0;i<100;i++){
   if(d.querySelectorAll('section[data-sec] .card').length===85)break;
   await tick();
 }
 assert.equal(d.querySelectorAll('section[data-sec] .card').length,85,'all 85 placements rendered');
}

(async()=>{
 await init();
 await test('tagline and main title',()=>{
   assert.equal(d.querySelector('h1').textContent,'🎬 Лабиринт кино — Анна и Егор');
   assert.match(d.querySelector('.tagline').textContent,/Чтобы однажды вспомнить/);
   assert.match(d.querySelector('.tagline').textContent,/Анна потом забыла/);
   assert(!d.getElementById('summary'));
 });
 await test('section counters and in-context sort',()=>{
   assert.equal(visible(),85);
   assert.equal(count('films'),'(20/85)');
   for(const sec of d.querySelectorAll('section[data-sec]')){
     assert.equal(sec.querySelector('.section-head h2').nextElementSibling.classList.contains('section-sort'),true);
   }
   click('section[data-sec="films"] .section-sort');
   assert.equal(d.querySelector('section[data-sec="series"] .section-sort').dataset.sort,'ru-asc');
   click('#reset'); assert.equal(count('films'),'(20/85)');
 });
 await test('category and review filters',()=>{
   click('[data-k="cat"][data-v="films"]');assert.equal(visible(),20);assert.equal(count('films'),'(20/85)');
   click('[data-k="cat"][data-v="all"]');
   click('#reviewMode');assert.equal(visible(),2);assert.equal(d.getElementById('reviewMode').dataset.mode,'has');
   click('#reviewMode');assert.equal(visible(),83);assert.equal(d.getElementById('reviewMode').dataset.mode,'none');
   click('#reset'); assert.equal(visible(),85);
 });
 await test('stars and country filters',()=>{
   click('#starsMode');assert.equal(d.getElementById('starsMode').dataset.mode,'3');
   click('#countryMode');assert.equal(d.getElementById('countryMode').dataset.mode,'ru');
   click('#reset');assert.equal(visible(),85);
 });
 await test('movie detail and poster zoom',()=>{
   click('[data-open-movie]');
   assert(d.getElementById('movieOverlay').classList.contains('open'));
   assert.match(w.location.hash,/^#movie=/);
   click('[data-poster-open]');
   assert(d.getElementById('posterOverlay').classList.contains('open'));
   click('#posterClose');
   assert(!d.getElementById('posterOverlay').classList.contains('open'));
   assert(d.getElementById('movieOverlay').classList.contains('open'));
 });
 await test('copy movie before/after, package and threads',async()=>{
   const detail=d.getElementById('movieDetailBody');
   assert(detail.querySelector('.thread-copy-menu'));
   const thread=detail.querySelector('[data-copy-thread="review:me"]');
   assert(thread,'all Egor copy action visible in detail markup');
   thread.click();await tick();
   assert(copied.includes('Disclaimer / Дисклеймер'),copied.slice(0,80));
   const packageButton=detail.querySelector('[data-copy-package]');
   assert(packageButton);
   click('#movieClose');
   const salt=[...d.querySelectorAll('.card')].find(el=>el.dataset.key===db.works[0].id);
   assert(salt.querySelector('.pre .copy-icon'));
   salt.querySelector('.pre .copy-icon').click();await tick();
   assert(copied.includes('Студент из Оксфорда'));
   const hasAfter=[...d.querySelectorAll('.card')].find(el=>el.querySelector('.post .copy-icon'));
   assert(hasAfter,'at least one after copy icon');
   hasAfter.querySelector('.post .copy-icon').click();await tick();
   assert(copied.length>20);
 });
 await test('review popup visible three-level copy actions',async()=>{
   const disclaimer=d.querySelector('.card[data-key="33233b1d276d"]');
   assert(disclaimer,'Disclaimer card not found');
   disclaimer.querySelector('.fact-review-trigger').click();await tick();
   assert(d.getElementById('reviewOverlay').classList.contains('open'));
   assert.match(d.getElementById('reviewCopyThread').textContent,/Вся ветка/);
   d.getElementById('reviewCopyThread').click();await tick();
   assert(copied.includes('Disclaimer'));
   d.getElementById('reviewCopyMovie').click();await tick();
   assert(copied.indexOf('Анна')>=0);
   assert(copied.indexOf('Анна')<copied.indexOf('Егор'),'Anna before Egor in package');
 });
 await test('Golden Fleece save code preserved',()=>{
   assert(html.includes('clone=document.documentElement.cloneNode(true)'));
   assert(html.includes('embedded.textContent=JSON.stringify(selected)'));
   assert(d.getElementById('embeddedMovieData').textContent.includes('works'));
 });
 if(errors.length){console.error('JSDOM ERRORS',errors);process.exitCode=1}
 console.log('DONE, errors=',errors.length,'status=',process.exitCode||0);
 dom.window.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
