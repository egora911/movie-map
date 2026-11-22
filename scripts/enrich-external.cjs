#!/usr/bin/env node
'use strict';
// Movie Map external metadata importer, designed for a read-only API.
// Usage: POISKKINO_API_KEY=... node scripts/enrich-external.cjs [--write]
// By default runs as dry-run; it NEVER overwrites human reviews or forecasts.
const fs = require('node:fs');
const path = require('node:path');

const BATCH = 'rec_2026_11_deep_01';
const base = (process.env.POISKKINO_API_BASE || 'https://eu-api.poiskkino.dev').replace(/\/+$/, '');
const key = process.env.POISKKINO_API_KEY || '';
const tmdbKey = process.env.TMDB_API_KEY || '';
const tmdbBearer = process.env.TMDB_READ_ACCESS_TOKEN || '';
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const INCLUDE_TMDB = argv.includes('--tmdb');
const FILE = path.resolve(process.cwd(), 'movies.json');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const numberOrNull = value => Number.isFinite(Number(value)) && value !== null && value !== '' && Number(value) > 0 ? Number(value) : null;
const safeString = value => typeof value === 'string' && value.trim() ? value.trim() : null;

function norm(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/ё/g, 'е').replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function titles(work) {
  return String(work.title || '').split(' / ').map(norm).filter(Boolean);
}
function aliases(candidate) {
  const names = [candidate.name,candidate.enName,candidate.alternativeName];
  if (Array.isArray(candidate.names)) for (const n of candidate.names) {
    names.push(typeof n === 'string' ? n : n && n.name);
  }
  return [...new Set(names.map(norm).filter(Boolean))];
}
function chooseMatch(work, docs) {
  const expected = titles(work);
  const year = Number(work.year);
  const eligible = (Array.isArray(docs) ? docs : []).filter(doc => {
    if (!doc || !['movie','cartoon','anime'].includes(doc.type)) return false;
    if (Number(doc.year) !== year) return false;
    return aliases(doc).some(a => expected.includes(a));
  });
  if (eligible.length === 1) return {status:'matched', candidate:eligible[0]};
  if (eligible.length > 1) return {status:'ambiguous', choices:eligible.map(d=>({id:d.id,name:d.name,enName:d.enName,year:d.year}))};
  return {status:'unmatched'};
}
function toExternal(record, year) {
  const kpId = numberOrNull(record.id);
  const tmdbId = numberOrNull(record.externalId && record.externalId.tmdb);
  const imdbId = safeString(record.externalId && record.externalId.imdb);
  const poster = record.poster && (safeString(record.poster.url) || safeString(record.poster.previewUrl));
  const kp = numberOrNull(record.rating && record.rating.kp);
  const imdb = numberOrNull(record.rating && record.rating.imdb);
  const tmdb = numberOrNull(record.rating && record.rating.tmdb);
  const votes = record.votes || {};
  const summary = record.reviewInfo || {};
  const reviewCount = numberOrNull(summary.count) || numberOrNull(summary.total) || null;
  const result = {
    source: 'poiskkino.dev',kp_id:kpId,tmdb_id:tmdbId,imdb_id:imdbId,
    matched_name: safeString(record.name) || safeString(record.enName),
    matched_year: Number(record.year) || Number(year),
    confidence: 100,
    overview: safeString(record.shortDescription) || safeString(record.description),
    kp_short_description: safeString(record.shortDescription),
    kp_description: safeString(record.description),
    poster: poster || null,
    ratings: {
      kp,imdb,tmdb,
      votes_kp: numberOrNull(votes.kp),
      votes_imdb: numberOrNull(votes.imdb),
      votes_tmdb: numberOrNull(votes.tmdb)
    }
  };
  // Review links and counts are external metadata, NEVER the user's own reviews.
  result.public_reviews = {
    kp: kpId ? {url:'https://www.kinopoisk.ru/film/'+kpId+'/reviews/',count:reviewCount} : null,
    tmdb: tmdbId ? {url:'https://www.themoviedb.org/movie/'+tmdbId+'/reviews',count:null} : null
  };
  return result;
}
async function getJson(url,headers) {
  for (let attempt=0;attempt<4;attempt++){
    const resp=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
    if (resp.status===401) throw new Error('API unauthorized (401): check POISKKINO_API_KEY / TMDB credentials');
    if (resp.status===403) throw new Error('API forbidden (403): quota or account permissions');
    if ((resp.status===429||resp.status>=500)&&attempt<3){await pause(1200*Math.pow(2,attempt));continue;}
    if (!resp.ok) throw new Error('API HTTP '+resp.status+' at '+new URL(url).pathname);
    return resp.json();
  }
  throw new Error('API retry limit reached');
}
async function search(query){
  const url=base+'/v1.5/movie/search?limit=12&page=1&query='+encodeURIComponent(query);
  const data=await getJson(url,{'X-API-KEY':key,'Accept':'application/json'});
  return Array.isArray(data.docs) ? data.docs : [];
}
async function detail(id){
  return getJson(base+'/v1.5/movie/'+id,{'X-API-KEY':key,'Accept':'application/json'});
}
async function getTmdb(movieId,expectedYear){
  if (!movieId || (!tmdbKey&&!tmdbBearer)) return null;
  const url='https://api.themoviedb.org/3/movie/'+movieId+
    '?language=en-US&append_to_response=reviews'+(tmdbKey?'&api_key='+encodeURIComponent(tmdbKey):'');
  const headers={'Accept':'application/json'};
  if(tmdbBearer)headers.Authorization='Bearer '+tmdbBearer;
  const data=await getJson(url,headers);
  const year=Number(String(data.release_date||'').slice(0,4));
  if(year && Math.abs(year-Number(expectedYear))>1)return null;
  if(data.id!==movieId)return null;
  return {
    score:numberOrNull(data.vote_average),count:numberOrNull(data.vote_count),
    review_count:Math.max(0,Number(data.reviews && data.reviews.total_results)||0),
    // No republishing copyrighted texts: link to original reviews instead.
    review_url:'https://www.themoviedb.org/movie/'+movieId+'/reviews'
  };
}
async function run(){
  const db=JSON.parse(fs.readFileSync(FILE,'utf8'));
  const target=(db.works||[]).filter(w => !w.external &&
    (w.recommendations||[]).some(e=>e.batch_id===BATCH&&e.event==='added'));
  if(!key){
    process.stdout.write(JSON.stringify({status:'blocked',reason:'POISKKINO_API_KEY is not configured',targets:target.length})+'\n');
    process.exitCode=2;return;
  }
  const report={batch_id:BATCH,target_count:target.length,matched:[],unmatched:[],ambiguous:[],errors:[]};
  for(const work of target){
    const names=String(work.title).split(' / ');
    const queries=[names[0]];
    if(names.length>1 && norm(names[1])!==norm(names[0]))queries.push(names[1]);
    let chosen={status:'unmatched'};
    try{
      for(const query of queries){
        const found=await search(query);
        chosen=chooseMatch(work,found);
        if(chosen.status!=='unmatched')break;
        await pause(320);
      }
      if(chosen.status==='ambiguous'){report.ambiguous.push({title:work.title,choices:chosen.choices});continue;}
      if(chosen.status!=='matched'){report.unmatched.push(work.title);continue;}
      const record=await detail(chosen.candidate.id);
      const confirmed=chooseMatch(work,[record]);
      if(confirmed.status!=='matched'){report.errors.push({title:work.title,error:'Detail mismatch'});continue;}
      const external=toExternal(record,work.year);
      if(INCLUDE_TMDB && external.tmdb_id){
        try{
          const t=await getTmdb(external.tmdb_id,work.year);
          if(t){
            external.ratings.tmdb=t.score||external.ratings.tmdb;
            external.ratings.votes_tmdb=t.count||external.ratings.votes_tmdb;
            external.public_reviews.tmdb.count=t.review_count;
          }
        }catch(err){report.errors.push({title:work.title,error:'TMDB: '+String(err.message).replace(/api_key=[^&]+/g,'api_key=[redacted]')});}
      }
      work.external=external;
      report.matched.push({title:work.title,kp_id:external.kp_id,tmdb_id:external.tmdb_id,
        ratings:external.ratings,poster:!!external.poster,description:!!external.overview});
    }catch(err){
      const m=String(err.message||err);
      if(/401|403/.test(m))throw err;
      report.errors.push({title:work.title,error:m});
    }
    await pause(400);
  }
  const allMatched=db.works.filter(w=>w.external).length;
  report.total_enriched=allMatched;
  report.mode=WRITE?'write':'dry-run';
  if(WRITE && report.matched.length){
    db.external_enrichment=Object.assign({},db.external_enrichment||{},{
      source:'poiskkino.dev',enriched_at:new Date().toISOString(),
      matched:allMatched,unmatched:[...new Set([...(db.external_enrichment?.unmatched||[]),...report.unmatched])],
      notes:'Imported verified external IDs, posters, descriptions and KP/IMDb/TMDb ratings. External reviews are links/counts; human reviews unchanged.'
    });
    const temp=FILE+'.tmp';
    fs.writeFileSync(temp,JSON.stringify(db,null,2)+'\n','utf8');
    fs.renameSync(temp,FILE);
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
if(require.main===module)run().catch(e=>{console.error('Enrichment failed: '+String(e.message||e).replace(/api_key=[^&]+/g,'api_key=[redacted]'));process.exitCode=1;});
module.exports={norm,titles,aliases,chooseMatch,toExternal};
