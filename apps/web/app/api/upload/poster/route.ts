import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

// 10MB 허용 (base64 인코딩 고려)
export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { imageBase64 } = body;
  if (!imageBase64) return NextResponse.json({ error: "No image" }, { status: 400 });

  const buffer = Buffer.from(imageBase64, "base64");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const fileName = `${Date.now()}_cropped.jpg`;
  const filePath = `${user.id}/${fileName}`;

  const { error } = await admin.storage
    .from("poster-originals")
    .upload(filePath, buffer, { contentType: "image/jpeg" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from("poster-originals").getPublicUrl(filePath);

  return NextResponse.json({ publicUrl });
}
