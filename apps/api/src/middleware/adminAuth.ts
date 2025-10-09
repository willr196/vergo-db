import { Request, Response, NextFunction } from "express";

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAdmin) return next();

  const wantsHtml = req.headers.accept?.includes("text/html");
  if (wantsHtml) return res.redirect("/login.html");

  return res.status(401).json({ error: "Unauthorized" });
}
