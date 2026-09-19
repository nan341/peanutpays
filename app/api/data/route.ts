import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { ensureTablesExist } from "@/lib/db/init";
import { sql } from "drizzle-orm";

export async function DELETE() {
  try {
    await ensureTablesExist();
    await db.run(sql`DELETE FROM lending_entries`);
    await db.run(sql`DELETE FROM friends`);
    await db.run(sql`DELETE FROM transactions`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/data]", err);
    return NextResponse.json({ error: "Failed to clear data" }, { status: 500 });
  }
}
