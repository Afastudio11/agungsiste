import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const ScanBody = z.object({ imageBase64: z.string() });

const RegisterBody = z.object({
  eventId: z.number(),
  staffId: z.number().optional(),
  staffName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(),
  nik: z.string(),
  fullName: z.string(),
  address: z.string().optional(),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.string().optional(),
  religion: z.string().optional(),
  maritalStatus: z.string().optional(),
  occupation: z.string().optional(),
  nationality: z.string().optional(),
  rtRw: z.string().optional(),
  kelurahan: z.string().optional(),
  kecamatan: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  bloodType: z.string().optional(),
});

router.post("/scan", async (req, res) => {
  try {
    const { imageBase64 } = ScanBody.parse(req.body);
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract all data from this Indonesian KTP (Identity Card) image. Return ONLY a valid JSON object with these exact fields (use null if not found):
{
  "nik": string or null,
  "fullName": string or null,
  "address": string or null,
  "birthPlace": string or null,
  "birthDate": string or null,
  "gender": string or null,
  "religion": string or null,
  "maritalStatus": string or null,
  "occupation": string or null,
  "nationality": string or null,
  "rtRw": string or null,
  "kelurahan": string or null,
  "kecamatan": string or null,
  "province": string or null,
  "city": string or null,
  "bloodType": string or null,
  "validUntil": string or null
}
Return only the JSON, no explanation, no markdown.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "high" },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let ktpData: Record<string, string | null> = {};
    try {
      ktpData = JSON.parse(content.replace(/```json\n?|```/g, "").trim());
    } catch {
      req.log.warn({ content }, "Failed to parse KTP extraction response");
    }
    res.json(ktpData);
  } catch (err) {
    req.log.error({ err }, "Error scanning KTP");
    res.status(500).json({ error: "Failed to scan KTP" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const body = RegisterBody.parse(req.body);
    const { eventId, staffId, staffName, phone, email, notes, tags, nik, fullName, ...rest } = body;

    let participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });

    const isNewParticipant = !participant;

    if (!participant) {
      const [p] = await db.insert(participantsTable).values({ nik, fullName, ...rest }).returning();
      participant = p;
    } else {
      await db.update(participantsTable)
        .set({ fullName, ...rest, updatedAt: new Date() })
        .where(eq(participantsTable.id, participant.id));
    }

    const existing = await db.query.eventRegistrationsTable.findFirst({
      where: (t, { and, eq }) => and(eq(t.eventId, eventId), eq(t.participantId, participant!.id)),
    });

    const totalEventsJoined = await db.$count(
      eventRegistrationsTable,
      eq(eventRegistrationsTable.participantId, participant.id)
    );

    if (existing) {
      return res.status(409).json({
        error: "Peserta sudah terdaftar di event ini",
        nik, eventId, totalEventsJoined,
      });
    }

    const [registration] = await db.insert(eventRegistrationsTable).values({
      eventId, participantId: participant.id,
      staffName: staffName ?? null,
      staffId: staffId ?? null,
      phone: phone ?? null,
      email: email ?? null,
      notes: notes ?? null,
      tags: tags ?? null,
    }).returning();

    res.status(201).json({
      success: true,
      participantId: participant.id,
      registrationId: registration.id,
      isNewParticipant,
      totalEventsJoined: totalEventsJoined + 1,
      message: isNewParticipant
        ? "Peserta baru berhasil didaftarkan"
        : `Peserta berhasil didaftarkan. Total event: ${totalEventsJoined + 1}`,
    });
  } catch (err) {
    req.log.error({ err }, "Error registering KTP");
    res.status(400).json({ error: "Data tidak valid" });
  }
});

export default router;
