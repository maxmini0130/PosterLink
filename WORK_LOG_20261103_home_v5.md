# 홈 v5·카드 정보·기관 팔로우 제안·측정 (2026-11-03)

상태: 로컬 구현·검증 완료, 독립 검토 대기. 기준 `release/design-20261102`(d0717fe), 브랜치 `feat/home-v5-20261103`, 작업 폴더 `C:\Maxmini_Project\PosterLink-home-v5`. 지시서 `docs/POSTER_FEED_INSTRUCTION_2026-11-01.md` 추가 지시(6~10)와 추가 지시 2(11~14), UI 문서 3-4장 C-0·C. 운영 DB 쓰기·마이그레이션 운영 적용·백필·배포·push 없음.

## 6번 조사 (운영 DB 읽기 전용, 게시 중 602건)

- 주관기관과 수집 출처: 스키마는 `organizer_id`·`source_institution_id`·`organizer_name`·`source_org_name`로 분리돼 있지만 `organizer_id`는 0건이다. 청년몽땅 게시물 456건 중 181건은 `source_org_name`에 주관기관명이 들어 있다. 크롤러는 주관기관을 못 찾으면 `organizer_name`을 출처명으로 채운다.
- 지역: `poster_regions` 하나로 장소·자격·소재지를 구분하지 않는다. 근거는 자격 문구 20(3%), 본문 키워드 254, 전국·서울 신호 72, 근거 없음 256건이다. 장소 텍스트(`event_location`)는 192건(32%)이다.
- 대상·혜택: 표본 108건 중 대상이 명시된 것은 44%, 무료·금액이 확인되는 것은 14%다. 마포 직접 게시판은 내용이 이미지에만 있다.
- 진행일: `event_start_at` 41%. 접수 중 행사·교육형은 79%. 접수 중인데 진행 종료일이 지난 공고가 47건이다.
- 팔로우: `institution_follows` 0행이다. 화면은 사실상 출처 기관 기준이다. 상세의 팔로우 카드는 `organizer_id`가 없어 보이지 않는다.

## 결정 (사용자 확인: 추천안으로 진행)

- 카드 둘째 줄은 `card_facts_status = 'verified'`인 값만 표시한다. 추출값은 모두 `needs_review`로 저장한다.
- 지역 문구: 저장된 `poster_regions.basis`를 먼저 쓴다. 없으면 자격 근거는 `주민`, 장소 텍스트 일치는 `에서`, 그 외는 `관련`이다. 시·도는 `서울 전체`, 전국은 `전국`이다.
- 신청 대상: 표시된 대상 문구(`eligibility_summary`)나 저장된 연령에서만 뽑는다. 제목·기관명(청년센터 등)에서는 뽑지 않는다.
- 기본 범위는 서울(+전국)이다. 조건이 있으면 일치하는 공고를 앞에 둔다(숨기지 않음).
- 진행일이 지난 공고는 홈에서 제외한다(지시 13).
- 팔로우 제안은 organizer만 대상으로 한다. 방문당 1회, 팔로우·거절한 기관은 다시 제안하지 않는다. 문구는 홈 '팔로우 기관 소식'만 말하고 알림을 약속하지 않는다. 시안 문구 "받아보시겠어요"는 "모아 보시겠어요"로 바꿨다.
- 문구가 사실이 되도록 회원 홈에 '팔로우 기관 소식' 줄을 추가했다(팔로우한 organizer 공고가 3개 이상일 때만 표시).

## 변경

- 마이그레이션 파일만 작성: `supabase/migrations/20261103010000_add_home_v5_card_facts.sql`
  - `posters`에 `benefit_summary`(20자), `benefit_kind`, `event_schedule_kind`, `card_facts_status`, `featured_week`(월요일)를 추가한다.
  - `poster_regions.basis`를 추가한다.
  - `public_poster_popularity_7d` RPC(집계만 제공)를 추가한다.
  - `product_events`에 follow_prompt_shown·click·dismiss, feed_card_impression·click 이벤트와 prompt_id·trigger·section_id·position·image_kind 속성을 추가한다.
  - 검증·롤백 쿼리를 파일에 포함했다.
- 홈 v5
  - `lib/homeFeed.ts`(순수 배치): 눈여겨볼 → 7일 마감 → 팔로우 기관 소식 → 새 공고 12장마다 기획 묶음 → 첫 묶음 뒤 기관 1회. 중복 금지, 3개 미만 숨김.
  - 기획 묶음은 `CURATED_BUNDLES` 정의로 추가한다.
  - `lib/homeFeedServer.ts`: 공개 키로 서버에서 읽는다. 미적용 컬럼은 폴백한다.
  - `app/api/home`: 조건과 다음 페이지를 제공한다.
  - `app/page.tsx`: 서버 렌더링, `?page=N`을 지원한다.
  - `HomeClient`: 칩·검색·한 줄 소개, 분야 바로가기 8, 가로 줄과 PC 4열, 화면 끝 600px 전 이어 불러오기와 `더 보기` 링크, 뒤로 가기 복원, 노출·클릭 측정.
  - 기존 탭과 관심 안내 카드는 제거했다.
- 카드: `FeedCard`를 세 줄로 바꾸고(row 변형 150px 포함) `lib/cardFacts.ts`에 지역 문구·대상·혜택+진행일 규칙을 둔다.
- 팔로우 제안: `lib/followPrompt.ts`, `components/pl/FollowPrompt.tsx`.
  - 홈 찜 직후, 상세 찜 직후·20초 체류·끝까지 스크롤에서 제안한다.
  - 비회원은 pending_action follow에 promptId를 붙이고, signup intent에도 promptId를 남긴다.
  - 표기를 '팔로우'로 통일했다(상세·내 공고·마이·쇼케이스).
- 관리자 공고 목록에 게시 공고용 '이번 주 선정' 토글을 추가했다(`featured_week`, admin_actions 기록). 마이그레이션 전에는 안내 문구만 나온다.
- 크롤러(하위 에이전트 구현, 검토함)
  - `poster-card-facts.js`(혜택·일정·주관기관 후보·지역 근거)를 추가하고 `upload-to-supabase.js` 신규 공고에 적용했다. 컬럼이 없으면 저장을 폴백한다.
  - 오프라인 dry-run `audit-card-facts.js`, `plan-organizer-institutions.js`를 추가했다. 둘 다 `--apply`가 없다.
- 측정 쿼리: `docs/content_supply_metrics_20261103.md`(C1~C4 콘텐츠 공급, F1 팔로우 제안 효과).
- E2E
  - `e2e/home-v5.spec.ts`와 고정 데이터 `e2e/fixtures`를 추가했다. 고정 데이터는 `UI_SHOWCASE=1 HOME_FEED_FIXTURE`에서만 읽고 배포 환경에서는 비활성이다.
  - interests·my-posters·home-search 기대값을 v5에 맞췄다.
  - 탭·관심 안내 카드를 검사하던 `poster-feed.spec.ts`는 삭제했다. 이미지 상태 검사는 home-v5로 옮겼다.

## Dry-run 결과 (운영 스냅샷 파일 입력, DB 연결 없음)

- 혜택 추출 132/602(21.9%): free 65, paid 41, grant 12, prize 5, experience 5, service 4.
- 전수 대조 정밀도: 엄격 96.2%, 관대 99.2%. 같은 데이터로 규칙을 조정했으므로 신규 수집분의 정밀도는 더 낮을 수 있다.
- 남은 오류 유형: 연계 프로그램 혜택 혼입, 조건부 지급의 조건 누락, 다중 가격 중 첫 가격.
- 진행일 형태: unknown 356, single 129, recurring 64, range 53. 이상 6건.
- 주관기관 후보 587/602. 정본 288개 중 신규 274(비공개·unverified), 기존 일치 14. 연결 대상 공고 584건.
  - SQL은 PREVIEW 파일만 만들었고 실행하지 않았다.
  - 지역 근거: institution 256, related 159, venue 147, eligibility 68.

## 콘텐츠 공급 지표 1회 실행 (운영 DB 읽기 전용; 로컬·스테이징에 데이터가 있는 DB가 없음)

- C1 서울 청년 7일 새 공고: 기타 28, 교육·취업 23, 문화·행사 17, 지원금·복지 2, 육아·가족 2, 주거·금융·소상공인·건강 각 1.
- C2 마포 7일 새 공고 6건, 직접 확보 0(0%).
- C3 30일 이상 빈 기관
  - 새 공고가 한 번도 없는 공개 기관 72곳(전국 창조경제혁신센터·신용보증재단·마포 동 주민센터 등).
  - 마지막 공고 이후 30일 이상: 마포구시설관리공단 171일 등 14곳.
  - 분야 공백은 없다.
- C4 접수 중 268건 중 기본 이미지 0(0%). 치수 미확인은 원본으로 셌다.
- F1 팔로우 제안: 이벤트 미적용이라 0행.

## 검증

- 웹: `tsc --noEmit` 통과, `next lint` 경고 없음, `next build` 통과(일반·`.next-e2e`).
- 루트 `pnpm test`(Node 24.15): 336건 중 334건 통과. 실패 2건은 기존 profile-role-release 스냅샷 검사이고 이번 변경과 무관하다.
- 새 단위·마이그레이션 검사: cardFacts 7, homeFeed 10, followPrompt 4, home-v5 마이그레이션 PGlite 3. 모두 통과.
- `scripts/security` 전체 111건 중 108건 통과. 기존 실패 3건(profile-role-release 2, withdrawal-release 1)은 그대로이고 신규 실패는 없다.
- 크롤러 `pnpm --filter posterlink-crawler test`: 360건 모두 통과.
- E2E `home-v5.spec.ts`(고정 데이터 서버, 브라우저 쓰기·이벤트는 모두 가로챔): 14건 통과.
  - 섹션 순서·중복 없음·카드 세 줄·6개 폭(가로 넘침 0, 2/3/4열, 줄 4장)·이미지 대체·이어 불러오기와 복원·no-JS `?page=2`.
  - 노출 이벤트, 비회원·회원 팔로우 제안(prompt_id 연결, 거절 기억, 방문당 1회).
- 실데이터(읽기 전용 빌드 `NEXT_PUBLIC_LOCAL_READ_ONLY=1`) 홈: 390·1280 모두 섹션이 deadline·new·youth 묶음 순서로 나오고 가로 넘침 0. 눈여겨볼 공고는 검증된 혜택이 0건이라 숨겨진다.
- 스크린샷(로컬, Git 제외): `apps/web/playwright-report/home-v5/`
  - `home-{360..1440}.png`, `follow-guest-390.png`, `follow-member-1280.png`, `real-home-{390,1280}(-first).png`.

## 하지 않은 것·승인 필요

- 마이그레이션 `20261103010000` 운영 적용. 적용 전에는 혜택 줄·눈여겨볼 공고·주말 묶음·지역 basis·새 이벤트가 동작하지 않는다(폴백으로 화면은 정상).
- 카드 사실 백필과 검수, 주관기관 정본 생성·`organizer_id` 연결(PREVIEW SQL). 이 작업 전에는 팔로우 제안·팔로우할 만한 기관·팔로우 기관 소식이 나오지 않는다.
- 진행일 이상 47건 점검. 지금 규칙으로는 홈에서 빠진다.
- 상세의 체류·스크롤 제안은 organizer 있는 실공고가 없어 E2E로 확인하지 못했다(규칙 단위 검사만 했다).
- 개인정보처리방침 문안: 새 이벤트(카드 노출·클릭, 팔로우 제안)도 기존 '이용 행태 정보'에 포함된다. 문안 변경 제안은 검토 시 함께 결정한다.
- Codex 독립 검토, push·PR·배포.
