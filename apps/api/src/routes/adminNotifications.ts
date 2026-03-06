import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";
import { Resend } from "resend";
import { FROM_EMAIL } from "../services/email";
import { logger } from "../services/logger";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const r = Router();
r.use(adminAuth);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const RECIPIENT_BATCH_SIZE = 500;
const PUSH_SEND_BATCH_SIZE = 100;
const ERROR_SAMPLE_LIMIT = 25;

function recordError(errors: string[], message: string) {
  if (errors.length < ERROR_SAMPLE_LIMIT) {
    errors.push(message);
  }
}

type EmailRecipientAudience = "all_staff" | "pending_staff" | "all_clients";

async function forEachAudienceEmail(
  audience: EmailRecipientAudience,
  handler: (email: string) => Promise<void>
): Promise<number> {
  let cursor: string | null = null;
  let processed = 0;

  for (;;) {
    let batch: Array<{ id: string; email: string }> = [];

    if (audience === "all_staff") {
      batch = await prisma.applicant.findMany({
        select: { id: true, email: true },
        orderBy: { id: "asc" },
        take: RECIPIENT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    } else if (audience === "pending_staff") {
      batch = await prisma.applicant.findMany({
        where: {
          applications: {
            some: {
              status: "RECEIVED",
            },
          },
        },
        select: { id: true, email: true },
        orderBy: { id: "asc" },
        take: RECIPIENT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    } else {
      batch = await prisma.client.findMany({
        where: { status: "APPROVED" },
        select: { id: true, email: true },
        orderBy: { id: "asc" },
        take: RECIPIENT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    }

    if (batch.length === 0) {
      return processed;
    }

    cursor = batch[batch.length - 1].id;
    for (const recipient of batch) {
      processed++;
      await handler(recipient.email);
    }
  }
}

// POST /api/v1/admin/notifications/send — push notification
const sendPushSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  audience: z.enum(["all", "staff", "clients"]).default("all"),
});

r.post("/send", async (req, res, next) => {
  try {
    const { title, message, audience } = sendPushSchema.parse(req.body);

    const where: any = {};
    if (audience === "staff") where.userId = { not: null };
    if (audience === "clients") where.clientId = { not: null };

    // Send via Expo Push API in batches of 100
    const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
    let cursor: string | null = null;
    let total = 0;
    let sent = 0;
    const errors: string[] = [];
    let errorCount = 0;
    let batchNumber = 0;

    for (;;) {
      const tokenRows = await prisma.pushToken.findMany({
        where,
        select: { id: true, token: true },
        orderBy: { id: "asc" },
        take: RECIPIENT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (tokenRows.length === 0) break;

      total += tokenRows.length;
      cursor = tokenRows[tokenRows.length - 1].id;

      for (let i = 0; i < tokenRows.length; i += PUSH_SEND_BATCH_SIZE) {
        batchNumber++;
        const batch = tokenRows.slice(i, i + PUSH_SEND_BATCH_SIZE).map((tokenRow) => ({
          to: tokenRow.token,
          title,
          body: message,
          sound: "default" as const,
        }));

        try {
          const resp = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(batch),
          });
          if (resp.ok) {
            sent += batch.length;
          } else {
            errorCount++;
            recordError(errors, `Batch ${batchNumber} failed: ${resp.statusText}`);
          }
        } catch (e: any) {
          errorCount++;
          recordError(errors, `Batch ${batchNumber} error: ${e.message}`);
        }
      }
    }

    if (total === 0) {
      return res.json({ ok: true, data: { sent: 0, message: "No tokens found for audience" } });
    }

    logger.info({ title, audience, sent, total, errorCount }, "Admin push notification sent");

    res.json({
      ok: true,
      data: {
        sent,
        total,
        errors: errors.length > 0 ? errors : undefined,
        errorCount: errorCount || undefined,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/notifications/email — broadcast email
const broadcastEmailSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  audience: z.enum(["all_staff", "pending_staff", "all_clients"]),
});

r.post("/email", async (req, res, next) => {
  try {
    if (!resend) {
      return res.status(503).json({ error: "Email service not configured" });
    }

    const { subject, body, audience } = broadcastEmailSchema.parse(req.body);

    let sent = 0;
    let total = 0;
    const errors: string[] = [];
    let errorCount = 0;

    total = await forEachAudienceEmail(audience, async (email) => {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">${escapeHtml(body).replace(/\n/g, "<br>")}</div>`,
        });
        sent++;
      } catch (e: any) {
        errorCount++;
        recordError(errors, `${email}: ${e.message}`);
      }
    });

    if (total === 0) {
      return res.json({ ok: true, data: { sent: 0, message: "No recipients found" } });
    }

    logger.info({ subject, audience, sent, total, errorCount }, "Admin broadcast email sent");

    res.json({
      ok: true,
      data: {
        sent,
        total,
        errors: errors.length > 0 ? errors : undefined,
        errorCount: errorCount || undefined,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/notifications/contacts — contacts list for comms page
r.get("/contacts", async (_req, res, next) => {
  try {
    const contacts = await prisma.contact.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    res.json({ ok: true, data: contacts });
  } catch (err) {
    next(err);
  }
});

export default r;
