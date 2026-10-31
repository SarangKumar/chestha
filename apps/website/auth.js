import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@chestha/db';
import { provisionalHandle, verifyCredentials } from './lib/accounts.js';

/**
 * Authentication.
 *
 * Email and password today, with the seam for Google and GitHub left open:
 * adding one is a single entry in `providers` below, because the adapter and
 * its `Account` table are already here. Two things make that work:
 *
 *  - **The Prisma adapter is installed even though credentials do not use it.**
 *    It is what writes the `Account` row linking a provider identity to a
 *    user, so an OAuth provider needs no schema change. Its `createUser` is
 *    wrapped below, because `handle` is required and no provider supplies one.
 *
 *  - **Sessions are JWTs, not database rows.** NextAuth does not support
 *    database sessions with the Credentials provider, and mixing strategies
 *    per provider is not possible — so JWT is the strategy that lets both
 *    kinds of sign-in coexist. The `Session` table stays empty by design.
 *
 * There is no email verification step, by product decision. `emailVerified`
 * is therefore only ever set by an OAuth provider that vouches for the address.
 */
/**
 * The stock adapter's `createUser` writes only email, name, image and
 * `emailVerified`. `handle` is required and unique, so an OAuth sign-up would
 * fail at the insert — before any callback could redirect the user anywhere.
 * Wrapping it assigns a provisional handle and marks it unchosen, which is
 * what `signIn` below keys on to send them to /onboarding/username.
 */
function chesthaAdapter() {
  const adapter = PrismaAdapter(prisma);
  const createUser = adapter.createUser.bind(adapter);

  adapter.createUser = async (data) => {
    const handle = await provisionalHandle({ email: data.email, name: data.name });
    return createUser({ ...data, handle, displayUsername: handle, handleChosen: false });
  };

  return adapter;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: chesthaAdapter(),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/signin',
    // Without this, an error sends the user to NextAuth's own unstyled page.
    error: '/signin',
  },
  providers: [
    Credentials({
      // `credentials` drives nothing but NextAuth's own fallback form, which
      // this app replaces with /signin; the real validation is below.
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const user = await verifyCredentials({
          email: credentials?.email,
          password: credentials?.password,
        });
        // Returning null is the only failure signal: throwing would let the
        // client tell "no such account" apart from "wrong password".
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          handle: user.handle,
        };
      },
    }),

    // ── Adding Google or GitHub ──────────────────────────────────────────────
    // 1. Add the provider here, e.g.
    //      GitHub({ clientId: process.env.AUTH_GITHUB_ID,
    //               clientSecret: process.env.AUTH_GITHUB_SECRET })
    // 2. Set those two variables (see .env.example).
    // 3. Nothing else: the adapter already stores the Account link.
    //
    // The handle problem is already handled: `chesthaAdapter` assigns a
    // provisional one so the row can be created, and `signIn` below sends the
    // user to pick a real one before they get a session.
  ],
  callbacks: {
    /**
     * Sends a user who still has a provisional handle to pick their own.
     *
     * Only reachable once an OAuth provider is enabled: credentials accounts
     * set `handleChosen` at registration, because the sign-up form asks for a
     * username.
     */
    async signIn({ user, account }) {
      if (account?.provider === 'credentials') return true;
      const existing = await prisma.user.findUnique({
        where: { id: user.id },
        select: { handleChosen: true },
      });
      return existing?.handleChosen ? true : '/onboarding/username';
    },

    /**
     * The handle is put on the token so every page can link to the signed-in
     * user's own profile without a database read per request. It is re-read
     * when the client calls `update()`, which is how a username change
     * propagates.
     */
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.handle = user.handle ?? token.handle;
      }
      if (trigger === 'update' || (token.id && !token.handle)) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id },
          select: { handle: true, handleChosen: true, name: true, image: true },
        });
        if (fresh) {
          token.handle = fresh.handle;
          token.handleChosen = fresh.handleChosen;
          token.name = fresh.name;
          token.picture = fresh.image;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.handle = token.handle ?? null;
        session.user.handleChosen = token.handleChosen ?? true;
      }
      return session;
    },
  },
});
