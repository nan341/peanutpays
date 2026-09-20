const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

async function callGroq(messages: { role: string; content: string }[], jsonMode = false) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: 400,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Groq API error: ${res.status} ${res.statusText} - ${errorText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

export async function categorizeWithAI(description: string): Promise<string> {
  const content = await callGroq(
    [
      {
        role: "system",
        content:
          'Categorize the transaction into exactly one of: Food, Transport, Shopping, Subscriptions, Rent, Other. Respond as JSON: {"category": "..."}',
      },
      { role: "user", content: description },
    ],
    true
  );
  return JSON.parse(content).category;
}

export async function generateSavingTips(spendingSummary: object): Promise<string[]> {
  const content = await callGroq(
    [
      {
        role: "system",
        content:
          'You are a friendly budgeting assistant for students. Given a spending summary, return 2-3 short, specific saving tips in simple language. Respond as JSON: {"tips": ["...", "..."]}',
      },
      { role: "user", content: JSON.stringify(spendingSummary) },
    ],
    true
  );
  return JSON.parse(content).tips;
}

export async function askBudgetQuestion(question: string, context: object): Promise<string> {
  return callGroq([
    {
      role: "system",
      content:
        "You are BudgetMitra, a friendly budgeting assistant for students. Answer plainly and briefly using the spending context provided. Never give investment advice.",
    },
    { role: "user", content: `Context: ${JSON.stringify(context)}\n\nQuestion: ${question}` },
  ]);
}
