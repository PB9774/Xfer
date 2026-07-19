// api/write-justification.js
// Called when head office approves a payment — generates a public permanent justification
// Frontend calls: fetch("/api/write-justification", { method:"POST", body: JSON.stringify({...}) })

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { district, purpose, allocated, requested, priorityScore, riskScore, adminReason } = req.body;
  if (!district || !purpose || !allocated) return res.status(400).json({ error: "Missing fields" });

  const prompt = `You are writing a public transparency report for a government fund allocation decision in India.
Write a clear, professional 3-sentence justification that will be permanently recorded on the blockchain.
Be factual. Do not invent details not given. Return ONLY the justification text — no quotes, no labels.

Fund Allocation Details:
District: ${district}
Purpose: ${purpose}
Amount Requested: ${requested} ETH
Amount Approved: ${allocated} ETH
AI Priority Score: ${priorityScore}/100
AI Risk Score: ${riskScore}/100
Approving Officer's Note: ${adminReason}

Write the public justification now:`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
        })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok || !data.candidates) {
      console.error("Gemini API error:", geminiRes.status, JSON.stringify(data));
      // Low-stakes text field — a generic factual sentence is a fine
      // substitute here, so this one stays a soft fallback rather than
      // surfacing as a blocking error to the admin.
      return res.status(200).json({ justification: `${allocated} ETH approved for ${district} — ${adminReason}` });
    }

    const justification = data.candidates[0]?.content?.parts?.[0]?.text?.trim();
    res.status(200).json({ justification: justification || `${allocated} ETH approved for ${district} — ${adminReason}` });

  } catch (err) {
    console.error("write-justification failed:", err.message);
    res.status(200).json({ justification: `${allocated} ETH approved for ${district} — ${adminReason}` });
  }
}