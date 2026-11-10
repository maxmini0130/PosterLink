type PublicLink = {
  id: string;
  url: string;
  link_type: string | null;
  is_primary: boolean | null;
  title?: string | null;
};

export function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function isInstitutionHomepage(value: string) {
  try {
    return (
      new URL(value).pathname.replace(/\/+$/, "") === "" &&
      !new URL(value).search
    );
  } catch {
    return false;
  }
}

/** Never label a bare institution homepage or an arbitrary reference as a form. */
export function resolvePosterActionLinks<T extends PublicLink>(
  links: T[],
  sourceUrl?: string | null,
  closed = false,
) {
  const valid = links.filter((link) => isPublicHttpUrl(link.url));
  const applications = valid.filter(
    (link) =>
      link.link_type === "official_apply" && !isInstitutionHomepage(link.url),
  );
  const application =
    applications.find((link) => link.is_primary) ?? applications[0] ?? null;
  const official =
    valid.find((link) => link.link_type === "official_notice") ??
    (sourceUrl && isPublicHttpUrl(sourceUrl)
      ? {
          id: "source-notice",
          url: sourceUrl,
          link_type: "official_notice",
          is_primary: false,
        }
      : null);
  const primary = closed ? official : (application ?? official);
  const references = valid.filter(
    (link) =>
      link.url !== primary?.url &&
      link.link_type !== "official_apply" &&
      link.link_type !== "official_homepage",
  );
  return {
    application,
    official,
    primary,
    references,
    label: !closed && application ? "신청 페이지로 이동" : "공식 공고 보기",
  };
}
