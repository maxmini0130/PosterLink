import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

const POSTER_IMAGE_BUCKET = process.env.POSTER_IMAGE_BUCKET?.trim() || "poster-originals";

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

function storagePathFromValue(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;

  try {
    const url = new URL(trimmed);
    const publicMarker = `/storage/v1/object/public/${POSTER_IMAGE_BUCKET}/`;
    const signedMarker = `/storage/v1/object/sign/${POSTER_IMAGE_BUCKET}/`;
    const marker = url.pathname.includes(publicMarker) ? publicMarker : signedMarker;
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) return null;
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return trimmed.replace(/^\/+/, "") || null;
  }
}

async function requirePosterDeleteAccess(posterId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };

  const [{ data: poster, error: posterError }, { data: profile }] = await Promise.all([
    supabase.from("posters").select("id, created_by").eq("id", posterId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  if (posterError) return { error: posterError.message, status: 500 as const };
  if (!poster) return { error: "Poster not found", status: 404 as const };

  const role = profile?.role;
  const canDelete = poster.created_by === user.id || role === "admin" || role === "super_admin";
  if (!canDelete) return { error: "Forbidden", status: 403 as const };

  return { user };
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const posterId = params.id;
  const access = await requirePosterDeleteAccess(posterId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const requiredStatus = req.nextUrl.searchParams.get("status");
  const admin = adminClient();

  const { data: poster, error: posterError } = await admin
    .from("posters")
    .select("id, poster_status, thumbnail_url, poster_images(storage_path)")
    .eq("id", posterId)
    .maybeSingle();

  if (posterError) return NextResponse.json({ error: posterError.message }, { status: 500 });
  if (!poster) return NextResponse.json({ error: "Poster not found" }, { status: 404 });
  if (requiredStatus && poster.poster_status !== requiredStatus) {
    return NextResponse.json({ error: `Poster status must be ${requiredStatus}` }, { status: 409 });
  }

  const imageValues = [
    poster.thumbnail_url,
    ...((poster.poster_images ?? []) as { storage_path: string | null }[]).map((image) => image.storage_path),
  ];
  const storagePaths = [...new Set(imageValues.map(storagePathFromValue).filter((path): path is string => Boolean(path)))];

  if (storagePaths.length > 0) {
    const { error: removeError } = await admin.storage.from(POSTER_IMAGE_BUCKET).remove(storagePaths);
    if (removeError) {
      return NextResponse.json({ error: removeError.message }, { status: 500 });
    }
  }

  let deleteQuery = admin.from("posters").delete().eq("id", posterId);
  if (requiredStatus) deleteQuery = deleteQuery.eq("poster_status", requiredStatus);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ deleted: true, deletedStorageObjects: storagePaths.length });
}
