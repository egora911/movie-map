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
const count=()=>d.getElementById('catalogCount')?.textContent;
const catalogTitle=()=>d.getElementById('catalogTitleText')?.textContent;
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
 await test('single header: All, sort, then category chips',()=>{
   assert.equal(visible(),85);
   assert.equal(count(),'(85/85)');
   assert.equal(catalogTitle(),'Все');
   assert.equal(d.querySelectorAll('#allRegistry .card').length,85);
   assert.equal(d.querySelectorAll('#allRegistry .card-origin').length,85);
   const header=d.getElementById('catalogToolbar');
   assert.equal(header.children[0].id,'catalogTitle');
   assert(header.children[1].classList.contains('section-sort'),'sort directly after title');
   assert.equal(header.children[2].id,'cat','category chips directly after sort');
   assert.equal(d.querySelectorAll('.top #cat').length,0,'old upper category row must be removed');
   assert.equal(d.querySelectorAll('[data-section-sort]').length,1);
   assert.equal(d.querySelector('[data-k="cat"][data-v="me"]').textContent,'👨 для Егор');
   assert.equal(d.querySelector('[data-k="cat"][data-v="her"]').textContent,'👩 для Анна');
   click('#catalogToolbar .section-sort');
   assert.equal(d.querySelector('.section-sort').dataset.sort,'ru-asc');
   click('[data-k="cat"][data-v="films"]');
   assert.equal(visible(),20);
   assert.equal(count(),'(20/85)');
   assert.equal(catalogTitle(),'❤️ Фильмы для двоих');
   assert.equal(d.querySelectorAll('#allRegistry .card').length,0);
   assert.equal(d.querySelectorAll('#catalogToolbar #cat [data-k="cat"]').length,6);
   click('[data-k="cat"][data-v="all"]');
   assert.equal(visible(),85);
   assert.equal(count(),'(85/85)');
   click('#reset');
 });
 await test('review-presence filter still updates header',()=>{
   click('#reviewMode');assert.equal(visible(),2);assert.equal(count(),'(2/85)');
   click('#reviewMode');assert.equal(visible(),83);assert.equal(count(),'(83/85)');
   click('#reset');assert.equal(visible(),85);assert.equal(count(),'(85/85)');
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
 await test('row status under number; no copy icons in list rows',()=>{
   const salt=d.querySelector('#allRegistry .card');
   const badge=salt.querySelector('.card-index');
   assert(badge,'row index must be a vertical stack');
   assert(badge.firstElementChild.classList.contains('n'),'number first');
   assert(badge.lastElementChild.classList.contains('state-mark'),'state directly under number');
   assert(!salt.querySelector('.row1 > .badge .state-mark'),'state must not sit beside movie title');
   assert.equal(d.querySelectorAll('section[data-sec] .card .pre .copy-icon').length,0);
   assert.equal(d.querySelectorAll('section[data-sec] .card .post .copy-icon').length,0);
 });
 await test('detailed copy for ДО and ПОСЛЕ, thread, package',async()=>{
   const detail=d.getElementById('movieDetailBody');
   assert(detail.querySelector('.thread-copy-menu'));
   assert(detail.querySelector('.section-title-row .copy-icon'),'detail copy icon must still be available');
   const before=detail.querySelector('button[title="Копировать ДО"]');
   assert(before,'before copy retained inside full movie card');
   before.click();await tick();
   assert(copied.includes('Студент из Оксфорда'));
   const after=detail.querySelector('button[title="Копировать ПОСЛЕ"]');
   assert(after,'after copy retained inside full movie card');
   after.click();await tick();
   assert(copied.length>25);
   const thread=detail.querySelector('[data-copy-thread="review:me"]');
   assert(thread);
   thread.click();await tick();
   assert(copied.includes('Disclaimer / Дисклеймер'));
   assert(detail.querySelector('[data-copy-package]'));
   click('#movieClose');
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
 await test('canonical UI labels do not alter raw reviews',()=>{
   assert.equal(db.categories.find(x=>x.id==='me').label,'для Егор');
   assert.equal(db.categories.find(x=>x.id==='her').label,'для Анна');
   assert(db.works.find(w=>w.id==='33233b1d276d').reviews.me.length>300);
   const api=fs.readFileSync('api/chat.js','utf8');
   assert(api.includes('me = Егор, wife = Анна'));
   assert(!/Для меня|Для неё|Для жены|Для него/i.test([...d.querySelectorAll('[data-k="cat"],.card-origin,#catalogTitleText')].map(x=>x.textContent).join(' ')));
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
