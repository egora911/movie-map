'use strict';
const {assertRecommendationMap}=require('./recommendation-contract.cjs');
function addRecommendationBatch(db,batch){
 if(!db||!Array.isArray(db.recommendation_batches))throw Error('Batch registry missing');
 if(db.recommendation_batches.some(b=>b.id===batch.id))throw Error('Batch already exists');
 const next={...db,recommendation_batches:[...db.recommendation_batches,{...batch}]};
 assertRecommendationMap(next);return next;
}
function appendRecommendationEvent(work,event,batches){
 if(!work||!Array.isArray(work.recommendations))throw Error('work.recommendations required');
 if(!Array.isArray(batches)||!batches.some(b=>b.id===event.batch_id))throw Error('Unknown batch');
 if(!['added','reconfirmed','reprioritized'].includes(event.event))throw Error('Unsupported recommendation event');
 if(work.recommendations.length===0&&event.event!=='added')throw Error('First event must be added');
 if(work.recommendations.length>0&&event.event==='added')throw Error('added event already exists');
 if(work.recommendations.some(e=>e.batch_id===event.batch_id&&e.event===event.event))throw Error('Duplicate batch event');
 return {...work,recommendations:[...work.recommendations,{...event}]};
}
module.exports={addRecommendationBatch,appendRecommendationEvent};
