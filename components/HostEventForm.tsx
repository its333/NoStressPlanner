'use client';
import { useState, type FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

type NameRow = {
  label: string;
  slug: string;
};

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export default function HostEventForm() {
  const router = useRouter();
  const { data: session } = useSession();
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10);
  const defaultDeadline = new Date(now.getTime() + 1000 * 60 * 60 * 24);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(defaultStart.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(defaultEnd.toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState(defaultDeadline.toISOString().slice(0, 16));
  const [quorum, setQuorum] = useState(2);
  const [requireLogin, setRequireLogin] = useState(false);
  const [names, setNames] = useState<NameRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize names with host's name first, then default names
  useEffect(() => {
    const hostName = session?.user?.name || 'Host';
    const hostSlug = slugify(hostName, 'host');
    
    setNames([
      { label: hostName, slug: hostSlug },
      { label: 'Alex', slug: 'alex' },
      { label: 'Bailey', slug: 'bailey' },
      { label: 'Casey', slug: 'casey' },
    ]);
  }, [session]);

  function updateName(index: number, next: Partial<NameRow>) {
    setNames((current) => {
      const copy = [...current];
      copy[index] = { ...copy[index], ...next };
      return copy;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        title,
        description: description.trim() || undefined,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        voteDeadline: new Date(deadline).toISOString(),
        quorum,
        requireLoginToAttend: requireLogin,
        attendeeNames: names.map((name, index) => ({
          label: name.label.trim(),
          slug: slugify(name.slug, `guest-${index + 1}`),
        })),
      };

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const details = data?.error?.formErrors?.join(', ') ?? data?.error?.[0] ?? data?.error;
        throw new Error(details || 'Failed to create event');
      }

      const payload = await res.json();
      router.push(`/e/${payload.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label className="label" htmlFor="title">
          Event title
        </label>
        <input
          id="title"
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <label className="label" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          className="input min-h-[120px]"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-2">
          <label className="label" htmlFor="startDate">
            Start date
          </label>
          <input
            id="startDate"
            type="date"
            className="input"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <label className="label" htmlFor="endDate">
            End date
          </label>
          <input
            id="endDate"
            type="date"
            className="input"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <label className="label" htmlFor="deadline">
            Vote deadline
          </label>
          <input
            id="deadline"
            type="datetime-local"
            className="input"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="label" htmlFor="quorum">
            Quorum (number of "I'm in" votes needed)
          </label>
          <input
            id="quorum"
            type="number"
            min={1}
            max={20}
            className="input"
            value={quorum}
            onChange={(event) => setQuorum(Number(event.target.value))}
            required
          />
        </div>
        <label className="mt-6 inline-flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={requireLogin}
            onChange={(event) => setRequireLogin(event.target.checked)}
            className="h-4 w-4"
          />
          Require Discord login to attend
        </label>
      </div>
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Invite list</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              setNames((current) => [
                ...current,
                { label: `Guest ${current.length + 1}`, slug: `guest-${current.length + 1}` },
              ])
            }
          >
            Add name
          </button>
        </div>
        <div className="grid gap-3">
          {names.map((name, index) => (
            <div key={index} className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="label">Display name</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={name.label}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateName(index, {
                        label: value,
                        slug: slugify(value, `guest-${index + 1}`),
                      });
                    }}
                    required
                  />
                  {names.length > 1 && index > 0 && (
                    <button
                      type="button"
                      className="btn text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => setNames(current => current.filter((_, i) => i !== index))}
                      aria-label={`Remove ${name.label}`}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                  {index === 0 && (
                    <span className="text-xs text-slate-500 px-2 py-1 bg-slate-100 rounded">
                      Host
                    </span>
                  )}
                </div>
              </div>
              <div className="grid gap-2">
                <label className="label">Slug (for join card)</label>
                <input
                  className="input"
                  value={name.slug}
                  onChange={(event) => updateName(index, { slug: slugify(event.target.value, `guest-${index + 1}`) })}
                  required
                />
              </div>
            </div>
          ))}
        </div>
      </section>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create event'}
        </button>
      </div>
    </form>
  );
}
