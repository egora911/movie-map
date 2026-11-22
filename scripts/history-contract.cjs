'use strict';

/**
 * History of Soul schema + consistency checks.
 * Does not rewrite user content, reviews, or Movie Map files.
 */
const fs=require('node:fs');
const PERSONS=['egor','anna'];
const AI_PERSONS=['egor','anna','together'];
const ALIAS={egor:'me',anna:'wife'};
const HUMAN_TYPES=new Set(['original','addition','rewatch','legacy_current']);
const AI_TYPES=new Set(['original','reinterpretation','taste_model_update','backfill','manual_revision']);
const CONFIDENCE=new Set(['tentative','developing','strong']);
const DATE=/^\d{4}-\d{2}-\d{2}$/;

function canonicalPerson(key){
  return key==='me'?'egor':key==='wife'?'anna':key;
}
function personValue(obj,person){
  if(!obj||typeof obj!=='object')return undefined;
  const key=canonicalPerson(person);
  if(Object.prototype.hasOwnProperty.call(obj,key))return obj[key];
  const old=ALIAS[key];
  return old&&Object.prototype.hasOwnProperty.call(obj,old)?obj[old]:undefined;
}
function personEvents(work,group,person){
  const obj=work&&work[group]||{};
  const events=obj[canonicalPerson(person)];
  return Array.isArray(events)?events:[];
}
function errorsForMovieMap(db,{requireCanonical}={}){
 const errors=[];
 const add=(p,msg)=>errors.push(p+': '+msg);
 if(!db||!Array.isArray(db.works)){add('root','works must be array');return errors}
 const strict=requireCanonical===undefined?Number(db.schema_version||0)>=2:requireCanonical;
 const ids=new Set(),eventIds=new Set();
 let placements=0;
 const validDate=(v,p)=>{if(v!==undefined&&v!==null&&(!DATE.test(v)||!Number.isFinite(Date.parse(v))))add(p,'date must be ISO YYYY-MM-DD')};
 const eventList=(work,group,persons,types,where)=>{
   const obj=work[group];
   if(obj===undefined){if(strict)add(where+'.'+group,'history array object missing');return}
   if(!obj||typeof obj!=='object'||Array.isArray(obj)){add(where+'.'+group,'must be object');return}
   for(const key of Object.keys(obj))if(!persons.includes(key))add(where+'.'+group+'.'+key,'noncanonical person key');
   for(const who of persons){
     const list=obj[who],path=where+'.'+group+'.'+who;
     if(!Array.isArray(list)){add(path,'must be array');continue}
     let priorVersion=0;
     for(let i=0;i<list.length;i++){
       const x=list[i],p=path+'['+i+']';
       if(!x||typeof x!=='object'||Array.isArray(x)){add(p,'event must be object');continue}
       if(typeof x.id!=='string'||!x.id.trim()){add(p+'.id','non-empty id required')}
       else if(eventIds.has(x.id)){add(p+'.id','duplicate event id '+x.id)}
       else eventIds.add(x.id);
       if(!types.has(x.type))add(p+'.type','unsupported event type '+x.type);
       if(typeof x.text!=='string')add(p+'.text','raw text must be a string');
       validDate(x.date,p+'.date');
       if(x.confidence!==undefined&&!CONFIDENCE.has(x.confidence))add(p+'.confidence','invalid confidence');
       if(group==='review_history'&&x.rating!==undefined&&typeof x.rating!=='string')add(p+'.rating','rating must be string');
       if(group==='ai_comment_history'){
         if(!Number.isInteger(x.version)||x.version<=priorVersion)add(p+'.version','version must be sequentially increasing positive integer');
         priorVersion=x.version||priorVersion;
       }
     }
   }
 };
 for(const [i,w] of db.works.entries()){
   const where='works['+i+']';
   if(!w||typeof w!=='object'){add(where,'invalid work');continue}
   if(!w.id||ids.has(w.id))add(where+'.id','work id missing/duplicate');
   ids.add(w.id);
   if(!Array.isArray(w.placements)||!w.placements.length){add(where+'.placements','must be non-empty array');continue}
   placements+=w.placements.length;
   const base=w.placements[0].actual||{};
   for(const [j,p] of w.placements.entries()){
     for(const who of PERSONS){
       const x=personValue(base,who),y=personValue(p.actual,who);
       if(x!==y)add(where+'.placements['+j+'].actual.'+who,'fact differs among placements');
     }
     for(const [k,rec] of [['prediction',p.prediction],['actual',p.actual]]){
       if(!rec){add(where+'.placements['+j+'].'+k,'must exist');continue}
       if(strict&&('me'in rec||'wife'in rec))add(where+'.placements['+j+'].'+k,'legacy person key remains');
       for(const who of PERSONS)if(personValue(rec,who)===undefined)add(where+'.placements['+j+'].'+k+'.'+who,'missing value');
     }
   }
   for(const group of ['reviews','review_dates','ai_comments']){
     const rec=w[group];if(rec===undefined)continue;
     if(!rec||typeof rec!=='object'||Array.isArray(rec)){add(where+'.'+group,'must be object');continue}
     if(strict&&('me'in rec||'wife'in rec))add(where+'.'+group,'legacy person keys remain');
     if(group==='reviews'||group==='ai_comments'){
       for(const who of PERSONS){
         const val=personValue(rec,who);
         if(val!==undefined&&typeof val!=='string')add(where+'.'+group+'.'+who,'text must be string');
       }
     }
   }
   eventList(w,'review_history',PERSONS,HUMAN_TYPES,where);
   eventList(w,'ai_comment_history',AI_PERSONS,AI_TYPES,where);
   const current=w.history_current;
   if(current!==undefined){
     if(!current||typeof current!=='object'){add(where+'.history_current','must be object');continue}
     for(const [bucket,source] of [['review','review_history'],['ai','ai_comment_history']]){
       const pointers=current[bucket]||{};
       const allowed=bucket==='review'?PERSONS:AI_PERSONS;
       for(const key of Object.keys(pointers))if(!allowed.includes(key))add(where+'.history_current.'+bucket+'.'+key,'noncanonical person key');
       for(const key of allowed){
         const id=pointers[key];if(!id)continue;
         const list=personEvents(w,source,key);
         const found=list.find(x=>x.id===id);
         if(!found){add(where+'.history_current.'+bucket+'.'+key,'points to missing event');continue}
         const mat=bucket==='review'?personValue(w.reviews,key):
           key==='together'?w.ai_comments&&w.ai_comments.together:personValue(w.ai_comments,key);
         if(typeof mat==='string'&&mat!==found.text&&
            (bucket==='ai'||found.type==='legacy_current'||found.type==='original'||found.type==='rewatch')){
           add(where+'.history_current.'+bucket+'.'+key,'materialized text mismatches current event');
         }
       }
     }
   }
 }
 if(db.counts?.unique_works!==undefined&&db.counts.unique_works!==ids.size)add('counts.unique_works','count mismatch');
 if(db.counts?.rendered_cards!==undefined&&db.counts.rendered_cards!==placements)add('counts.rendered_cards','count mismatch');
 return errors;
}
function assertMovieMap(db,options){
 const errors=errorsForMovieMap(db,options);
 if(errors.length)throw new Error(errors.slice(0,30).join('\n')+(errors.length>30?'\n... '+errors.length+' total errors':''));
 return {works:db.works.length,placements:db.works.reduce((n,w)=>n+w.placements.length,0),
   withReviews:db.works.filter(w=>w.reviews).length,history:db.works.filter(w=>w.review_history).length};
}
module.exports={PERSONS,AI_PERSONS,HUMAN_TYPES,AI_TYPES,CONFIDENCE,canonicalPerson,personValue,personEvents,errorsForMovieMap,assertMovieMap};
if(require.main===module){
 try{
  const path=process.argv[2]||'movies.json';
  const db=JSON.parse(fs.readFileSync(path,'utf8'));
  console.log('HISTORY CONTRACT OK',JSON.stringify(assertMovieMap(db)));
 }catch(e){console.error('HISTORY CONTRACT INVALID\n'+e.message);process.exit(1)}
}
