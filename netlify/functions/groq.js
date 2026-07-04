// netlify/functions/groq.js
//
// Server-side proxy for Groq's chat completions API.
// The Groq API key lives only here, as a Netlify environment variable —
// never in the browser-shipped HTML/JS.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: { message: 'Method not allowed' } })
    };
  }

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: 'Server is missing GROQ_API_KEY env var' } })
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

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: max_tokens || 1000,
        temperature: 0.7
      })
    });

    const data = await groqRes.json();

    return {
      statusCode: groqRes.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: { message: e.message || 'Upstream request to Groq failed' } })
    };
  }
};
