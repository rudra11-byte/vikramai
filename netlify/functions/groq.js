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

  const GROQ_KEYS = [process.env.GROQ_KEY_1, process.env.GROQ_KEY_2].filter(Boolean);

  if (GROQ_KEYS.length === 0) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'No Groq API keys configured in environment variables' } })
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
