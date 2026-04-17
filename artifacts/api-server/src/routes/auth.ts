import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

declare module "express-session" {
  interface SessionData {
    userId: number;
    role: string;
  }
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

router.post("/login", (req, res, next) => {
  const key = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({ error: `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(retryAfter / 60)} menit.` });
    }
  } else {
    loginAttempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
  }
  next();
}, async (req, res) => {
  const key = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password diperlukan" });
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (!user) {
      const entry = loginAttempts.get(key)!;
      entry.count++;
      return res.status(401).json({ error: "Username atau password salah" });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const entry = loginAttempts.get(key)!;
      entry.count++;
      return res.status(401).json({ error: "Username atau password salah" });
    }
    loginAttempts.delete(key);
    req.session.userId = user.id;
    req.session.role = user.role;
    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      jabatan: user.jabatan,
      wilayah: user.wilayah,
      phone: user.phone,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Belum login" });
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
    if (!user) {
      return res.status(401).json({ error: "User tidak ditemukan" });
    }
    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      jabatan: user.jabatan,
      wilayah: user.wilayah,
      phone: user.phone,
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
