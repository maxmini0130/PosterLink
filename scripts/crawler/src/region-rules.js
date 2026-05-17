export const SEOUL_SIGUNGU_REGIONS = [
  ["REG_SEOUL_JONGNO", "종로구", "서울특별시 종로구"],
  ["REG_SEOUL_JUNG", "중구", "서울특별시 중구"],
  ["REG_SEOUL_YONGSAN", "용산구", "서울특별시 용산구"],
  ["REG_SEOUL_SEONGDONG", "성동구", "서울특별시 성동구"],
  ["REG_SEOUL_GWANGJIN", "광진구", "서울특별시 광진구"],
  ["REG_SEOUL_DONGDAEMUN", "동대문구", "서울특별시 동대문구"],
  ["REG_SEOUL_JUNGNANG", "중랑구", "서울특별시 중랑구"],
  ["REG_SEOUL_SEONGBUK", "성북구", "서울특별시 성북구"],
  ["REG_SEOUL_GANGBUK", "강북구", "서울특별시 강북구"],
  ["REG_SEOUL_DOBONG", "도봉구", "서울특별시 도봉구"],
  ["REG_SEOUL_NOWON", "노원구", "서울특별시 노원구"],
  ["REG_SEOUL_EUNPYEONG", "은평구", "서울특별시 은평구"],
  ["REG_SEOUL_SEODAEMUN", "서대문구", "서울특별시 서대문구"],
  ["REG_SEOUL_MAPO", "마포구", "서울특별시 마포구"],
  ["REG_SEOUL_YANGCHEON", "양천구", "서울특별시 양천구"],
  ["REG_SEOUL_GANGSEO", "강서구", "서울특별시 강서구"],
  ["REG_SEOUL_GURO", "구로구", "서울특별시 구로구"],
  ["REG_SEOUL_GEUMCHEON", "금천구", "서울특별시 금천구"],
  ["REG_SEOUL_YEONGDEUNGPO", "영등포구", "서울특별시 영등포구"],
  ["REG_SEOUL_DONGJAK", "동작구", "서울특별시 동작구"],
  ["REG_SEOUL_GWANAK", "관악구", "서울특별시 관악구"],
  ["REG_SEOUL_SEOCHO", "서초구", "서울특별시 서초구"],
  ["REG_SEOUL_GANGNAM", "강남구", "서울특별시 강남구"],
  ["REG_SEOUL_SONGPA", "송파구", "서울특별시 송파구"],
  ["REG_SEOUL_GANGDONG", "강동구", "서울특별시 강동구"],
];

const SEOUL_REGION_KEYWORDS = {
  REG_SEOUL_JONGNO: ["종로구", "종로문화재단", "아름꿈도서관", "원당마을한옥도서관"],
  REG_SEOUL_JUNG: ["중구", "서울중구", "중구청", "중구가족센터", "서울청년센터 중구"],
  REG_SEOUL_YONGSAN: ["용산구", "용산청년지음", "용산 청년지음"],
  REG_SEOUL_SEONGDONG: ["성동구", "성동구청년카페", "서울청년센터 성동"],
  REG_SEOUL_GWANGJIN: ["광진구", "서울청년센터 광진"],
  REG_SEOUL_DONGDAEMUN: ["동대문구", "동대문구가족센터", "동대문여성", "청년취업사관학교 동대문"],
  REG_SEOUL_JUNGNANG: ["중랑구", "중랑청년청", "중랑문화재단"],
  REG_SEOUL_SEONGBUK: ["성북구", "서울청년센터 성북"],
  REG_SEOUL_GANGBUK: ["강북구", "서울청년센터 강북"],
  REG_SEOUL_DOBONG: ["도봉구", "도봉문화정보도서관", "서울청년센터 도봉", "도봉여성센터"],
  REG_SEOUL_NOWON: ["노원구", "노원청년", "서울청년센터노원"],
  REG_SEOUL_EUNPYEONG: ["은평구", "서울청년센터 은평"],
  REG_SEOUL_SEODAEMUN: ["서대문구"],
  REG_SEOUL_MAPO: ["마포구", "마포청년", "서울청년센터 마포", "마포구가족센터", "마포구청", "구립마포", "망원", "도화청소년", "mapo.go.kr", "mycc.or.kr", "mapojh.or.kr"],
  REG_SEOUL_YANGCHEON: ["양천구", "서울청년센터 양천"],
  REG_SEOUL_GANGSEO: ["강서구", "서울청년센터 강서", "강서새일센터"],
  REG_SEOUL_GURO: ["구로구", "구로청년이룸"],
  REG_SEOUL_GEUMCHEON: ["금천구", "금천구청", "가산", "독산", "시흥도서관", "금천구 구민정보화교육"],
  REG_SEOUL_YEONGDEUNGPO: ["영등포구", "영등포청년", "서울청년센터영등포"],
  REG_SEOUL_DONGJAK: ["동작구"],
  REG_SEOUL_GWANAK: ["관악구", "서울청년센터 관악", "신림동쓰리룸"],
  REG_SEOUL_SEOCHO: ["서초구", "서울청년센터 서초", "서초문화재단", "서초1인가구"],
  REG_SEOUL_GANGNAM: ["강남구", "강남취", "강남청소년", "강남구청"],
  REG_SEOUL_SONGPA: ["송파구", "송파구청", "송파구가족센터"],
  REG_SEOUL_GANGDONG: ["강동구", "서울청년센터 강동", "강동중앙도서관"],
};

export function inferRegionCodes(post) {
  const source = [
    post.title,
    post.content,
    post.summary_short,
    post.site,
    post.source_org_name,
    post.board,
    post.category,
    post.sourceUrl,
    post.source_key,
    post.url,
  ].filter(Boolean).join(" ");

  const codes = [];
  for (const [code, keywords] of Object.entries(SEOUL_REGION_KEYWORDS)) {
    if (keywords.some((keyword) => source.includes(keyword))) codes.push(code);
  }

  if (codes.length > 0) return [...new Set(codes)].slice(0, 2);
  if (/전국|온라인|비대면/.test(source)) return ["REG_NATION"];
  if (/서울|서울시|서울특별시|youth\.seoul\.go\.kr/.test(source)) return ["REG_SEOUL"];
  return [];
}
