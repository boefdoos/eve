export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transcript } = req.body;
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Analyseer deze Nederlandse meeting transcript en extract actionable insights. Focus op praktische waarde, niet op letterlijke transcriptie.

Transcript: "${transcript}"

Genereer een JSON response met deze structuur:
{
  "meetingType": "brainstorm/beslissing/update/planning/overleg",
  "keyDecisions": ["beslissing 1", "beslissing 2"],
  "actionItems": [
    {"task": "wat", "who": "wie", "when": "wanneer", "priority": "hoog/gemiddeld/laag"}
  ],
  "keyInsights": ["inzicht 1", "inzicht 2", "inzicht 3"],
  "followUpNeeded": ["opvolging 1", "opvolging 2"],
  "participants": ["persoon/rol 1", "persoon/rol 2"],
  "nextSteps": ["volgende stap 1", "volgende stap 2"],
  "blockers": ["blocker 1", "blocker 2"],
  "summary": "Een zin samenvatting van de essentie"
}

Wees specifiek en actionable. Alleen geldige JSON returnen.`
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const analysisText = data.content[0].text;
    
    // Parse Claude's JSON response
    const insights = JSON.parse(analysisText);
    res.json(insights);

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analyse mislukt' });
  }
}
