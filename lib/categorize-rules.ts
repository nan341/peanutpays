const CATEGORY_RULES: Record<string, string[]> = {
  Food: ["swiggy", "zomato", "restaurant", "cafe", "food", "dominos", "starbucks"],
  Transport: ["uber", "ola", "rapido", "petrol", "fuel", "metro", "bus", "auto"],
  Shopping: ["amazon", "flipkart", "myntra", "mall", "shopping"],
  Subscriptions: ["netflix", "spotify", "prime", "hotstar", "subscription"],
  Rent: ["rent", "hostel", "pg fee", "landlord"],
};

export function categorizeByRules(description: string): string | null {
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return null;
}
