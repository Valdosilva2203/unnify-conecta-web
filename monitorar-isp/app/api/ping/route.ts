import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { address, port } = await req.json();

    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    const url = `http://${address}:${port || 80}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return NextResponse.json({ online: true });
    } catch (err) {
      return NextResponse.json({ online: false });
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
