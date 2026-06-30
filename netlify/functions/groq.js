const GROQ_KEYS = [
  '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',
  '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'
];

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { messages, max_tokens } = JSON.parse(event.body);

    let lastErrorBody = null;
    let lastStatus = 500;

    for (const key of GROQ_KEYS) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          max_tokens: max_tokens || 1000,
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        };
      }

      // If rate-limited (429) or key-specific auth issue (401/403), try next key.
      // For other errors (e.g. bad request), no point retrying with a different key.
      lastStatus = response.status;
      lastErrorBody = await response.json().catch(() => ({}));
      if (response.status !== 429 && response.status !== 401 && response.status !== 403) {
        break;
      }
    }

    return {
      statusCode: lastStatus,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(lastErrorBody || { error: { message: 'All Groq keys failed' } })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: err.message } })
    };
  }
};
