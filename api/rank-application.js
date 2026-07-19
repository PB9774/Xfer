
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { purpose, requested, districtName } = req.body;
  if (!purpose || !requested) return res.status(400).json({ error: "Missing fields" });

  const prompt = `You are a government fund allocation AI advisor for India, reviewing applications submitted through Xfer — a blockchain-based transparency platform. All applications are inherently denominated and paid in ETH on-chain; this is the platform's normal design, not a risk factor. Never treat the use of cryptocurrency or blockchain itself as suspicious, unusual, or a sign of misuse.
Analyze this district funding application and return ONLY a valid JSON object — no markdown, no explanation, no extra text.

Application Details:
District: ${districtName || "Unknown"}
Purpose: ${purpose}
Amount Requested: ${requested} ETH

Scoring criteria:
- priorityScore (0-100): urgency of the stated need, scale of population affected, time sensitivity. Higher = more urgent/impactful.
- riskScore (0-100): risk that these specific funds could be misused or mismanaged, based ONLY on the application's own content — never on it using blockchain/crypto.
  Base this on:
  - Vagueness: is "purpose" specific and verifiable, or generic boilerplate?
  - Proportionality: does the requested amount fit the stated purpose, or is it unusually high or a suspiciously round number with no breakdown?
  - Specificity: concrete details (what, where, how many people, timeline) vs vague claims?
  - Accountability: is there an implied measurable deliverable, or open-ended spending? Score low (0-30) for clear, specific, proportionate requests. Reserve high scores (70-100) only for genuinely vague, disproportionate, or unverifiable requests.
- reason: 2 sentence plain-English explanation referencing specific details from this application — not generic language.

Return exactly this JSON format:
{"priorityScore": <number>, "riskScore": <number>, "reason": "<string>"}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok || !data.candidates) {
      console.error("Gemini API error:", geminiRes.status, JSON.stringify(data));
      throw new Error(`Gemini API returned ${geminiRes.status}`);
    }

    const parts = data.candidates[0]?.content?.parts || [];
    const rawText = parts.find((p) => !p.thought && p.text)?.text || "[]";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const ranked  = JSON.parse(cleaned);
    res.status(200).json({ ranked });

  } catch (err) {
    console.error("suggest-priority failed:", err.message);
    res.status(502).json({ error: "AI ranking unavailable", detail: err.message });
  }
}