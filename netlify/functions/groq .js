// netlify/functions/groq.js
//
// Server-side proxy for Groq's chat completions API.
// Groq keys live only here, as Netlify environment variables named
// GROQ_KEY_1, GROQ_KEY_2, ... GROQ_KEY_N — never in the browser-shipped HTML/JS.
//
// Matches the request contract used by vikram_v17.html's callGroq():
//   POST body: { messages: [...], max_tokens: number }
// and returns Groq's raw response JSON (so `data.choices[0].message.content`
// on the client keeps working).
//
// Key rotation: reads every env var matching GROQ_KEY_<n>, shuffles the order
// each invocation, and tries them one at a time. If a key comes back rate
// limited (429) or invalid (401), it moves on to the next key automatically
// before ever surfacing an error to the client. This multiplies your
// effective free-tier throughput across however many keys you've added.
//
// Setup:
// 1. Place this file at netlify/functions/groq.js in your repo (this exact path).
//    No netlify.toml redirect needed — Netlify auto-exposes it at
//    /.netlify/functions/groq, which is what the HTML calls.
// 2. In the Netlify dashboard you already have GROQ_KEY_1..GROQ_KEY_6 set —
//    nothing more to add. To add more keys later, just add GROQ_KEY_7, etc.
//    (any numbering works; the function discovers them automatically).
// 3. Deploy / trigger a new deploy so the function picks up any new keys.

function getKeys() {
  return Object.keys(process.env)
    .filter((k) => /^GROQ_KEY_\d+$/.test(k))
    .map((k) => process.env[k])
    .filter(Boolean);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: { message: 'Method not allowed' } })
    };
  }

  const keys = shuffle(getKeys());
  if (keys.length === 0) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: 'No GROQ_KEY_* env vars found on the server' } })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: { message: 'Invalid JSON body' } })
    };
  }

  const { messages, max_tokens } = payload;
  if (!Array.isArray(messages)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: { message: '"messages" array is required' } })
    };
  }

  const requestBody = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages,
    max_tokens: max_tokens || 1000,
    temperature: 0.7
  });

  let lastResult = null;

  for (const key of keys) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: requestBody
      });

      const data = await groqRes.json();

      // Rate-limited or bad key on this one — try the next key silently.
      if (groqRes.status === 429 || groqRes.status === 401) {
        lastResult = { statusCode: groqRes.status, data };
        continue;
      }

      return {
        statusCode: groqRes.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      };
    } catch (e) {
      lastResult = { statusCode: 502, data: { error: { message: e.message || 'Upstream request to Groq failed' } } };
      continue;
    }
  }

  // Every key failed (all rate limited / invalid / network errors) — surface
  // the last error so the client's own retry/backoff logic can still kick in.
  return {
    statusCode: lastResult ? lastResult.statusCode : 502,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lastResult ? lastResult.data : { error: { message: 'All Groq keys failed' } })
  };
};
