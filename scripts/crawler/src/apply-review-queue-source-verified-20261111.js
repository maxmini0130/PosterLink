#!/usr/bin/env node
// Source-verified review queue decisions (2026-11-11 KST).
// Default is a dry-run. Production writes are run by the operator (CLAUDE.md section 11):
//   node src/apply-review-queue-source-verified-20261111.js --snapshot=<file>
//   node src/apply-review-queue-source-verified-20261111.js --snapshot=<file> --backup=<file> --apply --confirm=SOURCE_REVIEW_20261111
//   node src/apply-review-queue-source-verified-20261111.js --verify
//   node src/apply-review-queue-source-verified-20261111.js --rollback=<backup file> --confirm=ROLLBACK_SOURCE_REVIEW_20261111
import "./load-env.js";

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { CATEGORY_CODE_BY_LABEL } from "./poster-category-classifier.js";

const MARKER = "directSourceReview20261111";
const REVIEWER = "claude-opus-5-5-source-review-20261111";
const YOUTH = (id) => `https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=${id}`;
const k = (date, time = "00:00:00") => `${date}T${time}+09:00`;
const eod = (date) => k(date, "23:59:59");
const Y = "2026-11-";
const JUNG = "서울청년센터 중구(서소문로12길 36, 8층)";

// app/ev: [start, end] in KST. A null application end means the source states no end date.
const PUBLISH = [
  { id: "7e3330ec", org: "서울청년센터 광진", app: [k(`${Y}09`), eod(`${Y}22`)], ev: [k(`${Y}25`, "19:00:00"), k(`${Y}25`, "21:00:00")], type: "fixed", cats: ["교육강좌"], conf: 0.96,
    f: { eligibility_summary: "서울시 청년(19~39세)", target_age_min: 19, target_age_max: 39, event_location: "서울청년센터 광진 2층(광진구 능동로 245)", application_method: "포스터 QR 또는 구글폼 신청, 11/23 개별 문자 안내" },
    short: "옷장 정리·수납법과 수납 바구니 만들기 실습. 11/25 19~21시 서울청년센터 광진. 11/22까지 신청.", note: "포스터·본문·포털 일치" },
  { id: "fbfc84cf", app: [k(`${Y}04`), eod(`${Y}13`)], ev: [k(`${Y}21`, "10:00:00"), k(`${Y}21`, "15:00:00")], type: "fixed", cats: ["교육강좌", "육아/가족"], conf: 0.95,
    f: { eligibility_summary: "결혼을 앞두거나 관심 있는 서울 생활권 커플", recruitment_count: "20쌍(선착순)", participation_fee: "무료", event_location: "비대면 ZOOM", application_method: "구글폼(QR) 신청, 11/13 저녁 확정 연락", contact_info: "02-471-0813" },
    short: "예비부부 대상 비대면 교육(커플 대화법·결혼 준비 체크리스트). 11/21 10~15시, 20쌍 선착순. 11/13까지 신청.", note: "포스터 ~11/13, 포털 일치" },
  { id: "06aab008", app: [k(`${Y}09`), eod(`${Y}26`)], ev: [k(`${Y}27`, "10:00:00"), k(`${Y}27`, "12:00:00")], type: "until_exhausted", cats: ["소상공인", "교육강좌"], conf: 0.92,
    f: { eligibility_summary: "요식업 창업·매장 운영에 관심 있는 양천구민", recruitment_count: "300명 내외", event_location: "양천구청 해누리타운 2층 해누리홀(목동동로 81)", application_method: "온라인 구글폼 신청", contact_info: "양천창업지원센터 02-2604-1471" },
    short: "임태훈 셰프의 요식업 창업 특강. 11/27 10~12시 해누리타운, 300명 내외. 선착순 마감 시까지 신청(포털 기간 11/26).", note: "본문 선착순 마감, 포털 종료 11/26" },
  { id: "e2f78fd2", org: "서울청년센터 중구", app: [k(`${Y}10`), eod(`${Y}18`)], ev: [k(`${Y}23`, "19:00:00"), k(`${Y}26`, "21:00:00")], type: "fixed", cats: ["교육강좌"], conf: 0.93,
    f: { eligibility_summary: "힐링이 필요한 서울시 19~39세 청년", target_age_min: 19, target_age_max: 39, recruitment_count: "총 24명(회차별 12명, 중복 참여 불가)", participation_fee: "무료", event_location: `${JUNG} 프로그램B실`, application_method: "구글폼 신청, 11/19 선정자 문자 안내", contact_info: "070-4125-2210" },
    short: "향을 배합해 나만의 감정 오일을 만드는 힐링 클래스. 11/23·26 19~21시(택1), 회차별 12명. 11/18까지 신청.", concerns: ["접수 시작: 포스터 11/9, 포털 11/10"], note: "마감 11/18 포스터·포털 일치" },
  { id: "c234405c", app: [k(`${Y}07`), eod(`${Y}24`)], ev: [k(`${Y}26`, "19:00:00"), k(`${Y}26`, "21:00:00")], type: "fixed", cats: ["교육강좌", "행사모집"], conf: 0.93,
    f: { eligibility_summary: "중학생~성인", recruitment_count: "6명", event_location: "YDP창의예술교육센터(영등포구 양평로20길 8-1)", application_method: "구글폼 신청" },
    short: "헌책 속 문장으로 만드는 콜라주 워크숍. 11/26 19~21시, 6명. 11/24까지 신청.", note: "행사 포스터·본문 일치, 마감은 포털" },
  { id: "d5e63364", app: [k(`${Y}09`, "10:00:00"), null], ev: [k(`${Y}18`, "10:00:00"), k(`${Y}18`, "13:00:00")], type: "until_exhausted", cats: ["행사모집"], conf: 0.92,
    f: { eligibility_summary: "영등포구 거주 내·외국인 주민 및 다문화가족 성인", recruitment_count: "30명(회차별 15명, 내국인 40%·외국인 60%)", participation_fee: "무료", event_location: "다드림문화복합센터 1층(대림로21길 11)", application_method: "방문·전화 접수(신분증 지참)", contact_info: "02-2670-1637" },
    short: "고추장 만들기와 내·외국인 소통 행사. 11/18 1·2회차, 회차별 15명. 11/9 10시부터 선착순 방문·전화 접수.", period: "2026-11-09 10:00 ~ 선착순 마감 시까지", note: "신청일을 행사일로 잘못 저장한 값 교정" },
  { id: "cccaac47", app: [null, null], ev: [k(`${Y}25`, "10:00:00"), k(`${Y}25`, "12:00:00")], type: "unknown", cats: ["교육강좌"], conf: 0.88,
    f: { eligibility_summary: "진로교육·진로강사에 관심 있는 누구나", participation_fee: "무료", event_location: "강서여성새로일하기센터 강의실 5", application_method: "구글폼(QR) 신청", contact_info: "02-2692-4549" },
    short: "현직 진로강사에게 듣는 현장 이야기와 취업 팁. 11/25 10~12시. 신청 마감일은 원문에 없어 기관 확인이 필요합니다.", period: "신청 마감 미기재", concerns: ["신청 마감 미기재(포털 '상시'는 근거 부족)"], note: "행사일을 신청일로 저장한 값 제거" },
  { id: "fe772905", org: "영등포청년건축학교", app: [k(`${Y}09`), eod(`${Y}24`)], ev: [k("2026-12-09", "09:00:00"), k("2026-12-11", "17:00:00")], type: "fixed", cats: ["교육강좌"], conf: 0.95,
    f: { eligibility_summary: "19~39세 서울시 거주 청년(영등포구 거주 우선)", target_age_min: 19, target_age_max: 39, recruitment_count: "10명(서류·11/27 면접 선발)", participation_fee: "무료(보증금 제도 운영)", event_location: "영등포청년건축학교(문래북로 116)", application_method: "신청서 작성 후 이메일 제출(ydpysa@naver.com)", contact_info: "02-2631-1539" },
    short: "인테리어 필름 시공 실무 교육. 12/9~11 평일 9~17시, 10명. 11/24까지 이메일 지원(조기 마감 가능).", note: "포스터·본문 일치" },
  { id: "99e73827", app: [null, k(`${Y}20`, "18:00:00")], ev: [k(`${Y}16`, "09:00:00"), k(`${Y}20`, "18:00:00")], type: "fixed", cats: ["행사모집", "생활정보"], conf: 0.85,
    f: { eligibility_summary: "누구나", application_method: "별도 신청 없음(현장 방문)", event_location: "영등포구청 광장(당산로 123)", contact_info: "일자리경제과 상권활성화팀 02-2670-3430" },
    short: "전통시장·소상공인 우수상품과 지역 특산품 장터. 11/16~20 9~18시(11/19는 10시 개장) 영등포구청 광장.", period: "별도 신청기간 없음(행사 2026-11-16 ~ 11-20)", note: "신청 없는 공개 행사, 행사 종료일을 노출 기한으로 사용" },
  { id: "caf26380", app: [null, k(`${Y}18`, "17:30:00")], ev: [k(`${Y}18`, "15:00:00"), k(`${Y}18`, "17:30:00")], type: "fixed", cats: ["교육강좌", "행사모집"], conf: 0.88,
    f: { eligibility_summary: "관내 고등학생, 대학생·청년, 마곡기업 재직자 등", recruitment_count: "350명", event_location: "강서구청 통합신청사 지하2층 다목적홀(공항대로 135)", application_method: "포스터 QR 사전신청(미신청자도 당일 참석 가능)", contact_info: "강서구청 교육지원과 02-2600-6979" },
    short: "구글 클라우드·퓨리오사AI 전문가의 AI 특강. 11/18 15~17:30 강서구청. 사전신청을 못해도 당일 참석 가능.", period: "별도 신청 마감 없음(행사일 2026-11-18)", note: "포스터의 당일 참석 안내 확인" },
  { id: "69179aa2", org: "서울청년센터 강서", app: [null, eod(`${Y}24`)], ev: [k(`${Y}26`, "19:00:00"), k(`${Y}26`, "21:00:00")], type: "until_exhausted", cats: ["교육강좌", "주거/금융"], conf: 0.92,
    f: { eligibility_summary: "서울시 청년(공고일 기준 만 19~39세, 제대군인 최대 3년 연장)", target_age_min: 19, target_age_max: 39, recruitment_count: "20명", event_location: "서울청년센터 강서 회의실3(강서로 231, 101동 2층)", application_method: "서울시 공공서비스예약 또는 안내 링크 신청", contact_info: "02-2600-4239" },
    short: "국민연금공단과 함께하는 사회초년생 기초 재무설계. 11/26 19~21시, 20명. 프로그램 시작 2일 전까지 선착순 신청.", period: "프로그램 시작 2일 전(2026-11-24)까지 선착순", note: "본문 '시작 2일 전' 적용" },
  { id: "0360454f", org: "서울청년센터 중구", app: [k(`${Y}10`), eod(`${Y}22`)], ev: [k(`${Y}26`, "19:00:00"), k("2026-12-15", "21:00:00")], type: "fixed", cats: ["교육강좌"], conf: 0.93,
    links: [["official_apply", "초급반 신청서", "https://forms.gle/Gh6f5VucFCWCqS2YA", true], ["official_apply", "심화반 신청서", "https://forms.gle/YcAvpKsUy4scVuhz8", false], ["official_notice", "공식 공고 원문", YOUTH(75755), false]],
    f: { recruitment_count: "총 60명(회차별 15명, 택1 또는 중복 가능)", participation_fee: "무료", event_location: `${JUNG} 프로그램A실`, application_method: "반별 구글폼 신청, 11/23 선정자 문자 안내", contact_info: "070-4125-2210" },
    short: "청년 커리어·실무 생성형 AI 교육. 초급 11/26·12/3, 심화 12/8·12/15 각 19~21시. 11/22까지 신청, 노트북 지참 권장.", concerns: ["기존 대표 신청 링크는 다른 프로그램(감정오일) 폼이어서 제거"], note: "마지막 회차 12/15로 교정, 반별 신청서 확인" },
  { id: "767388dc", app: [k(`${Y}02`), eod(`${Y}13`)], ev: [k(`${Y}13`, "19:00:00"), k(`${Y}27`, "21:00:00")], type: "fixed", cats: ["교육강좌", "주거/금융"], conf: 0.92,
    f: { eligibility_summary: "서울시 생활권(거주·직장·학교) 1인가구(영등포구 생활권·성별 조정 선발)", event_location: "비대면(구글 Meet)", application_method: "구글폼 신청", contact_info: "02-845-5433" },
    short: "1인가구 비대면 주거관리 교육. 11/13·20·27 19~21시, 3회 모두 참여. 11/13까지 신청.", note: "회차 포스터·본문 일치" },
  { id: "f1c2d01c", org: "스마트양천미래교육센터", app: [null, k(`${Y}13`, "17:00:00")], ev: [k(`${Y}12`, "10:00:00"), k(`${Y}13`, "17:00:00")], type: "fixed", cats: ["행사모집"], conf: 0.92,
    f: { eligibility_summary: "생성형 AI 강좌 수강생, 학부모 및 양천구민 누구나", participation_fee: "무료", application_method: "사전 예약 없이 자유 방문", event_location: "양천문화회관 별관 1층 전시관(목동서로 367)", contact_info: "02-2620-4737" },
    short: "AI 창작물 전시와 포토부스·체험. 11/12 10~18시, 11/13 10~17시 양천문화회관. 예약 없이 무료 방문.", period: "별도 신청 없음(전시 2026-11-12 ~ 11-13)", note: "본문 '사전 예약 없이 자유 방문' 확인" },
  { id: "bc875f2d", app: [k(`${Y}15`), eod("2027-03-15")], ev: [k(`${Y}15`), eod("2027-03-15")], type: "fixed", cats: ["행사모집"], conf: 0.95,
    f: { eligibility_summary: "양천구 주민 누구나", application_method: "1365 자원봉사포털 신청 후 활동 인증서 이메일 제출", benefits_summary: "봉사시간 최대 2시간 인정(2개 구간 이상 사진 인증)", contact_info: "양천구청 도로과 02-2620-3638" },
    short: "폭설 시 내 집 앞·관내 공공구역 눈 치우기 봉사자 모집. 11/15~2027/3/15, 1365 포털 신청 필수.", note: "포스터·본문 일치" },
  { id: "24822cc8", app: [k("2026-10-28"), eod(`${Y}27`)], ev: [k("2026-12-07"), eod("2027-03-30")], type: "fixed", cats: ["교육강좌"], conf: 0.93,
    f: { eligibility_summary: "15세 이상 서울 거주 미취업 청년", recruitment_count: "총 75명(과정별 25명)", participation_fee: "무료(예치금 10만 원, 수료 후 반환)", event_location: "청년취업사관학교 양천캠퍼스(목동서로 339, 양천구보건소 3층)", application_method: "청년취업사관학교(SeSAC) 홈페이지 온라인 접수", contact_info: "02-2061-7581" },
    short: "SeSAC 양천 AI 융합 3기(디지털마케팅·콘텐츠디자인·데이터분석). 12월 개강, 과정별 25명. 11/27까지 접수.", note: "중복 의심 9da85adf는 성북캠퍼스 6기로 별개 공고" },
  { id: "c09cddfb", title: "천왕동청소년문화의집 <2026 HIP-GURO 구로청소년 드림콘서트>", app: [k("2026-10-20"), k(`${Y}14`, "17:00:00")], ev: [k(`${Y}14`, "14:00:00"), k(`${Y}14`, "17:00:00")], type: "fixed", cats: ["행사모집"], conf: 0.9,
    f: { eligibility_summary: "9~24세 청소년 및 지역주민", target_age_min: 9, target_age_max: 24, participation_fee: "무료", event_location: "오류아트홀", application_method: "사전접수(11/7 종료) 및 당일 현장접수", contact_info: "02-2066-1020" },
    short: "청소년 밴드·댄스 무대와 힙합 공연 무료 콘서트. 11/14 14시 오류아트홀. 사전접수는 종료됐고 당일 현장접수 가능.", period: "사전접수 2026-10-20 ~ 11-07, 당일 현장접수", note: "포스터 하단 접수 안내 확인, 제목을 행사명으로 교정" },
  { id: "91025c6b", org: "서울신용보증재단 성북종합지원센터·프리즈미", app: [k(`${Y}10`), eod(`${Y}19`)], ev: [k(`${Y}20`, "14:00:00"), k(`${Y}20`, "16:00:00")], type: "fixed", cats: ["행사모집"], conf: 0.92,
    f: { eligibility_summary: "참여자 본인과 외국인 친구 2인 1팀", recruitment_count: "6명(3팀)", event_location: "선잠단지 앞 집결(성북동)", application_method: "구글폼(QR) 신청", contact_info: "프리즈미 010-3021-8339" },
    short: "외국인 친구와 성북동길 도슨트 투어·도자기 체험. 11/20 14~16시, 3팀. 11/19까지 신청.", note: "마감은 포털, 일정 본문 일치" },
  { id: "e8b07c3f", app: [k("2026-10-01"), null], ev: [k("2027-01-01"), eod("2028-12-31")], type: "unknown", cats: ["행사모집"], conf: 0.82,
    links: [["official_notice", "공식 공고 원문", YOUTH(75770), true], ["other", "주민자치학교 온라인 교육", "https://www.autonomyacademy.com/course/course_view.jsp?id=170288&cid=10947#course-view-170288", false]],
    f: { eligibility_summary: "해당 동 주민등록자 또는 외국인 등록대장에 올라 있는 사람(주민자치학교 6시간 이수 필수)", application_method: "해당 동주민센터 주민자치회 방문 접수", contact_info: "해당 동주민센터 주민자치회 담당자" },
    long: "우리 동네 변화를 함께 만들어갈 은평구 주민자치회 신규위원을 모집합니다.\n\n모집기간: 2026년 10월~11월(동별 상이)\n대상: 해당 동 주민등록자 또는 외국인 등록대장에 올라 있는 사람\n신청: 해당 동주민센터 주민자치회 방문 접수(주민자치학교 6시간 이수 필수)\n선정: 2026년 12월 중 공개추첨\n임기: 2027년 1월 1일 ~ 2028년 12월 31일(2년)",
    short: "동네 사업을 직접 발굴·시행할 주민자치회 신규위원 모집. 10~11월 동별 접수(기간 상이), 주민자치학교 6시간 이수 필수.", period: "2026년 10~11월(동별 상이)", concerns: ["접수 마감이 동별로 달라 날짜 미지정"], note: "교육 과정 페이지 본문을 포털 공고로 교체, 잘못된 12/31 마감 제거" },
  { id: "ef4123f5", app: [null, null], ev: [k(`${Y}19`, "19:00:00"), k("2026-12-10", "21:00:00")], type: "until_exhausted", cats: ["교육강좌", "행사모집"], conf: 0.88,
    f: { eligibility_summary: "청소년 및 성인", recruitment_count: "30명", participation_fee: "무료", event_location: "삼청공원 숲속도서관 프로그램실", application_method: "구글폼(QR) 또는 전화 신청", contact_info: "02-734-3801" },
    short: "클래식·대화법·종로 역사를 다루는 작가 3인 강연. 11/19, 12/3, 12/10 각 19~21시. 선착순 신청.", period: "선착순 마감 시까지", concerns: ["접수 기간 미기재"], note: "행사일을 신청일로 저장한 값 제거" },
  { id: "8090fb74", app: [k(`${Y}09`), k(`${Y}20`, "22:00:00")], ev: [k(`${Y}25`, "18:30:00"), k("2026-12-02", "21:30:00")], type: "until_exhausted", cats: ["교육강좌", "소상공인"], conf: 0.95,
    f: { eligibility_summary: "성북구 내 예비창업자, 캐릭터 IP 창작·시제품 제작·사업화에 관심 있는 창작자", recruitment_count: "프로그램별 30명 내외", event_location: "ZOOM 온라인", application_method: "구글폼 선착순 접수, 11/23 12시 개별 연락", contact_info: "02-941-9468" },
    short: "성호랑 작가의 캐릭터 창업·1인 창작자 특강. 11/25, 12/2 18:30~21:30 온라인. 11/20 22시까지 선착순 신청.", note: "포스터·본문 일치" },
  { id: "df8f1404", title: "서울청년센터 양천 <SKILL:ON - 클로드코드로 영상제작> 참여자 모집", org: "서울청년센터 양천", app: [k(`${Y}10`), eod(`${Y}23`)], ev: [k(`${Y}27`, "18:30:00"), k(`${Y}27`, "21:30:00")], type: "fixed", cats: ["교육강좌"], conf: 0.94,
    links: [["official_apply", "구글폼 신청서", "https://forms.gle/FhVbkxvBS6Mauey69", true], ["official_notice", "공식 공고 원문", YOUTH(75777), false]],
    f: { eligibility_summary: "클로드 코드 영상 제작에 관심 있는 만 19~39세 청년", target_age_min: 19, target_age_max: 39, event_location: "서울청년센터 양천 다목적실 A", application_method: "온라인 신청서 작성", contact_info: "070-4252-8389" },
    short: "클로드 코드로 15초 세로형 숏폼을 완성하는 실습. 11/27 18:30~21:30. 11/23 자정까지 신청, 노트북 등 준비사항 확인.", concerns: ["다른 강좌(클로드코드로 디자인) 링크 분리"], note: "포스터 일치, 제목을 강좌명으로 교정" },
  { id: "5a88c615", app: [k(`${Y}09`), k(`${Y}23`, "14:00:00")], ev: [k("2026-12-01", "14:00:00"), k("2026-12-08", "17:00:00")], type: "fixed", cats: ["교육강좌", "소상공인"], conf: 0.96,
    f: { eligibility_summary: "2027년 정부 지원사업 도전을 희망하는 예비창업자 및 기창업자", recruitment_count: "24명", participation_fee: "무료", application_method: "강동구 청년해냄센터 홈페이지 신청, 11/24 개별 연락", contact_info: "02-488-6880" },
    short: "2027년 정부지원사업 대비 창업 교육. 12/1·2·7·8 14~17시, 24명. 11/23 14시까지 신청.", note: "행사일을 공고일로 저장한 값 교정" },
  { id: "009d9e6f", app: [k(`${Y}02`), eod(`${Y}19`)], ev: [k(`${Y}19`, "13:00:00"), k(`${Y}19`, "17:30:00")], type: "fixed", cats: ["행사모집", "소상공인"], conf: 0.95,
    f: { eligibility_summary: "창업관계자, 투자자, 서울시민 등", event_location: "동대문구 아르코 로즈홀(왕산로 200, 타워동 5층)", application_method: "초청장 링크에서 사전등록", contact_info: "camtacenter@khu.ac.kr / 02-961-9514~5" },
    short: "경희대 캠퍼스타운 스타트업 8개사 IR 데모데이. 11/19 13~17:30 동대문구 아르코. 온라인 사전등록.", note: "포스터·K-Startup 일치" },
  { id: "76aedd4e", org: "서울청년센터 강북", app: [k(`${Y}09`), eod(`${Y}19`)], ev: [k(`${Y}17`, "13:00:00"), eod(`${Y}19`)], type: "fixed", cats: ["교육강좌", "주거/금융"], conf: 0.87,
    f: { eligibility_summary: "만 19~39세 청년(강북구 거주·생활권 우대)", target_age_min: 19, target_age_max: 39, recruitment_count: "회차별 6명", application_method: "서울시 공공서비스예약에서 '보여줘 강북홈즈' 검색 후 신청", contact_info: "02-908-8234" },
    short: "공인중개사와 실제 집을 보며 배우는 현장 주거교육. 11/17~19 매일 13시·18시 중 선택, 회차별 6명. 회차별 예약 가능 여부 확인.", concerns: ["본문에 신청 마감 없음, 포털 종료 11/19 적용. 회차별 예약 마감 상이 가능"], note: "일정 포스터·본문 일치" },
  { id: "a10dd1b0", org: "노원구 청년일자리센터 청년내일", app: [k(`${Y}06`), eod(`${Y}16`)], ev: [k(`${Y}18`, "16:00:00"), k(`${Y}19`, "18:00:00")], type: "fixed", cats: ["교육강좌"], conf: 0.94,
    f: { eligibility_summary: "취업을 처음 준비하는 청년 누구나", recruitment_count: "최대 100명", event_location: "온라인(Zoom)", contact_info: "02-932-2500" },
    short: "AI로 자기소개서·면접 기초 다지기. 11/18 자소서, 11/19 면접 특강 16~18시 Zoom. 11/16까지 신청.", note: "본문 '11/16까지' 일치" },
  { id: "2b05ea0d", app: [k(`${Y}09`), eod(`${Y}13`)], ev: [k(`${Y}23`, "10:00:00"), k("2026-12-02", "12:00:00")], type: "fixed", cats: ["건강/의료", "교육강좌"], conf: 0.86,
    links: [["official_apply", "나답게 잇다(TCI 워크숍) 신청서", "https://forms.gle/NuTKdDNkPXmAPAQG8", true], ["official_notice", "공식 공고 원문", YOUTH(75688), false]],
    f: { eligibility_summary: "노원구 거주 또는 생활권 주민", recruitment_count: "프로그램별 15명(선착순)", participation_fee: "무료(보증금 1만 원, 전체 참여 시 반환)", event_location: "노원구 마음건강지원센터 교육실", application_method: "프로그램별 구글폼 신청" },
    short: "TCI 기질·성격 검사 워크숍 11/23 10~12시, 11/13까지 신청. 리스·케이크 만들기 신청서는 11/11 확인 시 닫혀 있습니다.", period: "TCI 워크숍 ~ 2026-11-13", concerns: ["리스·케이크 폼 closedform 확인(원문 마감 11/20·11/26 이전)"], note: "신청 가능한 프로그램 기준 마감 적용" },
  { id: "553035dc", title: "강서구립곰달래도서관 봉제산 책쉼터 <클래식 공연 & 북토크>", app: [k(`${Y}09`, "10:00:00"), null], ev: [k(`${Y}21`, "13:30:00"), k(`${Y}21`, "15:30:00")], type: "until_exhausted", cats: ["행사모집"], conf: 0.82,
    long: "책과 음악이 만나는 클래식 공연과 북토크입니다.\n\n일시: 2026년 11월 21일(토) 13:30~15:30\n장소: 봉제산 책쉼터\n모집인원: 봉제산 책쉼터 이용자 100명\n신청: 11월 9일 오전 10시부터 선착순 마감 시까지, 강서구통합도서관 누리집",
    f: { eligibility_summary: "봉제산 책쉼터 이용자", recruitment_count: "100명", event_location: "봉제산 책쉼터", application_method: "강서구통합도서관 누리집 신청" },
    short: "책과 음악이 만나는 클래식 공연·북토크. 11/21 13:30~15:30 봉제산 책쉼터, 100명. 선착순 신청.", period: "2026-11-09 10:00 ~ 선착순 마감 시까지", concerns: ["본문 없음, 저해상도 포스터 판독 기준"], note: "포스터 기준 제목·일정 작성" },
  { id: "34706b36", app: [k(`${Y}06`, "18:30:00"), null], ev: [k(`${Y}19`, "10:00:00"), k("2026-12-24", "12:00:00")], type: "until_exhausted", cats: ["교육강좌"], conf: 0.88,
    long: "그림책을 깊이 읽고 감상하며 서사 구조와 시각적 구성 방식을 이해하는 프로그램입니다.\n\n운영기간: 2026년 11월 19일 ~ 12월 24일 매주 목요일 10:00~12:00(6차시)\n장소: 강서구립마곡열린도서관 프로그램실2\n대상: 성인 12명\n신청: 11월 6일 18:30부터 선착순 인원 마감까지, 로그인 필수\n준비물: 해당 차시 수업할 동화책, 연필, 지우개 등 필기구",
    f: { eligibility_summary: "성인", recruitment_count: "12명", event_location: "강서구립마곡열린도서관 프로그램실2", application_method: "강서구통합도서관 누리집 로그인 후 신청" },
    short: "그림책 서사와 시각 구성을 함께 읽는 6차시 탐구회. 11/19~12/24 목 10~12시, 성인 12명. 선착순 신청.", period: "2026-11-06 18:30 ~ 선착순 마감 시까지", note: "행사 종료일을 신청 마감으로 저장한 값 제거" },
  { id: "f7fbf788", org: "도봉구 청년취업지원센터(도봉구청 청년미래과)", app: [k(`${Y}09`), eod(`${Y}17`)], ev: [k(`${Y}12`, "19:00:00"), k(`${Y}19`, "21:00:00")], type: "fixed", cats: ["교육강좌"], conf: 0.9,
    f: { eligibility_summary: "취업준비청년", recruitment_count: "직무별 6명", event_location: "도봉구청 1층 청년취업지원센터", application_method: "온라인 신청, 자기소개서·이력서 사전 제출 필수", contact_info: "02-2091-3815" },
    short: "현직자 모의면접. 반도체 11/12, 마케팅 11/17, 영업 11/19 19~21시. 각 면접 시작 2일 전까지 신청.", period: "각 면접 시작 2일 전까지(마지막 2026-11-17)", concerns: ["11/12 반도체 회차 신청은 11/10 종료"], note: "포스터 회차별 마감 적용" },
  { id: "b649bf17", app: [k(`${Y}03`), null], ev: [k(`${Y}06`, "19:00:00"), k(`${Y}13`, "21:00:00")], type: "until_exhausted", cats: ["행사모집"], conf: 0.82,
    long: "강서구립등빛도서관 등빛박스 11월의 영화(주제: 따뜻한 한 끼)입니다.\n\n일시: 매주 금요일 19시\n11월 6일 라따뚜이, 11월 13일 남극의 쉐프(전체 관람가)\n장소: 2층 문화마당\n11월 20일·27일은 운영하지 않습니다.\n문의: 070-4454-0651",
    f: { event_location: "강서구립등빛도서관 2층 문화마당", contact_info: "070-4454-0651" },
    short: "도서관 금요 영화. 11/13 19시 '남극의 쉐프'(전체 관람가), 2층 문화마당. 11/20·27은 운영하지 않습니다.", period: "2026-11-03 ~ 선착순 마감 시까지", concerns: ["본문 없음, 포스터 기준. 신청 방법은 도서관 확인"], note: "포스터 기준 일정 작성, 포털 종료일 미기재" },
  { id: "c58f8aad", app: [k(`${Y}06`), eod(`${Y}18`)], ev: [k(`${Y}20`, "14:00:00"), k(`${Y}20`, "16:00:00")], type: "fixed", cats: ["행사모집"], conf: 0.94,
    f: { recruitment_count: "현장 50명 내외(선착순), 유튜브 생중계 병행", event_location: "커뮤니티하우스 마실(서울 중구 명동길 73)", application_method: "이벤터스 사전 신청", contact_info: "02-3156-6145" },
    short: "미디어 속 성별 재현과 정책을 논의하는 포럼. 11/20 14~16시 명동, 온·오프라인. 11/18까지 신청, 현장은 선착순.", note: "본문·포스터 일치" },
  { id: "46a2a97d", org: "서울청년센터 강동", app: [k(`${Y}17`), null], ev: [k(`${Y}17`), null], type: "until_exhausted", cats: ["지원사업"], conf: 0.9,
    f: { eligibility_summary: "서울을 거점으로 하는 만 19~39세 청년 및 병역의무 이행 제대군인", target_age_min: 19, target_age_max: 39, benefits_summary: "1:1 상담·만족도 조사 참여 시 주머니 담요 증정", event_location: "서울청년센터 강동 상담실(올림픽로 610, B동 2층)", application_method: "서울청년포털 청년정책종합상담 메뉴에서 신청", contact_info: "02-441-9381" },
    short: "1:1 청년정책 상담 후 만족도 조사 참여 시 기념품 증정. 11/17부터 선착순 마감 시까지, 평일 10~17시.", period: "2026-11-17 ~ 선착순 마감 시까지", note: "중복 의심 519222ea는 동대문 센터로 별개, 시작일을 마감으로 저장한 값 교정" },
  { id: "10bb26f2", app: [k(`${Y}12`, "14:00:00"), eod(`${Y}23`)], ev: [k(`${Y}27`, "18:30:00"), k(`${Y}27`, "18:30:00")], type: "until_exhausted", cats: ["교육강좌", "행사모집"], conf: 0.95,
    f: { eligibility_summary: "성인 누구나", recruitment_count: "30명(선착순)", participation_fee: "무료", event_location: "도봉문화정보도서관 2층 문화마루", application_method: "도서관 누리집 온라인 신청(전화·방문 불가)", contact_info: "02-900-1835(내선 226)" },
    short: "예술의전당 도슨트의 바르셀로나와 가우디 강의. 11/27 18:30, 30명. 11/12 14시부터 11/23까지 온라인 신청.", note: "포스터·도서관 일치, 기존 10월 회차는 별개" },
  { id: "618aa97c", org: "서울청년센터 광진", app: [k(`${Y}09`), eod(`${Y}18`)], ev: [k(`${Y}21`, "10:00:00"), k(`${Y}21`, "12:00:00")], type: "fixed", cats: ["교육강좌", "행사모집"], conf: 0.95,
    f: { eligibility_summary: "서울시 거주 19~39세 청년", target_age_min: 19, target_age_max: 39, recruitment_count: "30명", event_location: "서울청년센터 광진 2층 어서오소", application_method: "QR 또는 구글폼 신청, 11/19 개별 안내", contact_info: "070-7715-3893" },
    short: "정원 인문학 특강과 테라리움 만들기. 11/21 10~12시, 30명. 11/18까지 신청.", note: "포스터·본문 일치" },
  { id: "70f44b8c", app: [k(`${Y}09`, "09:00:00"), k("2026-12-06", "18:00:00")], ev: [null, null], type: "fixed", cats: ["지원사업", "소상공인"], conf: 0.96,
    f: { eligibility_summary: "예비창업자 및 창업 3년 미만 스타트업(공간별 조건 상이)", recruitment_count: "총 25개사(틔움 21개석, 키움 4개실)", event_location: "경기도 하남시 검단산로 239", application_method: "신청서 내려받아 이메일 접수(ksc@gbsa.or.kr)", contact_info: "031-830-8541" },
    short: "경기창업혁신공간 하남 신규 입주기업 25개사 모집. 12/6 18시까지 이메일 접수, 틔움 무료·키움 인실당 11,000원.", note: "포스터·K-Startup 일치" },
  { id: "4fba0115", app: [k(`${Y}16`, "10:00:00"), null], ev: [k(`${Y}28`), eod(`${Y}29`)], type: "unknown", cats: ["행사모집"], conf: 0.9,
    f: { eligibility_summary: "서울시민(가족 프로그램)", recruitment_count: "20명(추첨)", participation_fee: "1인 50,000원", event_location: "괴산서울농장(충북 괴산군)", application_method: "서울시 공공서비스예약 농장체험 신청, 11/19부터 선정자 개별 연락", contact_info: "괴산서울농장 043-832-3082" },
    short: "괴산 절임배추로 하는 1박 2일 김장 체험. 11/28~29, 20명 추첨, 1인 5만 원. 11/16 10시부터 서울시 예약 신청.", period: "2026-11-16 10:00 ~ (종료일 미기재, 추첨)", concerns: ["신청 종료일 미기재"], note: "여행 종료일을 신청 마감으로 저장한 값 제거" },
  { id: "3bd01102", app: [k(`${Y}09`), eod("2026-12-11")], ev: [null, null], type: "fixed", cats: ["공모전"], conf: 0.93,
    f: { eligibility_summary: "상수도 관망관리 관련 신기술 보유 업체·기관(지역 제한 없음)", application_method: "신청서 등 이메일 접수(khyoon1217@seoul.go.kr)", benefits_summary: "2차 현장실증 참여업체 실증비용 지급, 시범사업 참여", contact_info: "서울시 재난안전정책과 02-2133-8032" },
    short: "서울시 상수도관 누수탐사 신기술 공개모집. 12/11까지 이메일 접수, 현장실증 비용 지원.", note: "포스터·공고 일치" },
];

const REJECT = [
  { id: "04135dd0", why: "기존 공개 공고 695afcf0-8294-4521-92de-7ab43a437a94와 같은 사업·기간(은평 전입청년 이사 지원) 중복 수집본", keep: "695afcf0-8294-4521-92de-7ab43a437a94", conf: 0.97 },
];
const HOLD = [{ id: "3cc1015c", why: "신청 마감 충돌: 포털·본문 11/20, 포스터 신청결과 11/12 13시. 02-592-3721 확인 필요" }];

// Where each stored application end was read (posters_deadline_source_check).
const DEADLINE_SOURCE = new Map(Object.entries({
  poster: ["7e3330ec", "fbfc84cf", "e2f78fd2", "fe772905", "767388dc", "bc875f2d", "8090fb74", "df8f1404", "009d9e6f", "f7fbf788", "c58f8aad", "10bb26f2", "618aa97c", "70f44b8c", "3bd01102"],
  portal: ["06aab008", "c234405c", "0360454f", "24822cc8", "91025c6b", "76aedd4e"],
  notice: ["69179aa2", "5a88c615", "a10dd1b0", "2b05ea0d"],
}).flatMap(([source, ids]) => ids.map((id) => [id, source])));
// Open events: the end is the event's end, not a stated application deadline,
// so the date is kept for closing but not claimed as a verified deadline.
const EVENT_END_AS_DEADLINE = new Set(["99e73827", "caf26380", "f1c2d01c", "c09cddfb"]);

// v6.1 screens read these columns. A date-only end (23:59:59) never claims a time.
function deadlineColumns(p, checkedAt) {
  const appEnd = p.app[1];
  const claimsDate = Boolean(appEnd) && !EVENT_END_AS_DEADLINE.has(p.id);
  const source = claimsDate ? DEADLINE_SOURCE.get(p.id) : null;
  if (claimsDate && !source) throw new Error(`${p.id} has an application end without a deadline source`);
  return {
    deadline_status: claimsDate ? "verified" : "unverified",
    deadline_source: source ?? null,
    deadline_time_verified: claimsDate && !appEnd.includes("T23:59:59"),
    deadline_checked_at: checkedAt,
    reception_verified: [...p.app, ...p.ev].some(Boolean),
  };
}

const RESTORE_FIELDS = ["title", "organizer_name", "summary_short", "summary_long", "poster_status", "published_at", "rejection_reason", "application_start_at", "application_end_at", "event_start_at", "event_end_at", "deadline_type", "deadline_status", "deadline_source", "deadline_time_verified", "deadline_checked_at", "reception_verified", "eligibility_summary", "target_age_min", "target_age_max", "participation_fee", "benefits_summary", "recruitment_count", "application_method", "required_documents", "contact_info", "event_location", "field_verification"];

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [key, ...rest] = a.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "1"];
}));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
if (!url || !key) throw new Error("Supabase URL and service key are required");
const db = createClient(url, key, { auth: { persistSession: false } });
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const SELECT = "*,poster_links(*),poster_categories(category_id,categories(code,name))";

async function rollback() {
  if (args.confirm !== "ROLLBACK_SOURCE_REVIEW_20261111") throw new Error("confirm token required");
  const backup = JSON.parse(fs.readFileSync(args.rollback, "utf8"));
  for (const row of backup) {
    const [cur] = must(await db.from("posters").select("field_verification").eq("id", row.id));
    if (!cur?.field_verification?.[MARKER]) {
      console.log("skip (not changed by this run)", row.id.slice(0, 8));
      continue;
    }
    must(await db.from("poster_links").delete().eq("poster_id", row.id));
    if (row.poster_links.length) must(await db.from("poster_links").insert(row.poster_links.map(({ id: _id, ...link }) => link)));
    must(await db.from("poster_categories").delete().eq("poster_id", row.id));
    if (row.poster_categories.length) must(await db.from("poster_categories").insert(row.poster_categories.map((c) => ({ poster_id: row.id, category_id: c.category_id }))));
    must(await db.from("posters").update(Object.fromEntries(RESTORE_FIELDS.map((f) => [f, row[f]]))).eq("id", row.id));
    console.log("restored", row.id.slice(0, 8));
  }
}

async function verify() {
  const want = new Map([...PUBLISH.map((p) => [p.id, "published"]), ...REJECT.map((p) => [p.id, "rejected"]), ...HOLD.map((p) => [p.id, "review"])]);
  const rows = must(await db.from("posters").select("id,poster_status,application_end_at,deadline_type,deadline_status,deadline_source,deadline_time_verified,reception_verified,field_verification,poster_links(is_primary),poster_categories(category_id)").eq(`field_verification->${MARKER}->>reviewer`, REVIEWER));
  let failures = 0;
  const seen = new Set();
  for (const r of rows) {
    const p = r.id.slice(0, 8);
    seen.add(p);
    const status = want.get(p);
    const problems = [];
    if (r.poster_status !== status) problems.push(`status ${r.poster_status}, expected ${status}`);
    if (status === "published") {
      if (r.poster_links.filter((l) => l.is_primary).length !== 1) problems.push("primary link count");
      if (r.poster_categories.length < 1 || r.poster_categories.length > 2) problems.push("category count");
      const expected = deadlineColumns(PUBLISH.find((item) => item.id === p), null);
      for (const field of ["deadline_status", "deadline_source", "deadline_time_verified", "reception_verified"]) {
        if (r[field] !== expected[field]) problems.push(`${field} ${r[field]}, expected ${expected[field]}`);
      }
    }
    if (problems.length) {
      failures += 1;
      console.log("FAIL", p, problems.join("; "));
    }
  }
  const missing = [...want].filter(([p, s]) => s !== "review" && !seen.has(p)).map(([p]) => p);
  const queue = must(await db.from("posters").select("id").eq("poster_status", "review"));
  console.log(JSON.stringify({ reviewed: rows.length, failures, missing, queue: queue.length, queueIds: queue.map((r) => r.id.slice(0, 8)) }));
  process.exit(failures || missing.length ? 1 : 0);
}

async function main() {
  if (args.verify) return verify();
  if (args.rollback) return rollback();
  const apply = args.apply === "1";
  if (!args.snapshot) throw new Error("--snapshot=<file> is required");
  if (apply && args.confirm !== "SOURCE_REVIEW_20261111") throw new Error("confirm token required");
  if (apply && !args.backup) throw new Error("--backup=<file> is required");
  if (apply && fs.existsSync(args.backup)) throw new Error("backup file already exists");

  const rows = must(await db.from("posters").select(SELECT).eq("poster_status", "review"));
  const catRows = must(await db.from("categories").select("id,code"));
  const catId = new Map(catRows.map((c) => [c.code, c.id]));
  const snapAt = new Map(JSON.parse(fs.readFileSync(args.snapshot, "utf8")).map((r) => [r.id, r.updated_at]));
  const find = (p) => {
    const m = rows.filter((r) => r.id.startsWith(p));
    if (m.length !== 1) throw new Error(`row ${p}: ${m.length} matches in review queue`);
    return m[0];
  };
  const now = new Date().toISOString();
  const previous = (r) => ({
    title: r.title, organizer_name: r.organizer_name, summary_short: r.summary_short, summary_long: r.summary_long,
    application_start_at: r.application_start_at, application_end_at: r.application_end_at, event_start_at: r.event_start_at, event_end_at: r.event_end_at, deadline_type: r.deadline_type,
    deadline_status: r.deadline_status, deadline_source: r.deadline_source, deadline_time_verified: r.deadline_time_verified, deadline_checked_at: r.deadline_checked_at, reception_verified: r.reception_verified,
    decision: r.field_verification?.decision, dateIssues: r.field_verification?.dateIssues, readableNotice: r.field_verification?.readableNotice,
    categories: r.poster_categories.map((c) => c.categories?.code), links: r.poster_links.map((l) => ({ type: l.link_type, url: l.url, primary: l.is_primary })),
  });
  const stamp = (r, p, status, evidence) => ({
    reviewer: REVIEWER, reviewedAt: now, todayKst: "2026-11-11", finalStatus: status, confidence: p.conf, concerns: p.concerns ?? [], evidence,
    imageCheck: "대표 이미지 직접 판독: 실제 포스터/안내 카드", previous: previous(r),
  });

  const plan = PUBLISH.map((p) => {
    const r = find(p.id);
    const [appStart, appEnd] = p.app;
    const [evStart, evEnd] = p.ev;
    for (const [a, b, name] of [[appStart, appEnd, "app"], [evStart, evEnd, "event"]]) {
      if (a && b && Date.parse(a) > Date.parse(b)) throw new Error(`${p.id} ${name} range`);
    }
    const lastUseful = appEnd ?? evEnd;
    if (lastUseful && Date.parse(lastUseful) < Date.now()) throw new Error(`${p.id} would publish expired`);
    const cats = p.cats.map((label) => {
      const code = CATEGORY_CODE_BY_LABEL[label];
      if (!code || !catId.has(code)) throw new Error(`${p.id} category ${label}`);
      return code;
    });
    const v = { ...(r.field_verification ?? {}) };
    const rn = { ...(v.readableNotice ?? {}), summaryShort: p.short };
    const facts = { ...(rn.facts ?? {}) };
    if (p.f?.eligibility_summary) facts.target = p.f.eligibility_summary;
    if (p.f?.event_location) facts.location = p.f.event_location;
    if (p.f?.contact_info) facts.contact = p.f.contact_info;
    if (p.f?.application_method) facts.application = p.f.application_method;
    facts.period = p.period ?? `${appStart ? appStart.slice(0, 10) : "시작일 미확인"} ~ ${appEnd ? appEnd.slice(0, 10) : "미기재"}`;
    rn.facts = facts;
    v.readableNotice = rn;
    v.dateIssues = [];
    v.classificationIssues = (v.classificationIssues ?? []).filter((i) => /region/.test(i?.code ?? ""));
    v.deadlineMatches = true;
    v.decision = "approved";
    v.reason = `Source review approved: ${p.note}`.slice(0, 700);
    if (/중복 의심/.test(p.note)) v.duplicateIssues = [];
    v[MARKER] = stamp(r, p, "published", p.note);
    const deadline = deadlineColumns(p, now);
    v.deadlineProvenance = {
      reviewer: REVIEWER, final: appEnd, status: deadline.deadline_status, source: deadline.deadline_source, timeVerified: deadline.deadline_time_verified,
      reason: EVENT_END_AS_DEADLINE.has(p.id) ? "event-end-used-for-closing" : appEnd ? "direct-source-review" : "no-stated-application-end",
    };
    const update = {
      ...deadline,
      poster_status: "published", published_at: now, rejection_reason: null,
      application_start_at: appStart, application_end_at: appEnd, event_start_at: evStart, event_end_at: evEnd, deadline_type: p.type,
      summary_short: p.short, ...(p.long ? { summary_long: p.long } : {}), ...(p.f ?? {}),
      ...(p.title ? { title: p.title } : {}), ...(p.org ? { organizer_name: p.org } : {}),
      field_verification: v,
    };
    return { p, r, status: "published", update, cats };
  });
  for (const p of REJECT) {
    const r = find(p.id);
    const v = { ...(r.field_verification ?? {}), decision: "rejected", reason: p.why.slice(0, 700), [MARKER]: stamp(r, p, "rejected", p.why) };
    plan.push({ p, r, status: "rejected", update: { poster_status: "rejected", rejection_reason: p.why, field_verification: v } });
  }

  const covered = new Set([...plan.map((x) => x.r.id), ...HOLD.map((h) => find(h.id).id)]);
  const uncovered = rows.filter((r) => !covered.has(r.id)).map((r) => r.id.slice(0, 8));
  const changed = plan.filter((x) => x.r.updated_at !== snapAt.get(x.r.id)).map((x) => x.p.id);
  for (const x of plan) {
    const u = x.update;
    const before = x.r.poster_categories.map((c) => c.categories?.code).sort().join();
    const notes = [];
    if (u.title) notes.push("title");
    if (x.cats && x.cats.slice().sort().join() !== before) notes.push(`cats→${x.p.cats.join("+")}`);
    if (x.p.links) notes.push(`links ${x.r.poster_links.length}→${x.p.links.length}`);
    if (x.p.long) notes.push("body rebuilt");
    console.log(`${x.status.padEnd(9)} ${x.p.id} app ${u.application_start_at?.slice(5, 16) ?? "-"}~${u.application_end_at?.slice(5, 16) ?? "-"} ev ${u.event_start_at?.slice(5, 16) ?? "-"}~${u.event_end_at?.slice(5, 16) ?? "-"} ${u.deadline_type ?? ""} ${u.deadline_status ?? ""}/${u.deadline_source ?? "-"}/time=${u.deadline_time_verified ?? "-"}/reception=${u.reception_verified ?? "-"} | ${notes.join("; ")}`);
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", queue: rows.length, publish: PUBLISH.length, reject: REJECT.length, hold: HOLD.length, uncovered, changedSinceSnapshot: changed }));
  if (uncovered.length || changed.length) {
    console.log("BLOCKED: queue changed since the reviewed snapshot");
    process.exit(2);
  }
  if (!apply) return undefined;

  fs.writeFileSync(args.backup, JSON.stringify(rows, null, 1));
  const done = [];
  for (const x of plan) {
    const id = x.r.id;
    if (x.p.links) {
      must(await db.from("poster_links").delete().eq("poster_id", id));
      must(await db.from("poster_links").insert(x.p.links.map(([link_type, title, linkUrl, is_primary]) => ({ poster_id: id, link_type, title, url: linkUrl, is_primary }))));
    }
    if (x.cats) {
      must(await db.from("poster_categories").delete().eq("poster_id", id));
      must(await db.from("poster_categories").insert(x.cats.map((code) => ({ poster_id: id, category_id: catId.get(code) }))));
    }
    const updated = must(await db.from("posters").update(x.update).eq("id", id).eq("poster_status", "review").select("id,poster_status").maybeSingle());
    if (!updated) throw new Error(`no row updated: ${x.p.id}`);
    done.push(x.p.id);
    console.log("applied", x.p.id, updated.poster_status);
  }
  must(await db.from("admin_actions").insert({
    actor_user_id: null, target_type: "poster", target_id: null, action_type: "approve", action_reason: "source_review_queue_20261111",
    metadata_json: { reviewed_by: REVIEWER, applied: done, hold: HOLD.map((h) => h.id), published: PUBLISH.length, rejected: REJECT.length },
  }));
  console.log("DONE", done.length);
  return undefined;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
