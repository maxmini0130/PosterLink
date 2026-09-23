export function buildNotificationLink(
  posterId: string,
  notificationType: "new_match" | "favorite_deadline",
) {
  return `/posters/${posterId}?notification_open=1&notification_type=${notificationType}`;
}

export async function recordNotificationSent(
  supabase: any,
  input: {
    posterId: string;
    posterStatus: string;
    ctaVariant: string;
    metadata?: Record<string, unknown>;
  },
) {
  const [regionLinksResult, categoryLinksResult] = await Promise.all([
    supabase
      .from("poster_regions")
      .select("regions(name,full_name,level)")
      .eq("poster_id", input.posterId)
      .limit(1),
    supabase
      .from("poster_categories")
      .select("categories(name)")
      .eq("poster_id", input.posterId)
      .limit(1),
  ]);

  const regionRelation = regionLinksResult.data?.[0]?.regions;
  const region = Array.isArray(regionRelation)
    ? regionRelation[0]
    : regionRelation;
  const categoryRelation = categoryLinksResult.data?.[0]?.categories;
  const category = Array.isArray(categoryRelation)
    ? categoryRelation[0]
    : categoryRelation;

  const { error } = await supabase.from("product_events").insert({
    event_name: "notification_sent",
    poster_id: input.posterId,
    poster_status: input.posterStatus,
    region:
      region?.level === "sigungu"
        ? region.full_name || region.name || "지역 전체"
        : region?.name || "지역 전체",
    category: category?.name || "분야 전체",
    cta_variant: input.ctaVariant,
    metadata_json: input.metadata ?? {},
  });

  if (error) console.error("Notification product event error:", error);
}
