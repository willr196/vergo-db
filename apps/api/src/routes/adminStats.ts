import { Router } from "express";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";

const r = Router();
r.use(adminAuth);

// GET /api/v1/admin/stats — live KPI summary for dashboard
r.get("/", async (_req, res, next) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const [
      appCounts,
      appNewThisWeek,
      clientCounts,
      clientNewThisWeek,
      quoteCounts,
      quoteRevenue,
      contactCounts,
      pendingApps48hrs,
      recentApplications,
      recentClients,
      recentQuotes,
    ] = await Promise.all([
      prisma.application.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.application.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.client.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.client.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.quoteRequest.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.quoteRequest.aggregate({
        where: { status: { in: ["ACCEPTED", "COMPLETED"] }, quotedAmount: { not: null } },
        _sum: { quotedAmount: true },
      }),
      prisma.contact.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.application.count({
        where: { status: "RECEIVED", createdAt: { lte: fortyEightHoursAgo } },
      }),
      prisma.application.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { applicant: { select: { firstName: true, lastName: true } } },
      }),
      prisma.client.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { id: true, companyName: true, status: true, createdAt: true },
      }),
      prisma.quoteRequest.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { client: { select: { companyName: true } } },
      }),
    ]);

    // Merge activity feed
    const activityItems: Array<{
      type: string; text: string; time: Date; color: string;
    }> = [];

    recentApplications.forEach((app) => {
      activityItems.push({
        type: "application",
        text: `New application: ${app.applicant.firstName} ${app.applicant.lastName}`,
        time: app.createdAt,
        color: app.status === "HIRED" ? "success" : app.status === "REJECTED" ? "error" : "info",
      });
    });

    recentClients.forEach((c) => {
      activityItems.push({
        type: "client",
        text: `Client registered: ${c.companyName} (${c.status})`,
        time: c.createdAt,
        color: c.status === "APPROVED" ? "success" : c.status === "REJECTED" ? "error" : "default",
      });
    });

    recentQuotes.forEach((q) => {
      activityItems.push({
        type: "quote",
        text: `Quote request: ${q.client.companyName} — ${q.eventType}`,
        time: q.createdAt,
        color: q.status === "COMPLETED" ? "success" : q.status === "DECLINED" ? "error" : "default",
      });
    });

    activityItems.sort((a, b) => b.time.getTime() - a.time.getTime());
    const activity = activityItems.slice(0, 10);

    type CountRow = { status: string; _count: { id: number } };

    const toMap = (rows: CountRow[]) => {
      const m: Record<string, number> = {};
      rows.forEach((r) => { m[r.status] = r._count.id; });
      return m;
    };

    const appMap = toMap(appCounts as CountRow[]);
    const clientMap = toMap(clientCounts as CountRow[]);
    const quoteMap = toMap(quoteCounts as CountRow[]);
    const contactMap = toMap(contactCounts as CountRow[]);

    const unansweredQuotes = quoteMap["NEW"] || 0;
    const alerts: Array<{ type: string; message: string }> = [];
    if (pendingApps48hrs > 0) {
      alerts.push({
        type: "warning",
        message: `${pendingApps48hrs} application${pendingApps48hrs > 1 ? "s" : ""} pending for over 48 hours`,
      });
    }
    if (unansweredQuotes > 0) {
      alerts.push({
        type: "warning",
        message: `${unansweredQuotes} unanswered quote request${unansweredQuotes > 1 ? "s" : ""}`,
      });
    }

    res.json({
      ok: true,
      data: {
        applicants: {
          total: Object.values(appMap).reduce((a, b) => a + b, 0),
          received: appMap["RECEIVED"] || 0,
          reviewing: appMap["REVIEWING"] || 0,
          shortlisted: appMap["SHORTLISTED"] || 0,
          rejected: appMap["REJECTED"] || 0,
          hired: appMap["HIRED"] || 0,
          newThisWeek: appNewThisWeek,
        },
        clients: {
          total: Object.values(clientMap).reduce((a, b) => a + b, 0),
          pending: clientMap["PENDING"] || 0,
          approved: clientMap["APPROVED"] || 0,
          rejected: clientMap["REJECTED"] || 0,
          suspended: clientMap["SUSPENDED"] || 0,
          newThisWeek: clientNewThisWeek,
        },
        quotes: {
          total: Object.values(quoteMap).reduce((a, b) => a + b, 0),
          new: quoteMap["NEW"] || 0,
          quoted: quoteMap["QUOTED"] || 0,
          accepted: quoteMap["ACCEPTED"] || 0,
          completed: quoteMap["COMPLETED"] || 0,
          declined: quoteMap["DECLINED"] || 0,
          revenueEstimate: Number(quoteRevenue._sum.quotedAmount || 0),
        },
        contacts: {
          total: Object.values(contactMap).reduce((a, b) => a + b, 0),
          new: contactMap["NEW"] || 0,
          contacted: contactMap["CONTACTED"] || 0,
          quoted: contactMap["QUOTED"] || 0,
          booked: contactMap["BOOKED"] || 0,
        },
        activity,
        alerts,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default r;
