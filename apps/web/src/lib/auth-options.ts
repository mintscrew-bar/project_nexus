// apps/web/src/lib/auth-options.ts
import { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import DiscordProvider from "next-auth/providers/discord";
import CredentialsProvider from "next-auth/providers/credentials";
import { JWT } from "next-auth/jwt";

// Extend JWT type to include custom properties
interface BackendTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface ExtendedJWT extends JWT {
  backendTokens?: BackendTokens;
  user?: any;
}

declare module "next-auth" {
  interface Session {
    backendTokens?: BackendTokens;
  }
  interface User {
    backendTokens?: BackendTokens;
    user?: any;
  }
}

async function refreshToken(token: ExtendedJWT): Promise<ExtendedJWT> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      authorization: `Refresh ${token.backendTokens?.refreshToken}`,
    },
  });

  const response = await res.json();

  return {
    ...token,
    backendTokens: response,
  };
}

export const authOptions: AuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing credentials");
        }

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          },
        );

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Failed to login");
        }

        const user = await res.json();

        if (user) {
          return user;
        } else {
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account }): Promise<ExtendedJWT> {
      const extToken = token as ExtendedJWT;
      if (account && user) {
        // This is the first login
        return {
          ...extToken,
          backendTokens: user.backendTokens,
          user: user.user,
        };
      }

      // access token has not expired
      if (extToken.backendTokens?.expiresIn && extToken.backendTokens.expiresIn > Date.now()) {
        return extToken;
      }

      // access token has expired
      return await refreshToken(extToken);
    },
    async session({ session, token }) {
      const extToken = token as ExtendedJWT;
      session.user = extToken.user;
      session.backendTokens = extToken.backendTokens;
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
