const fs = require('node:fs');

const token = String(process.env.TMDB_BEARER_TOKEN || '').trim();
if (!token) {
  throw new Error('Missing TMDB_BEARER_TOKEN GitHub Actions secret');
}

const path = 'movies.json';
const db = JSON.parse(fs.readFileSync(path, 'utf8'));

const headers = {
  accept: 'application/json',
  Authorization: 'Bearer ' + token
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '')
  .toLocaleLowerCase('en-US')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9]+/gi, ' ')
  .trim();

function latinTitle(work) {
  const parts = String(work.title || '').split('/').map(x => x.trim()).filter(Boolean);
  return parts.find(x => /[A-Za-z]/.test(x)) || parts[0] || work.title;
}

function startYear(year) {
  const m = String(year || '').match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

function candidateTitle(c, type) {
  return type === 'tv' ? (c.name || c.original_name) : (c.title || c.original_title);
}

function candidateYear(c, type) {
  const value = type === 'tv' ? c.first_air_date : c.release_date;
  const m = String(value || '').match(/^\d{4}/);
  return m ? Number(m[0]) : null;
}

function candidateScore(c, work, type) {
  const q = norm(latinTitle(work));
  const names = type === 'tv'
    ? [c.name, c.original_name]
    : [c.title, c.original_title];
  let score = 0;
  for (const name of names.filter(Boolean)) {
    const n = norm(name);
    if (n === q) score = Math.max(score, 100);
    else if (n.includes(q) || q.includes(n)) score = Math.max(score, 70);
  }
  const y = startYear(work.year);
  const cy = candidateYear(c, type);
  if (y && cy) score += y === cy ? 25 : Math.max(0, 8 - Math.abs(y - cy) * 4);
  score += Math.min(10, Number(c.popularity || 0) / 50);
  return score;
}

async function getJson(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(r.status + ' ' + r.statusText + ' for ' + url);
  return r.json();
}

async function findWork(work) {
  const type = work.media_type === 'сериал' ? 'tv' : 'movie';
  const q = latinTitle(work);
  const y = startYear(work.year);
  const params = new URLSearchParams({
    query: q,
    include_adult: 'false',
    language: 'en-US',
    page: '1'
  });
  if (y) params.set(type === 'tv' ? 'first_air_date_year' : 'year', String(y));

  const searchUrl = 'https://api.themoviedb.org/3/search/' + type + '?' + params.toString();
  const search = await getJson(searchUrl);
  let candidates = Array.isArray(search.results) ? search.results : [];

  // If year-filtered search found nothing, retry without year.
  if (!candidates.length && y) {
    params.delete(type === 'tv' ? 'first_air_date_year' : 'year');
    const retry = await getJson('https://api.themoviedb.org/3/search/' + type + '?' + params.toString());
    candidates = Array.isArray(retry.results) ? retry.results : [];
  }
  if (!candidates.length) return { work, match: null, reason: 'no search results' };

  const ranked = candidates
    .map(c => ({ c, score: candidateScore(c, work, type) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 60) {
    return { work, match: null, reason: 'low confidence: ' + (best ? best.score.toFixed(1) : 'n/a') };
  }

  // Prefer Russian overview, fall back to English.
  const base = 'https://api.themoviedb.org/3/' + type + '/' + best.c.id;
  const ru = await getJson(base + '?language=ru-RU');
  let overview = String(ru.overview || '').trim();
  let details = ru;
  if (!overview) {
    const en = await getJson(base + '?language=en-US');
    overview = String(en.overview || '').trim();
    if (!details.poster_path && en.poster_path) details = en;
  }
  const posterPath = details.poster_path || best.c.poster_path || null;

  return {
    work,
    match: {
      source: 'TMDB',
      media_type: type,
      tmdb_id: best.c.id,
      matched_title: candidateTitle(best.c, type),
      matched_year: candidateYear(best.c, type),
      confidence: Math.round(best.score),
      overview,
      poster: posterPath ? 'https://image.tmdb.org/t/p/w500' + posterPath : null
    }
  };
}

const ok = [];
const missed = [];

for (let i = 0; i < db.works.length; i++) {
  const work = db.works[i];
  try {
    const result = await findWork(work);
    if (!result.match) {
      missed.push({ title: work.title, reason: result.reason });
      console.log('MISS', work.title, '-', result.reason);
    } else {
      work.external = result.match;
      ok.push(work.title);
      console.log(
        'OK', String(i + 1).padStart(2, '0') + '/' + db.works.length,
        work.title, '=>', result.match.tmdb_id,
        result.match.matched_title, result.match.matched_year,
        'score=' + result.match.confidence,
        result.match.poster ? 'poster' : 'no-poster',
        result.match.overview ? 'overview' : 'no-overview'
      );
    }
  } catch (e) {
    missed.push({ title: work.title, reason: String(e && e.message || e) });
    console.log('ERR', work.title, '-', String(e && e.message || e));
  }
  await sleep(320);
}

db.external_enrichment = {
  source: 'TMDB',
  enriched_at: new Date().toISOString(),
  matched: ok.length,
  unmatched: missed
};

fs.writeFileSync(path, JSON.stringify(db, null, 2) + '\n');
console.log('DONE matched=' + ok.length + ' missed=' + missed.length);
if (missed.length) console.log('MISSED', JSON.stringify(missed, null, 2));
