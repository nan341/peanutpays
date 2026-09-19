import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { ensureTablesExist } from "@/lib/db/init";
import { transactions } from "@/lib/db/schema";
import { categorizeByRules } from "@/lib/categorize-rules";
import { categorizeWithAI } from "@/lib/ai/groq";
import { fallbackCategory } from "@/lib/ai/fallback";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    await ensureTablesExist();
    const rows = await db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.date));
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/transactions]", err);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTablesExist();
    const body = await req.json();
    const { amount, description, type } = body as {
      amount: number;
      description: string;
      type: "income" | "expense";
    };

    if (!amount || !description || !type) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Categorization chain: rules -> AI -> fallback
    let category = categorizeByRules(description);
    if (!category) {
      try {
        category = await categorizeWithAI(description);
      } catch {
        category = fallbackCategory();
      }
    }

    const inserted = await db
      .insert(transactions)
      .values({ amount, description, category, type })
      .returning();

    return NextResponse.json(inserted[0], { status: 201 });
  } catch (err) {
    console.error("[POST /api/transactions]", err);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}
