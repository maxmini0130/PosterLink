/**
 * Source check of 2026-11-10 (notice page, portal header and poster image).
 * changes: the source gives a date with no time, so the deadline runs through
 * that day; an entry with `time` takes the time the source states instead. keep: a real time is stated, or the date is not a plain deadline;
 * these need a person and are excluded from the daily run as well.
 */
export const DATE_ONLY_REPAIR_CHANGES = [
  {
    id: "24312656-5b04-4d47-8a86-76334bbea435",
    date: "2026-12-31",
    expected: "2026-12-31 09:00:00",
    title: "원당마을한옥도서관 <독서동아리 '페이스메이커'> 상시 모집",
    time: "19:00:00",
    source: "포털 ~2026-12-31 19 : 00 (포스터에는 마감 표기 없음)",
  },
  {
    id: "87190372-a96c-4615-904f-6fb1e99c820b",
    date: "2027-07-31",
    expected: "2027-07-31 09:00:00",
    title: "사단법인 희망가치 <2026 주거위기청년 지원사업>",
    source: "포털 ~2027-07-31, 포스터 26.5~27.7 연중 상시",
  },
  {
    id: "cde477b0-32f7-4f45-ac83-bd4e1fa9032f",
    date: "2026-11-10",
    expected: "2026-11-10 00:00:00",
    title: "서울청년센터 양천<2026 또오리의 나 사용 설명서>",
    source: "공고문·포털 ~11월 10일",
  },
  {
    id: "8a6e3242-c705-40f7-87f4-04693e50b9e5",
    date: "2026-11-12",
    expected: "2026-11-12 00:00:00",
    title: "서울시여성가족재단 <아빠표 우리아이 건강도시락>",
    source: "공고문 ~11월 12일(목)까지 (포털 11-13 00:00)",
  },
  {
    id: "113c1ecb-178b-45b0-a24e-bde1ad7be87e",
    date: "2026-11-12",
    expected: "2026-11-12 00:00:00",
    title: "강북구청<11월 기후변화 구민 환경교실 – 몬스테라 화분 만들기>모집",
    source: "포스터·공고문 2026.10.26~11.12",
  },
  {
    id: "0617b286-2aca-48f9-85aa-5d12b2f14713",
    date: "2026-11-13",
    expected: "2026-11-13 00:00:00",
    title: "대청종합사회복지관 <마주친 사이, 5행시 챌린지> 모집 안내",
    source: "포스터·공고문 ~26.11.13(금)",
  },
  {
    id: "efe58938-5b76-4519-9a7f-3e3c226b578f",
    date: "2026-11-18",
    expected: "2026-11-18 00:00:00",
    title: "서울청년센터 강서<테마상담 1:1 전문가 연계상담>",
    source: "포스터·공고문 10월 29일~11월 18일(수)",
  },
  {
    id: "67190b85-afc8-427f-807b-b420f9925218",
    date: "2026-11-19",
    expected: "2026-11-19 00:00:00",
    title:
      "도봉구청 <풀스택 마케터와 함께하는 실무 원데이 특강: 데이터 스튜디오를 활용한 데이터 시각화> 참여자 모집",
    source: "포스터 신청 11.2~11.19 필요시 연장 (포털 11-20)",
  },
  {
    id: "0eccbbb6-40bf-4556-87e5-9a38a5f4a756",
    date: "2026-11-30",
    expected: "2026-11-30 00:00:00",
    title: "서울청년센터 마포 <독서 동아리> 참여자 모집",
    source: "공고문 모집 기간 11월 30일까지",
  },
  {
    id: "980c16a1-00ae-4fe9-ba48-b5745da2904a",
    date: "2026-11-12",
    expected: "2026-11-12 00:00:00",
    title:
      "도봉구청 <풀스택 마케터와 함께하는 실무 원데이 특강: 구글시트를 활용한 데이터 관리> 참여자 모집",
    source:
      "포스터 신청 10.26~11.12 필요시 연장. 포털 00 : 00은 날짜만 있는 공고의 기본 표기",
  },
  {
    id: "8901cb5f-6f2f-4bf6-bd21-162b45daa627",
    date: "2026-11-18",
    expected: "2026-11-18 09:00:00",
    title:
      "관악구자원봉사센터 x 관악청년청 <청년식당: 아토(나에게 주는 선물)> 안내",
    source: "포털 ~11-18 00:00, 시각 표기 없음. 포스터 일시 6.25~11.19 매주 목",
  },
  {
    id: "7b582174-53cd-4cdb-bbb9-d9c563ec8879",
    date: "2026-11-30",
    expected: "2026-11-30 09:00:00",
    title: "상계청소년문화의집 <꿈의 연결 프로그램 '멘토'> 모집",
    source: "포털 ~11-30, 포스터 모집기간 5월~11월",
  },
  {
    id: "995e8645-9590-4fe8-8bad-9938eb830d66",
    date: "2026-11-30",
    expected: "2026-11-30 09:00:00",
    title:
      "영등포구1인가구지원센터 <나를 이해하는 시간 자기이해 및 자기돌봄 프로그램 TCI-SCT 활용>",
    source: "포털 ~11-30, 포스터 7월~ 검사지 소진시까지",
  },
  {
    id: "61db9004-4870-46f3-ac8e-6fabf723e52b",
    date: "2026-11-30",
    expected: "2026-11-30 09:00:00",
    title:
      "성북구 1인가구지원센터 <심리정서 지원사업 마음점검 (2회기) 모집> 안내",
    source: "포털 ~11-30, 포스터 8월~11월 모집마감시까지",
  },
  {
    id: "fe6c7414-0ccc-4087-bbbb-0661703d22f8",
    date: "2026-11-30",
    expected: "2026-11-30 09:00:00",
    title: "종로구 <2026 종로싱글홈케어> 지원",
    source: "포스터·공고문 2.23~11.30 예산 소진 시 조기 종료",
  },
  {
    id: "1d710b45-29a1-4120-9d0b-9639862d509d",
    date: "2026-11-30",
    expected: "2026-11-30 09:00:00",
    title: "성북구보건소 <모바일 걷기 챌린지> 안내",
    source: "공고문 기간 9월 1일~11월 30일",
  },
  {
    id: "8e20eb64-641e-4539-ba88-e0742e8e1b39",
    date: "2026-12-11",
    expected: "2026-12-11 09:00:00",
    title: "[서울청년센터 성북] 웰컴성북 웰컴상담",
    source: "공고문·포털 ~26.12.11(금)",
  },
  {
    id: "3a0442e8-bbae-45b7-8b6f-ac92af670330",
    date: "2026-12-31",
    expected: "2026-12-31 09:00:00",
    title: "시원한 여름과 따뜻한 겨울을 위해 에너지바우처 신청하세요!",
    source: "포스터 2026년 6월 15일~12월 31일",
  },
  {
    id: "37e62400-2d84-4696-b8a9-61fae8fdc92e",
    date: "2026-12-31",
    expected: "2026-12-31 09:00:00",
    title: "강북구청 <2026년 강북구 문화관광해설 해설코스 예약>",
    source: "포털 ~12-31, 희망일 3일 전까지 예약",
  },
  {
    id: "70bd7f86-13eb-4c8f-8512-de2fcb5641c1",
    date: "2026-12-31",
    expected: "2026-12-31 09:00:00",
    title: "강북구청 <2026년 빌라관리사무소 무료법률상담실>",
    source: "포털 ~12-31, 시각 표기 없음",
  },
  {
    id: "b55299b4-9529-490b-a1e2-8cb83bbb4902",
    date: "2026-12-31",
    expected: "2026-12-31 09:00:00",
    title: "강북구청 <강북구 건축 법률 상담실>",
    source: "공고문 접수기간 2025.04.09~2026.12.31",
  },
  {
    id: "86c36b0e-d91e-4a55-927b-c803fab145ff",
    date: "2027-04-15",
    expected: "2027-04-15 09:00:00",
    title:
      "나눔과 미래 <주거취약계층 주거복지기금 대출지원사업 '든든한주거복지기금'> 신청자 모집",
    source: "포털 ~2027-04-15, 포스터 매 짝수월 1~15일",
  },
  {
    id: "f0065caf-407a-4717-8b49-38db5714e255",
    date: "2026-11-12",
    expected: "2026-11-12 00:00:00",
    title: "도봉구청 <개편 2027 NCS 대비 해커스 1타 강사 특강> 참여자 모집",
    source:
      "공고문 신청기간 ~11월 12일(목)까지 (필요시 연장). 포털 00 : 00은 날짜만 있는 공고의 기본 표기",
  },
  {
    id: "d9e192bd-1e32-40fa-8a06-bdf3267f5f6c",
    date: "2026-11-23",
    expected: "2026-11-23 00:00:00",
    title:
      "서울청년센터 관악 신림동쓰리룸<2026년 11월 1차 청년성장프로젝트><글라스아트> 참여자 모집",
    source:
      "공고문 프로그램 시작 3일 전까지 신청, 회차 11.26(목) 19:30 하나 → 11-23까지. 회차별 처리는 v6.1",
  },
];

/**
 * Summary sentences written by this service from the portal header, which
 * told users the poster closed at 00:00 on its deadline day. Replaced with
 * the source wording (or removed when `to` is empty) in summary_short,
 * summary_long, application_method and field_verification.readableNotice.facts.
 */
export const SUMMARY_TEXT_FIXES = [
  {
    id: "f0065caf-407a-4717-8b49-38db5714e255",
    from: "신청 종료는 포털 표기 기준 11월 12일 00시입니다",
    to: "신청은 11월 12일(목)까지입니다",
  },
  {
    id: "980c16a1-00ae-4fe9-ba48-b5745da2904a",
    from: "신청 종료는 포털 기준 11월 12일 00시입니다",
    to: "신청은 11월 12일(목)까지입니다",
  },
  {
    // Removed: the sentence before it already says "프로그램 시작3일 전까지
    // 선착순 신청합니다", which is what the source says.
    id: "d9e192bd-1e32-40fa-8a06-bdf3267f5f6c",
    from: "접수 종료는 공식 포털 기준11월23일00시입니다. ",
    to: "",
  },
];

export const DATE_ONLY_REPAIR_KEEP = [
  {
    id: "25ba66a3-561e-4c29-bb2b-4cda2b4526dd",
    why: "시각 있음: 11/19 09:00까지",
  },
  {
    id: "d8aa301f-b03c-46c6-a9da-528ebb32e65a",
    why: "시각 있음: 11/19 09:00까지",
  },
  {
    id: "ae12161f-7fdd-4836-8af6-40833ded1bb7",
    why: "시각 있음: 포털 12-13 09:00",
  },
  {
    id: "6af039db-c767-4353-b0c3-641e69a13c53",
    why: "보류: 각 교육 시작 2일 전까지, 회차별",
  },
  {
    id: "5bbb8675-ced1-48b9-9310-07341676b78f",
    why: "보류: 포털 상시, 신청 마감 표기 없음",
  },
  {
    id: "410b3a05-44a7-483f-b4dd-2bad53c67467",
    why: "보류: 제목에 예산소진 임시종료, 원문 삭제(404). 접수 종료 처리 별도",
  },
  {
    id: "9d7653d7-84ec-450b-b681-b227f5f63c68",
    why: "보류: 원문에 신청 마감 표기 없음",
  },
  {
    id: "2b55f6d2-b92c-4ed1-821f-8322377906f6",
    why: "보류: 12-13은 마지막 수업일, 신청 마감 표기 없음",
  },
];
