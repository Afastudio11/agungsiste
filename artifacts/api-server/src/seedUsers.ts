import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { count } from "drizzle-orm";

export async function seedUsersIfEmpty(): Promise<void> {
  const [row] = await db.select({ cnt: count() }).from(usersTable);
  if (row && row.cnt > 0) return;

  console.log("[seedUsers] No users found. Creating default accounts...");

  const adminHash = await bcrypt.hash("admin123", 10);
  const petugasHash = await bcrypt.hash("petugas123", 10);

  await db.insert(usersTable).values([
    {
      username: "admin",
      passwordHash: adminHash,
      role: "admin",
      name: "Administrator",
      jabatan: "Super Admin",
      wilayah: "Pusat",
      phone: "+62 800 000 0001",
    },
    {
      username: "budi",
      passwordHash: petugasHash,
      role: "petugas",
      name: "Budi Santoso",
      jabatan: "Koordinator",
      wilayah: "Kab. Bandung Barat",
      phone: "+62 812 0001 0001",
    },
    {
      username: "rina",
      passwordHash: petugasHash,
      role: "petugas",
      name: "Rina Wati",
      jabatan: "Staf",
      wilayah: "Kab. Garut",
      phone: "+62 812 0001 0002",
    },
    {
      username: "agus",
      passwordHash: petugasHash,
      role: "petugas",
      name: "Agus Purnomo",
      jabatan: "Staf",
      wilayah: "Kab. Cimahi",
      phone: "+62 812 0001 0003",
    },
  ]);

  console.log("[seedUsers] Default accounts created. Admin: admin/admin123 | Petugas: budi/petugas123");
}
