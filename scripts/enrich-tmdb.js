const fs = require('node:fs');

const token = String(process.env.POISKKINO_API_KEY || '').trim();
if (!token) throw new Error('Missing POISKKINO_API_KEY GitHub Actions secret');

const DB_PATH = 'movies.json';
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const API = 'https://eu-api.poiskkino.dev/v1.5';
const headers = {'X-API-KEY': token, accept: 'application/json'};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const norm = s => String(s || '')
  .toLocaleLowerCase('ru-RU')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9]+/gi, ' ')
  .trim();

function parts(work) {
  return String(work.title || '').split('/').map(x => x.trim()).filter(Boolean);
}
function startYear(year) {
  const m = String(year || '').match(/\d{4}/);
  return m ? Number(m[0]) : null;
}
function expectedSeries(work) {
  return work.media_type === 'сериал';
}
function itemNames(x) {
  return [x.name, x.alternativeName, x.enName].filter(Boolean);
}
function scoreCandidate(x, work) {
  const qs = parts(work).map(norm);
  const names = itemNames(x).map(norm);
  let score = 0;
  for (const q of qs) {
    for (const n of names) {
      if (!q || !n) continue;
      if (q === n) score = Math.max(score, 100);
      else if (n.includes(q) || q.includes(n)) score = Math.max(score, 72);
    }
  }
  const y = startYear(work.year);
  const cy = Number(x.year) || null;
  if (y && cy) score += y === cy ? 25 : Math.max(0, 8 - Math.abs(y-cy)*4);
  if (typeof x.isSeries === 'boolean') score += (x.isSeries === expectedSeries(work)) ? 12 : -30;
  if (x.type && expectedSeries(work) && /series|tv-series|anime/i.test(String(x.type))) score += 5;
  if (x.type && !expectedSeries(work) && /movie|cartoon|anime/i.test(String(x.type))) score += 5;
  return score;
}

async function getJson(url) {
  const r = await fetch(url,{headers});
  if (!r.ok) throw new Error(r.status+' '+r.statusText+' for '+url);
  return r.json();
}

async function search(work) {
  const qs = parts(work);
  let candidates = [];
  for (const q of qs) {
    const url = API + '/movie/search?page=1&limit=10&query=' + encodeURIComponent(q);
    const json = await getJson(url);
    const docs = Array.isArray(json.docs) ? json.docs : (Array.isArray(json) ? json : []);
    candidates.push(...docs);
    if (docs.length) break;
    await sleep(120);
  }
  const seen = new Set();
  candidates = candidates.filter(x => {
    const k = x.id || JSON.stringify([x.name,x.year]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const ranked = candidates
    .map(x => ({x,score:scoreCandidate(x,work)}))
    .sort((a,b)=>b.score-a.score);
  const best = ranked[0];
  if (!best || best.score < 65) return {match:null, reason:'low confidence/no results'};
  return {match:best.x, score:Math.round(best.score)};
}

function chooseOverview(x) {
  return String(x.shortDescription || x.description || '').trim();
}
function choosePoster(x) {
  return x && x.poster && (x.poster.url || x.poster.previewUrl) || null;
}
function chooseRatings(x) {
  const r=x && x.rating || {};
  const v=x && x.votes || {};
  return {
    kp: Number.isFinite(Number(r.kp)) ? Number(r.kp) : null,
    imdb: Number.isFinite(Number(r.imdb)) ? Number(r.imdb) : null,
    tmdb: Number.isFinite(Number(r.tmdb)) ? Number(r.tmdb) : null,
    votes_kp: Number.isFinite(Number(v.kp)) ? Number(v.kp) : null,
    votes_imdb: Number.isFinite(Number(v.imdb)) ? Number(v.imdb) : null,
    votes_tmdb: Number.isFinite(Number(v.tmdb)) ? Number(v.tmdb) : null
  };
}

const ok=[], missed=[];
for (let i=0;i<db.works.length;i++) {
  const work=db.works[i];
  try {
    const {match,score}=await search(work);
    if (!match) {
      missed.push({title:work.title,reason:'no confident match'});
      console.log('MISS',work.title);
    } else {
      const overview=chooseOverview(match);
      const poster=choosePoster(match);
      const ratings=chooseRatings(match);
      work.external={
        source:'poiskkino.dev',
        kp_id:match.id || null,
        tmdb_id:match.externalId && match.externalId.tmdb || null,
        imdb_id:match.externalId && match.externalId.imdb || null,
        matched_name:match.name || match.alternativeName || null,
        matched_year:match.year || null,
        confidence:score,
        overview,
        kp_short_description:String(match.shortDescription || '').trim() || null,
        kp_description:String(match.description || '').trim() || null,
        poster,
        ratings
      };
      ok.push(work.title);
      console.log(
        'OK',String(i+1).padStart(2,'0')+'/'+db.works.length,
        work.title,'=>',match.id,match.name||match.alternativeName,
        match.year,'score='+score,poster?'poster':'no-poster',overview?'overview':'no-overview',
        'kp='+ratings.kp,'imdb='+ratings.imdb,'tmdb='+ratings.tmdb
      );
    }
  } catch(e) {
    missed.push({title:work.title,reason:String(e&&e.message||e)});
    console.log('ERR',work.title,'-',String(e&&e.message||e));
  }
  await sleep(220);
}

db.external_enrichment={
  source:'poiskkino.dev',
  enriched_at:new Date().toISOString(),
  matched:ok.length,
  unmatched:missed
};

fs.writeFileSync(DB_PATH,JSON.stringify(db,null,2)+'\n');
console.log('DONE matched='+ok.length+' missed='+missed.length);
if (missed.length) console.log('MISSED',JSON.stringify(missed,null,2));
