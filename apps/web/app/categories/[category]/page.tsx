import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DiscoveryLanding } from "../../components/DiscoveryLanding";
import {
  resolveTaxonomyByRouteValue,
  taxonomySlug,
} from "../../../lib/discoveryRoutes";
import {
  createPublicSupabaseClient,
  fetchPublicTaxonomies,
  fetchPublicDiscovery,
  fetchCategorySupplements,
} from "../../../lib/publicDiscovery";
import { categoryPageCopy } from "../../../lib/categoryContent";

export const dynamic = "force-dynamic";

const resolveCategory = cache(async (value: string) => {
  const client = createPublicSupabaseClient();
  const taxonomies = await fetchPublicTaxonomies(client);
  return {
    client,
    taxonomies,
    category: resolveTaxonomyByRouteValue(taxonomies.categories, value),
  };
});

export async function generateMetadata({
  params,
}: {
  params: { category: string };
}): Promise<Metadata> {
  const { category } = await resolveCategory(params.category);
  if (!category) return { title: "분야를 찾을 수 없습니다" };
  const canonical = `/categories/${taxonomySlug(category, "CAT")}`;
  const { title, description } = categoryPageCopy(category);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title: `${title} | PosterLink`, description, url: canonical },
  };
}

export default async function CategoryLandingPage({
  params,
}: {
  params: { category: string };
}) {
  const { client, taxonomies, category } = await resolveCategory(
    params.category,
  );
  if (!category) notFound();
  const canonical = `/categories/${taxonomySlug(category, "CAT")}`;
  const [discovery, supplements] = await Promise.all([
    fetchPublicDiscovery(
      { category: category.id, limit: 48 },
      client,
      taxonomies,
    ),
    fetchCategorySupplements(category, client),
  ]);
  return (
    <DiscoveryLanding
      eyebrow="Category"
      title={`${category.name} 공공 공고`}
      description={categoryPageCopy(category).description}
      filters={{ category: category.id }}
      canonicalPath={canonical}
      initialDiscovery={discovery}
      categorySupplements={supplements}
    />
  );
}
