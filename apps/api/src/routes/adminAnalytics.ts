import { Router } from "express";
import { prisma } from "../prisma";
import { adminAuth } from "../middleware/adminAuth";

const r = Router();
r.use(adminAuth);

// GET /api/v1/admin/analytics
r.get("/", async (_req, res, next) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [
      appFunnel,
      recentAppsThisWeek,
      recentAppsPrevWeek,
      clientGrowthRaw,
      recentClientCount,
      prevClientCount,
      quotePipelineRaw,
      recentQuoteCount,
      prevQuoteCount,
      roleStats,
    ] = await Promise.all([
      prisma.application.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.application.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.application.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      // DB-side monthly grouping — avoids loading all rows into JS heap
      prisma.$queryRaw<Array<{ month: Date; count: number }>>`
        SELECT DATE_TRUNC('month', "createdAt") AS month, COUNT(*)::int AS count
        FROM "Client"
        WHERE "createdAt" >= ${sixMonthsAgo}
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month ASC
      `,
      prisma.client.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.client.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.quoteRequest.groupBy({
        by: ["status"],
        _count: { id: true },
        _sum: { quotedAmount: true },
      }),
      prisma.quoteRequest.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.quoteRequest.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.applicationRole.groupBy({
        by: ["roleId"],
        _count: { applicationId: true },
        orderBy: { _count: { applicationId: "desc" } },
        take: 8,
      }),
    ]);

    // Monthly client growth (last 6 months) — build from DB result
    const monthMap: Record<string, number> = {};
    clientGrowthRaw.forEach((row) => {
      const d = new Date(row.month);
      monthMap[`${d.getFullYear()}-${d.getMonth()}`] = row.count;
    });
    const monthLabels: string[] = [];
    const clientsByMonth: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthLabels.push(d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }));
      clientsByMonth.push(monthMap[`${d.getFullYear()}-${d.getMonth()}`] || 0);
    }

    // Quote pipeline by status — from groupBy result
    const quotePipeline: Record<string, { count: number; value: number }> = {};
    quotePipelineRaw.forEach((q) => {
      quotePipeline[q.status] = {
        count: q._count.id,
        value: Number(q._sum.quotedAmount || 0),
      };
    });

    // Top roles with names
    const roleIds = roleStats.map((r) => r.roleId);
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true },
    });
    const roleNameMap: Record<string, string> = {};
    roles.forEach((r) => { roleNameMap[r.id] = r.name; });

    const topRoles = roleStats.map((r) => ({
      role: roleNameMap[r.roleId] || r.roleId,
      count: r._count.applicationId,
    }));

    // Applicant funnel
    const funnelOrder = ["RECEIVED", "REVIEWING", "SHORTLISTED", "HIRED", "REJECTED"];
    const funnelCountMap: Record<string, number> = {};
    appFunnel.forEach((r) => { funnelCountMap[r.status] = r._count.id; });
    const funnelData = funnelOrder.map((s) => ({
      status: s,
      count: funnelCountMap[s] || 0,
    }));

    res.json({
      ok: true,
      data: {
        funnel: funnelData,
        clientGrowth: { labels: monthLabels, data: clientsByMonth },
        quotePipeline,
        topRoles,
        weekly: {
          applications: { thisWeek: recentAppsThisWeek, prevWeek: recentAppsPrevWeek },
          clients: { thisWeek: recentClientCount, prevWeek: prevClientCount },
          quotes: { thisWeek: recentQuoteCount, prevWeek: prevQuoteCount },
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default r;
