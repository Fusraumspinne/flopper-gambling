import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const pathname = req.nextUrl.pathname;

    if (pathname.startsWith("/admin")) {
      return NextResponse.next();
    }

    const isVerified = (req.nextauth.token as any)?.verified === true;
    if (!isVerified && pathname !== "/not-verified") {
      const url = new URL("/not-verified", req.url);
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/login",
    },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    secret: process.env.NEXTAUTH_SECRET,
  }
);

export const config = {
  matcher: [
    "/((?!login|signup|privacy|api|_next/static|_next/image|images|favicon.ico).*)",
  ],
};