import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable, eventsTable } from "@workspace/db";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { GetDashboardStatsQueryParams, GetEventsSummaryQueryParams, GetDailyRegistrationsQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const query = GetDashboardStatsQueryParams.safeParse(req.query);
    const { startDate, endDate } = query.success ? query.data : {};

    const [totalParticipants] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(participantsTable);

    const [totalEvents] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(eventsTable);

    let regConditions: any[] = [];
    if (startDate) regConditions.push(gte(eventRegistrationsTable.registeredAt, new Date(startDate)));
    if (endDate) regConditions.push(lte(eventRegistrationsTable.registeredAt, new Date(endDate)));

    const [totalRegistrations] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(eventRegistrationsTable)
      .where(regConditions.length > 0 ? and(...regConditions) : undefined);

    const [multiEventParticipants] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(
        db
          .select({
            participantId: eventRegistrationsTable.participantId,
            cnt: sql<number>`count(*)`,
          })
          .from(eventRegistrationsTable)
          .groupBy(eventRegistrationsTable.participantId)
          .having(sql`count(*) > 1`)
          .as("multi")
      );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [recentRegistrations] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(eventRegistrationsTable)
      .where(gte(eventRegistrationsTable.registeredAt, sevenDaysAgo));

    // Previous 7-day window for % change
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const [prevWeekRegistrations] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(eventRegistrationsTable)
      .where(
        and(
          gte(eventRegistrationsTable.registeredAt, fourteenDaysAgo),
          lte(eventRegistrationsTable.registeredAt, sevenDaysAgo)
        )
      );

    res.json({
      totalParticipants: totalParticipants.count,
      totalEvents: totalEvents.count,
      totalRegistrations: totalRegistrations.count,
      multiEventParticipants: multiEventParticipants.count,
      recentRegistrations: recentRegistrations.count,
      prevWeekRegistrations: prevWeekRegistrations.count,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting dashboard stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/events-summary", requireAuth, async (req, res) => {
  try {
    const query = GetEventsSummaryQueryParams.safeParse(req.query);
    const { startDate, endDate } = query.success ? query.data : {};

    let conditions: any[] = [];
    if (startDate) conditions.push(gte(eventsTable.eventDate, startDate));
    if (endDate) conditions.push(lte(eventsTable.eventDate, endDate));

    const events = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        eventDate: eventsTable.eventDate,
        location: eventsTable.location,
        participantCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
      })
      .from(eventsTable)
      .leftJoin(eventRegistrationsTable, eq(eventsTable.id, eventRegistrationsTable.eventId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(eventsTable.id)
      .orderBy(sql`count(${eventRegistrationsTable.id}) desc`);

    res.json(events);
  } catch (err) {
    req.log.error({ err }, "Error getting events summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/daily-registrations", requireAuth, async (req, res) => {
  try {
    const query = GetDailyRegistrationsQueryParams.safeParse(req.query);
    const { startDate, endDate } = query.success ? query.data : {};

    let conditions: any[] = [];
    if (startDate) conditions.push(gte(eventRegistrationsTable.registeredAt, new Date(startDate)));
    if (endDate) conditions.push(lte(eventRegistrationsTable.registeredAt, new Date(endDate)));

    const daily = await db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${eventRegistrationsTable.registeredAt}), 'YYYY-MM-DD')`,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(eventRegistrationsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(sql`date_trunc('day', ${eventRegistrationsTable.registeredAt})`)
      .orderBy(sql`date_trunc('day', ${eventRegistrationsTable.registeredAt})`);

    res.json(daily);
  } catch (err) {
    req.log.error({ err }, "Error getting daily registrations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/multi-event-participants", requireAuth, async (req, res) => {
  try {
    const result = await db
      .select({
        nik: participantsTable.nik,
        fullName: participantsTable.fullName,
        eventCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
      })
      .from(participantsTable)
      .innerJoin(eventRegistrationsTable, eq(participantsTable.id, eventRegistrationsTable.participantId))
      .groupBy(participantsTable.id)
      .having(sql`count(${eventRegistrationsTable.id}) > 1`)
      .orderBy(sql`count(${eventRegistrationsTable.id}) desc`);

    const enriched = await Promise.all(
      result.map(async (p) => {
        const events = await db
          .select({ name: eventsTable.name })
          .from(eventRegistrationsTable)
          .innerJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.id))
          .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
          .where(eq(participantsTable.nik, p.nik));
        return { ...p, events: events.map((e) => e.name) };
      })
    );

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error getting multi-event participants");
    res.status(500).json({ error: "Internal server error" });
  }
});

// All staff with detailed stats
router.get("/staff", requireAuth, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const staffRows = await db
      .select({
        staffName: eventRegistrationsTable.staffName,
        totalCount: sql<number>`cast(count(*) as integer)`,
        recentCount: sql<number>`cast(sum(case when ${eventRegistrationsTable.registeredAt} >= ${sevenDaysAgo.toISOString()} then 1 else 0 end) as integer)`,
        lastActivity: sql<string>`to_char(max(${eventRegistrationsTable.registeredAt}), 'YYYY-MM-DD')`,
      })
      .from(eventRegistrationsTable)
      .where(sql`${eventRegistrationsTable.staffName} is not null`)
      .groupBy(eventRegistrationsTable.staffName)
      .orderBy(sql`count(*) desc`);

    res.json(staffRows);
  } catch (err) {
    req.log.error({ err }, "Error getting staff list");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Top staff by registration count
router.get("/top-staff", requireAuth, async (req, res) => {
  try {
    const result = await db
      .select({
        staffName: eventRegistrationsTable.staffName,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(eventRegistrationsTable)
      .where(sql`${eventRegistrationsTable.staffName} is not null`)
      .groupBy(eventRegistrationsTable.staffName)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error getting top staff");
    res.status(500).json({ error: "Internal server error" });
  }
});

// New: gender + province breakdown
router.get("/segments", requireAuth, async (req, res) => {
  try {
    const gender = await db
      .select({
        gender: participantsTable.gender,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(participantsTable)
      .groupBy(participantsTable.gender)
      .orderBy(sql`count(*) desc`);

    const province = await db
      .select({
        province: participantsTable.province,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(participantsTable)
      .groupBy(participantsTable.province)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    // Day-of-week registrations (0=Sun ... 6=Sat)
    const dow = await db
      .select({
        dow: sql<number>`cast(extract(dow from ${eventRegistrationsTable.registeredAt}) as integer)`,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(eventRegistrationsTable)
      .groupBy(sql`extract(dow from ${eventRegistrationsTable.registeredAt})`)
      .orderBy(sql`extract(dow from ${eventRegistrationsTable.registeredAt})`);

    res.json({ gender, province, dow });
  } catch (err) {
    req.log.error({ err }, "Error getting segments");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
