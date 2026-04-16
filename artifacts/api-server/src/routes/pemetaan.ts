import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable, eventsTable, prizeDistributionsTable } from "@workspace/db";
import { jatimWilayah, getKecamatanList, getDesaList } from "@workspace/db/jatimWilayah";
import { sql, count, countDistinct } from "drizzle-orm";

const router = Router();

router.get("/summary", async (_req, res) => {
  try {
    const [totals] = await db
      .select({
        totalDesa: countDistinct(participantsTable.kelurahan),
        totalKecamatan: countDistinct(participantsTable.kecamatan),
        totalKabupaten: countDistinct(participantsTable.city),
      })
      .from(participantsTable);

    const desaWithEvents = await db
      .select({ kelurahan: participantsTable.kelurahan })
      .from(participantsTable)
      .innerJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .groupBy(participantsTable.kelurahan)
      .having(sql`count(distinct ${eventRegistrationsTable.eventId}) > 0`);

    const [eventCount] = await db
      .select({ totalEvent: count(eventsTable.id) })
      .from(eventsTable);

    const [hadiahCount] = await db
      .select({ totalHadiah: count(prizeDistributionsTable.id) })
      .from(prizeDistributionsTable);

    return res.json({
      totalDesa: totals.totalDesa || 0,
      totalKecamatan: totals.totalKecamatan || 0,
      totalKabupaten: totals.totalKabupaten || 0,
      desaWithEvents: desaWithEvents.length,
      totalEvent: eventCount?.totalEvent || 0,
      totalHadiah: hadiahCount?.totalHadiah || 0,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/kabupaten", async (req, res) => {
  try {
    const { startDate, endDate } = req.query as Record<string, string>;

    const conditions: ReturnType<typeof sql>[] = [sql`${participantsTable.city} is not null`];
    if (startDate) conditions.push(sql`${eventRegistrationsTable.registeredAt} >= ${new Date(startDate).toISOString()}`);
    if (endDate) conditions.push(sql`${eventRegistrationsTable.registeredAt} <= ${new Date(endDate).toISOString()}`);

    const hasDateFilter = !!(startDate || endDate);
    const data = await db
      .select({
        kabupaten: participantsTable.city,
        totalInput: hasDateFilter
          ? sql<number>`cast(count(distinct ${eventRegistrationsTable.id}) as integer)`
          : countDistinct(participantsTable.id),
        totalDesa: countDistinct(participantsTable.kelurahan),
        totalKecamatan: countDistinct(participantsTable.kecamatan),
        totalEvent: countDistinct(eventRegistrationsTable.eventId),
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(sql`${conditions.reduce((a, b) => sql`${a} and ${b}`)}`)
      .groupBy(participantsTable.city)
      .orderBy(sql`count(distinct ${hasDateFilter ? eventRegistrationsTable.id : participantsTable.id}) desc`);

    const kabMap = new Map(data.map((d) => [d.kabupaten?.toLowerCase() ?? "", d]));

    const result = Object.keys(jatimWilayah).map((kab) => {
      const db = kabMap.get(kab.toLowerCase());
      const totalDesaRef = Object.values(jatimWilayah[kab]).flat().length;
      const totalKecRef = getKecamatanList(kab).length;
      return {
        kabupaten: kab,
        totalInput: db?.totalInput ?? 0,
        totalDesa: totalDesaRef,
        totalKecamatan: totalKecRef,
        totalEvent: db?.totalEvent ?? 0,
      };
    });

    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/kecamatan", async (req, res) => {
  try {
    const { kabupaten } = req.query as Record<string, string>;

    const dbRows = await db
      .select({
        kecamatan: participantsTable.kecamatan,
        kabupaten: sql<string>`min(${participantsTable.city})`,
        totalInput: countDistinct(participantsTable.id),
        totalEvent: countDistinct(eventRegistrationsTable.eventId),
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(
        kabupaten
          ? sql`${participantsTable.kecamatan} is not null and ${participantsTable.city} ilike ${"%" + kabupaten + "%"}`
          : sql`${participantsTable.kecamatan} is not null`
      )
      .groupBy(participantsTable.kecamatan);

    const dbMap = new Map(dbRows.map((r) => [r.kecamatan?.toLowerCase() ?? "", r]));

    const kabKey = kabupaten
      ? Object.keys(jatimWilayah).find((k) => k.toLowerCase().includes(kabupaten.toLowerCase()))
      : undefined;

    const kecList = kabKey ? getKecamatanList(kabKey) : Object.keys(jatimWilayah).flatMap((k) => getKecamatanList(k));

    const result = kecList.map((kec) => {
      const row = dbMap.get(kec.toLowerCase());
      const totalDesa = kabKey
        ? getDesaList(kabKey, kec).length
        : Object.values(jatimWilayah).reduce((acc, kecMap) => acc + (kecMap[kec]?.length ?? 0), 0);
      return {
        kecamatan: kec,
        kabupaten: row?.kabupaten ?? kabKey ?? "",
        totalInput: row?.totalInput ?? 0,
        totalDesa,
        totalEvent: row?.totalEvent ?? 0,
      };
    });

    result.sort((a, b) => (b.totalInput as number) - (a.totalInput as number));
    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/desa", async (req, res) => {
  try {
    const { kabupaten, kecamatan, search } = req.query as Record<string, string>;

    const conditions: ReturnType<typeof sql>[] = [sql`${participantsTable.kelurahan} is not null`];
    if (kabupaten) conditions.push(sql`${participantsTable.city} ilike ${"%" + kabupaten + "%"}`);
    if (kecamatan) conditions.push(sql`${participantsTable.kecamatan} ilike ${"%" + kecamatan + "%"}`);
    if (search) conditions.push(sql`${participantsTable.kelurahan} ilike ${"%" + search + "%"}`);

    const dbRows = await db
      .select({
        kelurahan: participantsTable.kelurahan,
        kecamatan: sql<string>`min(${participantsTable.kecamatan})`,
        kabupaten: sql<string>`min(${participantsTable.city})`,
        totalInput: countDistinct(participantsTable.id),
        totalEvent: countDistinct(eventRegistrationsTable.eventId),
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(sql`${conditions.reduce((a, b) => sql`${a} and ${b}`)}`)
      .groupBy(participantsTable.kelurahan)
      .orderBy(sql`count(distinct ${participantsTable.id}) desc`)
      .limit(2000);

    const dbMap = new Map(dbRows.map((r) => [r.kelurahan?.toLowerCase() ?? "", r]));

    const kabKey = kabupaten
      ? Object.keys(jatimWilayah).find((k) => k.toLowerCase().includes(kabupaten.toLowerCase()))
      : undefined;

    const kecKey = kecamatan && kabKey
      ? getKecamatanList(kabKey).find((k) => k.toLowerCase().includes(kecamatan.toLowerCase()))
      : undefined;

    let refDesaList: { kelurahan: string; kecamatan: string; kabupaten: string }[] = [];

    if (kabKey && kecKey) {
      refDesaList = getDesaList(kabKey, kecKey).map((d) => ({ kelurahan: d, kecamatan: kecKey, kabupaten: kabKey }));
    } else if (kabKey) {
      refDesaList = getKecamatanList(kabKey).flatMap((kec) =>
        getDesaList(kabKey, kec).map((d) => ({ kelurahan: d, kecamatan: kec, kabupaten: kabKey }))
      );
    } else {
      refDesaList = Object.keys(jatimWilayah).flatMap((kab) =>
        getKecamatanList(kab).flatMap((kec) =>
          getDesaList(kab, kec).map((d) => ({ kelurahan: d, kecamatan: kec, kabupaten: kab }))
        )
      );
    }

    if (search) {
      refDesaList = refDesaList.filter((d) => d.kelurahan.toLowerCase().includes(search.toLowerCase()));
    }

    const result = refDesaList.map(({ kelurahan, kecamatan: kec, kabupaten: kab }) => {
      const row = dbMap.get(kelurahan.toLowerCase());
      return {
        kelurahan,
        kecamatan: kec,
        kabupaten: kab,
        totalInput: row?.totalInput ?? 0,
        totalEvent: row?.totalEvent ?? 0,
      };
    });

    result.sort((a, b) => (b.totalInput as number) - (a.totalInput as number));
    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/desa/:kelurahan", async (req, res) => {
  try {
    const { kelurahan } = req.params;
    const [info] = await db
      .select({
        kelurahan: participantsTable.kelurahan,
        kecamatan: sql<string>`min(${participantsTable.kecamatan})`,
        kabupaten: sql<string>`min(${participantsTable.city})`,
        totalInput: countDistinct(participantsTable.id),
        totalEvent: countDistinct(eventRegistrationsTable.eventId),
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(sql`lower(${participantsTable.kelurahan}) = lower(${kelurahan})`)
      .groupBy(participantsTable.kelurahan);

    const events = await db
      .select({
        eventId: eventsTable.id,
        eventName: eventsTable.name,
        eventDate: eventsTable.eventDate,
        location: eventsTable.location,
        peserta: count(participantsTable.id),
      })
      .from(participantsTable)
      .innerJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .innerJoin(eventsTable, sql`${eventsTable.id} = ${eventRegistrationsTable.eventId}`)
      .where(sql`lower(${participantsTable.kelurahan}) = lower(${kelurahan})`)
      .groupBy(eventsTable.id, eventsTable.name, eventsTable.eventDate, eventsTable.location)
      .orderBy(sql`count(${participantsTable.id}) desc`);

    const [hadiahRow] = await db
      .select({ total: count(prizeDistributionsTable.id) })
      .from(prizeDistributionsTable)
      .innerJoin(participantsTable, sql`${participantsTable.id} = ${prizeDistributionsTable.participantId}`)
      .where(sql`lower(${participantsTable.kelurahan}) = lower(${kelurahan})`);

    const totalHadiah = hadiahRow?.total ?? 0;

    if (!info) {
      let foundKec = "";
      let foundKab = "";
      outer: for (const [kab, kecMap] of Object.entries(jatimWilayah)) {
        for (const [kec, desaArr] of Object.entries(kecMap)) {
          if (desaArr.some((d) => d.toLowerCase() === kelurahan.toLowerCase())) {
            foundKab = kab;
            foundKec = kec;
            break outer;
          }
        }
      }
      return res.json({
        kelurahan,
        kecamatan: foundKec,
        kabupaten: foundKab,
        totalInput: 0,
        totalEvent: 0,
        totalHadiah: 0,
        events: [],
      });
    }

    return res.json({ ...info, totalHadiah, events });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/desa/:kelurahan/event/:eventId/participants", async (req, res) => {
  try {
    const { kelurahan, eventId } = req.params;
    const data = await db
      .select({
        nik: participantsTable.nik,
        fullName: participantsTable.fullName,
        gender: participantsTable.gender,
        occupation: participantsTable.occupation,
        phone: eventRegistrationsTable.phone,
        tags: eventRegistrationsTable.tags,
        registeredAt: eventRegistrationsTable.registeredAt,
      })
      .from(participantsTable)
      .innerJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(
        sql`lower(${participantsTable.kelurahan}) = lower(${kelurahan})
          and ${eventRegistrationsTable.eventId} = ${parseInt(eventId)}`
      )
      .orderBy(sql`${eventRegistrationsTable.registeredAt} desc`);
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
