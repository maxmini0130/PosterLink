import Link from "next/link";
import type { CategorySupplement } from "../../lib/publicDiscovery";
import { PosterCard } from "./PosterCard";

export type CategorySupplements = {
  closed: CategorySupplement;
  information: CategorySupplement;
};

export function CategorySupplementalSections({
  supplements,
  searchPath,
}: {
  supplements: CategorySupplements;
  searchPath: string;
}) {
  const sections = [
    {
      key: "information",
      title: "공개 정보·안내",
      description:
        "모집 기간이 없는 일반 정보 안내입니다. 이용 내용은 공식 원문을 확인하세요.",
      contentState: "information",
      data: supplements.information,
    },
    {
      key: "closed",
      title: "마감된 공개 공고",
      description:
        "모집이 종료된 공고입니다. 현재 모집 중인 공고와 구분하여 참고하세요.",
      contentState: "closed",
      data: supplements.closed,
    },
  ] as const;
  const archivePath = `${searchPath}${searchPath.includes("?") ? "&" : "?"}closed=include`;
  return (
    <>
      {sections
        .filter((section) => section.data.totalCount > 0)
        .map((section) => (
          <section
            key={section.key}
            id={`category-${section.key}`}
            aria-labelledby={`category-${section.key}-title`}
            className="border-t border-slate-200 py-8"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id={`category-${section.key}-title`}
                  className="text-xl font-black text-slate-950"
                >
                  {section.title}{" "}
                  <span className="text-slate-500">
                    {section.data.totalCount.toLocaleString()}건
                  </span>
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {section.description}
                </p>
              </div>
              <Link
                href={archivePath}
                className="text-sm font-bold text-blue-700"
              >
                마감 포함 전체 검색
              </Link>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
              {section.data.posters.map((poster) => (
                <PosterCard
                  source="list"
                  key={poster.id}
                  poster={{
                    id: poster.id,
                    title: poster.title,
                    org: poster.source_org_name || undefined,
                    applicationStartAt: poster.application_start_at,
                    deadline: poster.application_end_at || undefined,
                    deadlineType: poster.deadline_type,
                    eventEndAt: poster.event_end_at,
                    tags: [poster.categoryName, poster.regionName].filter(
                      (value): value is string => Boolean(value),
                    ),
                    image: poster.thumbnail_url || undefined,
                    images: poster.images,
                    sourceUrl: poster.source_key || undefined,
                    contentState: section.contentState,
                  }}
                />
              ))}
            </div>
          </section>
        ))}
    </>
  );
}
