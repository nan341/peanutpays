export function fallbackCategory(): string {
  return "Other";
}

export function fallbackTips(spendingSummary: { topCategory?: string }): string[] {
  return [
    `Try tracking your ${spendingSummary.topCategory ?? "top"} spending closely this week.`,
    "Set a small weekly limit for non-essential purchases and see how it feels.",
  ];
}

export function fallbackChatAnswer(): string {
  return "I couldn't process that right now — try rephrasing your question, or check back in a moment.";
}
