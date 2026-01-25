import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const access = cookieStore.get("site_access");

  if (access?.value === "true") {
    return NextResponse.json({ authorized: true });
  }

  return NextResponse.json({ authorized: false }, { status: 401 });
}
