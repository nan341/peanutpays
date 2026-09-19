import { NextRequest, NextResponse } from "next/server";
import { categorizeByRules } from "@/lib/categorize-rules";
import { categorizeWithAI } from "@/lib/ai/groq";
import { fallbackCategory } from "@/lib/ai/fallback";

export async function POST(req: NextRequest) {
  try {
    const { description } = await req.json();
    if (!description) {
      return NextResponse.json({ category: "Other" });
    }

    let category = categorizeByRules(description);
    if (!category) {
      try {
        category = await categorizeWithAI(description);
      } catch {
        category = fallbackCategory();
      }
    }

    return NextResponse.json({ category });
  } catch (err) {
    console.error("[POST /api/categorize]", err);
    return NextResponse.json({ category: "Other" });
  }
}
