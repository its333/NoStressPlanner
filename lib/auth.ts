// lib/auth.ts
// NextAuth configuration with proper session cookies
import NextAuth, { type Session } from 'next-auth';
import Discord from 'next-auth/providers/discord';

const nextAuth = NextAuth({
  // Remove PrismaAdapter for JWT strategy - they are incompatible
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt', // Switch back to JWT for better client-side compatibility
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true, // SECURITY: Prevent XSS attacks by keeping token server-side only
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        // Remove domain setting - let browser handle it automatically
      },
    },
    callbackUrl: {
      name: 'next-auth.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  pages: {
    signIn: '/host',
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // If coming from host page, redirect back to host
      if (url.includes('/host') || url.includes('callbackUrl=/host')) {
        return `${baseUrl}/host`;
      }

      // Otherwise, redirect to home page
      return `${baseUrl}/`;
    },
    async jwt({ token, user, account }) {
      console.log('🔍 JWT Callback:', {
        hasToken: !!token,
        hasUser: !!user,
        userId: user?.id,
        userName: user?.name,
        tokenKeys: token ? Object.keys(token) : [],
      });

      // Initial sign in
      if (account && user) {
        console.log('🔍 JWT Initial Sign In:', {
          userId: user.id,
          userName: user.name,
          provider: account.provider,
        });
        return {
          ...token,
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          discordId: user.id, // Use user.id as discordId for Discord provider
          emailVerified: new Date(), // Set email as verified for Discord
        };
      }

      return token;
    },
    async session({ session, token }) {
      console.log('🔍 Session Callback:', {
        hasSession: !!session,
        hasToken: !!token,
        userId: token?.id,
        userName: token?.name,
        tokenKeys: token ? Object.keys(token) : [],
      });

      try {
        if (token) {
          session.user = {
            id: token.id as string,
            name: token.name as string,
            email: token.email as string,
            image: token.image as string,
            discordId: token.discordId as string,
            emailVerified: token.emailVerified as Date,
          };
          console.log('🔍 Session Created:', {
            userId: session.user.id,
            name: session.user.name,
            sessionKeys: Object.keys(session),
          });
        } else {
          console.log('🔍 Session Callback: No token provided');
        }
        return session;
      } catch (error) {
        console.error('🔍 Session Callback Error:', error);
        throw error;
      }
    },
    async signIn({ user, account }) {
      console.log('🔍 SignIn Callback:', {
        userId: user.id,
        userName: user.name,
        provider: account?.provider,
      });
      return true;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      console.log('🔍 SignIn Event:', {
        userId: user.id,
        userName: user.name,
        provider: account?.provider,
        isNewUser,
      });
    },
    async session({ session, token }) {
      console.log('🔍 Session Event:', {
        hasSession: !!session,
        hasToken: !!token,
        userId: session?.user?.id,
      });
    },
  },
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
});

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
} = nextAuth;

const baseAuth = nextAuth.auth;

const TEST_BYPASS_ENABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.TEST_AUTH_BYPASS === 'true';

export const auth: typeof baseAuth = async (...args) => {
  if (TEST_BYPASS_ENABLED) {
    console.warn(
      'TEST_AUTH_BYPASS enabled - returning mock session for testing purposes'
    );
    const userId = process.env.TEST_AUTH_USER_ID ?? 'test-user';
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const session: Session = {
      user: {
        id: userId,
        name: process.env.TEST_AUTH_USER_NAME ?? 'Test User',
        email: process.env.TEST_AUTH_USER_EMAIL ?? `${userId}@example.com`,
        image: process.env.TEST_AUTH_USER_IMAGE ?? null,
        discordId: process.env.TEST_AUTH_DISCORD_ID ?? userId,
        emailVerified: new Date(now),
      },
      expires: new Date(now + thirtyDaysMs).toISOString(),
    };

    return session;
  }

  return baseAuth(...args);
};
