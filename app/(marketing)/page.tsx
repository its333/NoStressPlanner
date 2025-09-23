import Link from 'next/link';

export default function MarketingPage() {
  return (
    <main className="container-page grid gap-12">
      <section className="grid gap-6 text-center">
        <span className="badge mx-auto">Group planning, simplified</span>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Plan together without the fear of rejection
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-600">
          No Stress Planner orchestrates the awkward parts of coordinating a group activity. Collect votes, block out
          busy days, surface the first date everyone can make—or the best near-miss—and let the host lock it in.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/host" className="btn-primary">
            Create an event
          </Link>
          <Link href="/attend" className="btn">
            Enter invite code
          </Link>
        </div>
      </section>
      <section className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: 'Quorum-based votes',
            copy: 'Move to picking days automatically once enough people opt in ahead of the deadline.',
          },
          {
            title: 'Anonymous day blocks',
            copy: 'Everyone can veto conflict days without broadcasting their calendar to the group.',
          },
          {
            title: 'Realtime sync via Pusher',
            copy: 'Votes, blocks, and final picks propagate instantly—no manual refresh required.',
          },
        ].map((feature) => (
          <article key={feature.title} className="card text-left">
            <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{feature.copy}</p>
          </article>
        ))}
      </section>
    </main>
  );
}