export interface Poster {
  id: string;
  title: string;
  source_org_name: string;
  thumbnail_url: string;
  application_end_at: string;
  region: string;
  category: string;
  tags: string[];
}

export const DUMMY_POSTERS: Poster[] = [
  {
    id: "1",
    title: "2026년 청년 어학시험 응시료 지원",
    source_org_name: "서울특별시 청년정책과",
    thumbnail_url: "https://via.placeholder.com/300x400/1e3a8a/ffffff?text=Poster+1",
    application_end_at: "2026-04-30T23:59:59Z",
    region: "서울",
    category: "지원금/복지",
    tags: ["청년", "지원금", "서울"],
  },
  {
    id: "2",
    title: "소상공인 디지털 전환 교육 모집",
    source_org_name: "중소벤처기업부",
    thumbnail_url: "https://via.placeholder.com/300x400/6ee7b7/1e3a8a?text=Poster+2",
    application_end_at: "2026-04-20T18:00:00Z",
    region: "전국",
    category: "교육/취업",
    tags: ["소상공인", "교육", "디지털"],
  },
  {
    id: "3",
    title: "시니어 IT 활용 교육 과정",
    source_org_name: "경기도 사회복지관",
    thumbnail_url: "https://via.placeholder.com/300x400/fb7185/ffffff?text=Poster+3",
    application_end_at: "2026-05-15T23:59:59Z",
    region: "경기",
    category: "교육/취업",
    tags: ["시니어", "교육", "경기"],
  },
];
