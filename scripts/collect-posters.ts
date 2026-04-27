/**
 * PosterLink 공공데이터 수집 스크립트
 *
 * 사용법:
 *   1. .env 파일에 아래 환경변수 설정
 *   2. npx tsx scripts/collect-posters.ts [소스명]
 *      - 소스명 없으면 전체 실행
 *      - 예: npx tsx scripts/collect-posters.ts youth   (온통청년만)
 *           npx tsx scripts/collect-posters.ts bokjiro (복지로만)
 *           npx tsx scripts/collect-posters.ts subsidy (보조금24만)
 *
 * 필요 환경변수:
 *   NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   DATA_GO_KR_API_KEY=your_api_key        (data.go.kr 발급)
 *   YOUTH_CENTER_API_KEY=your_api_key      (온통청년 별도 발급)
 *
 * API 키 발급:
 *   - data.go.kr 회원가입 → 활용신청 → 마이페이지에서 인증키 확인
 *   - 온통청년: www.youthcenter.go.kr 회원가입 → 마이페이지 → Open API
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../apps/web/.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ──────────────────────────────────────────────
// 카테고리 UUID 캐시
// ──────────────────────────────────────────────
const categoryCache: Record<string, string> = {};

async function getCategoryId(code: string): Promise<string | null> {
  if (categoryCache[code]) return categoryCache[code];
  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("code", code)
    .single();
  if (data) categoryCache[code] = data.id;
  return data?.id ?? null;
}

// ──────────────────────────────────────────────
// 포스터 upsert (source_url 기준 중복 방지)
// ──────────────────────────────────────────────
async function upsertPoster(params: {
  title: string;
  source_org_name: string;
  summary_short: string;
  summary_long?: string;
  application_start_at?: string | null;
  application_end_at?: string | null;
  category_code: string;
  source_url: string;
  source_key: string; // 외부 ID (중복 방지용)
}) {
  const categoryId = await getCategoryId(params.category_code);

  // 이미 수집된 항목인지 source_key로 확인
  const { data: existing } = await supabase
    .from("posters")
    .select("id")
    .eq("source_key", params.source_key)
    .maybeSingle();

  if (existing) {
    process.stdout.write(".");
    return; // 이미 있으면 스킵
  }

  const { data: poster, error } = await supabase
    .from("posters")
    .insert({
      title: params.title.slice(0, 200),
      source_org_name: params.source_org_name,
      summary_short: params.summary_short?.slice(0, 300),
      summary_long: params.summary_long,
      application_start_at: params.application_start_at || null,
      application_end_at: params.application_end_at || null,
      poster_status: "review", // 관리자 승인 후 published
      source_key: params.source_key,
    })
    .select("id")
    .single();

  if (error || !poster) {
    console.error(`\n[ERROR] ${params.title}: ${error?.message}`);
    return;
  }

  // 카테고리 연결
  if (categoryId) {
    await supabase.from("poster_categories").insert({
      poster_id: poster.id,
      category_id: categoryId,
    });
  }

  // 공식 링크 등록
  await supabase.from("poster_links").insert({
    poster_id: poster.id,
    link_type: "official_notice",
    title: "공식 안내 페이지",
    url: params.source_url,
    is_primary: true,
  });

  process.stdout.write("+");
}

// ──────────────────────────────────────────────
// 1. 온통청년 청년정책 API
//    카테고리: 교육/취업(CAT_EDUCATION), 지원금/복지(CAT_WELFARE), 육아/가족(CAT_FAMILY)
//    API 키: 온통청년 마이페이지에서 발급
// ──────────────────────────────────────────────
async function collectYouth() {
  const apiKey = process.env.YOUTH_CENTER_API_KEY;
  if (!apiKey) {
    console.log("\n[SKIP] YOUTH_CENTER_API_KEY 미설정 — 온통청년 수집 건너뜀");
    return;
  }

  // 온통청년 정책 분류 코드 → PosterLink 카테고리 매핑
  const policyTypeMap: Record<string, string> = {
    "023010": "CAT_EDUCATION", // 일자리
    "023020": "CAT_EDUCATION", // 교육
    "023030": "CAT_WELFARE",   // 복지/문화
    "023040": "CAT_WELFARE",   // 참여/권리
    "023050": "CAT_WELFARE",   // 생활지원금
  };

  console.log("\n[온통청년] 수집 시작...");
  let page = 1;
  let total = 0;

  while (true) {
    const url = new URL("https://www.youthcenter.go.kr/go/opi/getAllPolicyList.do");
    url.searchParams.set("openApiVlak", apiKey);
    url.searchParams.set("pageIndex", String(page));
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("srchPolyBizSecd", ""); // 전체 분류

    const res = await fetch(url.toString());
    if (!res.ok) break;

    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { break; }

    const items: any[] = json?.result?.youthPolicy ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      const policyType = item.polyBizSecd ?? "";
      const categoryCode = policyTypeMap[policyType] ?? "CAT_WELFARE";

      await upsertPoster({
        title: item.polyBizSjnm ?? "제목 없음",
        source_org_name: item.cnsgNmor ?? item.polyBizSecd ?? "정부",
        summary_short: (item.polyItcnCn ?? "").slice(0, 300),
        summary_long: item.sporCn ?? undefined,
        application_start_at: parseKoreanDate(item.rqutPrdSStrt),
        application_end_at: parseKoreanDate(item.rqutPrdEnd),
        category_code: categoryCode,
        source_url: item.rfcSiteAdds1 || `https://www.youthcenter.go.kr/go/opi/getPolyInfo.do?bizId=${item.bizId}`,
        source_key: `youth_${item.bizId}`,
      });
      total++;
    }

    if (items.length < 100) break;
    page++;
  }

  console.log(`\n[온통청년] 완료 — 처리 ${total}건`);
}

// ──────────────────────────────────────────────
// 복지로 공통 파서
// ──────────────────────────────────────────────
async function collectBokjiroEndpoint(label: string, baseUrl: string, sourcePrefix: string) {
  const apiKey = process.env.DATA_GO_KR_API_KEY!;
  let page = 1;
  let total = 0;

  console.log(`\n[${label}] 수집 시작...`);

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("numOfRows", "100");
    url.searchParams.set("returnType", "json");

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.log(`\n[${label}] HTTP ${res.status} — 중단`);
      break;
    }

    let json: any;
    try { json = await res.json(); } catch { break; }

    // 두 API 모두 동일한 응답 구조 사용
    const body = json?.response?.body ?? json?.WelfarelistInqire2 ?? json?.WelfarelistInqire ?? {};
    const raw = body?.items?.item ?? body?.list ?? [];
    const items: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (items.length === 0) break;

    for (const item of items) {
      const name: string = item.servNm ?? item.servNmEn ?? "";
      const isFamily = /육아|가족|아동|출산|보육|임신|양육|돌봄/.test(name);
      const isEducation = /교육|훈련|취업|일자리|직업|장학/.test(name);
      const categoryCode = isFamily ? "CAT_FAMILY"
        : isEducation ? "CAT_EDUCATION"
        : "CAT_WELFARE";

      const servId = item.servId ?? item.servNm ?? Math.random().toString(36).slice(2);

      await upsertPoster({
        title: name || "제목 없음",
        source_org_name: item.jurMnofNm ?? item.wlfareInfoReldBjNm ?? "복지부",
        summary_short: (item.servDgist ?? item.servSumry ?? "").slice(0, 300),
        application_start_at: parseKoreanDate(item.aplyBgngDt),
        application_end_at: parseKoreanDate(item.aplyEndDt),
        category_code: categoryCode,
        source_url: item.servDetailLink
          ?? `https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${servId}`,
        source_key: `${sourcePrefix}_${servId}`,
      });
      total++;
    }

    if (items.length < 100) break;
    page++;
  }

  console.log(`\n[${label}] 완료 — 처리 ${total}건`);
}

// ──────────────────────────────────────────────
// 2. 한국사회보장정보원 — 중앙부처복지서비스
//    전국 단위 보건복지부·여성가족부 등 지원사업
// ──────────────────────────────────────────────
async function collectBokjiroCentral() {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    console.log("\n[SKIP] DATA_GO_KR_API_KEY 미설정 — 중앙부처복지서비스 건너뜀");
    return;
  }
  // ※ 정확한 오퍼레이션명은 마이페이지 > 내 오픈API > 상세보기 > 참고문서에서 확인
  await collectBokjiroEndpoint(
    "중앙부처복지서비스",
    "http://apis.data.go.kr/B554287/WelfareInfoService/WelfarelistInqire",
    "bokjiro_central"
  );
}

// ──────────────────────────────────────────────
// 3. 한국사회보장정보원 — 지자체복지서비스
//    시·군·구 단위 지역 지원사업
// ──────────────────────────────────────────────
async function collectBokjiroLocal() {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    console.log("\n[SKIP] DATA_GO_KR_API_KEY 미설정 — 지자체복지서비스 건너뜀");
    return;
  }
  // ※ 정확한 오퍼레이션명은 마이페이지 > 내 오픈API > 상세보기 > 참고문서에서 확인
  await collectBokjiroEndpoint(
    "지자체복지서비스",
    "http://apis.data.go.kr/B554287/WelfareInfoService/LocalWelfarelistInqire",
    "bokjiro_local"
  );
}

// ──────────────────────────────────────────────
// 3. 보조금24 공공서비스 API
//    카테고리: 지원금/복지(CAT_WELFARE)
//    API 키: data.go.kr에서 발급
// ──────────────────────────────────────────────
async function collectSubsidy() {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    console.log("\n[SKIP] DATA_GO_KR_API_KEY 미설정 — 보조금24 수집 건너뜀");
    return;
  }

  console.log("\n[보조금24] 수집 시작...");
  let page = 1;
  let total = 0;

  while (true) {
    const url = new URL("http://apis.data.go.kr/1383000/mpm/SubsidyService/getPymSbstList");
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("numOfRows", "100");
    url.searchParams.set("returnType", "json");

    const res = await fetch(url.toString());
    if (!res.ok) break;

    let json: any;
    try { json = await res.json(); } catch { break; }

    const items: any[] = json?.response?.body?.items?.item ?? [];
    if (!Array.isArray(items) || items.length === 0) break;

    for (const item of items) {
      await upsertPoster({
        title: item.servNm ?? "제목 없음",
        source_org_name: item.minCtgryNm ?? item.majrCtgryNm ?? "행정안전부",
        summary_short: (item.servSumry ?? "").slice(0, 300),
        application_start_at: parseKoreanDate(item.aplyBgngDt),
        application_end_at: parseKoreanDate(item.aplyEndDt),
        category_code: "CAT_WELFARE",
        source_url: item.servDetailLink ?? "https://www.gov.kr/",
        source_key: `subsidy_${item.servId ?? item.servNm}`,
      });
      total++;
    }

    if (items.length < 100) break;
    page++;
  }

  console.log(`\n[보조금24] 완료 — 처리 ${total}건`);
}

// ──────────────────────────────────────────────
// 날짜 파싱 유틸 (YYYYMMDD → ISO 문자열)
// ──────────────────────────────────────────────
function parseKoreanDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.replace(/[.\-\/ ]/g, "").trim();
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ──────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────
async function main() {
  const target = process.argv[2] ?? "all";
  console.log(`\nPosterLink 공공데이터 수집 (대상: ${target})`);
  console.log("범례: + 신규 등록  . 중복 스킵  [ERROR] 오류\n");

  if (target === "all" || target === "youth")   await collectYouth();
  if (target === "all" || target === "central") await collectBokjiroCentral();
  if (target === "all" || target === "local")   await collectBokjiroLocal();
  if (target === "all" || target === "subsidy") await collectSubsidy();

  console.log("\n\n수집 완료. 관리자 페이지에서 review 상태 포스터를 승인해주세요.");
  console.log("https://posterlink.co.kr/admin/posters");
}

main().catch(console.error);
