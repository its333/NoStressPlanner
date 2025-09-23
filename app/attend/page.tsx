import JoinTokenForm from '@/components/JoinTokenForm';

export default function AttendPage() {
  return (
    <main className="container-page grid gap-6">
      <section className="grid gap-2">
        <h1 className="text-3xl font-bold text-slate-900">Join an event</h1>
        <p className="text-sm text-slate-600">
          Enter the invite token you received from the host to jump into the live planning board.
        </p>
      </section>
      <JoinTokenForm />
    </main>
  );
}
