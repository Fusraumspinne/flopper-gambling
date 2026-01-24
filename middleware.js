export { default } from "next-auth/middleware"

export const config = { matcher: ["/((?!login|signup|api|_next/static|_next/image|images|favicon.ico).*)"] }