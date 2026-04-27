import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
    .select("title, source_org_name, summary_short, thumbnail_url")
    .eq("id", params.id)
    .single();

  if (!poster) return {};

  const title = poster.title;
  const description = poster.summary_short || `${poster.source_org_name} 공고 — PosterLink에서 확인하세요.`;
  const image = poster.thumbnail_url;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
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
