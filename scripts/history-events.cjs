'use strict';
/**
 * History of Soul append-only authoring primitives.
 * Pure functions: return a new work; never mutate the canonical Movie Map JSON or generate text.
 * Use in 30_ci_chat authoring workflow with explicit reviewed events.
 */
const {PERSONS,AI_PERSONS,HUMAN_TYPES,AI_TYPES,CONFIDENCE}=require('./history-contract.cjs');
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function ensure(ok,msg){if(!ok)throw new Error(msg)}
function clone(work){return JSON.parse(JSON.stringify(work))}
function requireDate(date){ensure(typeof date==='string'&&DATE.test(date),'Explicit ISO date YYYY-MM-DD required')}
function ensureUnique(work,id){
 ensure(typeof id==='string'&&!!id.trim(),'Event ID required');
 const lists=[
  ...Object.values(work.review_history||{}),
  ...Object.values(work.ai_comment_history||{})
 ];
 ensure(!lists.some(list=>Array.isArray(list)&&list.some(e=>e.id===id)),'Event ID already exists: '+id);
}
function canonicalWork(work){
 const w=clone(work);
 ensure(w.review_history&&w.ai_comment_history&&w.history_current,'History schema not initialized');
 w.reviews=w.reviews||{};
 w.ai_comments=w.ai_comments||{};
 return w;
}
function appendHumanEvent(work,person,event){
 ensure(PERSONS.includes(person),'Only egor/anna are accepted as person identities');
 const w=canonicalWork(work);
 ensure(event&&typeof event==='object','Event required');
 ensure(['original','addition','rewatch'].includes(event.type),'New human events: original/addition/rewatch only');
 ensure(typeof event.text==='string'&&!!event.text.trim(),'Exact nonempty raw review required');
 ensure(event.source&&typeof event.source==='string','Original source required');
 requireDate(event.date);
 ensureUnique(w,event.id);
 ensure(w.review_history[person]&&Array.isArray(w.review_history[person]),'Missing review_history.'+person);
 if(event.type==='original')ensure(w.review_history[person].length===0,'original requires no earlier review history');
 if(event.type==='rewatch')ensure(typeof event.rating==='string'&&!!event.rating.trim(),'rewatch requires a new rating');
 if(event.rating!==undefined)ensure(typeof event.rating==='string','rating must be a string');
 const rec={...event};
 w.review_history[person].push(rec);
 const prior=w.reviews[person]||'';
 w.reviews[person]=event.type==='addition'&&prior?prior+'\n\n'+event.text:event.text;
 if(event.type==='original'||event.type==='rewatch'){
   w.review_dates=w.review_dates||{};
   w.review_dates[person]=event.date;
 }
 if(event.rating!==undefined){
   for(const p of w.placements||[]){
     p.actual=p.actual||{};
     p.actual[person]=event.rating;
   }
 }
 w.history_current.review=w.history_current.review||{};
 w.history_current.review[person]=event.id;
 return w;
}
function appendAiEvent(work,person,event){
 ensure(AI_PERSONS.includes(person),'AI history must use egor/anna/together');
 const w=canonicalWork(work);
 ensure(event&&typeof event==='object','Event required');
 ensure(AI_TYPES.has(event.type),'Unknown AI version type');
 ensure(typeof event.text==='string'&&!!event.text.trim(),'Exact authored GPT comment required');
 ensure(typeof event.source==='string'&&!!event.source,'GPT source required');
 ensure(typeof event.author==='string'&&!!event.author,'GPT author required');
 requireDate(event.date);
 if(event.confidence!==undefined)ensure(CONFIDENCE.has(event.confidence),'confidence must be qualitative');
 if(event.type!=='original')ensure(typeof event.reason==='string'&&!!event.reason.trim(),'Reason required for a new interpretation');
 ensureUnique(w,event.id);
 const list=w.ai_comment_history[person];
 ensure(Array.isArray(list),'Missing ai_comment_history.'+person);
 if(event.type==='original')ensure(list.length===0,'original requires no prior versions');
 const nextVersion=list.length?Math.max(...list.map(e=>e.version))+1:1;
 if(event.version!==undefined)ensure(event.version===nextVersion,'AI version must increase sequentially');
 const rec={...event,version:nextVersion};
 list.push(rec);
 w.ai_comments[person]=event.text;
 w.history_current.ai=w.history_current.ai||{};
 w.history_current.ai[person]=event.id;
 return w;
}
module.exports={appendHumanEvent,appendAiEvent};
