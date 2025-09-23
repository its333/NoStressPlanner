import HostEventForm from '@/components/HostEventForm';
import LoginPrompt from '@/components/LoginPrompt';
import { auth } from '@/lib/auth';

export default async function HostPage() {
  // Get the actual session from NextAuth
  // This ensures proper authentication state detection
  const session = await auth();

  return (
    <main className="container-page grid gap-6">
      <section className="grid gap-2">
        <h1 className="text-3xl font-bold text-slate-900">Host an event</h1>
        <p className="text-sm text-slate-600">
          Define the range, pick your invite list, and let No Stress Planner handle quorum, day blocks, and the final
          decision.
        </p>
      </section>
      {session ? (
        <HostEventForm />
      ) : (
        <LoginPrompt message="Log in with Discord to create and manage events." />
      )}
    </main>
  );
}