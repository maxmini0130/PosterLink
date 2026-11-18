# 2026-11-19 검수 정답 세트와 크롤러 정확도 기준선

## 목적

크롤러 품질 개선 계획(1~7단계) 중 7단계 작업이다. 지금까지 사람이 원문 검수한 결과를 정답으로 삼아, 크롤러 출력의 항목별 정확도를 숫자로 잰다. 2~6단계 개선이 실제로 효과가 있는지는 이 기준선과 비교해 확인한다.

## 방법

- 자료: `data/results/source-review-*` 17개 묶음(10/29~11/18)
  - 크롤러 값: 각 묶음의 `backup.json`
  - 검수 값: 각 묶음의 `after-<id>.json`
- 여러 번 검수된 공고는 가장 이른 백업을 크롤러 값으로, 가장 늦은 검수 결과를 정답으로 쓴다.
- 비교 항목: 제목, 주관기관, 마감 유형, 마감일(일·분), 접수 시작일, 행사 시작·종료일, 대표 이미지, 링크, 분류, 대상
  - 날짜는 서울 기준 날짜·분으로 비교한다.
  - 연락처 같은 개인정보는 정답 세트에 넣지 않는다.
- 결과물: `scripts/crawler/test-fixtures/review-golden-set.json`(266건)
- 실행: `npm run golden:build`, `npm run golden:measure`

## 기준선 (2026-11-19, 266건)

```
golden rows: 266 (rejected excluded: 0)

field accuracy of crawler output
  title                             68%  (181/266)
  organizer_name                  65.4%  (174/266)
  deadline_type                   77.1%  (205/266)
  application_end_at (day)        77.1%  (205/266)
  application_end_at (minute)     42.5%  (113/266)
  application_start_at (day)      71.1%  (189/266)
  event_start_at (day)            84.2%  (224/266)
  event_end_at (day)              78.2%  (208/266)
  thumbnail_url                     94%  (250/266)
  links (no wrong link)           88.3%  (235/266)
  links (exact set)               78.2%  (208/266)
  categories                      61.3%  (163/266)
  audiences                       85.7%  (228/266)

known error patterns
     18%   48  deadline stored at UTC midnight (date-only not mapped to KST end of day)
   10.9%   29  deadline set but reviewed as none
      9%   24  deadline equals reviewed event day
    1.5%    4  ongoing (상시) not confirmed by review
   16.9%   45  organizer is a collection portal or bare 서울청년센터
   11.7%   31  links from other notices removed
      6%   16  representative image replaced
```

## 해석

- 마감일은 날짜 단위로 77%가 맞지만, 시각까지 보면 43%만 맞는다.
  - 날짜만 있는 마감이 UTC 자정으로 저장된 경우가 18%다.
  - 마감이 없는데 만든 경우가 11%, 행사일을 마감으로 쓴 경우가 9%다.
- 주관기관 정확도는 65%다. 수집 포털 이름이나 지점명 없는 '서울청년센터'로 들어간 경우가 17%다.
- 다른 공고 링크가 섞인 경우가 12%, 대표 이미지를 바꾼 경우가 6%다.
- 다음 단계는 2단계(날짜 정규화)와 3단계(주관기관)다. 위 오류 유형이 줄어드는지로 효과를 확인한다.

## 한계

- 정답 세트는 이미 저장된 크롤러 출력을 비교하므로, 코드를 고친 뒤 새 결과를 다시 재려면 각 단계에서 원본 입력(원문 페이지·포털 필드)을 다시 처리하는 재현 테스트를 함께 만든다.
- 정답 세트는 사람이 검수한 공고만 포함한다. 자동 승인된 공고의 품질은 포함되지 않는다.
