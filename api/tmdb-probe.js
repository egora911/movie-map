module.exports = async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  const type = req.query.type === 'tv' ? 'tv' : 'movie';
  if (!q) return res.status(400).json({error:'q required'});
  const url = 'https://www.themoviedb.org/search/'+type+'?query='+encodeURIComponent(q);
  try {
    const r = await fetch(url, {headers:{'user-agent':'Mozilla/5.0 MovieMapEnricher/1.0','accept-language':'en-US,en;q=0.9'}});
    const text = await r.text();
    const compact = text.replace(/\s+/g,' ');
    const candidates = [];
    const re = new RegExp('href="/'+type+'/(\\d+)[^"]*"[^>]*>[\\s\\S]{0,1800}?<img[^>]+(?:src|data-src)="([^"]+)"[\\s\\S]{0,2400}?<h2[^>]*>([\\s\\S]*?)<\\/h2>[\\s\\S]{0,3000}?<p[^>]*>([\\s\\S]*?)<\\/p>','gi');
    let m;
    while ((m=re.exec(compact)) && candidates.length<5) {
      candidates.push({
        media_type:type,
        tmdb_id:Number(m[1]),
        image:m[2].replace(/&amp;/g,'&'),
        title:m[3].replace(/<[^>]+>/g,'').trim(),
        overview:m[4].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim()
      });
    }
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({status:r.status,url,candidates,html_sample:compact.slice(0,8000)});
  } catch (e) {
    return res.status(500).json({error:String(e&&e.message||e)});
  }
}