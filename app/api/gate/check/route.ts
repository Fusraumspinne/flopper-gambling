import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    if (password === process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ success: true, role: 'admin' });
    }

    if (password === process.env.SITE_PASSWORD) {
      return NextResponse.json({ success: true, role: 'user' });
    }

    return NextResponse.json({ success: false }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
