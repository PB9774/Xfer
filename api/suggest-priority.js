// api/suggest-priority.js
// Called from admin panel — AI reads all pending applications and ranks them
// Frontend calls: fetch("/api/suggest-priority", { method:"POST", body: JSON.stringify({ applications }) })

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { applications } = req.body;
  if (!applications || !applications.length) return res.status(400).json({ error: "No applications provided" });

  const appList = applications.map((a, i) =>
    `${i + 1}. ID #${a.id} | District: ${a.district} | Purpose: ${a.purpose} | Requested: ${a.requested} ETH`
  ).join("\n");

  const prompt = `You are a government fund allocation AI advisor for India.
Rank these pending funding applications from highest to lowest priority.
Consider: urgency, population impact, humanitarian need, and value for money.
Return ONLY a valid JSON array — no markdown, no explanation.

Pending Applications:
${appList}

Return this exact format:
[{"id": <number>, "rank": <number>, "reason": "<1 sentence>", "suggestedAction": "Approve" or "Review" or "Reject"}]`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
        })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok || !data.candidates) {
      console.error("Gemini API error:", geminiRes.status, JSON.stringify(data));
      return res.status(502).json({ error: "Gemini API error", detail: data.error?.message || `status ${geminiRes.status}` });
    }

    const rawText = data.candidates[0]?.content?.parts?.[0]?.text || "";

    let ranked;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      ranked = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse Gemini output as JSON. Raw text was:", rawText);
      return res.status(502).json({ error: "Could not parse AI response", detail: rawText.slice(0, 300) });
    }

    res.status(200).json({ ranked });

  } catch (err) {
    console.error("suggest-priority failed:", err.message);
    res.status(502).json({ error: "AI ranking unavailable", detail: err.message });
  }
}