import { NextResponse } from "next/server";
import { uploadBytes, errMsg } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "No file" }, { status: 400 });
    const url = await uploadBytes(file, file.type || "application/octet-stream", (file as File).name || "upload");
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
