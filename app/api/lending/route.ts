import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { ensureTablesExist } from "@/lib/db/init";
import { friends, lendingEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET: Return all friends with their net unsettled balance
export async function GET() {
  try {
    await ensureTablesExist();

    const allFriends = await db.select().from(friends);
    const allEntries = await db
      .select()
      .from(lendingEntries)
      .where(eq(lendingEntries.settled, false));

    const result = allFriends.map((f) => {
      const friendEntries = allEntries.filter((e) => e.friendId === f.id);
      const lentTotal = friendEntries
        .filter((e) => e.direction === "lent")
        .reduce((s, e) => s + e.amount, 0);
      const borrowedTotal = friendEntries
        .filter((e) => e.direction === "borrowed")
        .reduce((s, e) => s + e.amount, 0);
      const netBalance = lentTotal - borrowedTotal; // positive = they owe you
      return {
        ...f,
        netBalance,
        entries: friendEntries,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/lending]", err);
    return NextResponse.json({ error: "Failed to fetch lending data" }, { status: 500 });
  }
}

// POST: Create a friend (if new by name) + add a lending entry
export async function POST(req: NextRequest) {
  try {
    await ensureTablesExist();
    const body = await req.json();
    const { friendName, amount, direction, note } = body as {
      friendName: string;
      amount: number;
      direction: "lent" | "borrowed";
      note?: string;
    };

    if (!friendName || !amount || !direction) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Find or create friend
    const existingFriends = await db
      .select()
      .from(friends)
      .where(eq(friends.name, friendName));
    let friend = existingFriends[0];
    if (!friend) {
      const inserted = await db.insert(friends).values({ name: friendName }).returning();
      friend = inserted[0];
    }

    const entry = await db
      .insert(lendingEntries)
      .values({ friendId: friend.id, amount, direction, note: note ?? null })
      .returning();

    return NextResponse.json(entry[0], { status: 201 });
  } catch (err) {
    console.error("[POST /api/lending]", err);
    return NextResponse.json({ error: "Failed to create lending entry" }, { status: 500 });
  }
}

// PATCH: Mark a lending entry as settled
export async function PATCH(req: NextRequest) {
  try {
    await ensureTablesExist();
    const body = await req.json();
    const { entryId } = body as { entryId: number };

    if (!entryId) {
      return NextResponse.json({ error: "Missing entryId" }, { status: 400 });
    }

    await db
      .update(lendingEntries)
      .set({ settled: true })
      .where(eq(lendingEntries.id, entryId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/lending]", err);
    return NextResponse.json({ error: "Failed to settle entry" }, { status: 500 });
  }
}
