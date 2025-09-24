import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Delete all events where the user is the host
    const deletedEvents = await prisma.event.deleteMany({
      where: {
        hostId: userId,
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: deletedEvents.count,
    });
  } catch (error) {
    console.error('Error deleting all events:', error);
    return NextResponse.json(
      { error: 'Failed to delete events' },
      { status: 500 }
    );
  }
}
