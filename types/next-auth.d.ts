// types/next-auth.d.ts
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      discordId?: string;
      emailVerified?: Date | null;
    };
  }

  interface User {
    discordId?: string | null;
  }
}