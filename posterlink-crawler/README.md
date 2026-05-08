# PosterLink Crawler

공공기관 포스터/공고 데이터 수집 크롤러

## 대상 기관 (34개 사이트, 38개 게시판)

| # | 기관 | ID | 게시판 |
|---|------|-----|--------|
| 1 | 서울특별시 | `seoul-city` | 공고/고시 |
| 2 | 마포구청 | `mapo-gu` | 공지사항, 채용공고 |
| 3 | 마포구 16개 동 주민센터 | `mapo-dong-*` | 주민센터 소식 |
| 4 | 마포구의회 | `mapo-council` | 공지사항, 입법예고 |
| 5 | 마포구시설관리공단 | `mfmc` | 공지사항, 채용공고 |
| 6 | 마포문화재단 | `mfac` | 재단소식 |
| 7 | 마포인재육성장학재단 | `mapo-scholarship` | 공지사항 |
| 8 | 마포문화원 | `mapo-culture` | 공지사항 |
| 9 | 마포구고용복지지원센터 | `mapo-employ` | 공공일자리 |
| 10 | 마포구노동자종합지원센터 | `mapo-labor` | 공지사항 |
| 11 | 구립망원청소년문화센터 | `mangwon-youth` | 공지사항 |
| 12 | 구립도화청소년문화의집 | `dohwa-youth` | 공지사항 |
| 13 | 구립마포청소년문화의집 | `mapo-youth` | 공지사항 |
| 14 | 마포장애인종합복지관 | `mapo-disabled` | 공지사항, 채용공고 |
| 15 | 마포노인복지센터 | `mapo-senior` | 공지사항 |
| 16 | 마포구민체육센터 | `mapo-sports` | 공지사항 |
| 17 | 한국전기안전공사 | `kesco` | 공지사항 |
| 18 | 마포구어린이급식관리지원센터 | `mapo-kids-meal` | 공지사항 |
| 19 | 마포복지재단 | `mapo-welfare-foundation` | 공지사항, 채용공고 |

## 설치

```bash
cd posterlink-crawler
npm install
```

## 사용법

```bash
# 등록된 사이트 목록 확인
node src/index.js --list

# 전체 사이트 크롤링
npm run crawl

# 특정 사이트만 크롤링
node src/index.js --site mapo-gu
node src/index.js --site mapo-dong    # 16개 동 주민센터 전체
node src/index.js --site mfac         # 마포문화재단만

# 드라이런 (목록만 수집, 상세 페이지 미접근)
npm run test
```

## 출력

```
data/
├── results/
│   ├── mapo-gu_20260508_143000.json     # 사이트별 결과
│   ├── mfac_20260508_143100.json
│   └── all_2026-05-08.json              # 전체 통합
├── seen_urls.json                        # 중복 방지용 (이미 수집한 URL)
└── crawler.log                           # 실행 로그
```

## 결과 데이터 형식

```json
{
  "title": "2026년 마포구 청년 창업지원금 모집",
  "url": "https://www.mapo.go.kr/site/main/board/notice/12345",
  "date": "2026-05-08",
  "deadline": "2026-06-30",
  "content": "마포구에 거주하는 만 19~39세 청년을 대상으로...",
  "images": ["https://www.mapo.go.kr/upload/poster.jpg"],
  "attachments": [
    { "name": "신청서.hwp", "url": "https://..." }
  ],
  "board": "공지사항",
  "category": "공지",
  "site": "마포구청",
  "siteId": "mapo-gu",
  "crawledAt": "2026-05-08T14:30:00.000Z"
}
```

## 어댑터 구조

각 기관의 HTML 구조가 다르기 때문에 어댑터 패턴을 사용합니다.

```
src/adapters/
├── index.js          # 어댑터 레지스트리
├── generic-board.js  # 그누보드 계열 범용 파서 (대부분의 기관)
└── mapo-gu.js        # 마포구청 전용 파서
```

### 새 어댑터 추가 방법

1. `src/adapters/` 에 새 파일 생성 (예: `mfac-custom.js`)
2. `parseList(boardUrl, site, maxPages)` — 목록에서 게시물 링크 추출
3. `parseDetail(postUrl, site)` — 상세 페이지에서 정보 추출
4. `src/adapters/index.js` 에 등록
5. `src/sites.js` 에서 해당 기관의 `adapter` 값 변경

## 크롤링 정책

- **요청 간격**: 같은 사이트 내 1.5초, 사이트 간 3초
- **동시 요청**: 1개 (순차 처리)
- **페이지 수**: 사이트당 최대 2~3페이지
- **중복 방지**: seen_urls.json으로 이미 수집한 URL 스킵
- **User-Agent**: PosterLink 크롤러임을 명시

## Supabase 연동

수집된 JSON을 PosterLink DB에 넣으려면:

```bash
# 환경변수 설정
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_KEY=eyJ...

# 업로드 스크립트 실행
node src/upload-to-supabase.js data/results/all_2026-05-08.json
```

## 자동 실행 (cron)

매일 오전 9시에 크롤링 실행:

```bash
# crontab -e
0 9 * * * cd /path/to/posterlink-crawler && node src/index.js >> data/cron.log 2>&1
```

## 주의사항

- robots.txt를 확인하고 준수하세요
- 공공기관 홈페이지 서버에 부하를 주지 않도록 요청 간격을 유지하세요
- 수집한 데이터는 공공누리 라이선스를 확인하세요
- 일부 사이트는 HTML 구조가 변경될 수 있으니, 크롤링 실패 시 어댑터 수정이 필요합니다
