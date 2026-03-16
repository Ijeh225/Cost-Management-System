import { db, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, "admin@costanalysis.com"));
  if (existing.length > 0) {
    console.log("Admin user already exists, skipping...");
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash("admin123", 10);
  await db.insert(usersTable).values({
    email: "admin@costanalysis.com",
    name: "System Administrator",
    passwordHash,
    role: "admin",
    isActive: true,
  });

  console.log("✅ Admin user created:");
  console.log("   Email: admin@costanalysis.com");
  console.log("   Password: admin123");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
