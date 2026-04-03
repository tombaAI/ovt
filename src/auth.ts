import { eq, and } from "drizzle-orm";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { adminUsers } from "@/db/schema";
import { getDb } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [Google],
    session: { strategy: "jwt" },
    callbacks: {
        async signIn({ user }) {
            if (!user.email) return false;
            try {
                const db = getDb();
                const [admin] = await db
                    .select({ id: adminUsers.id })
                    .from(adminUsers)
                    .where(and(eq(adminUsers.email, user.email), eq(adminUsers.isActive, true)))
                    .limit(1);
                return Boolean(admin);
            } catch {
                return false;
            }
        }
    },
    pages: {
        signIn: "/login",
        error: "/login"
    }
});
