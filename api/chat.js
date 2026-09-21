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

const functionDeclarations = [
  {
    name: "search_movies",
    description: "Search and filter the user's Movie Map. Use this for recommendations, watched/unwatched questions, categories, tags and score-based selection.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Optional words to search across title, descriptions, categories and tags." },
        category: { type: "STRING", enum: ["films","series","weird","me","her"] },
        media_type: { type: "STRING", enum: ["фильм","сериал"] },
        state: { type: "STRING", enum: ["seen","todo"] },
        tag: { type: "STRING", description: "Exact tag such as отдых or россия." },
        min_stars: { type: "NUMBER", description: "Minimum stars from 0 to 3." },
        limit: { type: "INTEGER", description: "Maximum results from 1 to 30." }
      }
    }
  },
  {
    name: "get_movie",
    description: "Get the complete structured record for one movie or series by id or a distinctive part of its title.",
    parameters: {
      type: "OBJECT",
      properties: {
        id_or_title: { type: "STRING" }
      },
      required: ["id_or_title"]
    }
  },
  {
    name: "get_catalog_stats",
    description: "Get Movie Map counts and category definitions.",
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  }
];

function executeTool(name, args) {
  if (name === "search_movies") return searchMovies(args);
  if (name === "get_movie") return getMovie(args);
  if (name === "get_catalog_stats") return getCatalogStats();
  return { error: "Unknown tool: " + name };
}

function geminiKey() {
  // Support the exact recommended name plus the mixed-case name currently visible in Vercel.
  return process.env.GEMINI_API_KEY || process.env.Gemini_API_Key || "";
}

function geminiModel() {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
}

async function callGemini(contents) {
  const key = geminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not configured for this environment");

  const model = geminiModel();
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent";

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

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents,
      tools: [{ functionDeclarations }],
      generationConfig: { maxOutputTokens: 900 }
    })
  });

  const data = await r.json();
  if (!r.ok) {
    const msg = data && data.error && data.error.message
      ? data.error.message
      : "Gemini API error " + r.status;
    throw new Error(msg);
  }
  return data;
}

function getCandidateContent(response) {
  return response && response.candidates && response.candidates[0]
    ? response.candidates[0].content
    : null;
}

function extractFunctionCalls(content) {
  if (!content || !Array.isArray(content.parts)) return [];
  return content.parts
    .filter(p => p && p.functionCall)
    .map(p => p.functionCall);
}

function extractText(content) {
  if (!content || !Array.isArray(content.parts)) return "";
  return content.parts
    .filter(p => p && typeof p.text === "string")
    .map(p => p.text)
    .join("\n")
    .trim();
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
  if (!geminiKey()) return res.status(500).json({ error: "GEMINI_API_KEY is not configured for this environment" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const message = String(body.message || "").trim().slice(0, 2500);
    if (!message) return res.status(400).json({ error: "Empty message" });

    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const contents = history
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "").slice(0, 2500) }]
      }));
    contents.push({ role: "user", parts: [{ text: message }] });

    let response = await callGemini(contents);
    let content = getCandidateContent(response);
    let turns = 0;

    while (turns < 5) {
      const calls = extractFunctionCalls(content);
      if (!calls.length) break;

      contents.push(content);
      contents.push({
        role: "user",
        parts: calls.map(call => ({
          functionResponse: {
            name: call.name,
            response: { result: executeTool(call.name, call.args || {}) }
          }
        }))
      });

      response = await callGemini(contents);
      content = getCandidateContent(response);
      turns++;
    }

    const answer = extractText(content) || "Не удалось сформировать ответ.";
    return res.status(200).json({
      answer,
      model: geminiModel()
    });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
