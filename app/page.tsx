import { format } from 'date-fns';
import Link from 'next/link';

import DeleteAllEventsButton from '@/components/DeleteAllEventsButton';
import { auth } from '@/lib/auth';
import { getUserEvents, type UserEventSummary } from '@/lib/user-events';

import MarketingPage from './(marketing)/page';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Get the actual session from NextAuth
  // This ensures proper authentication state detection
  const session = await auth();
  const userId = session?.user?.id || null;

  if (!userId) {
    return <MarketingPage />;
  }

  const { hosting, attending } = await getUserEvents(userId);
  const hasEvents = hosting.length > 0 || attending.length > 0;

  return (
    <>
      <section className='container-page grid gap-6'>
        <header className='grid gap-1'>
          <p className='text-sm text-slate-500'>
            Welcome back,{' '}
            <span className='font-semibold text-slate-700'>
              {session?.user?.name}
            </span>
          </p>
          <h1 className='text-2xl font-semibold text-slate-900'>
            {hasEvents ? 'Your upcoming plans' : 'You have no events yet'}
          </h1>
          {!hasEvents && (
            <p className='text-sm text-slate-600'>
              Host a new event or join one from an invite link to see it here.
            </p>
          )}
        </header>

        {hosting.length > 0 && (
          <section className='grid gap-3'>
            <div className='flex items-center justify-between'>
              <h2 className='text-sm font-semibold text-slate-700'>Hosting</h2>
              <DeleteAllEventsButton eventCount={hosting.length} />
            </div>
            <EventGrid
              items={hosting}
              emptyLabel='You are not hosting any events yet.'
            />
          </section>
        )}

        {attending.length > 0 && (
          <section className='grid gap-3'>
            <h2 className='text-sm font-semibold text-slate-700'>Attending</h2>
            <EventGrid
              items={attending}
              emptyLabel='You have not joined any events yet.'
            />
          </section>
        )}

        {!hasEvents && (
          <div className='flex flex-wrap gap-3'>
            <Link href='/host' className='btn-primary'>
              Host an event
            </Link>
            <Link href='/attend' className='btn'>
              Enter an invite code
            </Link>
          </div>
        )}
      </section>

      <MarketingPage />
    </>
  );
}

function EventGrid({
  items,
  emptyLabel,
}: {
  items: UserEventSummary[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className='text-sm text-slate-500'>{emptyLabel}</p>;
  }

  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {items.map(event => {
        const dateRange = describeRange(event.startDate, event.endDate);
        const phaseLabel = event.finalDate
          ? `Final date ${format(event.finalDate, 'PPP')}`
          : (phaseDescription[event.phase] ?? event.phase);

        return (
          <Link
            key={event.id}
            href={`/e/${event.token}`}
            className='rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-200 hover:shadow-card'
          >
            <h3 className='text-base font-semibold text-slate-900'>
              {event.title}
            </h3>
            <p className='mt-1 text-sm text-slate-600'>{dateRange}</p>
            <p className='mt-3 text-xs font-medium uppercase tracking-wide text-slate-500'>
              {phaseLabel}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

const phaseDescription: Record<string, string> = {
  VOTE: 'Collecting votes',
  PICK_DAYS: 'Blocking availability',
  FINALIZED: 'Event finalized',
  FAILED: 'Voting failed',
};

function describeRange(start: Date, end: Date) {
  const sameDay =
    start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
  if (sameDay) {
    return format(start, 'PPP');
  }
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
}
