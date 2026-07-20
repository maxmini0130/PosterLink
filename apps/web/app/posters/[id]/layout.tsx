import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolvePosterImageUrl } from "../../../lib/posterImage";

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
      { cookies: { get: (name) => cookieStore.get(name)?.value } }
    );

    const { data: poster } = await supabase
      .from("posters")
      .select("title, source_org_name, summary_short, thumbnail_url, source_key")
      .eq("id", params.id)
      .single();

    if (!poster) return {};

    const title = poster.source_org_name ? `${poster.title} - ${poster.source_org_name}` : poster.title;
    const description =
      poster.summary_short ||
      `${poster.source_org_name ?? "공공기관"} 공고의 신청 기간, 대상, 요약과 공식 링크를 PosterLink에서 확인하세요.`;
    const image = resolvePosterImageUrl(poster.thumbnail_url, poster.source_key);

    return {
      title,
      description,
      alternates: {
        canonical: `/posters/${params.id}`,
      },
      openGraph: {
        title,
        description,
        url: `/posters/${params.id}`,
        ...(image ? { images: [{ url: image, width: 800, height: 1067, alt: title }] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch {
    return {};
  }
}

export default function PosterDetailLayout({ children }: Props) {
  return <>{children}</>;
}
