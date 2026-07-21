import axios from "axios";

const BASE_URL = "https://www.youthcenter.go.kr";
const LIST_ENDPOINT = `${BASE_URL}/pubot/search/portalPolicySearch`;
const DEFAULT_PAGE_SIZE = 9;
const policyCache = new Map();

const BASE_SEARCH_PARAMS = {
  sortFields: "DATE/DESC",
  searchFields: "all",
  query: "",
  PVSN_INST_GROUP_CD: "",
  SPRT_TRGT_AGE: "",
  EARN_MIN_AMT: "",
  EARN_MAX_AMT: "",
  QLFC_ACBG_NM: "",
  MRG_STTS_CD: "",
  MJR_CND_NM: "",
  EMPM_STTS_NM: "",
  STDG_NM: "",
  SPCL_FLD_NM: "",
  USER_MCLSF_NO: "",
  STDG_CTPV_NM: "",
  PLCY_KYWD_SN: "",
  APLY_PRD_BGNG_YMD: "",
  APLY_PRD_END_YMD: "",
  APLY_PRD_SE_CD: "",
  ODTM_CD: "",
};

const LABELS = {
  description: "\uC815\uCC45 \uC124\uBA85",
  support: "\uC9C0\uC6D0\uC0AC\uC5C5 \uB0B4\uC6A9",
  period: "\uC2E0\uCCAD \uAE30\uAC04",
  status: "\uC9C4\uD589 \uC0C1\uD0DC",
  supervisingOrg: "\uC8FC\uAD00 \uAE30\uAD00",
  operatingOrg: "\uC6B4\uC601 \uAE30\uAD00",
  category: "\uBD84\uB958",
  keyword: "\uD0A4\uC6CC\uB4DC",
  age: "\uB300\uC0C1 \uC5F0\uB839",
  region: "\uC9C0\uC5ED",
  application: "\uC2E0\uCCAD \uBC29\uBC95",
  screening: "\uC120\uBC1C \uBC29\uBC95",
  documents: "\uC81C\uCD9C \uC11C\uB958",
  qualification: "\uCD94\uAC00 \uC790\uACA9\uC870\uAC74",
  target: "\uCC38\uC5EC \uC81C\uC678 \uB300\uC0C1",
  note: "\uAE30\uD0C0 \uC0AC\uD56D",
  applicationUrl: "\uC2E0\uCCAD URL",
  referenceUrl: "\uCC38\uACE0 URL",
  alwaysOpen: "\uC0C1\uC2DC",
};

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/["\u201C\u201D]+$/g, "")
    .replace(/^["\u201C\u201D]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function firstValue(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

function formatDate(value) {
  const text = cleanText(value);
  if (!text || text === "0") return null;

  const isoDate = text.match(/^(20\d{2})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2].padStart(2, "0")}-${isoDate[3].padStart(2, "0")}`;
  }

  const compactDate = text.match(/^(20\d{2})(\d{2})(\d{2})/);
  if (compactDate) {
    return `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`;
  }

  return null;
}

function normalizeUrl(value) {
  const text = cleanText(value);
  if (!text || !/^https?:\/\//i.test(text)) return null;
  try {
    return new URL(text).href;
  } catch {
    return null;
  }
}

function policyUrl(docId) {
  return `${BASE_URL}/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/${encodeURIComponent(docId)}?isNew=Y`;
}

function summarizeRegions(value) {
  const regions = cleanText(value)
    .split(",")
    .map((region) => region.trim())
    .filter(Boolean);

  if (regions.length === 0) return "";
  if (regions.length <= 8) return regions.join(", ");
  return `${regions.slice(0, 6).join(", ")} \uC678 ${regions.length - 6}\uAC1C \uC9C0\uC5ED`;
}

function formatAge(item) {
  const minAge = cleanText(item.SPRT_TRGT_MIN_AGE);
  const maxAge = cleanText(item.SPRT_TRGT_MAX_AGE);
  const limited = cleanText(item.SPRT_TRGT_AGE_LMT_YN);

  if (minAge && maxAge && minAge !== "0" && maxAge !== "0") return `${minAge}~${maxAge}\uC138`;
  if (limited === "N") return "\uC81C\uD55C\uC5C6\uC74C";
  return "";
}

function formatPeriod(item) {
  const start = formatDate(item.APLY_PRD_BGNG_YMD);
  const end = formatDate(item.APLY_PRD_END_YMD);
  const status = cleanText(item.APLY_PRD_SE_CD);

  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start} ~`;
  if (end) return `~ ${end}`;
  if (status) return status;
  return "";
}

function appendSection(lines, label, value) {
  const text = cleanText(value);
  if (!text) return;
  lines.push(`${label}: ${text}`);
}

function buildContent(item) {
  const lines = [];
  const category = [item.USER_LCLSF_NM, item.USER_MCLSF_NM].map(cleanText).filter(Boolean).join(" > ");
  const urls = [item.APLY_URL_ADDR, item.REF_URL_ADDR1, item.REF_URL_ADDR2]
    .map(normalizeUrl)
    .filter(Boolean);

  appendSection(lines, LABELS.description, item.PLCY_EXPLN_CN);
  appendSection(lines, LABELS.support, item.PLCY_SPRT_CN);
  appendSection(lines, LABELS.period, formatPeriod(item));
  appendSection(lines, LABELS.status, item.APLY_PRD_SE_CD);
  appendSection(lines, LABELS.supervisingOrg, item.SPRVSN_INST_CD_NM);
  appendSection(lines, LABELS.operatingOrg, item.OPER_INST_CD_NM);
  appendSection(lines, LABELS.category, category);
  appendSection(lines, LABELS.keyword, item.PLCY_KYWD_NM);
  appendSection(lines, LABELS.age, formatAge(item));
  appendSection(lines, LABELS.region, summarizeRegions(item.STDG_NM));
  appendSection(lines, LABELS.application, item.PLCY_APLY_MTHD_CN);
  appendSection(lines, LABELS.screening, item.SRNG_MTHD_CN);
  appendSection(lines, LABELS.documents, item.SBMSN_DCMNT_CN);
  appendSection(lines, LABELS.qualification, item.ADD_APLY_QLFC_CND_CN);
  appendSection(lines, LABELS.target, item.PTCP_PRP_TRGT_CN);
  appendSection(lines, LABELS.note, item.ETC_MTTR_CN);

  for (const [index, url] of urls.entries()) {
    appendSection(
      lines,
      index === 0 && normalizeUrl(item.APLY_URL_ADDR) === url ? LABELS.applicationUrl : `${LABELS.referenceUrl} ${index + 1}`,
      url
    );
  }

  return lines.join("\n");
}

function buildAttachments(item) {
  const links = [
    [LABELS.applicationUrl, item.APLY_URL_ADDR],
    [`${LABELS.referenceUrl} 1`, item.REF_URL_ADDR1],
    [`${LABELS.referenceUrl} 2`, item.REF_URL_ADDR2],
  ];

  return links
    .map(([name, url]) => ({ name, url: normalizeUrl(url) }))
    .filter((attachment) => attachment.url);
}

function buildTitle(item) {
  const policyName = firstValue(item.PLCY_NM, item.ALIAS);
  const orgName = firstValue(item.SPRVSN_INST_CD_NM, item.RGTR_UP_INST_CD_NM, item.OPER_INST_CD_NM);
  if (!policyName || !orgName || policyName.includes(orgName)) return policyName;
  return `${orgName} <${policyName}>`;
}

function buildPost(item) {
  const docId = cleanText(item.DOCID);
  const title = buildTitle(item);
  if (!docId || !title) return null;

  const url = policyUrl(docId);
  const deadline = formatDate(item.APLY_PRD_END_YMD);
  const post = {
    title,
    url,
    sourceUrl: url,
    date: formatDate(item.FRST_REG_DT) || formatDate(item.DATE) || formatDate(item.LAST_MDFCN_DT) || "",
    deadline,
    content: buildContent(item),
    images: [],
    attachments: buildAttachments(item),
  };

  policyCache.set(url, post);
  policyCache.set(docId, post);
  return post;
}

async function fetchPolicies(page, pageSize, apiParams = {}) {
  const response = await axios.post(
    LIST_ENDPOINT,
    {
      ...BASE_SEARCH_PARAMS,
      ...apiParams,
      pageNum: page,
      listCount: pageSize,
    },
    {
      timeout: 20000,
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Referer: `${BASE_URL}/youthPolicy/ythPlcyTotalSearch`,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "PosterLink-Crawler/1.0",
      },
    }
  );

  const rows = response.data?.searchResult?.youthpolicy;
  return Array.isArray(rows) ? rows : [];
}

function uniquePosts(posts) {
  return [...new Map(posts.map((post) => [post.url, post])).values()];
}

export default {
  name: "youthcenter",

  async parseList(_boardUrl, site = {}, maxPages = 2, board = {}) {
    const pageSize = Number(board.pageSize ?? site.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
    const apiParams = {
      ...(site.apiParams && typeof site.apiParams === "object" ? site.apiParams : {}),
      ...(board.apiParams && typeof board.apiParams === "object" ? board.apiParams : {}),
    };
    const posts = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const rows = await fetchPolicies(page, pageSize, apiParams);
      const pagePosts = rows.map(buildPost).filter(Boolean);
      posts.push(...pagePosts);
      if (rows.length < pageSize) break;
    }

    return uniquePosts(posts);
  },

  async parseDetail(postUrl) {
    const cached = policyCache.get(postUrl) || policyCache.get(cleanText(postUrl).match(/ythPlcyDetail\/([^/?#]+)/)?.[1]);
    if (!cached) return {};
    return {
      title: cached.title,
      content: cached.content,
      date: cached.date,
      deadline: cached.deadline,
      images: cached.images,
      attachments: cached.attachments,
      sourceUrl: cached.sourceUrl,
    };
  },
};
