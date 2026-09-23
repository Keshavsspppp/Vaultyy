import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/errors";

export { HttpError };

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Google sign-in is available only when OAuth client credentials are configured. */
export const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      // Accounts created through Google have no password; they must keep using Google.
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

if (googleEnabled) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Lets a user with an existing password account also sign in with Google
      // (Google verifies the email, so linking by email is safe).
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    /**
     * Sessions are JWTs (no database adapter), so on an OAuth sign-in we create or
     * link the local User row ourselves and store *our* id in the token.
     */
    async jwt({ token, user, account, profile }) {
      if (!account) return token; // subsequent requests: token already carries our id
      if (account.provider === "credentials") {
        token.id = user.id;
        return token;
      }
      const email = (profile?.email ?? user.email)?.toLowerCase();
      const verified = profile?.email_verified !== false;
      if (!email || !verified) throw new Error("Google account has no verified email");
      const dbUser = await prisma.user.upsert({
        where: { email },
        create: { email, name: user.name || profile?.name || email.split("@")[0], image: user.image ?? null },
        // Keep the local name; refresh the avatar.
        update: { image: user.image ?? undefined },
      });
      token.id = dbUser.id;
      token.name = dbUser.name;
      token.picture = dbUser.image;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
  },
});

/** Returns the current user id or throws a 401-style error for API routes. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new HttpError(401, "Unauthorized");
  return id;
}
