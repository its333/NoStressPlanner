'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinTokenForm() {
  const [token, setToken] = useState('');
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) return;
    router.push(`/e/${token.trim()}`);
  }

  return (
    <form className="card grid gap-3" onSubmit={handleSubmit}>
      <label className="label" htmlFor="token">
        Invite token
      </label>
      <input
        id="token"
        className="input"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="Enter the invite token from your host"
        required
      />
      <button type="submit" className="btn-primary w-full">
        Go to event
      </button>
    </form>
  );
}
