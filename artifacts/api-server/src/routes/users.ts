import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, eventRegistrationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        name: usersTable.name,
        jabatan: usersTable.jabatan,
        wilayah: usersTable.wilayah,
        phone: usersTable.phone,
        notes: usersTable.notes,
        createdAt: usersTable.createdAt,
        totalInput: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`.as("total_input"),
        totalEvent: sql<number>`cast(count(distinct ${eventRegistrationsTable.eventId}) as integer)`.as("total_event"),
      })
      .from(usersTable)
      .leftJoin(eventRegistrationsTable, eq(eventRegistrationsTable.staffId, usersTable.id))
      .groupBy(usersTable.id)
      .orderBy(sql`count(${eventRegistrationsTable.id}) desc`);
    return res.json(users);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { username, password, role, name, jabatan, wilayah, phone, notes } = req.body as {
      username: string; password: string; role: string; name: string;
      jabatan?: string; wilayah?: string; phone?: string; notes?: string;
    };
    if (!username || !password || !name) {
      return res.status(400).json({ error: "Username, password, dan nama diperlukan" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({
      username, passwordHash, role: role || "petugas", name, jabatan, wilayah, phone, notes
    }).returning();
    return res.json({ id: user.id, username: user.username, role: user.role, name: user.name });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") {
      return res.status(400).json({ error: "Username sudah digunakan" });
    }
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { password, role, name, jabatan, wilayah, phone, notes } = req.body as {
      password?: string; role?: string; name?: string;
      jabatan?: string; wilayah?: string; phone?: string; notes?: string;
    };
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (role) updates.role = role;
    if (jabatan !== undefined) updates.jabatan = jabatan;
    if (wilayah !== undefined) updates.wilayah = wilayah;
    if (phone !== undefined) updates.phone = phone;
    if (notes !== undefined) updates.notes = notes;
    if (password) updates.passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!user) return res.status(404).json({ error: "User tidak ditemukan" });
    return res.json({ id: user.id, name: user.name, role: user.role });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(usersTable).where(eq(usersTable.id, id));
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
