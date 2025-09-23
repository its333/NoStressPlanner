export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createEventSchema } from '@/lib/validators';
import { toUtcDate } from '@/lib/time';
import { randomBytes } from 'crypto';
import { handleNextApiError, ValidationError, UnauthorizedError } from '@/lib/error-handling';
import { rateLimiters } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

async function createInviteToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = randomBytes(6).toString('base64url');
    const existing = await prisma.inviteToken.findUnique({ where: { token } });
    if (!existing) return token;
  }
  throw new Error('Unable to generate unique invite token');
}

export const POST = rateLimiters.eventCreation(async (req: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError('Login required to create events');
    }

    logger.auth('Event creation attempt', { userId: session.user.id });

    const json = await req.json().catch(() => null);
    if (!json) {
      throw new ValidationError('Invalid JSON payload');
    }

    const parsed = createEventSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('Invalid event data', parsed.error.flatten());
    }

  const { title, description, startDate, endDate, voteDeadline, quorum, requireLoginToAttend, attendeeNames } = parsed.data;

  const eventStart = toUtcDate(startDate);
  const eventEnd = toUtcDate(endDate);
  const deadline = new Date(voteDeadline);

  const token = await createInviteToken();

  const result = await prisma.$transaction(async (tx) => {
    // First, check if user exists by ID
    let user = await tx.user.findUnique({
      where: { id: session.user!.id }
    });

    if (!user) {
      // Check for conflicts with email and discordId
      const existingUserWithEmail = await tx.user.findUnique({
        where: { email: session.user!.email || undefined }
      });
      
      const existingUserWithDiscordId = await tx.user.findUnique({
        where: { discordId: session.user!.discordId || undefined }
      });

      // Create user data object, omitting conflicting fields
      const userData: any = {
        id: session.user!.id,
        name: session.user!.name,
        image: session.user!.image,
      };

      // Only add email if no conflict
      if (!existingUserWithEmail && session.user!.email) {
        userData.email = session.user!.email;
      }

      // Only add discordId if no conflict
      if (!existingUserWithDiscordId && session.user!.discordId) {
        userData.discordId = session.user!.discordId;
      }

      user = await tx.user.create({
        data: userData
      });
    } else {
      // User exists, check for conflicts before updating
      const existingUserWithEmail = await tx.user.findUnique({
        where: { email: session.user!.email || undefined }
      });
      
      const existingUserWithDiscordId = await tx.user.findUnique({
        where: { discordId: session.user!.discordId || undefined }
      });

      // Create update data object, omitting conflicting fields
      const updateData: any = {
        name: session.user!.name,
        image: session.user!.image,
      };

      // Only update email if no conflict and user doesn't have email yet
      if (!existingUserWithEmail && session.user!.email && !user.email) {
        updateData.email = session.user!.email;
      }

      // Only update discordId if no conflict and user doesn't have discordId yet
      if (!existingUserWithDiscordId && session.user!.discordId && !user.discordId) {
        updateData.discordId = session.user!.discordId;
      }

      user = await tx.user.update({
        where: { id: session.user!.id },
        data: updateData
      });
    }

    const event = await tx.event.create({
      data: {
        title,
        description: description ?? null,
        startDate: eventStart,
        endDate: eventEnd,
        voteDeadline: deadline,
        quorum,
        requireLoginToAttend: Boolean(requireLoginToAttend),
        hostId: user.id,
      },
    });

    await tx.attendeeName.createMany({
      data: attendeeNames.map((name) => ({
        eventId: event.id,
        label: name.label,
        slug: name.slug,
      })),
    });

    await tx.inviteToken.create({
      data: {
        eventId: event.id,
        token,
      },
    });

    return event;
  });

    logger.api('Event created successfully', { 
      eventId: result.id, 
      userId: session.user.id,
      title: result.title 
    });

    return NextResponse.json({
      ok: true,
      eventId: result.id,
      token,
    });

  } catch (error) {
    const { status, body } = handleNextApiError(error as Error, req);
    return NextResponse.json(body, { status });
  }
});
