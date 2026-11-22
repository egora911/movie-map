'use strict';
const fs=require('node:fs');
const EVENTS=new Set(['added','reconfirmed','reprioritized']);
const ID=/^rec_(\d{4})_(0[1-9]|1[0-2])_[a-z0-9_]+$/;
const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
function recommendationErrors(db){
 const err=[],add=(p,e)=>err.push(p+': '+e);
 if(!db||!Array.isArray(db.works)){add('root','works array required');return err}
 if(!Array.isArray(db.recommendation_batches)){add('recommendation_batches','array required');return err}
 const batches=new Map();
 db.recommendation_batches.forEach((b,i)=>{
  const p='recommendation_batches['+i+']';
  if(!b||typeof b!=='object'||Array.isArray(b)){add(p,'object required');return}
  const match=typeof b.id==='string'&&ID.exec(b.id);
  if(!match){add(p+'.id','invalid id');return}
  if(batches.has(b.id))add(p+'.id','duplicate id');batches.set(b.id,b);
  if(typeof b.period!=='string'||!PERIOD.test(b.period)||b.period!==match[1]+'-'+match[2])add(p+'.period','invalid YYYY-MM');
  for(const key of ['label','source','type'])if(typeof b[key]!=='string'||!b[key].trim())add(p+'.'+key,'nonempty string required');
  if(b.created_at!==undefined){
    const x=b.created_at,iso=typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
    if(!iso||x.slice(0,7)!==b.period)add(p+'.created_at','invalid known calendar date');
  }
 });
 db.works.forEach((w,i)=>{
  const p='works['+i+'].recommendations',arr=w&&w.recommendations;
  if(!Array.isArray(arr)){add(p,'array required');return}
  const keys=new Set();
  arr.forEach((e,j)=>{
   const at=p+'['+j+']';
   if(!e||typeof e!=='object'||Array.isArray(e)){add(at,'object required');return}
   if(typeof e.batch_id!=='string'||!batches.has(e.batch_id))add(at+'.batch_id','unknown batch');
   if(!EVENTS.has(e.event))add(at+'.event','unknown event');
   if((j===0&&e.event!=='added')||(j>0&&e.event==='added'))add(at+'.event','only the first event may be added');
   if(e.source!==undefined&&(typeof e.source!=='string'||!e.source.trim()))add(at+'.source','invalid source');
   const key=e.batch_id+'|'+e.event;
   if(keys.has(key))add(at,'duplicate batch/event');keys.add(key);
  });
 });
 return err;
}
function assertRecommendationMap(db){
 const problems=recommendationErrors(db);
 if(problems.length)throw Error(problems.slice(0,40).join('\n'));
 return {works:db.works.length,batches:db.recommendation_batches.length,events:db.works.reduce((n,w)=>n+w.recommendations.length,0)};
}
module.exports={EVENTS,recommendationErrors,assertRecommendationMap};
if(require.main===module){
 try{const db=JSON.parse(fs.readFileSync(process.argv[2]||'movies.json','utf8'));console.log('RECOMMENDATION CONTRACT OK',JSON.stringify(assertRecommendationMap(db)))}
 catch(e){console.error('RECOMMENDATION CONTRACT INVALID\n'+e.message);process.exit(1)}
}
