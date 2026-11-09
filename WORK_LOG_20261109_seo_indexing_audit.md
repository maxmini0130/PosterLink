# 2026-11-09 검색 색인 읽기 전용 점검

## 범위와 기준

- 사용자 제공 GSC: 색인 696, 미색인 1,313, 발견 후 미색인 1,129, 크롤링 후 미색인 102, 3개월 노출 324/클릭 12. URL별 원본은 미제공이며 GSC 연결 도구도 없어 집단별 분포와 원인은 확정하지 못했다.
- git fetch origin 완료. 현재 HEAD 1166345, origin/main 대비 로컬 전용 24/원격 전용 100커밋. 현재 브랜치의 동명 원격은 없음. 로컬 구현을 운영 배포와 동일하다고 가정하지 않았다. 기존 미추적 문서 보존.
- 운영 공개 URL에 익명 GET만 사용. 앱 코드, DB, 데이터, 환경설정, 배포 변경 없음. 이 작업 기록만 추가.

## 관측 결과

- business 카테고리 HTTP 200, 초기 HTML에 공고 20개 링크(현재 모집 14개 및 마감 표본 6개), 마감 공고 전체 건수 124. title/description/self canonical 정상. robots 메타와 X-Robots-Tag의 색인 차단 없음. robots.txt도 공개 경로 허용.
- 대표 URL은 https://www.posterlink.kr. HTTP apex는 HTTPS apex로 308, HTTPS apex는 www로 307, www HTTPS는 200. 일관된 목적지이나 영구 이전에 임시 307이 사용되고 HTTP apex는 2단계 이동. Next 설정에 호스트 리디렉션이 없어 Vercel 도메인 설정 확인 필요.
- sitemap-index.xml 및 하위 5개 XML 모두 200 및 XML 파싱 성공. sitemap.xml 323개, 공고 조각 1,000/1,000/1,000/395개. 전체 3,718개 모두 유일하고 www 도메인.
- 구성: 공고 상세 3,395, 카테고리 17, 지역 단독 35, 지역×분야 169, 기관 상세 97, 기타 5. 이는 현재 사이트맵 분포이며 GSC 미색인 집단의 분포가 아님.
- 유형별 표본 12개 모두 200/self canonical/색인 차단 없음. 전체 3,718개 페이지 상태는 전수 조사하지 않음. 기관 표본 econ-chungnam/econ-jeonbuk/sinbo-gwangju 모두 공고 링크 0개.
- 홈 HTML에 카테고리 전용 링크 0개, UUID 공고 상세 링크 0개. 공고 제보 링크 2개는 상세 공고 링크가 아님. 지역×분야 링크는 있음. 관심분야 링크는 /posters?q=...로 연결되고 검색 결과는 noindex/follow. 홈 통계 신청 가능 296건인데 피드는 빈 결과 표시. 로컬에 초기 피드 전달 구현은 있으므로 배포 버전/데이터/필터 확인 필요.
- 강남·강동 지역 목록 각각 48개 공고 중 40개 공유(Jaccard 0.714). 전국/서울 자격의 정상 포함 가능성이 있어 오류나 중복 공고로 확정하지 않음. 랜딩별 고유 가치가 약해질 위험.
- 존재하지 않는 UUID 상세 및 invalid sitemap 조각은 실제 404. 기존 테스트가 비공개 표본으로 사용하는 두 UUID는 현재 운영 200이므로 과거 fixture의 비공개 상태를 현재 정책 증거로 쓰면 안 됨. 실제 삭제 URL은 미제공.
- 상세 표본 0045095f-4ecc-4b10-b3cb-f2beeee6d4f9의 description은 기관명+일반 안내 fallback. 전체 상세 품질이나 102개 집단의 대표성은 확인하지 않음.
- 로컬 상세 조회는 DB 오류와 미존재를 모두 null로 바꾸고 notFound로 처리한다. 일시 DB 장애가 404로 잘못 표현될 위험. 실제 장애 발생 여부는 미확인.

## 개선 우선순위와 예상 파일

1. P1: 홈 전용 카테고리 링크 및 실제 초기 공고 링크 복구. apps/web/app/HomeClient.tsx, app/page.tsx, e2e/seo.spec.ts. 검색 발견 구조 영향 높음, 위험 낮음~중간(홈 필터/개인화 회귀).
2. P1: GSC 두 집단 URL export를 현재 sitemap/공개 상태/접수 상태/SSR 링크/Google 선택 canonical/원문 및 내용 중복과 조인. 우선 읽기 전용 감사 도구. GSC 집계 시점 및 속성 범위를 맞춰야 함.
3. P1: 실수요 카테고리·지역 랜딩에 신청 자격/혜택/모집기간/공식 출처 및 관련 공고를 근거 기반으로 보강. lib/categoryContent.ts, app/categories/[category]/page.tsx, app/components/DiscoveryLanding.tsx, lib/publicDiscovery.ts. 영향 높음, 위험 중간. 전국 자격을 임의 배제하거나 미확인 기간을 상시로 바꾸지 않음.
4. P2: 빈 기관·유사 지역 조합을 평가해 sitemap 선별. app/sitemap.ts, lib/publicDiscovery.ts, app/institutions/[slug]/page.tsx, app/regions/[region]/[category]/page.tsx. 위험 중간~높음: 일괄 noindex/삭제는 기존 유입 손실 가능. sitemap 제외 자체는 색인 삭제 아님.
5. P2: apex→www를 영구 308/301로 통일하고 가능하면 HTTPS www 직행. Vercel 도메인 설정 우선 확인, 필요 시 next.config.mjs. 영향 중간, 위험 중간(인증 콜백·경로·쿼리 보존).
6. P2: 오류/미존재 구분, 가치 있는 마감 기록 200 유지, 실제 삭제/비공개는 404 유지. app/posters/[id]/page.tsx, 관련 sitemap 및 공개 노출 helper. 신뢰/색인 안정성 영향 높음, 위험 중간~높음(RLS·비공개 노출 회귀).

## 후속 판단과 검증

- 마감만으로 404/noindex 하지 않음. 과거 지원 조건·서류·기관·회차 비교 가치가 있으면 종료일/마감 표시 및 현재 관련 모집 링크와 함께 보존. 새 회차는 별도 URL, 동일 공고 중복은 원문과 기관 확인 후 대표 URL 결정. 무관한 홈 일괄 리디렉션 금지.
- 1,129개는 미크롤링 대기라는 상태이지 품질 불량 확정이 아님. 102개도 중복/저품질 확정이 아님. URL별 Google 마지막 크롤링 및 선택 canonical, 렌더링 결과와 콘텐츠 비교가 필요.
- GSC 미색인 사유 중 나머지 82개도 별도 확인. 현재 사이트맵 3,718과 GSC 집계 2,009는 시점/속성/발견 범위가 다를 수 있어 차이를 미색인 건수로 해석하지 않음.
- 성공 지표는 우선 랜딩·신규 고품질 공고의 비브랜드 노출/클릭, 검색 유입 후 공식 원문·신청 이동, 신규 공고의 크롤링 소요 시간. 전체 색인 수만 목표로 하지 않음. 324회 표본에서 CTR 3.7%만으로 제목 성과 확정 불가.
- 검증: 운영 HTTP/HTML/헤더, 전체 사이트맵 XML 및 중복 검사, 유형별 표본, 로컬 구현/기존 테스트 정적 검토. 웹 lint/build와 앱 테스트는 코드 변경이 없어 실행하지 않음. 문서 Prettier 및 git diff --check 확인. 배포/운영 DB 쓰기 없음. 코드 롤백 불필요.
