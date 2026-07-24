import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

const POSTER_IMAGE_BUCKET = process.env.POSTER_IMAGE_BUCKET?.trim() || "poster-originals";
const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const MAX_BATCH_SIZE = 100;

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

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return ADMIN_ROLES.has(profile?.role) ? user : null;
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids = [...new Set(
    (Array.isArray(body?.ids) ? body.ids : [])
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id: string) => id.trim())
  )];

  if (ids.length === 0) {
    return NextResponse.json({ error: "At least one poster id is required." }, { status: 400 });
  }
  if (ids.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: `A maximum of ${MAX_BATCH_SIZE} posters can be deleted at once.` }, { status: 400 });
  }

  const admin = adminClient();
  const { data: posters, error: posterError } = await admin
    .from("posters")
    .select("id,title,source_key,poster_status,thumbnail_url,poster_images(storage_path)")
    .in("id", ids);

  if (posterError) return NextResponse.json({ error: posterError.message }, { status: 500 });
  if ((posters?.length ?? 0) !== ids.length) {
    return NextResponse.json({ error: "One or more posters were not found." }, { status: 404 });
  }

  const invalid = posters?.filter((poster) => poster.poster_status !== "rejected") ?? [];
  if (invalid.length > 0) {
    return NextResponse.json({
      error: "Only rejected posters can be permanently deleted in bulk.",
      invalidIds: invalid.map((poster) => poster.id),
    }, { status: 409 });
  }

  const storagePaths = [...new Set(
    (posters ?? []).flatMap((poster) => [
      poster.thumbnail_url,
      ...((poster.poster_images ?? []) as { storage_path: string | null }[]).map((image) => image.storage_path),
    ]).map(storagePathFromValue).filter((path): path is string => Boolean(path))
  )];

  if (storagePaths.length > 0) {
    const { error: removeError } = await admin.storage.from(POSTER_IMAGE_BUCKET).remove(storagePaths);
    if (removeError) return NextResponse.json({ error: removeError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin
    .from("posters")
    .delete()
    .in("id", ids)
    .eq("poster_status", "rejected");
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await admin.from("admin_actions").insert((posters ?? []).map((poster) => ({
    actor_user_id: user.id,
    target_type: "poster",
    target_id: poster.id,
    action_type: "delete",
    action_reason: "rejected poster permanently deleted",
    metadata_json: {
      title: poster.title,
      status: "rejected",
      source_key: poster.source_key ?? null,
      bulk: true,
    },
  })));

  return NextResponse.json({
    deleted: ids.length,
    deletedStorageObjects: storagePaths.length,
  });
}
