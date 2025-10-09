import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import { prisma } from "../prisma";

const r = Router();

// Rate limiter stays
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Try again in 10 minutes." },
});

// POST /api/v1/auth/login
r.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Missing username or password" });
  }

  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  req.session.isAdmin = true;
  req.session.username = username;
  res.json({ ok: true });
});

r.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("vergo.sid");
    res.json({ ok: true });
  });
});

export default r;
