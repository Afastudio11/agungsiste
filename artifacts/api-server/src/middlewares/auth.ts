import type { Request, Response, NextFunction } from "express";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Belum login" });
  }
  next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Belum login" });
  }
  if (req.session.role !== "admin") {
    return res.status(403).json({ error: "Akses ditolak: hanya admin" });
  }
  next();
};
