// Names are aliases for resolving supplied taxonomy rows, never new DB records.
export const PROVINCES = [
  ["REG_SEOUL", "서울특별시", "서울시", "서울"],
  ["REG_BUSAN", "부산광역시", "부산시", "부산"],
  ["REG_DAEGU", "대구광역시", "대구시", "대구"],
  ["REG_INCHEON", "인천광역시", "인천시", "인천"],
  ["REG_GWANGJU", "광주광역시", "광주"],
  ["REG_DAEJEON", "대전광역시", "대전시", "대전"],
  ["REG_ULSAN", "울산광역시", "울산시", "울산"],
  ["REG_SEJONG", "세종특별자치시", "세종시", "세종"],
  ["REG_GYEONGGI", "경기도", "경기"],
  ["REG_GANGWON", "강원특별자치도", "강원도", "강원"],
  ["REG_CHUNGBUK", "충청북도", "충북"],
  ["REG_CHUNGNAM", "충청남도", "충남"],
  ["REG_JEONBUK", "전북특별자치도", "전라북도", "전북"],
  ["REG_JEONNAM", "전라남도", "전남"],
  ["REG_GYEONGBUK", "경상북도", "경북"],
  ["REG_GYEONGNAM", "경상남도", "경남"],
  ["REG_JEJU", "제주특별자치도", "제주도", "제주"],
];

// These names cannot be resolved from a Seoul-only taxonomy by uniqueness.
const SHARED_NAMES = new Set([
  "중구",
  "서구",
  "동구",
  "남구",
  "북구",
  "강서구",
  "고성군",
  "광주시",
]);
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unique = (rows) => [
  ...new Map(rows.map((row) => [row.code ?? row.name, row])).values(),
];

function provinceFor(row, catalog) {
  const parent = catalog.find((item) => item.id && item.id === row.parent_id);
  return PROVINCES.find(
    ([code, ...aliases]) =>
      code === parent?.code ||
      aliases.some((alias) =>
        String(row.full_name ?? "").startsWith(`${alias} `),
      ),
  );
}

function mentions(text, catalog) {
  const rows = [];
  const pattern = new RegExp(
    PROVINCES.flatMap(([, ...names]) => names)
      .sort((a, b) => b.length - a.length)
      .map(escape)
      .join("|"),
    "g",
  );
  for (const match of text.matchAll(pattern)) {
    if (rows.some((row) => match.index >= row.index && match.index < row.end))
      continue;
    if (match.index > 0 && /[가-힣]/.test(text[match.index - 1])) continue;
    const province = PROVINCES.find(([, ...names]) => names.includes(match[0]));
    // A city/district after a province must be resolved as that child, not
    // silently broadened to the whole province when the taxonomy lacks it.
    const child = text
      .slice(match.index + match[0].length)
      .match(/^\s+([가-힣]{1,8}(?:시|군|구))(?![가-힣])/);
    const candidates = child
      ? catalog.filter(
          (row) =>
            row.name === child[1] &&
            provinceFor(row, catalog)?.[0] === province[0],
        )
      : catalog.filter((row) => row.code === province[0]);
    rows.push({
      index: match.index,
      end: match.index + match[0].length + (child?.[0].length ?? 0),
      name: child ? `${province[1]} ${child[1]}` : province[1],
      code:
        candidates.length === 1 && match[0] !== "광주"
          ? candidates[0].code
          : null,
    });
  }
  for (const name of new Set(
    catalog.filter((row) => row.level === "sigungu").map((row) => row.name),
  )) {
    for (const match of text.matchAll(new RegExp(escape(name), "g"))) {
      if (rows.some((row) => match.index >= row.index && match.index < row.end))
        continue;
      if (match.index > 0 && /[가-힣]/.test(text[match.index - 1])) continue;
      const candidates = catalog.filter(
        (row) => row.level === "sigungu" && row.name === name,
      );
      // Only an adjacent parent in this clause can disambiguate a shared name.
      const before = text.slice(0, match.index).trim();
      const parents = PROVINCES.filter(([, ...aliases]) =>
        aliases.some((alias) => before.endsWith(alias)),
      );
      const scoped =
        parents.length === 1
          ? candidates.filter(
              (row) => provinceFor(row, catalog)?.[0] === parents[0][0],
            )
          : candidates;
      rows.push({
        index: match.index,
        end: match.index + name.length,
        name,
        code:
          scoped.length === 1 &&
          (parents.length === 1 || !SHARED_NAMES.has(name))
            ? scoped[0].code
            : null,
      });
    }
  }
  return rows.sort((a, b) => a.index - b.index);
}

export function analyzeRegionContext(post, catalog) {
  const result = {
    eligibility: [],
    preference: [],
    institution: [],
    event: [],
    unresolved: [],
  };
  const texts = [
    post.title,
    post.content,
    post.summary_short,
    post.eligibility_summary,
  ].filter(Boolean);
  for (const text of texts) {
    for (const clause of String(text).split(
      /[\n;·。!?]|\.(?:\s|$)|,(?=\s*[가-힣])/,
    )) {
      const found = mentions(clause, catalog);
      for (let i = 0; i < found.length; i++) {
        const item = found[i];
        const before = clause.slice(0, item.index);
        const after = clause.slice(
          item.end,
          found[i + 1]?.index ?? clause.length,
        );
        const label =
          [
            ...before.matchAll(
              /(대상|자격|장소|행사장|개최지|교육장|주소|주최|주관|기관|소재지|우대(?:지역|대상)?|우선(?:지역|대상)?|가점)\s*[:：]/g,
            ),
          ].at(-1)?.[1] ?? "";
        const role = /^(장소|행사장|개최지|교육장|주소)$/.test(label)
          ? "event"
          : /^(주최|주관|기관|소재지)$/.test(label)
            ? "institution"
            : /우대|우선|가점/.test(after.slice(0, 55)) ||
                /우대|우선|가점/.test(label)
              ? "preference"
              : /^\s*(?:에\s*)?(?:거주|지역\s*주민|주민(?!센터)|구민(?!회관|센터)|시민|도민|민(?=$|\s)|소재\s*(?:기업|사업|소상공인)|재학|재직)/.test(
                    after,
                  )
                ? "eligibility"
                : null;
        if (!role) {
          if (found[i + 1] && /^\s*(?:또는|및|혹은|와|과|\/)\s*$/.test(after))
            result.unresolved.push({
              name: item.name,
              role: "eligibility",
              evidence: clause.trim().slice(0, 200),
              reason: "combined-scope-needs-review",
            });
          continue;
        }
        const evidence = clause.trim().slice(0, 200);
        if (/제외|불가|아닌|않는/.test(after.slice(0, 35))) {
          result.unresolved.push({
            name: item.name,
            role,
            evidence,
            reason: "negative-or-conflicting-condition",
          });
        } else if (!item.code) {
          result.unresolved.push({
            name: item.name,
            role,
            evidence,
            reason: "ambiguous-or-unregistered-region",
          });
        } else
          result[role].push({
            code: item.code,
            confidence: 0.9,
            source: "eligibility_scope",
            evidence,
            role,
          });
      }
      if (
        /전국\s*(?:거주|누구나|청년|시민|대상)|(?:대상|자격)\s*[:：]\s*전국|지역\s*제한\s*없|지역\s*무관|거주지\s*무관/.test(
          clause,
        ) &&
        !/우대|제외/.test(clause)
      ) {
        result.eligibility.push({
          code: "REG_NATION",
          confidence: 0.9,
          source: "eligibility_scope",
          role: "eligibility",
          evidence: clause.trim().slice(0, 200),
        });
      }
    }
  }
  for (const key of ["source_org_name", "site", "organizer_name"]) {
    for (const item of mentions(String(post[key] ?? ""), catalog))
      result.institution.push({
        name: item.name,
        code: item.code,
        role: "institution",
        evidence: String(post[key]).slice(0, 200),
      });
  }
  for (const item of mentions(String(post.event_location ?? ""), catalog))
    result.event.push({
      name: item.name,
      code: item.code,
      role: "event",
      evidence: String(post.event_location).slice(0, 200),
    });
  for (const role of ["eligibility", "preference", "institution", "event"])
    result[role] = unique(result[role]);
  // A conflicting/unknown mandatory scope must not leave a confident partial scope.
  if (result.unresolved.some((item) => item.role === "eligibility"))
    result.eligibility = [];
  if (result.eligibility.length > 1) {
    result.eligibility = result.eligibility.map((item) => ({
      ...item,
      ambiguous: true,
      confidence: 0.5,
    }));
  }
  return result;
}
