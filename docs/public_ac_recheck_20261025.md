# A/C 재조사·분리 결과 — 2026-10-25

기준: `82fb1f4` 부모 `9bb8a9e`. A/C 브랜치 `fix/public-ac-web-20261025`, B 브랜치 `fix/public-b-regions-20261025`. 원래 혼합 커밋은 원래 브랜치에 보존했다. 배포·push·운영 DB 쓰기는 수행하지 않았다.

## 1. 캐시와 기준일 코드 추적

운영 코드 `0aa3524`, 부모 `9bb8a9e`, 수정본을 대조했다. 검색 범위는 `/posters` page/client/card, 공통 application/publicDiscovery, layout/middleware/next.config, 공유 코드 및 DB migration이다.

| 경로                 | 코드 근거                                                                                                                                                                        | 판정                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/posters` 서버 렌더 | `apps/web/app/posters/page.tsx:7` force-dynamic → fetchPublicDiscovery                                                                                                           | 빌드 시 정적 목록을 생성하는 경로 아님. 부모도 동일                                                          |
| 목록 데이터          | publicDiscovery의 createPublicSupabaseClient global fetch에 `cache: "no-store"` 명시(부모80행, 수정81행). 검색 RPC와 count 모두 이 client 사용                                   | Next fetch Data Cache를 사용하는 목록 wrapper 없음                                                           |
| 목록 캐시 API        | 목록 경로에 unstable_cache / force-cache / revalidate / next.tags 설정 없음. 목록 하위 layout 없음, root layout/next.config에도 해당 설정 없음                                   | 재검증 태그/TTL을 발견하지 못함. 헤더만 보고 판정한 것이 아님                                                |
| React cache()        | `app/posters/[id]/page.tsx:145`의 fetchPosterDetail에서 사용                                                                                                                     | 상세 페이지 전용. `/posters` 목록 조회를 감싸지 않음                                                         |
| D-day 기준일         | 운영/부모 posterApplication의 `const nowTime = (input.now ?? new Date()).getTime()`(부모87행) → Asia/Seoul dateOrdinal → endDay-today. PosterCard는 DB application_end_at만 전달 | SSR은 서버 시계, 클라이언트 렌더는 브라우저 시계. 고정 9/20·날짜 env·max(crawled_at) 입력 없음               |
| 화면 접수 중 판정    | publicDiscovery isAcceptingPoster → 같은 application 함수; client도 같은 함수                                                                                                    | 렌더 당시 Date. 부모 카드에는 시계 갱신 타이머가 없었음                                                      |
| DB 접수 중 판정      | 저장소 최신 search/count RPC(`20260831010000...sql`)에서 시작 <= now(), 종료 >= now() 또는 종료 NULL + 명시적 상시/소진시                                                        | DB 시계의 now(). 크롤 시각을 기준일로 사용하지 않음. 실제 운영 DB 함수 본문을 새 SQL로 조회/교체한 것은 아님 |
| 수정 시계            | usePosterClock의 new Date(), 30초 interval·focus·visibilitychange                                                                                                                | 장시간 열린 화면의 표시를 갱신. 새로운 env 기준일을 추가하지 않음                                            |

수정본·운영/부모 관련 코드에서 Date 전역 덮어쓰기, 고정 2026-09-20/21, 날짜 override env, 크롤 시각 MAX를 D-day에 연결하는 코드가 발견되지 않았다. 테스트의 `input.now`/fake Date는 테스트에서만 사용한다. 목록 Client의 Date.now는 검색 로그 중복 방지용이며 D-day 기준일이 아니다.

### 현재 운영 HTML 재조회

요청한 curl의 본문을 그대로 저장하고 정규식과 head에 해당하는 첫10개 추출을 했다. Windows에는 grep 대신 Python의 동일 정규식을 사용했다. DOM으로 재계산한 값이 아닌 **원본 HTML 텍스트**다.

```text
2026.11.16까지 · D-22
2026.11.13까지 · D-19
2026.11.02까지 · D-8
2026.10.27까지 · D-2
2026.11.02까지 · D-8
2026.11.12까지 · D-18
2026.11.04까지 · D-10
2026.11.05까지 · D-11
```

원본: 로컬 `data/results/cache-recheck-production-20261025.html`. curl GET 외 실행·게시 없음.

**종결: “미재현, 관측 측 캐시로 추정”.** 사용자 지시에 따라 이 분류로 종결한다. 수동 스모크 `scripts/security/production-poster-date-smoke.mjs`를 추가했다. 운영 HTML article의 표시 마감일·D-day를 실제 KST 오늘과 대조하며, 0쌍/조회 오류/자정 통과는 성공이 아닌 확인 불가로 반환한다. 스크립트는 작성만 했으며 실행·테스트 연결·스케줄 등록하지 않았다.

## 2. 실패 3건 부모 재실행

동일 테스트 파일·동일 name pattern을 부모 detached worktree와 A/C worktree에서 실행했다. 파일/expected/assertion을 변경하지 않았다.

```text
tsx --test --test-name-pattern="release preserves|unapproved analytics|GA integration preserves"
  scripts/security/profile-role-release.test.ts
  scripts/security/naver-emergency-stop.test.ts
```

| 검사                                                                                   | 부모9bb8a9e | 혼합82fb1f4 | 분리A/C  | 분류·처리                                                                                                                            |
| -------------------------------------------------------------------------------------- | ----------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| release preserves the five role-free handlers and adds only approved signup statistics | 실패        | 실패        | 실패     | 기존 실패. b3519d2 기준의 변경 파일 목록을 고정해 후속 GA 릴리스와 충돌. 원인 기록만                                                 |
| unapproved analytics is absent and existing authorization paths are unchanged          | 실패        | 실패        | 실패     | 기존 실패. 이미 부모에 있는 analytics 파일을 없어야 한다고 요구. 원인 기록만                                                         |
| GA integration preserves Production security, stats, SEO and migrations byte-for-byte  | **통과**    | **실패**    | **통과** | **신규 실패였다.** 82fb1f4가 package.json 및 supabase/Edge·migration 파일을 바꿔 고정 검사를 위반. A/C에서 해당 변경을 제외하여 수정 |

이전 보고에서 세 실패를 모두 기존 실패처럼 분류한 설명을 정정한다. 원래 혼합 커밋의 실패를 숨기지 않고 분리본에서 신규 실패가 제거됐음을 확인했다.

증거: root ignored `data/results/parent-three-failures-20261025.log`, `ac-three-tests-20261025.log`; 기존 혼합 결과는 `emergency-security-tests.log`.

## 3. A/C와 B 경계

A/C는 홈 SSR·카운트·검색 토글, D-day 표시, 마감/공식 신청 링크, 충돌 지역의 확인 필요 표시를 포함한다. 지역 매핑/자치구 필터/광역 섹션 및 신규 스키마는 B에 남겼다.

- A/C의 `supabase/`, package.json, lockfile, 기존 API route는 부모와 동일하다. 신규 `/api/posters/discovery`는 **GET 조회만** export하며 공개 client로 읽는다. 새 SQL/migration 없음.
- 82fb1f4의 Edge 알림 함수 변경과 supabase shared application 이동은 A/C에서 제외했다. 공용 application 엔진은 web/lib 안에 유지한다. 알림 배포·쓰기를 변경하지 않는다. 원래 구현은 혼합 브랜치에 보존되어 있고 별도 검토 전 적용하지 않는다.
- 상세 화면의 기존 `toggleFavorite`와 `logOfficialLinkClick` 변수 선언 본문은 부모 소스 그대로 복원·대조했다. 기존 DB 쓰기 함수/엔드포인트 구현을 변경하지 않았다. 신청 CTA의 선택/노출을 바꿨으며 새 쓰기 경로를 만들지 않았다.
- A/C에서 B의 자치구 분리를 배포한 것처럼 설명하지 않는다. B는 독립 브랜치이며 미적용 SQL과 읽기 전용 diff·샘플을 제공한다.
- A/C에는 기존 미승인 privacy 초안이 기준 브랜치에서 상속되어 있다. 이것을 포함한 브랜치 전체를 Production에 배포하면 안 된다. 실제 배포 승인 후 Production 안전 기준에 A/C 커밋만 적용해 확인해야 한다. GA·방침 게시 승인을 대신하지 않는다.

검증: 분리본 Node20 build/lint 통과, 새 유닛15통과, A/C PC·모바일8통과. 루트 전체172건 중170통과/기존2실패. 지역 B E2E는 A/C에서 제외했으므로 이전 혼합10건과 구별한다. 부모 재현된 실패2건을 전체 PASS로 표시하지 않는다. 배포·PR 생성·push 없음.

## 4. B 산출물

B worktree의 `docs/region_diff_groups_samples_20261025.md`에 전체/변경/유지 및 confidence 표와 무작위53샘플을 첨부했다. 10건 이상 묶음은 변경 제안 중10건, 구조화0.7 묶음은 전체3건(변경2/유지1), 소스 기본값0건은 샘플 없음. 원 CSV/plan/보조 master 분류 SHA256과 seed를 기록했다. 기관 후보를 실제 마스터 매칭과 제목 단서로 구별했으며, 어느 묶음도 일괄 승인하지 않았다.
