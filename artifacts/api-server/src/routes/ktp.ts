import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable, eventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { ScanKtpBody, RegisterKtpBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

router.post("/scan", requireAuth, async (req, res) => {
  try {
    const body = ScanKtpBody.parse(req.body);
    const { imageBase64 } = body;

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
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let ktpData: Record<string, string | null> = {};

    try {
      const cleaned = content.replace(/```json\n?|```/g, "").trim();
      ktpData = JSON.parse(cleaned);
    } catch {
      req.log.warn({ content }, "Failed to parse KTP extraction response");
    }

    res.json(ktpData);
  } catch (err) {
    req.log.error({ err }, "Error scanning KTP");
    res.status(500).json({ error: "Failed to scan KTP" });
  }
});

router.post("/register", requireAuth, async (req, res) => {
  try {
    const body = RegisterKtpBody.parse(req.body);
    const { eventId, nik, fullName, ...rest } = body;

    let participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });

    const isNewParticipant = !participant;

    if (!participant) {
      const [newParticipant] = await db
        .insert(participantsTable)
        .values({ nik, fullName, ...rest })
        .returning();
      participant = newParticipant;
    } else {
      await db
        .update(participantsTable)
        .set({ fullName, ...rest, updatedAt: new Date() })
        .where(eq(participantsTable.id, participant.id));
    }

    const existing = await db.query.eventRegistrationsTable.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.eventId, eventId), eq(t.participantId, participant!.id)),
    });

    const totalEventsJoined = await db.$count(
      eventRegistrationsTable,
      eq(eventRegistrationsTable.participantId, participant.id)
    );

    if (existing) {
      return res.status(409).json({
        error: "Participant already registered for this event",
        nik,
        eventId,
        totalEventsJoined,
      });
    }

    const [registration] = await db
      .insert(eventRegistrationsTable)
      .values({ eventId, participantId: participant.id })
      .returning();

    const newTotal = totalEventsJoined + 1;

    res.status(201).json({
      success: true,
      participantId: participant.id,
      registrationId: registration.id,
      isNewParticipant,
      totalEventsJoined: newTotal,
      message: isNewParticipant
        ? `Peserta baru berhasil didaftarkan ke event ini`
        : `Peserta berhasil didaftarkan. Total event diikuti: ${newTotal}`,
    });
  } catch (err) {
    req.log.error({ err }, "Error registering KTP");
    res.status(400).json({ error: "Invalid data" });
  }
});

export default router;
