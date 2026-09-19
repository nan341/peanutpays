import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import path from "path";

const client = createClient({
  url: `file:${path.join(process.cwd(), "budgetmitra.db")}`,
});

export const db = drizzle(client, { schema });
