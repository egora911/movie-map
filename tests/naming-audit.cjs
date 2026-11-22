'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {assertMovieMap}=require('../scripts/history-contract.cjs');
const db=JSON.parse(fs.readFileSync('movies.json','utf8'));
const html=fs.readFileSync('index.html','utf8');
const api=fs.readFileSync('api/chat.js','utf8');
assert.equal(db.schema_version,2,'canonical production schema v2');
const stats=assertMovieMap(db,{requireCanonical:true});
assert.equal(stats.works,db.counts.unique_works,'work count');
assert.equal(stats.placements,db.counts.rendered_cards,'placement count');
assert.equal(stats.history,db.works.length,'history coverage');
assert(stats.withReviews>=1,'at least one work must have materialized reviews');
const PEOPLE=['egor','anna'],AI_PEOPLE=['egor','anna','together'],LEGACY=['me','wife','husband','her','him','she','he','partner','spouse'];
const checkKeys=(obj,allowed,where)=>{
 if(!obj)return;
 assert(typeof obj==='object'&&!Array.isArray(obj),where+' must be object');
 for(const key of Object.keys(obj)){
   assert(!LEGACY.includes(key),where+' legacy identity key '+key);
   assert(allowed.includes(key),where+' noncanonical key '+key);
 }
};
for(const work of db.works){
 checkKeys(work.reviews,PEOPLE,work.title+' reviews');
 checkKeys(work.review_dates,PEOPLE,work.title+' review_dates');
 checkKeys(work.ai_comments,AI_PEOPLE,work.title+' ai_comments');
 checkKeys(work.review_history,PEOPLE,work.title+' review_history');
 checkKeys(work.ai_comment_history,AI_PEOPLE,work.title+' ai_comment_history');
 if(work.history_current){
  checkKeys(work.history_current.review,PEOPLE,work.title+' history_current.review');
  checkKeys(work.history_current.ai,AI_PEOPLE,work.title+' history_current.ai');
 }
 for(const p of work.placements){
  checkKeys(p.actual,PEOPLE,work.title+' actual');
  checkKeys(p.prediction,PEOPLE,work.title+' prediction');
 }
}
// Search only system-generated labels, not user-authored review/AI/before/after texts.
assert(html.includes("navChip('Отзыв Егора'")&&html.includes("navChip('Отзыв Анны'"));
assert(html.includes("navChip('GPT · Егор'")&&html.includes("navChip('GPT · Анна'"));
for(const forbidden of ['GPT · Я','GPT · Жена','Для меня','Для неё','Для него','Отзыв жены','Мой отзыв']){
 assert(!html.includes(forbidden),'Legacy UI label: '+forbidden);
}
assert(db.categories.some(c=>c.id==='me'&&c.label==='Кино / сериал для Егора'));
assert(db.categories.some(c=>c.id==='her'&&c.label==='Кино / сериал для Анны'));
assert(api.includes('Системные ключи персон: egor / anna'));
assert(!/shortlist_(?:me|wife|her|him)/i.test(html),'Person-based localStorage key must not be introduced');
assert(html.includes("const PERSON_LEGACY={egor:'me',anna:'wife'}"),'Transitional read layer must remain');
console.log('NAMING AUDIT OK: canonical egor/anna; legacy category IDs and fallback whitelisted; raw texts untouched');
