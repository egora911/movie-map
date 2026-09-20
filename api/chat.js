const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = path.join(process.cwd(), "movies.json");
let cachedDb = null;

function loadDb() {
  if (!cachedDb) cachedDb = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  return cachedDb;
}

function flatRows() {
  const db = loadDb();
  const categoryLabels = Object.fromEntries((db.categories || []).map(c => [c.id, c.label]));
  return (db.works || []).flatMap(work =>
    (work.placements || []).map(p => ({
      id: work.id,
      title: work.title,
      year: work.year,
      media_type: work.media_type,
      state: work.state,
      category: p.category,
      category_label: categoryLabels[p.category] || p.category,
      order: p.order,
      stars: Number(p.stars || 0),
      tags: p.tags || [],
      prediction: p.prediction,
      actual: p.actual,
      before: p.before,
      after: p.after,
      links: work.links
    }))
  );
}

function normalize(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е");
}

function searchMovies(args = {}) {
  let rows = flatRows();
  const q = normalize(args.query);
  if (q) {
    rows = rows.filter(r => normalize([
      r.title, r.before, r.after, r.category_label, ...(r.tags || [])
    ].filter(Boolean).join(" ")).includes(q));
  }
  if (args.category) rows = rows.filter(r => r.category === args.category);
  if (args.media_type) rows = rows.filter(r => r.media_type === args.media_type);
  if (args.state) rows = rows.filter(r => r.state === args.state);
  if (args.tag) rows = rows.filter(r => (r.tags || []).includes(args.tag));
  if (Number.isFinite(Number(args.min_stars))) {
    rows = rows.filter(r => r.stars >= Number(args.min_stars));
  }
  const seen = new Set();
  rows = rows.filter(r => {
    const k = r.id + "|" + r.category;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  rows.sort((a,b) => (b.stars - a.stars) || (a.order - b.order));
  const limit = Math.max(1, Math.min(Number(args.limit) || 12, 30));
  return rows.slice(0, limit);
}

function getMovie(args = {}) {
  const needle = normalize(args.id_or_title);
  if (!needle) return [];
  const db = loadDb();
  const matches = (db.works || []).filter(w =>
    normalize(w.id) === needle ||
    normalize(w.title).includes(needle)
  );
  return matches.slice(0, 8);
}

function getCatalogStats() {
  const db = loadDb();
  return {
    counts: db.counts,
    categories: db.categories
  };
}

const tools = [
  {
    type: "function",
    name: "search_movies",
    description: "Search and filter the user's Movie Map. Use this for recommendations, shortlists, watched/unwatched questions, categories, tags and score-based selection.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional words to search across title, descriptions, categories and tags." },
        category: { type: "string", enum: ["films","series","weird","me","her"] },
        media_type: { type: "string", enum: ["фильм","сериал"] },
        state: { type: "string", enum: ["seen","todo"] },
        tag: { type: "string", description: "Exact tag such as отдых or россия." },
        min_stars: { type: "number", minimum: 0, maximum: 3 },
        limit: { type: "integer", minimum: 1, maximum: 30 }
      },
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "get_movie",
    description: "Get the complete structured record for one movie or series by id or a distinctive part of its title.",
    parameters: {
      type: "object",
      properties: {
        id_or_title: { type: "string" }
      },
      required: ["id_or_title"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "get_catalog_stats",
    description: "Get Movie Map counts and category definitions.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

function executeTool(name, args) {
  if (name === "search_movies") return searchMovies(args);
  if (name === "get_movie") return getMovie(args);
  if (name === "get_catalog_stats") return getCatalogStats();
  return { error: "Unknown tool: " + name };
}

function extractText(response) {
  const parts = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if (c.type === "output_text" && c.text) parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

async function callOpenAI(payload) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : "OpenAI API error " + r.status;
    throw new Error(msg);
  }
  return data;
}

function allowedOrigin(origin) {
  if (!origin) return null;
  if (origin === "https://egora911.github.io") return origin;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return origin;
  if (origin === "https://raw.githack.com") return origin;
  return null;
}

module.exports = async function handler(req, res) {
  const origin = allowedOrigin(req.headers.origin);
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const message = String(body.message || "").trim().slice(0, 2500);
    if (!message) return res.status(400).json({ error: "Empty message" });

    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const input = history
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      .map(m => ({ role: m.role, content: String(m.content || "").slice(0, 2500) }));
    input.push({ role: "user", content: message });

    const instructions = [
      "Ты — Movie Map Agent v1, read-only агент персональной карты кино.",
      "Отвечай по-русски, компактно и по делу.",
      "Для любых утверждений о содержимом карты обязательно используй инструменты. Не выдумывай фильмы, оценки, теги, просмотренность или предпочтения.",
      "Рекомендации делай только из Movie Map. Для рекомендации обычно исключай state=seen, если пользователь явно не просит иначе.",
      "Учитывай прогнозы me/wife, stars, категории, теги и тексты ДО/ПОСЛЕ.",
      "Если данных недостаточно, так и скажи.",
      "Ты НЕ МОЖЕШЬ менять JSON, shortlist, оценки или карточки. Если просят изменить данные, объясни, что v1 read-only, и скажи какое изменение понял.",
      "Когда рекомендуешь несколько вариантов, объясни одним коротким предложением почему каждый подходит."
    ].join("\n");

    const base = {
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions,
      tools,
      tool_choice: "auto",
      max_output_tokens: 900
    };

    let response = await callOpenAI({ ...base, input });
    let turns = 0;
    while (turns < 5) {
      const calls = (response.output || []).filter(x => x.type === "function_call");
      if (!calls.length) break;
      const outputs = calls.map(call => {
        let args = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch (_) {}
        return {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(executeTool(call.name, args))
        };
      });
      response = await callOpenAI({
        ...base,
        previous_response_id: response.id,
        input: outputs
      });
      turns++;
    }

    const answer = extractText(response) || "Не удалось сформировать ответ.";
    return res.status(200).json({
      answer,
      model: response.model || process.env.OPENAI_MODEL || "gpt-5.6-luna"
    });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
