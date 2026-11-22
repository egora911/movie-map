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
   assert.equal(d.querySelector('[data-k="cat"][data-v="me"]').textContent,'👨 Для Егора');
   assert.equal(d.querySelector('[data-k="cat"][data-v="her"]').textContent,'👩 Для Анны');
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
   const reviewed=db.works.reduce((n,x)=>n+x.placements.length*((w.personValue(x.reviews,'egor')?.trim()||w.personValue(x.reviews,'anna')?.trim())?1:0),0);
   click('#reviewMode');assert.equal(visible(),reviewed);assert.equal(count(),`(${reviewed}/85)`);
   click('#reviewMode');assert.equal(visible(),85-reviewed);assert.equal(count(),`(${85-reviewed}/85)`);
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
 await test('screenshot layout: membership, stars, tomorrow and aggregator ratings',async()=>{
   const saltWork=db.works.find(w=>w.title.startsWith('Saltburn'));
   const salt=d.querySelector('#allRegistry .card[data-key="'+saltWork.id+'"]');
   assert(salt,'Saltburn row exists in All');
   assert.equal(salt.querySelector('.left .external-ratings'),null,'ratings must not remain under year');
   assert.equal(salt.querySelector('.row1 .watch'),null,'tomorrow must not reduce movie title width');
   assert.equal(salt.querySelector('.score .watch').textContent.trim(),'📌 завтра');
   const scoreChildren=[...salt.querySelector('.score').children];
   assert(scoreChildren[0].classList.contains('score-shortlist'),'tomorrow must occupy first header cell');
   assert(scoreChildren[3].textContent.includes('прогноз'),'forecast follows immediately below tomorrow header');
   assert.equal(salt.querySelector('.score .external-ratings .external-rating.kp').textContent.replace(/\\s+/g,' ').trim(),'КП 7.0');
   assert.equal(salt.querySelector('.score .external-ratings .external-rating.imdb').textContent.replace(/\\s+/g,' ').trim(),'IMDb 7.0');
   assert.equal(salt.querySelectorAll('.score-ext-values').length,1);
   assert(!salt.querySelector('.row1 .badge')||!salt.querySelector('.row1 .badge').textContent.includes('завтра'));
   const meta=salt.querySelector('.meta');
   assert(meta.nextElementSibling.classList.contains('card-memberships'),'category line must be directly under year and type');
   assert.equal(salt.querySelector('.card-memberships').children[0].classList.contains('card-origin'),true,'origin must be first');
   const sentimental=db.works.find(w=>w.title.startsWith('Sentimental Value'));
   const filmPlacement=d.querySelector('#allRegistry .card[data-key="'+sentimental.id+'"][data-cat="films"]');
   assert(filmPlacement,'Sentimental Value Films 2x placement exists');
   const line=filmPlacement.querySelector('.card-memberships');
   assert.match(line.textContent,/Фильмы 2х/);
   assert.match(line.textContent,/ещё:/);
   assert.match(line.textContent,/Для Анны/);
   assert(line.querySelector('[data-cross-cat="her"]'),'cross-list chip must retain its navigation');
   assert.equal(line.previousElementSibling.classList.contains('meta'),true);
   assert.equal(d.querySelectorAll('#allRegistry .card .score-shortlist .watch').length,85,'all 85 placements have shortlist button in score');
   const beforeCopy=d.querySelectorAll('#allRegistry .card .pre .copy-icon').length;
   assert.equal(beforeCopy,0,'compact card does not have copy action');
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
   const thread=detail.querySelector('[data-copy-thread="review:egor"]');
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
   if(Number(db.schema_version)>=2)assert.equal(db.categories.find(x=>x.id==='me').label,'Кино / сериал для Егора');
   if(Number(db.schema_version)>=2)assert.equal(db.categories.find(x=>x.id==='her').label,'Кино / сериал для Анны');
   assert(w.personValue(db.works.find(w=>w.id==='33233b1d276d').reviews,'egor').length>300);
   const api=fs.readFileSync('api/chat.js','utf8');
   assert(api.includes('Системные ключи персон: egor / anna'));
   assert(!/Для меня|Для неё|Для жены|Для него/i.test([...d.querySelectorAll('[data-k="cat"],.card-origin,#catalogTitleText')].map(x=>x.textContent).join(' ')));
 });

 await test('origin schema, fallback and unified chip',()=>{
   assert.equal(w.originBucket({}),'unknown');
   assert.equal(w.originBucket({origin:{type:'gpt_recommendation',added_by:'chatgpt'}}),'gpt');
   assert.equal(w.originBucket({origin:{type:'watched_history',added_by:'couple'}}),'couple');
   assert.equal(w.originBucket({origin:{type:'user_added',added_by:'egor'}}),'egor');
   assert.equal(w.originBucket({origin:{type:'user_added',added_by:'anna'}}),'anna');
   assert.equal(w.originBucket({origin:{type:'gpt_recommendation',added_by:'unknown'}}),'unknown');
   assert.equal(d.querySelectorAll('#allRegistry .card[data-origin]').length,85);
   assert.equal(d.querySelectorAll('#allRegistry .card .origin-source').length,85);
   assert(d.querySelector('#originMode'),'origin filter must be visible');
   click('#originMode');assert.equal(d.querySelector('#originMode').dataset.mode,'gpt');
   const gptRows=db.works.filter(x=>w.originBucket(x)==='gpt').reduce((n,x)=>n+x.placements.length,0);
   assert.equal(visible(),gptRows);
   click('#reset');
   for(let i=0;i<5;i++)click('#originMode');
   assert.equal(d.querySelector('#originMode').dataset.mode,'unknown');
   const unknownRows=db.works.filter(x=>w.originBucket(x)==='unknown').reduce((n,x)=>n+x.placements.length,0);
   assert.equal(visible(),unknownRows);
   click('#reset');assert.equal(visible(),85);
 });
 await test('missing Egor/Anna human review modes',()=>{
   for(let i=0;i<3;i++)click('#reviewMode');
   assert.equal(d.querySelector('#reviewMode').dataset.mode,'missing-egor');
   const expected=db.works.reduce((n,x)=>n+x.placements.length*((w.personValue(x.reviews,'anna')?.trim()||w.personValue(x.reviews,'egor')?.trim())&&!w.personValue(x.reviews,'egor')?.trim()?1:0),0);
   assert.equal(visible(),expected);
   click('#reviewMode');
   assert.equal(d.querySelector('#reviewMode').dataset.mode,'missing-anna');
   const anna=db.works.reduce((n,x)=>n+x.placements.length*((w.personValue(x.reviews,'anna')?.trim()||w.personValue(x.reviews,'egor')?.trim())&&!w.personValue(x.reviews,'anna')?.trim()?1:0),0);
   assert.equal(visible(),anna);
   click('#reset');
 });

 await test('four duplicate modes with unique work representatives',()=>{
   const duplicates=db.works.filter(x=>x.placements.length>1),sum=duplicates.reduce((n,x)=>n+x.placements.length,0);
   click('#dupMode');assert.equal(d.getElementById('dupMode').dataset.mode,'exclude');assert.equal(visible(),85-sum);
   click('#dupMode');assert.equal(d.getElementById('dupMode').dataset.mode,'only');assert.equal(visible(),sum);
   click('#dupMode');assert.equal(d.getElementById('dupMode').dataset.mode,'unique');assert.equal(visible(),duplicates.length);
   const rows=[...d.querySelectorAll('section[data-sec] .card:not(.hidden)')];
   assert.equal(new Set(rows.map(c=>c.dataset.key)).size,rows.length);
   click('#dupMode');assert.equal(d.getElementById('dupMode').dataset.mode,'all');assert.equal(visible(),85);
   click('[data-k="cat"][data-v="her"]');for(let i=0;i<3;i++)click('#dupMode');
   assert.equal(visible(),duplicates.filter(x=>x.placements.some(p=>p.category==='her')).length);
   click('#reset');
 });
 await test('multiselect film years and year sort',()=>{
   click('#yearPickerToggle');
   const boxes=[...d.querySelectorAll('input[data-year-choice]')];
   assert(boxes.length>=5);
   assert(boxes.some(x=>x.value==='2023')&&boxes.some(x=>x.value==='2025'));
   for(const y of ['2023','2025']){
     const input=boxes.find(x=>x.value===y);
     input.checked=true;input.dispatchEvent(new w.Event('change',{bubbles:true}));
   }
   assert([...d.querySelectorAll('.card:not(.hidden)')].every(c=>['2023','2025'].includes(c.dataset.year)));
   click('#yearClear');
   assert.equal(visible(),85);
   click('#reset');
   for(let i=0;i<7;i++)click('#catalogToolbar .section-sort');
   assert.equal(d.querySelector('.section-sort').dataset.sort,'year-desc');
   const yearsDesc=[...d.querySelectorAll('#allRegistry .card:not(.hidden)')].map(x=>Number(x.dataset.year));
   assert(yearsDesc.every((x,i)=>i===0||yearsDesc[i-1]>=x),'desc sort must be chronological');
   click('#catalogToolbar .section-sort');
   assert.equal(d.querySelector('.section-sort').dataset.sort,'year-asc');
   const yearsAsc=[...d.querySelectorAll('#allRegistry .card:not(.hidden)')].map(x=>Number(x.dataset.year));
   assert(yearsAsc.every((x,i)=>i===0||yearsAsc[i-1]<=x),'asc sort must be chronological');
   click('#reset');
 });
 await test('History of Soul canonical-first reads and legacy safety',()=>{
   const contract=require('../scripts/history-contract.cjs');
   assert.deepEqual(contract.errorsForMovieMap(db),[]);
   assert.equal(w.canonicalPerson('wife'),'anna');
   assert.equal(w.canonicalPerson('me'),'egor');
   assert.equal(w.personValue({egor:'new',me:'old'},'egor'),'new');
   assert.equal(w.personValue({wife:'legacy'},'anna'),'legacy');
   const legacy=db.works.find(x=>x.id==='33233b1d276d');
   assert(legacy);
   const canonical=JSON.parse(JSON.stringify(legacy));
   function remap(obj){
     if(!obj||typeof obj!=='object')return;
     if(Object.prototype.hasOwnProperty.call(obj,'me')){obj.egor=obj.me;delete obj.me}
     if(Object.prototype.hasOwnProperty.call(obj,'wife')){obj.anna=obj.wife;delete obj.wife}
   }
   for(const group of ['reviews','review_dates','ai_comments'])remap(canonical[group]);
   for(const p of canonical.placements){remap(p.prediction);remap(p.actual)}
   assert.equal(w.personValue(canonical.reviews,'egor'),w.personValue(legacy.reviews,'egor'));
   assert.equal(w.personValue(canonical.ai_comments,'anna'),w.personValue(legacy.ai_comments,'anna'));
   const card=w.cardHtml(canonical,canonical.placements[0]);
   assert(card.includes('data-has-review-egor="1"'));
   assert(card.includes('data-has-review-anna="1"'));
   assert(card.includes('data-score-egor="9"')&&card.includes('data-score-anna="10"'));
   assert(card.includes('data-review-egor=')&&card.includes('data-review-anna='));
   assert(card.includes('data-ai-together='));
   assert(card.includes('Открыть полный отзыв Егора'));
   assert.deepEqual(contract.errorsForMovieMap({...db,works:db.works.map(w=>w.id===canonical.id?canonical:w)}),[]);
   const fake={...canonical,history_current:undefined,review_history:{egor:[{id:'event_review_1',type:'legacy_current',date:'2026-11-16',text:canonical.reviews.egor}],anna:[]},ai_comment_history:{egor:[{id:'event_ai_1',type:'backfill',version:1,text:canonical.ai_comments.egor}],anna:[],together:[]}};
   assert.equal(contract.errorsForMovieMap({...db,works:db.works.map(w=>w.id===fake.id?fake:w)}).length,0);
   assert.equal(w.personHistory(fake,'review_history','egor').length,1);
 });
 await test('canonical migrated history stays exactly materialized',()=>{
   if(Number(db.schema_version)<2)return;
   const contract=require('../scripts/history-contract.cjs');
   assert.equal(contract.errorsForMovieMap(db,{requireCanonical:true}).length,0);
   assert.equal(db.works.filter(w=>w.review_history&&w.ai_comment_history).length,58);
   const w0=db.works.find(w=>w.id==='33233b1d276d');
   assert(w0.review_history.egor.length>=1);
   assert(w0.review_history.anna.length>=1);
   for(const p of ['egor','anna']){
     const reviewEvent=w0.review_history[p].find(x=>x.id===w0.history_current.review[p]);
     const aiEvent=w0.ai_comment_history[p].find(x=>x.id===w0.history_current.ai[p]);
     assert(reviewEvent,'current human review event must exist for '+p);
     assert(aiEvent,'current AI event must exist for '+p);
     assert.equal(reviewEvent.text,w0.reviews[p]);
     assert.equal(aiEvent.text,w0.ai_comments[p]);
   }
   const togetherEvent=w0.ai_comment_history.together.find(x=>x.id===w0.history_current.ai.together);
   assert(togetherEvent,'current together AI event must exist');
   assert.equal(togetherEvent.text,w0.ai_comments.together);
   assert(w0.placements.every(x=>x.actual.egor==='9'&&x.actual.anna==='10'));
   assert(db.works.every(w=>w.origin));
   assert.equal(db.works.length,58);
   assert.equal(db.works.reduce((n,w)=>n+w.placements.length,0),85);
 });
 await test('System naming and API tools use Egor/Anna only',()=>{
   const labels=[...d.querySelectorAll('[data-k="cat"],.review-nav-chips button,.review-mode-label,#catalogTitleText,.score .c.lab')].map(x=>x.textContent).join(' ');
   assert(!/(GPT\s*·\s*(?:Я|Жена)|Для\s+(?:меня|неё|нее|него|жены)|Мой отзыв|Отзыв жены)/iu.test(labels));
   assert(labels.includes('Егор')&&labels.includes('Анна'));
   const code=fs.readFileSync('api/chat.js','utf8');
   const backend=new Function('require','process','module',code+'\nreturn {canonicalPair,flatRows,getMovie,getCatalogStats};')(require,process,{exports:{}});
   assert.deepEqual(backend.canonicalPair({me:'9',wife:'10'}),{egor:'9',anna:'10'});
   assert.deepEqual(backend.canonicalPair({egor:'9',anna:'10'}),{egor:'9',anna:'10'});
   assert.equal(backend.flatRows().length,85);
   const result=backend.getMovie({id_or_title:'Disclaimer'});
   assert(result.length>0);
   assert.equal(backend.getCatalogStats().categories.find(c=>c.id==='me').label,'Кино / сериал для Егора');
   const record=result[0];
   assert(w.personValue(record.reviews,'egor').length>100);
   assert(record.placements.every(p=>p.actual.egor!==undefined&&p.actual.anna!==undefined));
 });
 await test('History UI supports human additions and GPT version increments without changing production JSON',async()=>{
   const {appendHumanEvent,appendAiEvent}=require('../scripts/history-events.cjs');
   const live=w.getMovieData().works.find(x=>x.id==='33233b1d276d');
   const snapshot=JSON.stringify(live);
   const card=d.querySelector('#allRegistry .card[data-key="33233b1d276d"]');
   const trigger=card.querySelector('.fact-review-trigger[data-person="egor"]');
   const oldReview=trigger.dataset.reviewEgor,oldAi=trigger.dataset.aiEgor;
   try{
     const added=appendHumanEvent(live,'egor',{
       id:'review_synthetic_ui_addition',date:'2026-12-03',type:'addition',
       text:'Позднее уточнение первого просмотра.',source:'30_ci_chat'
     });
     const revision=appendAiEvent(added,'egor',{
       id:'ai_synthetic_ui_v2',date:'2026-12-04',type:'reinterpretation',
       reason:'Контекст вкуса изменился',confidence:'developing',
       text:'Новая GPT-интерпретация v2.',source:'30_ci_chat',author:'ChatGPT'
     });
     Object.assign(live,revision);
     trigger.dataset.reviewEgor=revision.reviews.egor;
     trigger.dataset.aiEgor=revision.ai_comments.egor;
     trigger.click();await tick();
     assert.match(d.getElementById('historyToggle').textContent,/История · 2/);
     assert.equal(d.getElementById('reviewBody').textContent,revision.reviews.egor);
     click('#historyToggle');
     assert.equal(d.querySelectorAll('#historyPanel [data-history-index]').length,2);
     assert.match(d.getElementById('historyPanel').textContent,/Дополнение/);
     click('#historyPanel [data-history-index="0"]');
     assert.equal(d.getElementById('reviewBody').textContent,revision.review_history.egor[0].text);
     click('#historyPanel [data-history-index="1"]');
     assert.equal(d.getElementById('reviewBody').textContent,'Позднее уточнение первого просмотра.');
     click('#reviewCopyCurrent');await tick();
     assert.equal(copied,'Позднее уточнение первого просмотра.');
     click('#historyShowCurrent');
     assert.equal(d.getElementById('reviewBody').textContent,revision.reviews.egor);
     click('#reviewNavChips [data-review-mode="ai"][data-review-person-target="egor"]');
     const latestAiIndex=revision.ai_comment_history.egor.length-1;
     const latestAiVersion=revision.ai_comment_history.egor[latestAiIndex].version;
     assert.match(d.getElementById('historyStatus').textContent,new RegExp('v'+latestAiVersion));
     click('#historyToggle');
     assert.match(d.getElementById('historyPanel').textContent,/Контекст вкуса изменился/);
     assert.match(d.getElementById('historyPanel').textContent,/развивается/);
     click('#historyPanel [data-history-index="0"]');
     assert.equal(d.getElementById('reviewBody').textContent,revision.ai_comment_history.egor[0].text);
     click('#historyPanel [data-history-index="'+latestAiIndex+'"]');
     assert.equal(d.getElementById('reviewBody').textContent,'Новая GPT-интерпретация v2.');
     click('#reviewClose');
   }finally{
     Object.assign(live,JSON.parse(snapshot));
     trigger.dataset.reviewEgor=oldReview;
     trigger.dataset.aiEgor=oldAi;
   }
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
