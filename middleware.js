import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export const config = { matcher: ["/((?!login|signup|api|_next/static|_next/image|images|favicon.ico).*)"] }