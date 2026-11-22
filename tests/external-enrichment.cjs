'use strict';
const assert = require('node:assert/strict');
const {norm,titles,aliases,chooseMatch,toExternal} = require('../scripts/enrich-external.cjs');

const work={title:'The Drama / Вот это драма!',year:2026};
const exact={id:12345,type:'movie',year:2026,name:'Вот это драма!',enName:'The Drama',
  externalId:{imdb:'tt123',tmdb:6789},poster:{url:'https://example.org/poster.jpg'},
  rating:{kp:7.8,imdb:8.2,tmdb:7.5},votes:{kp:500,imdb:600,tmdb:100},
  description:'Описание',shortDescription:'Краткое описание',reviewInfo:{count:31}};
assert.equal(norm('  LA GRÀZIA! '),'la grazia');
assert.deepEqual(titles(work),['the drama','вот это драма']);
assert(aliases(exact).includes('the drama'));
assert.equal(chooseMatch(work,[exact]).status,'matched');
assert.equal(chooseMatch(work,[{...exact,year:2025}]).status,'unmatched');
assert.equal(chooseMatch(work,[{...exact,type:'tv-series'}]).status,'unmatched');
assert.equal(chooseMatch(work,[exact,{...exact,id:200}]).status,'ambiguous');
assert.equal(chooseMatch(work,[{...exact,enName:'Not the Drama',name:'Другая драма'}]).status,'unmatched');
const mapped=toExternal(exact,2026);
assert.equal(mapped.kp_id,12345);
assert.equal(mapped.tmdb_id,6789);
assert.equal(mapped.imdb_id,'tt123');
assert.equal(mapped.ratings.kp,7.8);
assert.equal(mapped.ratings.tmdb,7.5);
assert.equal(mapped.public_reviews.kp.count,31);
assert.equal(mapped.public_reviews.tmdb.url,'https://www.themoviedb.org/movie/6789/reviews');
assert.equal(mapped.poster,'https://example.org/poster.jpg');
assert(!('reviews' in mapped));
assert(!('ai_comments' in mapped));
console.log('External API enrichment contract: OK (15 assertions)');
