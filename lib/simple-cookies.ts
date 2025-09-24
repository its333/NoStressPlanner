/**
 * Simple cookie system that tracks which person an anonymous user selected.
 * This allows them to see that person's progress from the database.
 */

import { cookies } from 'next/headers';

export async function getSelectedPerson(
  eventId: string
): Promise<string | null> {
  try {
    console.log(
      '🍪 Getting selected person cookie for event:',
      eventId.substring(0, 8)
    );

    const cookieStore = await cookies();

    // Use a simple cookie name without browser hash for now
    const cookieName = `selected-person-${eventId.substring(0, 8)}`;
    const selectedPerson = cookieStore.get(cookieName)?.value || null;

    console.log('🍪 Get selected person cookie result:', {
      eventId: eventId.substring(0, 8),
      cookieName,
      selectedPerson,
      allCookies: cookieStore.getAll().map(c => c.name),
    });

    return selectedPerson;
  } catch (error) {
    console.error('🍪 Failed to get cookie:', error);
    return null;
  }
}

export async function setSelectedPerson(
  eventId: string,
  personSlug: string
): Promise<void> {
  try {
    console.log('🍪 Setting selected person cookie:', {
      eventId: eventId.substring(0, 8),
      personSlug,
    });

    const cookieStore = await cookies();

    // Use a simple cookie name without browser hash for now
    const cookieName = `selected-person-${eventId.substring(0, 8)}`;

    cookieStore.set(cookieName, personSlug, {
      httpOnly: false, // Allow client-side access for UX
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
      // Don't set domain in development to avoid issues
    });

    console.log('🍪 Cookie set successfully:', { cookieName, personSlug });
  } catch (error) {
    console.error('🍪 Failed to set cookie:', error);
  }
}

export async function clearSelectedPerson(eventId: string): Promise<void> {
  const cookieStore = await cookies();
  const cookieName = `selected-person-${eventId.substring(0, 8)}`;

  cookieStore.delete(cookieName);
  console.log(
    '🍪 Cleared selected person cookie for event:',
    eventId.substring(0, 8)
  );
}

// Legacy functions for backward compatibility (can be removed later)
export async function getPreferredName(
  eventId: string
): Promise<string | null> {
  return getSelectedPerson(eventId);
}

export async function setPreferredName(
  eventId: string,
  nameSlug: string
): Promise<void> {
  return setSelectedPerson(eventId, nameSlug);
}

export async function clearPreferredName(eventId: string): Promise<void> {
  return clearSelectedPerson(eventId);
}
