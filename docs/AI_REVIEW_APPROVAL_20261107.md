# 2026-11-07 검수 대기 원문 검토 및 승인

## 적용 후 검증

- 변경 대상 103건 전부 저장 후 재조회 일치, 관리자 감사 기록 및 완료 저널 저장.
- 익명 공개 검색에서 승인 18건 전부 확인. 접수중 목록에는 게시 11건만 확인되고, 마감 7건은 제외됨. 보류 85건은 공개 목록 노출 없음.
- 접수중 검색 270건·집계 270건 일치. 마감 포함 집계 3,323건이며 검색 반환은 API 상한 500건으로 검증함.
- 크롤러 테스트 385개 통과. 실행기 구문검사, Prettier 및 `git diff --check` 확인.
- 전체 AI healthcheck는 `quality_gate_status=fail`: 낮은 이미지 신뢰도 2건, 필드 정정 후보 1건이 남음. 공개 비포스터 후보는 0건. 이 전체 잔여 문제를 해결했다고 간주하지 않음.
- 승인 후 유지 필드까지 다시 확인하다 시흥도서관 추가 모집의 혜택란에 기관명이 들어간 오류를 발견해 원문의 책 제작·사진전·출판기념회 공유 예정으로 정정. `finalize-review-benefits-20261107.js`가 승인 후 스냅샷·수정시각 일치를 확인하고 해당 필드만 변경했으며 감사 기록과 변경 전후를 별도 보존함.
- 보류 중 제목 수정: 서울청년센터 양천 → `서울청년센터 양천 <SKILL ON: 클로드 마스터> 참여자 모집`. 상주서울농장·괴산서울농장 2회차의 행사 종료일을 잘못 넣은 신청 마감은 삭제하고 `unknown`으로 보존.

기준: Asia/Seoul, 시작 검수 대기 103건. 공식 본문·신청 경로 232개 응답과 대표 이미지 103개를 확보했다. 네이버 블로그 2개는 시간 초과였으며 HTTP 200이더라도 동적 본문·로그인 제한으로 세부 내용을 읽지 못한 항목은 확인 완료로 간주하지 않았다. 대표 포스터는 전체 연락판과 승인 대상 원본 크기 이미지로 확인했다.

[AI 보고서](https://github.com/maxmini0130/PosterLink/actions/runs/42337073461)는 apply=false, thorough=false, limit=500으로 성공했다. AI는 91건 승인을 제안했지만 안전조건 통과 0건·자동 적용 0건이었다. 신청서 조기 마감, 날짜 오추출, 복수 회차, 잘못된 대상 등은 별도 원문 대조로 판단했다. 사람 확정 판정·원문·추출 근거는 보존했고 verification_status=verified를 새로 부여하지 않았다.

최종: 18건 수정 후 승인(게시 11건, 접수 마감 7건), 85건 개별 사유와 함께 검수 대기 유지. 보류 중 3건도 확실한 오류만 정정했다(기관명 제목 1건, 행사 종료일을 신청 마감으로 오인한 2건).

## 승인 및 수정 내역

### 서울청년센터 강동 <12월 전문가 1:1 취업상담> 참여자 모집

- ID: `acd6a1ff-8a05-45e8-8be9-174cf65f2c72`
- 상태: 게시 / 분류: 교육/취업
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75648)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 서울 생활권 청년 8명을 위한 12월 1:1 취업상담입니다. 11월 19일 23:59까지 신청하세요.

서울 생활권 청년 8명을 위한 12월 1:1 취업상담입니다. 11월 19일 23:59까지 신청하세요.

대상: 11월 6일 기준 만 19~39세 서울 거주 또는 생활권 청년. 의무복무 제대군인은 복무기간에 따라 최대 3세 연장.
신청: 공식 구글폼 신청 후 선정자는 별도 청년정책종합상담 신청 및 자료 제출을 완료해야 최종 확정됩니다.

12월 3일·4일 10~16시 중 1인 약 50분, 1회만 참여하며 시간은 무작위 배정되고 변경할 수 없습니다. 11월 20일 14시 이후 선정자에게만 개별 연락합니다. 사진·영상 수집 및 홍보 활용 동의가 필수입니다. 10분 지각 시 입장 불가, 노쇼 시 향후 6개월 선정 제한 가능, 신청자 5명 미만 시 취소 가능합니다. 중도 귀가 불가, 종료 후 만족도 조사에 참여합니다. 일반 주차비 미지원(장애 청년은 장애인증 제시 시 2시간 무료). 문의: 카카오톡 서울청년센터 강동.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `organizer_name`, `application_organization_name`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `target_age_min`, `target_age_max`, `recruitment_count`, `participation_fee`, `required_documents`, `deadline_type`, `category_id`.

### 서울청년센터 강동 <11월 티톡: 둘 사이에서, 내게 맞는 균형> 참여자 모집

- ID: `b277123c-d9a8-4fa9-b982-3184559c66e4`
- 상태: 게시 / 분류: 행사모집
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75657)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 11월 23일 저녁, 청년정책을 알아보고 대화와 밸런스 게임으로 일상의 균형을 찾습니다.

11월 23일 저녁, 청년정책을 알아보고 대화와 밸런스 게임으로 일상의 균형을 찾습니다.

대상: 11월 6일 기준 만 19~39세 청년. 의무복무 제대군인은 복무기간에 따라 최대 3세 연장. 강동·송파 생활권 등 우선 선발 기준은 신청서 확인.
신청: 공식 구글폼으로 11월 15일 23:59까지 신청. 선정 후 참석 확인서 응답이 필요합니다.

2027 청년정책 소개와 3~4명 소그룹 대화를 진행합니다. 11월 16일 선정자에게만 개별 연락합니다. 사진·영상 수집 및 활용 동의가 필수이며 10분 지각 시 입장할 수 없습니다. 노쇼 시 향후 6개월 선정 제한 가능, 신청자 5명 미만 시 취소 가능합니다. 주차비 미지원. 기타 우선 선발 및 참여 유의사항은 공식 신청서에서 확인하세요.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `organizer_name`, `application_organization_name`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `target_age_min`, `target_age_max`, `recruitment_count`, `deadline_type`, `category_id`.

### 금천문화재단 2026 하반기 예술인 역량강화교육 <작업중입니다>

- ID: `84f282aa-9d3a-41f4-8f48-11a24c84830c`
- 상태: 게시 / 분류: 교육강좌
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75564)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 금천구 예술인을 위한 무료 권리보호·계약·노무 교육입니다. 회차별 선착순 15명을 모집합니다.

금천구 예술인을 위한 무료 권리보호·계약·노무 교육입니다. 회차별 선착순 15명을 모집합니다.

대상: 금천구 거주·활동 예술인 및 예비 예술인. 타지역 예술인은 잔여석에 한해 접수·등록 가능.
신청: 공식 구글폼으로 신청. 10월 19일부터 선착순 모집 시까지 접수합니다.

11월 10일 19시 권리보호 교육(백경태 변호사), 11월 17일 19시 계약·노무 교육(임애리 변호사)을 진행합니다. 종료 시각은 원문에 없어 단정하지 않습니다. 교육 일주일 전 참여 확인 문자를 발송할 예정입니다. 당일·전날 취소와 노쇼를 삼가 주세요. 한국예술인복지재단 찾아가는 교육 연계 사업입니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_start_at`, `application_end_at`, `deadline_type`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `participation_fee`, `target_age_min`, `target_age_max`, `contact_info`, `category_id`.

### 독산도서관<11월 수요일 힙독 시네마>

- ID: `1694abec-406f-4ae3-be1d-a2a2688ac98c`
- 상태: 게시 / 분류: 문화/행사
- 원문: [공식 상세](https://geumcheonlib.seoul.kr/geumcheonlib/uce/programDetail.do?idxNo=3935&INST_CD=INST0000&INST_GB=1&selfId=1090)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 11월 25일 독산도서관에서 영화 리틀 포레스트를 무료 상영합니다. 현장 접수도 가능합니다.

11월 25일 독산도서관에서 영화 리틀 포레스트를 무료 상영합니다. 현장 접수도 가능합니다.

대상: 지역주민 누구나. 가족·친구 동반 관람 가능.
신청: 금천구립도서관 홈페이지 또는 전화로 신청하며 현장 접수도 가능합니다.

영화 리틀 포레스트를 관람하며 농산물과 자연의 의미를 돌아봅니다. 간단한 간식과 음료 반입이 가능합니다. 온라인 접수는 11월 24일 18시까지이며 현장 참여 가능 여부는 도서관에 확인하세요.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `participation_fee`, `target_age_min`, `target_age_max`, `contact_info`, `deadline_type`, `category_id`.

### 독산도서관 <11월 상주작가 지원사업-마음의 각주 모집>

- ID: `a3ad4ae6-6c5f-4324-a920-45511d5dce29`
- 상태: 게시 / 분류: 문화/행사
- 원문: [공식 상세](https://geumcheonlib.seoul.kr/geumcheonlib/uce/programDetail.do?idxNo=3936&INST_CD=INST0000&INST_GB=1&selfId=1090)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 현재 정원 10명이 차서 대기 신청만 받습니다. 11월 28일 이도훈 작가와 주제도서 북토크를 진행합니다.

현재 정원 10명이 차서 대기 신청만 받습니다. 11월 28일 이도훈 작가와 주제도서 북토크를 진행합니다.

대상: 성인. 기존 프로그램 참여자는 자동 신청됩니다.
신청: 금천구립도서관 공식 페이지에서 대기 신청. 정원 10/10으로 일반 접수 중이 아닙니다.

주제도서는 이토록 평범한 미래이며 상주작가 이도훈과 공통의 문제·고민을 나누는 문학 상담 프로그램입니다. 신청해도 즉시 참여가 확정되지 않으므로 대기 순번과 참여 가능 여부를 도서관에 확인하세요.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `participation_fee`, `target_age_min`, `target_age_max`, `contact_info`, `benefits_summary`, `deadline_type`, `category_id`.

### 시흥도서관 <세 개의 길, 하나의 금천: 사라질 기억을 담다> 3기 추가 모집

- ID: `4b71dd60-3b86-4be8-9696-91d381853918`
- 상태: 접수 마감 / 분류: 교육강좌
- 원문: [공식 상세](https://geumcheonlib.seoul.kr/geumcheonlib/uce/programDetail.do?idxNo=3937&INST_CD=INST0000&INST_GB=1&selfId=1090)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 3기 추가 모집은 11월 4일 14시에 마감됐습니다. 시흥동 산책과 기록 활동을 3회 진행합니다.

3기 추가 모집은 11월 4일 14시에 마감됐습니다. 시흥동 산책과 기록 활동을 3회 진행합니다.

대상: 성인. 11월 7일·14일·21일 세 회차 모두 참여 가능한 사람.
신청: 시흥도서관 공식 프로그램 페이지에서 접수한 추가 모집으로 현재 접수 기간이 종료됐습니다.

11월 7일·14일·21일 토요일 10~13시에 진행합니다. 시흥길·시호길·정조길을 걸으며 글·그림 등으로 기록하고 책·사진전·출판기념회로 공유합니다. 원문 포스터의 전체 사업 모집 일정과 구분해 이번 추가 모집의 실제 접수 마감일을 반영했습니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `title`, `organizer_name`, `application_organization_name`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `participation_fee`, `target_age_min`, `target_age_max`, `deadline_type`, `category_id`.

### 서울청년센터 동대문 <11월 뜸하는대로 AI에게 일 시키는 법: Claude로 시작하는 업무 자동화> 참여자 모집

- ID: `497b06dc-3695-47fd-87c7-d104edbb5b2d`
- 상태: 게시 / 분류: 교육강좌
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75585)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 11월 18일 저녁, Claude로 업무를 맡기고 AI 결과를 확인하는 방법을 배웁니다. 11월 16일 15시 신청 마감입니다.

11월 18일 저녁, Claude로 업무를 맡기고 AI 결과를 확인하는 방법을 배웁니다. 11월 16일 15시 신청 마감입니다.

대상: 서울시 거주 또는 생활권 청년. 동대문구 거주·생활권자 우대.
신청: 공식 구글폼으로 신청. 11월 16일 18시 이전 선정자에게만 개별 안내합니다.

김성규 라핀 대표가 진행하며 19~20시 AI에게 일 맡기기, 20~21시 결과 확인·업무 적용 및 질의응답을 진행합니다. 휴대폰으로 간단히 따라 해보는 내용으로 노트북은 필수라고 단정하지 않습니다. 개인정보 수집·제3자 제공 및 사진·영상 촬영·이용 동의가 신청서 필수 항목입니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `organizer_name`, `application_organization_name`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `target_age_min`, `target_age_max`, `recruitment_count`, `required_documents`, `deadline_type`, `category_id`.

### 성동구청년지원센터 <말자할매와 함께하는 청년공감 소통토크쇼>

- ID: `3197f0fb-8e2d-4be8-904a-bac3107d7759`
- 상태: 접수 마감 / 분류: 문화/행사
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75617)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 말자할매와 함께하는 청년공감 소통토크쇼는 공식 신청서에서 모집 마감됐습니다.

말자할매와 함께하는 청년공감 소통토크쇼는 공식 신청서에서 모집 마감됐습니다.

대상: 성동구 거주·생활권 만 19~39세 청년 및 지역주민. 청년 우선 선발.
신청: 공식 구글 신청서가 모집 마감으로 표시되어 신규 접수를 받지 않습니다.

11월 12일 18~20시 청년의 고민과 공감을 나누는 토크쇼입니다. 원래 신청 예정 마감은 11월 8일 18시였으나 11월 7일 확인한 실제 신청서는 이미 모집 마감 상태입니다. 조기 마감 일시 자체는 확인되지 않아 만들지 않았습니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `target_age_min`, `target_age_max`, `contact_info`, `deadline_type`, `category_id`.

### 강동구립 강일도서관 <영민 작가와의 만남 "작은 수집, 스몰 컬렉팅"> 참여자 모집

- ID: `74901a94-a768-4d76-810c-20d8632dc006`
- 상태: 접수 마감 / 분류: 교육강좌
- 원문: [공식 상세](https://www.gdlibrary.or.kr/portal/menu/45/tmpr/lctr-evnt/special/101408?searchHmpg=4)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 영민 작가와의 만남은 11월 5일 진행된 종료 행사이며 신청도 마감됐습니다.

영민 작가와의 만남은 11월 5일 진행된 종료 행사이며 신청도 마감됐습니다.

대상: 청소년 이상.
신청: 강일도서관 공식 페이지 접수 기간은 10월 26일 09시~11월 4일 18시로 종료됐습니다.

일러스트레이터 영민과 나의 관심사·생각을 담아 작은 책을 만드는 프로그램입니다. 모집 기간을 행사 기간으로 잘못 저장한 값을 바로잡았습니다. 수강료·재료비는 공식 페이지에 대시로 표시되어 무료라고 단정하지 않았습니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `target_age_min`, `target_age_max`, `participation_fee`, `deadline_type`, `category_id`.

### 암사도서관 <전시를 보는 두 개의 시선: 큐레이터의 위치에서> 1회차

- ID: `6c8fbde3-13af-404c-b3b6-592f18a58501`
- 상태: 접수 마감 / 분류: 교육강좌
- 원문: [공식 상세](https://www.gdlibrary.or.kr/portal/menu/46/tmpr/lctr-evnt/reading/101379?searchHmpg=5)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 전시트렌드 강연 1회차 신청은 11월 4일 23시에 마감됐습니다. 2회차는 별도 신청입니다.

전시트렌드 강연 1회차 신청은 11월 4일 23시에 마감됐습니다. 2회차는 별도 신청입니다.

대상: 성인.
신청: 암사도서관 1회차 공식 페이지에서 신청한 행사이며 1회차 접수는 종료됐습니다.

김진혁 큐레이터가 진행합니다. 이번 공고는 11월 7일 1회차이며 11월 14일 2회차 미술사학도의 시선에서는 11월 10일 23시까지 별도 신청을 받습니다. 2회차 마감일을 1회차 마감일로 합치지 않았습니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `title`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `target_age_min`, `target_age_max`, `deadline_type`, `category_id`.

2회차 링크는 별도 회차로 명시하고 1회차 신청 링크로 취급하지 않도록 정정.

### 강동구립 성내도서관 <문화전문기자를 반하게 만든 뮤지컬의 세계> 참여자 모집

- ID: `f7cf0230-29b7-4cda-bb7e-ece33be53b17`
- 상태: 게시 / 분류: 교육강좌
- 원문: [공식 상세](https://www.gdlibrary.or.kr/portal/menu/46/tmpr/lctr-evnt/reading/101425?searchHmpg=2)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 11월 18일 저녁 성내도서관에서 윤하정 문화전문기자와 주요 뮤지컬의 특징과 이야기를 나눕니다.

11월 18일 저녁 성내도서관에서 윤하정 문화전문기자와 주요 뮤지컬의 특징과 이야기를 나눕니다.

대상: 청소년 이상. 참석 가능한 사람만 신청.
신청: 성내도서관 공식 프로그램 페이지에서 11월 18일 18시까지 신청합니다.

30일 밤의 뮤지컬 저자 윤하정과 영국·미국·프랑스·오스트리아·한국의 주요 뮤지컬을 살펴봅니다. 행사 참여자는 내부 보고 및 홍보용 사진 촬영에 동의하는 것으로 간주됩니다. 주차장이 협소하므로 대중교통 이용을 권합니다. 신청 기간과 실제 강연 시간을 구분해 수정했습니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `target_age_min`, `target_age_max`, `contact_info`, `deadline_type`, `category_id`.

### 서울청년센터 양천<2026 또오리의 나 사용 설명서>

- ID: `cde477b0-32f7-4f45-ac83-bd4e1fa9032f`
- 상태: 게시 / 분류: 건강/의료
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75552)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 서울 생활권 만 19~39세 청년을 위한 TCI 해석상담입니다. 선정 뒤 개별 상담 예약까지 마쳐야 참여가 확정됩니다.

서울 생활권 만 19~39세 청년을 위한 TCI 해석상담입니다. 선정 뒤 개별 상담 예약까지 마쳐야 참여가 확정됩니다.

대상: 서울시 생활권 만 19~39세 청년.
신청: 11월 10일까지 공식 구글폼 신청 후 선정자 개별 연락에 따라 별도 상담 예약을 완료합니다.

상담은 11월 12~30일 중 개별 운영합니다. 정확한 예약 시각은 선정 후 정해집니다. 11월 11일까지 선정자를 개별 안내하며 별도 예약 완료 후 검사지가 발송됩니다. TCI 기질·성격검사를 바탕으로 감정·관계·생활 패턴을 이해하는 상담입니다. 개인정보 수집·이용 및 제3자 제공 동의가 필요합니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `organizer_name`, `application_organization_name`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `target_age_min`, `target_age_max`, `recruitment_count`, `contact_info`, `deadline_type`, `category_id`.

### 대청종합사회복지관 <마주친 사이, 5행시 챌린지> 모집 안내

- ID: `0617b286-2aca-48f9-85aa-5d12b2f14713`
- 상태: 게시 / 분류: 공모전
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75559)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 강남구 주민 대상 마주친사이 5행시 챌린지입니다. 11월 13일까지 제출하며 간식 쿠폰은 조건을 충족한 선착순 50명에게 제공합니다.

강남구 주민 대상 마주친사이 5행시 챌린지입니다. 11월 13일까지 제출하며 간식 쿠폰은 조건을 충족한 선착순 50명에게 제공합니다.

대상: 강남구 지역주민.
신청: 공식 구글폼에 마·주·친·사·이 각 글자로 시작하는 5행시를 작성해 제출합니다.

참여 기간은 10월 26일~11월 13일이며 정확한 마감 시각은 안내되지 않았습니다. 이웃에게 전하고 싶은 말, 이웃돌봄 행동, 동네에 대한 생각 등을 자유롭게 담습니다. 우수작은 복지관 홈페이지·카카오톡 등에 공유될 수 있으며 물품 지급을 위해 연락처를 수집합니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `target_age_min`, `target_age_max`, `recruitment_count`, `benefits_summary`, `contact_info`, `deadline_type`, `category_id`.

### 서울창업허브 스케일업센터, 2027년 입주 파트너스 9개사 모집

- ID: `755ef9b8-93f2-4c23-8012-928101770212`
- 상태: 접수 마감 / 분류: 지원사업
- 원문: [공식 상세](https://news.seoul.go.kr/economy/archives/575117)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 2027 서울창업허브 스케일업센터 입주 파트너스 모집은 11월 2일 16시에 마감됐습니다. 일반 창업기업 모집이 아닙니다.

2027 서울창업허브 스케일업센터 입주 파트너스 모집은 11월 2일 16시에 마감됐습니다. 일반 창업기업 모집이 아닙니다.

대상: 창업기업에 투자하는 VC·AC 등 민간·공공 전문 투자기관.
신청: 스타트업플러스 온라인 접수였으며 현재 접수 기간은 종료됐습니다. 입주 조건·제출서류·평가 기준은 개별 모집 공고를 확인해야 합니다.

포스터의 2026년 10월 16일~11월 2일 16시 모집을 확인해 잘못된 2027년 신청 시작일을 수정했습니다. 2층 사무공간 9실(33~264㎡)을 모집하며 기본 입주기간은 2027년 1월~2028년 12월, 평가 후 최대 4년까지 가능합니다. 모든 공간이 무료라고 단정하지 않습니다. 서류·대면 심사 후 선정하며 신청자가 충족해야 하는 입주 세부 조건은 스타트업플러스 공고가 우선합니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `organizer_name`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `target_age_min`, `target_age_max`, `recruitment_count`, `participation_fee`, `contact_info`, `deadline_type`, `category_id`.

### 서울시여성가족재단 <아빠표 우리아이 건강도시락>

- ID: `8a6e3242-c705-40f7-87f4-04693e50b9e5`
- 상태: 게시 / 분류: 육아/가족
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75416)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 서울 소재 중소기업 아빠 근로자와 6~13세 자녀가 함께하는 무료 도시락 만들기입니다. 11월 12일까지 15팀을 모집합니다.

서울 소재 중소기업 아빠 근로자와 6~13세 자녀가 함께하는 무료 도시락 만들기입니다. 11월 12일까지 15팀을 모집합니다.

대상: 서울시 소재 중소기업 아빠 근로자와 자녀(6~13세). 아빠 1명·아이 1명이 한 팀이며 처음 참여자를 우선 선정합니다.
신청: 공식 구글폼으로 11월 12일까지 신청. 조기 마감 가능하며 참여 세부 안내는 개별 전달합니다.

주최는 서울시여성가족재단, 운영은 프리즈미입니다. 이연지 강사와 두부 계란 유부초밥을 만들고 완성한 도시락을 나누며 육아·일생활균형 경험을 나눕니다. 6~13세는 동반 자녀 조건이며 신청자 아빠의 나이 제한이 아닙니다. 여성가족재단 명칭을 여성 전용 참여 조건으로 해석하지 않았습니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_organization_name`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `target_age_min`, `target_age_max`, `participation_fee`, `contact_info`, `deadline_type`, `category_id`.

기관명을 여성 전용 자격으로 오인한 여성 대상 관계 1개 제거.

### 서울청년센터 광진 <11월 티톡: 쫀득한 사이> (조기 마감)

- ID: `6687dbff-3ce9-4e65-9ad9-3a017c3ce50c`
- 상태: 접수 마감 / 분류: 행사모집
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75493)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 광진 11월 티톡 쫀득한 사이는 공식 신청서에서 조기 마감됐습니다. 신규 신청을 받지 않습니다.

광진 11월 티톡 쫀득한 사이는 공식 신청서에서 조기 마감됐습니다. 신규 신청을 받지 않습니다.

대상: 서울시 만 19~39세 청년. 광진구 거주 4대 취약청년 중 첫 참여자 우선. 의무복무 제대군인은 원문 기준 1~2년 연장 가능.
신청: 공식 구글폼이 조기 마감 안내로 전환되어 신규 접수가 종료됐습니다.

1차 11월 13일 14~16시(예정 신청 마감 11월 8일), 2차 11월 27일 19~21시(예정 신청 마감 11월 22일). 같은 프로그램이므로 1인 1회만 신청·참여 가능합니다. 과일모찌 만들기, 취미 공유와 청년정책 안내를 진행합니다. 실제 신청서는 이미 조기 마감됐으며 정확한 조기 마감 일시는 안내되지 않았습니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `title`, `organizer_name`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `target_age_min`, `target_age_max`, `recruitment_count`, `deadline_type`, `category_id`.

### 도봉구청 <풀스택 마케터와 함께하는 실무 원데이 특강: 데이터 스튜디오를 활용한 데이터 시각화> 참여자 모집

- ID: `67190b85-afc8-427f-807b-b420f9925218`
- 상태: 게시 / 분류: 교육강좌
- 원문: [공식 상세](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75458)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 도봉구 취업준비 청년 15명을 위한 데이터 시각화 실습입니다. 개인 노트북과 구글 계정이 필수이며 11월 19일까지 신청합니다.

도봉구 취업준비 청년 15명을 위한 데이터 시각화 실습입니다. 개인 노트북과 구글 계정이 필수이며 11월 19일까지 신청합니다.

대상: 도봉구 (취업준비) 청년. 개인 노트북과 구글 계정이 없으면 참여 불가.
신청: 공식 Tally 신청서로 11월 19일까지 접수. 선정·참여 안내는 개별 연락을 확인하세요.

Google Data Studio 데이터 연결, 측정기준·측정항목, 스코어카드·시계열 차트, 피벗테이블·필터·배포·공유를 실습합니다. 공고에는 11월 20일까지 선정 안내, 신청서에는 신청 후 3일 이내 참여 안내로 표현되어 있어 정확한 연락 일정은 담당 부서에 확인하세요. 개인정보 수집·이용 동의가 필수입니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `target_age_min`, `target_age_max`, `required_documents`, `contact_info`, `deadline_type`, `category_id`.

### 니트생활자 <거리감 제로 프로젝트> 영감 수집가 모집

- ID: `b3e5f043-c5f7-40e7-aa4b-54117ff290c3`
- 상태: 접수 마감 / 분류: 행사모집
- 원문: [공식 상세](https://neetconnect.kr/meet/0UTs4ByHfB)
- 판단: 공식 상세 본문·신청서 및 대표 포스터 대조 후 수정. 거리감 제로 영감수집가는 11월 3일 23:59 접수가 마감됐습니다. 3회 모두 참여해야 활동비 10만원을 지급합니다.

거리감 제로 영감수집가는 11월 3일 23:59 접수가 마감됐습니다. 3회 모두 참여해야 활동비 10만원을 지급합니다.

대상: 1인가구 청년·중장년 및 이웃. 공식 모집 페이지 회원 대상이며 전 회차 참여 필수.
신청: 닛커넥트 공식 모집 페이지가 크루 신청마감 상태입니다.

11월 5일 10시 교육·도구 만들기·탐색, 11월 6일 13시 공릉 감 수확, 11월 9일 10시 은평 감 수확·감사 인사를 진행합니다. 가공 후 복지기관 나눔을 계획합니다. 11월 9일은 운영일이며 신청 마감일이 아닙니다.

수정 필드: `summary_short`, `summary_long`, `eligibility_summary`, `application_method`, `application_start_at`, `application_end_at`, `event_start_at`, `event_end_at`, `event_location`, `recruitment_count`, `target_age_min`, `target_age_max`, `benefits_summary`, `deadline_type`, `category_id`.

## 보류 항목

원문·첨부·신청서의 불확실성을 그대로 남기고 승인하지 않았다. 기존 25건의 미해결 검수 사유도 유지했다.

| ID                                   | 제목                                                                                                                                                              | 보류 사유                                                                                                         | 원문                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 848e7433-b986-4521-806d-0d6706158c3c | 서울청년센터 성동 <성동 한 장> 참여자 모집                                                                                                                        | 현장 참여 가능하나 원문 연결 랜딩·사전신청 세부 조건 추가 확인 필요                                               | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75639)                                           |
| 4ac8e4c7-450e-4d6a-80f6-1e1c90640640 | 양천구청<일정 변경 11/14(토) -> 11/21(토)! 2026 목동깨비시장 깨비야간 BBQ페스티벌>                                                                                | 변경 공지 본문과 포스터 시작 시각 불일치                                                                          | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75640)                                           |
| 565ae9ca-a3e8-4299-9af6-4c64c89b2585 | 관악청년청 <2026 청년정책페스타> 안내                                                                                                                             | 층별 프로그램 사전 접수 조건 추가 확인 필요                                                                       | [원문](https://www.checkin-gwanak.or.kr/core/?cid=32&role=view&uid=642)                                                               |
| 34ce68ff-51bc-412f-abfb-a83875c217fe | 은평구1인가구지원센터 <은솔 안전지키미 4기> 참여자 모집                                                                                                           | 기관 회원·등본 제출 절차와 신청 경로 추가 확인 필요                                                               | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75650)                                           |
| 25ba66a3-561e-4c29-bb2b-4cda2b4526dd | 용산청년지음 <[N잡 컴퍼니] 나의 경험을 강의로, 강사 생존 키트> 참여자 모집                                                                                        | 공식 개별 신청서 조건 미확인                                                                                      | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75620)                                           |
| d8aa301f-b03c-46c6-a9da-528ebb32e65a | 용산청년지음 <[커리어 플러스] 클로드 200% 활용법:나만의AI 비서와 사이트 만들기> 참여자 모집                                                                       | 공식 개별 신청서·유료 계정 조건 추가 확인 필요                                                                    | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75621)                                           |
| 27a77178-efb8-4b6d-942d-196de8e3061f | 서울청년센터 영등포 <영등포 티톡 '빼빼로데이, 빼빼로 만들기'>                                                                                                     | 본문 마감 11월 8일 13시와 예약 페이지 마감 표기 불일치                                                            | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75651)                                           |
| 84c63198-36b5-4e1e-b233-6d5bd5876f0c | 익산시 고향올래(로컬벤처)\_솜솜쌀롱 8회차 <좋아하는 공간을 여는 일> 참여자 모집                                                                                   | 신청서 동적 페이지·보증금 환급 조건 추가 확인 필요                                                                | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75636)                                           |
| 3ec31136-851a-45e3-be75-3da4f65e1355 | 중랑구 사회적경제지원센터<사회적경제 공공구매 박람회 × 판매 장터「중사경 들랑날랑」>(11/12)                                                                       | 사전신청 없는 구매·상담 행사로 신청기간 구조 재정리 필요                                                          | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75656)                                           |
| bddf424b-b90a-4c1e-9ee4-c05e4e9bb320 | 중랑구보건소<11월 중랑 워킹 데이 참여 안내>(11/11)                                                                                                                | 실제 신청 마감과 운영 종료시각 미확인                                                                             | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75658)                                           |
| 9e8252d8-ec0e-472c-a957-2c42583ae548 | 고척2동 축제추진위원회<제9회 능골산 자락길 마을축제>                                                                                                              | 현장 축제 안내의 신청 여부·분류 추가 확인 필요                                                                    | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75663)                                           |
| 604c4817-1530-4f96-a3dd-117e03a78da9 | 가리봉동 축제추진위원회<한마음 마을축제 놀고, 먹고, 즐기자>                                                                                                       | 현장 축제 안내의 신청 여부·분류 추가 확인 필요                                                                    | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75664)                                           |
| e4fe8421-f08b-4a1f-9f0e-295d66636d46 | 양천구청 <2026년 하반기 양천구 혁신·적극행정 우수사례 선정 투표>                                                                                                  | 투표 개별 안건 URL 미확인                                                                                         | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75666)                                           |
| ae76f5b3-a35a-4918-8beb-a0cf93db3a67 | 서초1인가구지원센터 <2026 싱글데이 : 싱글(Sinlge)말고, 위글(Wiggle)!'> 모집 안내                                                                                  | 개별 예약 페이지 동적 본문·증빙 절차 미확인                                                                       | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75669)                                           |
| d1e595f2-492a-4d43-b636-9e014ab36fd6 | 서울청년센터 중구<생화 리스 만들기 클래스> 모집                                                                                                                   | 공고 19~39세와 공통 신청서 18~39세 및 제외 대상 충돌                                                              | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75505)                                           |
| 1df699c9-e523-4ee5-a616-af84b0f878b6 | ["Beyond Silicon 2026" 화합물반도체 미래를 여는 길] 개최                                                                                                          | 신청 경유 페이지 동적 본문 추가 확인 필요                                                                         | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179728&schM=view)                                         |
| 265c97b1-3df2-481f-afbf-c27ec4e64cee | 2026 아산 투자유치 Build-Up 프로그램 참여기업 모집                                                                                                                | 공고·신청서 모집 시작일 불일치 및 이메일 첨부서류 미검증                                                          | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179739&schM=view)                                         |
| f52b846f-1c78-4a71-8f14-cf633cafdf7d | 2027년 인천관광기업지원센터 입주기업 모집                                                                                                                         | 원문 HWP 입주 자격·비용 조건 검증 필요                                                                            | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179738&schM=view)                                         |
| 2b9a699d-6dc1-4534-a1db-8539f1652124 | NEST G밸리 4기 입주기업 모집                                                                                                                                      | 신청 URL 오결합 및 첨부 입주 자격 검증 필요                                                                       | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179733&schM=view)                                         |
| c16391a6-618d-4c09-aecd-e97d77c083fc | 활동가 실무 역량강화 교육 <노션으로 나만의 홈페이지 만들기>                                                                                                       | 네이버 신청서 동적 본문 미확인                                                                                    | [원문](https://seochoequality.org/board_TwMT47/6494)                                                                                  |
| 171dbf42-a676-4d21-9c46-d297526b0867 | 서울청년센터 동대문 <11월 뜸하는대로 청년명사특강: AI 작곡, 나를 표현하는 새로운 방법> 참여자 모집                                                                | 기공개 AI 작곡 프로그램과 동일 신청폼·일정의 중복 후보                                                            | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75584)                                           |
| 7e77b5a1-bdc7-4129-9351-2a71f754cc00 | 서울청년센터 은평 <대조시장 은크크Pick> 참여자 사전모집                                                                                                           | 인스타그램 프로필 외 개별 신청 경로 미확인                                                                        | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75587)                                           |
| dcb3ab12-1e51-4f54-9059-f2429b218574 | 강북구청 <강북구 청년 어학자격 시험 응시료 지원 사업>                                                                                                             | 분기별 조건·첨부 증빙 원문 추가 확인 필요                                                                         | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=74915)                                           |
| ab86c81a-e921-4e1e-9b49-a2a57c8187b7 | 동대문구 <2026 동대문구 청년정책 네트워크 해커톤> 참여자 모집                                                                                                     | 팀 인원·참가 연령 조건 공고와 신청서 불일치                                                                       | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75536)                                           |
| c4d5e65d-986d-412b-a231-d522b52d5c42 | 서울시 여성가족재단 <2026 서울 커리업 일자리페어>                                                                                                                 | 박람회·야간 특강 일정 및 별도 신청 조건 분리 필요                                                                 | [원문](https://www.seoulcareerup.or.kr/www/common/cntnts/selectContents.do?cntnts_id=W0000095)                                        |
| ac3bf523-2e03-4cf3-8f71-8e0237dc59e0 | 서울청년센터 성동 청년이슈실험실 <이웃집 아카이브 전시 : 옆집에 살고 있습니다>                                                                                    | 인스타그램 원문 본문 접근 불가                                                                                    | [원문](https://www.instagram.com/p/DfT7LQGSgoZ/?cplk=MjllcW8xY2dwbmph)                                                                |
| 4cc4ba29-b671-407f-946a-b54a68aae05e | 금천구 <제90회 해피워킹 금천한가족건강걷기>행사 안내                                                                                                              | 네이버 블로그 원문 요청 시간 초과                                                                                 | [원문](https://m.blog.naver.com/PostView.naver?blogId=geumcheon1&logNo=224466042907&navType=by)                                       |
| 682431bd-541d-4fa4-85af-d0ad62159c46 | 2027년도 '맞춤형 해외 저작권 바우처 지원' 사업 수행기관 모집 공고                                                                                                 | 수행기관 모집과 이용자 지원 혼동 및 시작일·첨부 검증 필요                                                         | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179722&schM=view)                                         |
| 3559715c-b3b8-42ad-9603-fc464cd4e906 | 서울청년센터 중구 <아트유니온 - 청년 합창단> 참여자 모집                                                                                                          | 총 6회 표기와 11월 14일~12월 12일 토요일 5회 일정 불일치                                                          | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75531)                                           |
| 94a3279c-1b49-4a79-a636-8b5633bbb6cc | 영등포구청 <2026년 하반기 실전경제교육 5회차(11월) 참여자 모집>                                                                                                   | 영등포 공고 링크에 다른 프로그램 공고 혼입                                                                        | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75532)                                           |
| f0609fbd-f592-4cc7-9f43-327d9f99bb6e | 서울청년센터 중구 <서울청년센터 중구 서포터즈 - 아트유니온 / 어반 스케치> 참여자 모집                                                                             | 모집 마감일 미확인·회차별 참여 조건 정리 필요                                                                     | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75534)                                           |
| 3bf00967-55f1-4a0c-980a-bd3cf81599ed | [menu]공공누리 공공저작물                                                                                                                                         | 메뉴명 제목 오추출·서로 다른 공고와 첨부 링크 혼입                                                                | [원문](https://sb.go.kr/www/selectBbsNttView.do?bbsNo=41&key=6350&nttNo=9585085&searchCnd=all)                                        |
| ed372dd5-5e06-4cca-a206-be5fc81e85b9 | 서울청년센터 중구 <브레쓰워크 세션: 숨을 따라 몸과 마음을 만나는 시간> 모집                                                                                       | 공고 15~39세와 공통 신청서 18~39세 불일치                                                                         | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75391)                                           |
| 9f53b850-d7a3-49f6-8aac-dc5bbac9bc1b | 서울청년센터 중구<인생컬러 진단 클래스> 모집                                                                                                                      | 공통 신청서에 해당 프로그램 선택 항목 미확인·연령 불일치                                                          | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75374)                                           |
| 0b5ba3ce-5857-46c1-a1d0-79e634cf4ef8 | 서울청년센터 영등포 <모두의 창업 1R 동행반 모집>                                                                                                                  | 행사일을 모집일로 오인·로그인 신청서 본문 미확인                                                                  | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75548)                                           |
| a4fc32e0-26fb-46a4-a215-0bac086ee9d7 | 서초구립반포도서관 <서초북클럽: 북앤드 - 최은영&편집자K 북토크> 모집 안내                                                                                         | 도서관 동적 페이지 상세 본문 미확인                                                                               | [원문](https://www.seocholib.or.kr/Cultural/CulturalDetail/2927/2)                                                                    |
| 1bf884be-8f00-45c2-9e9b-2a9112cc6538 | 가양7종합사회복지관 <가양7놀이대회 자원봉사자 모집>                                                                                                               | 1365 봉사 시간 12~17시와 본문 11~16시 불일치                                                                      | [원문](https://www.1365.go.kr/vols/P9210/partcptn/timeCptn.do?progrmRegistNo=3535131&type=show)                                       |
| ecd05ec0-d24e-45ce-8dcc-00974e0d3bba | 서울청년센터 양천                                                                                                                                                 | 제목이 기관명으로 잘못 추출됨·모집 기간 포스터 추가 검증 필요                                                     | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75561)                                           |
| 541e274a-12fa-420a-996f-527a228fd5b0 | 금천구 북콘서트<우리 모두는 자신의 이야기를 쓰는 작가입니다>                                                                                                      | 온라인·대기 정원 마감이나 포스터 당일 현장 50명 별도 모집 여부 확인 필요                                          | [원문](https://www.geumcheon.go.kr/reserve/edcLctreView.do?key=112&searchLctreKey=157444)                                             |
| 0c23fe43-8d98-42d7-a5d8-7b10a56389c1 | 2026년 주민 인권교육 <영화로 만나는 인권>                                                                                                                         | 네이버 블로그 원문 요청 시간 초과                                                                                 | [원문](https://m.blog.naver.com/PostView.naver?blogId=geumcheon1&logNo=224459136042&navType=by)                                       |
| 3b83ac31-b3da-43c5-9b73-c002f9e619b4 | [동대문구 창업지원센터] 11월 메이커스페이스(레이저커터, 3D프린팅) 교육 일정                                                                                       | 레이저·3D 과정별 서로 다른 신청서·마감 분리 필요                                                                  | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179707&schM=view)                                         |
| c972f189-19c7-4de2-a6ea-a8be5365af0e | 김해시중장년기술창업센터 2026년 하반기 신규 입주(자)기업 모집                                                                                                     | 본문 11월 27일과 포스터 11월 30일 모집 마감 불일치                                                                | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179714&schM=view)                                         |
| e3f159ee-98e7-41c9-aa77-4728f32a0300 | 출연연, 대학 연구소기업 Business Development 프로그램 참여 예비창업자 모집 (11월)                                                                                 | 로그인 제한 신청서와 사업계획서 첨부 조건 미확인                                                                  | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179694&schM=view)                                         |
| 02c23ed2-018f-4110-855d-1c525750a252 | 손목닥터9988 300만 돌파 기념 걷기대회('26.11.5, 사전신청~11.4.)                                                                                                   | 종료 행사·보상별 지급 조건 별도 정리 필요                                                                         | [원문](https://news.seoul.go.kr/culture/archives/535159)                                                                              |
| 498a552c-09e6-4984-b47f-28c9667b3786 | [상주서울농장] 제철먹거리체험-상주곶감여행 (261120)                                                                                                               | 행사 종료일을 모집 마감으로 오인·개별 예약 공고 미확인                                                            | [원문](https://news.seoul.go.kr/gov/archives/581800)                                                                                  |
| 5f96b3ff-6a81-47aa-b359-e3d183bf6a36 | 강서구청 <개청 50주년을 맞이하는 강서구의 기념 슬로건 및 엠블럼 주민투표에 참여해주세요!>                                                                         | 종료된 투표·QR 개별 안건 미확인                                                                                   | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75474)                                           |
| b629135a-9d29-44fb-b628-047325d201c7 | 서울청년센터 광진<청년 맞춤형 1:1 재무상담>참여자 모집(~11/22)                                                                                                    | 선정일 10월 23일과 11월 모집 기간 모순                                                                            | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75489)                                           |
| 726e1c0c-32c1-4d40-82d7-d99f93744f32 | 서울청년센터 성북 <커뮤니티 페스타 : 취향 수집 (부스 소개) > 행사 안내                                                                                            | 사전접수 종료·현장접수 가능 상태와 워크숍별 정원 분리 필요                                                        | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75491)                                           |
| 46fe66aa-2270-480e-9ee2-affc9050b208 | 영등포구청 <드론산업진로 특강 안내>                                                                                                                               | 주관기관과 영등포 개별 원문 조건 추가 확인 필요                                                                   | [원문](https://www.ydp.go.kr/www/selectBbsNttView.do?bbsNo=40&key=2848&nttNo=421066&pageUnit=10)                                      |
| 9758f6e7-8c10-4b9e-8eef-b07509b1c1d6 | 영등포구청 <2026년 하반기 영등포구립합창단 신규단원 모집 안내>                                                                                                    | 합창단 2종 연령·오디션·필수 서류 및 잘못된 신청 공고 링크 분리 필요                                               | [원문](https://www.ydp.go.kr/www/selectBbsNttView.do?bbsNo=40&key=2848&nttNo=421140&pageUnit=10)                                      |
| 77cc49e2-bad7-4543-8894-d8d8fa34245f | 서울신용보증재단 강북종합지원센터 <사일구로 카페 뿌시기 2회차>                                                                                                    | 종료 행사·보증금 환급 조건 확인 필요                                                                              | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75231)                                           |
| a75022bb-e581-462a-a8d2-ac7bb2cf7ef1 | 서울신용보증재단 강북종합지원센터 <사일구로 / 4.19로가 당신의 이야기, 고기로 삽니다.>                                                                             | 종료 행사·보증금 등 세부 신청 조건 추가 확인 필요                                                                 | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75241)                                           |
| 81135a55-88e4-4e5b-ac6f-0a7fcb9ded38 | 성북구보건소 X 서울청년센터 성북 「청년 나DO한끼 프로그램」참여자 <청년 나DO한끼 프로그램> 모집                                                                   | 네이버 신청서 동적 본문 미확인                                                                                    | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75502)                                           |
| 61b391da-1cd7-47f1-ba2c-065921cd852f | 강서구립옹기종기작은도서관<그림책과 자수책갈피 만들기>                                                                                                            | 도서관 동적 페이지 상세 본문 미확인                                                                               | [원문](https://lib.gangseo.seoul.kr/NoticeInfoDetail/34387/TOL)                                                                       |
| c0cc51b3-c723-4548-8664-e23058fa7d6d | 강서구립허준마을산작은도서관<가을은 명상이다>                                                                                                                     | 도서관 동적 페이지 상세 본문 미확인                                                                               | [원문](https://lib.gangseo.seoul.kr/NoticeInfoDetail/34382/TOL)                                                                       |
| 3c0124be-86b4-48c2-832a-8520b08d0c8b | 강서구립가양도서관<반려식물 특강: 이야기를 화분에 심는 시간 - 그림책 정원>                                                                                        | 도서관 동적 페이지 상세 본문 미확인                                                                               | [원문](https://lib.gangseo.seoul.kr/NoticeInfoDetail/34341/TOL)                                                                       |
| efe58938-5b76-4519-9a7f-3e3c226b578f | 서울청년센터 강서<테마상담 1:1 전문가 연계상담>                                                                                                                   | 회차 3일 전 마감과 예약 페이지 종료일 불일치                                                                      | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75512)                                           |
| 06edd638-844b-4125-a3f1-b988f230c609 | 서울청년센터 강서<11월 낮/밤 티톡: 청년 마음 가드닝(전입청년)> 참여자 모집                                                                                        | 모집 시작·회차별 3일 전 마감과 예약 페이지 표기 불일치                                                            | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75520)                                           |
| 9f2e455f-efec-4f39-9997-455569679df8 | 서울청년센터 관악 신림동쓰리룸 X 단양군 X 서울청년센터 금천 청춘삘딩 X 꿈지락네트워크 <2026 서울 청년, 단양으로 이음 프로젝트 - 폴투어 주말여행 참여팀 신청> 안내 | 로그인 제한 신청서·지원 조건 세부 미확인                                                                          | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75521)                                           |
| 33ec4e96-f994-4a7c-a08f-bd40f82607ab | [괴산서울농장] 자연울림 맛의울림-총각김치편-2 (261121)                                                                                                            | 여행 종료일을 모집 마감으로 오인·개별 예약 공고 미확인                                                            | [원문](https://news.seoul.go.kr/gov/archives/581763)                                                                                  |
| bceb17be-4c21-4531-928d-a987b637a59a | 서울청년센터 서초<11월 두시티톡&2026년 구직•자립 지원 프로그램> 참여자 모집                                                                                       | 센터 원문이 여러 프로그램으로 연결되고 대표 이미지가 공통 안내사항임. 해당 회차 일정·포스터·신청서 분리 확인 필요 | [원문](https://www.seochoyc.org/sub_program/operate_view.php?idx=416)                                                                 |
| a73a432f-10e8-4c71-8d8d-7b644b84dab2 | 신촌문화발전소 예술로 협업사업                                                                                                                                    | 이미 승인된 펫로스 모임과 같은 프로그램·신청서로 보여 중복 확인 필요                                              | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75453)                                           |
| 4478c538-743e-46b6-aa12-e4e10663eb28 | 서울청년센터 강북<강북구 청년 김장 행사 '김장 한 판! 수육 한 점!' 참여자 모집>                                                                                    | 실제 예약 상단 마감 11/19와 상세·포스터 11/16이 충돌. 확정 마감 기관 확인 필요                                    | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75468)                                           |
| 461b69c5-8d4d-4f95-bc8b-0e75edbd28f6 | 서울청년센터 은평 11월 티톡<반찬 한 상, 청년정책 한 장> 참여자 모집                                                                                               | 실제 예약 상단 11/12 15시와 상세 모집 11/11 13시가 충돌. 선정안내 11/12 15시 혼입 여부 확인 필요                  | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75470)                                           |
| c53ca08b-4f8e-49e8-bcab-80a695b7df49 | 서울광역청년센터 <2026 서울청년이슈포럼>                                                                                                                          | 행사일·장소 확인됐으나 실제 신청서·포스터에 11/17 모집 마감 근거가 없음. 포털 기본 마감만으로 승인 안 함          | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75483)                                           |
| 55015e69-3bda-447b-8587-13a32de97b70 | 2027년 청년 쿡 비즈니스·푸드테크 센터 스타트업 모집 공고                                                                                                          | 비즈니스·푸드테크 두 별도 공고와 신청서가 합쳐짐. 트랙별 자격·서류·대표이미지 분리 검수 필요                      | [원문](https://www.seoul.go.kr/news/news_notice.do?bbsNo=277&nttNo=469331)                                                            |
| 717bfc55-73cd-42fe-b221-b598e503c8b9 | 강북문화재단<천하제일탈공작소x강북문화예술회관 가장무도 : 대방놀이판>안내                                                                                         | 대표 이미지가 장문의 관람 주의사항 위주이고 종료된 공연. 실제 대표 포스터 후보·게시 필요성 추가 검토              | [원문](https://www.gbcf.or.kr/load.asp?cate=A&idx=466&subPage=110.view)                                                               |
| d9badcf3-0b8a-4df7-86ba-26cfc35cd7a1 | 성동청소년문화의집 <2026 MZ마음상담소 청년마음상담> 참여자 모집                                                                                                   | 신청서 출생연도와 나이 범위 불일치, 예산소진 조건 및 정확한 마감 미확인                                           | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75337)                                           |
| affcc302-3dcb-46b1-a098-ae0c4f320ad0 | 마포여성동행센터 <나에게 맞는 식생활 기준 찾기> 참여자 모집                                                                                                       | 대상 지역 표기 충돌과 회차별 신청조건 추가 확인 필요                                                              | [원문](https://mapogowith.or.kr/program/?bmode=view&idx=175238710)                                                                    |
| 0eccbbb6-40bf-4556-87e5-9a38a5f4a756 | 서울청년센터 마포 <독서 동아리> 참여자 모집                                                                                                                       | 독서모임 실제 확정 일정·개별 안내 방식 및 모집 마감 추가 확인 필요                                                | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75449)                                           |
| 40b85fe8-e76f-42d0-b4a3-76f99430ea5b | 서울디자인재단 「2026 서울디자인런 포럼」 참가 신청                                                                                                               | 원문·예매 페이지의 시작 및 종료 시간 차이 미해결                                                                  | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179637&schM=view)                                         |
| acc2cb4e-4469-423a-8858-181c5201b2b1 | [2026 Beyond OI] 밋업 데이 참여 스타트업 모집(~11.1)                                                                                                              | 접수 종료된 공고이며 행사 종료시각 자료 충돌 미해결                                                               | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179624&schM=view)                                         |
| f66471b0-6242-46f3-8fb2-b2150ab94575 | 2026 서울 기후테크 글로벌 B2G 매칭데이 행사 참여기업 모집                                                                                                         | 첨부와 포털 모집 시작일 차이 및 비공개 행사 장소 미확정                                                           | [원문](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=179668&schM=view)                                         |
| ab4ac090-5885-4ca1-a40e-e697581e1055 | 서울청년센터 동대문 <동대문구지역사회보장협의체 1인가구 소통 톡톡 영화제> 안내                                                                                    | 날짜·요일 표기 오류와 QR 접수의 정확한 종료일 확인 필요                                                           | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75436)                                           |
| 5e6d7c1a-889f-45b2-a848-81b7d020d377 | (사)한국ICT패션뷰티산업협회 <2026년 미래내일일경험(인턴형) 패션뷰티유통직무 서울 5기 청년 참여자> 모집                                                            | 나이·교육/인턴 기간·면접 일정 자료 충돌 미해결                                                                    | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75344)                                           |
| f9a04abc-2e80-4685-80f5-51412f124ff7 | 서울청년센터 중구 <하트 도시락 꽃꽂이> 모집                                                                                                                       | 포털 대상 19~39세와 실제 공통 신청서 대상 18~39세 및 추가 제외조건 충돌                                           | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75216)                                           |
| 1b481bf9-09af-43f3-880a-baa7597ee414 | 양천문화재단 <청년문화기획자 양성프로젝트 - 문화처방 ZINE>                                                                                                        | 포털과 신청서 지역 조건 차이 및 예산소진 마감 상태 추가 확인 필요                                                 | [원문](https://blog.naver.com/PostView.naver?blogId=yfac2019&categoryNo=50&from=thumbnailList&logNo=224440387484&parentCategoryNo=50) |
| d2e211c6-3711-47ad-87da-4da13c1c59d0 | 양천구가족센터 <서울가족학교 아동기부모교실 - 답을 찾는 시대, 생각하는 힘을 키우는 부모>                                                                          | 본문·포스터·이전 홍보의 접수 기간 충돌 및 동적 가족센터 상세 응답 실패                                            | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75102)                                           |
| d266f210-fd0d-495f-acbd-3072fcbf36f6 | 강동구 청년해냄센터 <전문분야 창업 멘토링(11월)> 참여자 모집                                                                                                      | 게시된 동일 멘토링 공고 중복 및 6팀/6명 표기 차이 검토 필요                                                       | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75417)                                           |
| 555711da-82c5-489b-9b00-892fbf00e436 | 구로구x한국능률협회 <현직자와 함께하는 빅데이터 직무체험 프로그램 참여자> 모집                                                                                    | 공통 신청서의 해당 회차 접수 종료일·잔여석 및 실제 신청 가능 상태 미확정                                          | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75234)                                           |
| 3e6a0f12-e5cd-40f8-b9bf-2bdf65aa9e92 | 신길종합사회복지관 <청년의 바로잡힌 몸 마음 건강 지원사업(청바지) - 따뜻한 집>                                                                                    | 연령과 진행 층수 자료 충돌 미해결                                                                                 | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75248)                                           |
| 21936c85-4d24-4c62-9dbd-71bcea2c64fa | 강남구<스트레스 컷(cut!)-직무회복 솔루션 집단 프로그램> 모집 안내                                                                                                 | 실제 신청서 저녁과 포스터 오후 행사시간 충돌 미해결                                                               | [원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=75304)                                           |
| 8708ca07-d8b3-4d65-8c97-5d25607e5f47 | 도봉문화정보도서관 <11월 쉼표클래스 '야생화 이끼볼 만들기'> 참여자 모집                                                                                           | 원문·신청 정보는 정정됐으나 다수 다른 강좌 이미지가 함께 수집되어 이미지 관계 정리 필요                           | [원문](https://www.unilib.dobong.kr/edusat/list.do?sh_ct_idx=2)                                                                       |
| aeb79dfc-3708-48a6-9f5f-060631abd573 | 김근태기념도서관 <김근태기념도서관과 함께하는 11월 2회차 독립영화 상영 '콘크리트 녹색섬'(+GV)> 참여자 모집                                                        | 통합 포스터의 다른 상영회 혼입 및 접수방식 본문/공통안내 차이 추가 확인                                           | [원문](https://www.unilib.dobong.kr/edusat/view.do?edu_idx=6310&prepage=%2Fedusat%2Flist.do%3Fsh_ct_idx%3D83)                         |
| 8c0ab9d9-e06a-4721-8cf7-95a2ac22bfb2 | 서울시복지재단 청년동행센터 <청년 금융교육 채무조정제도의 이해> 신청기관 모집                                                                                     | 모집 기관 대상은 정정됐으나 기관 홈페이지에서 수집한 다수 무관 이미지 관계 정리 필요                              | [원문](https://sfwc.welfare.seoul.kr/web/main/index.do)                                                                               |

## 적용 및 복구 근거

실행기: `scripts/crawler/src/apply-direct-review-20261107.js`. 계획 SHA-256: `4c77da9377db41ad898f33cade311e34820ebc0e424cf7e8a8c054efa7f06bc8`. 전체 103건의 변경 전 스냅샷과 현재값 일치를 dry-run으로 검증한 후 수정시각 조건부 선점·관계 정정·최종 상태 변경을 수행했다. 승인 대상 분류 관계도 정정하고 대표 이미지·원문·나머지 필드가 그대로인지 저장 후 대조했다. 103건 모두 재조회 검증 후 관리자 감사 기록을 저장했다. 완료 저널이 있으면 실행기는 재적용을 차단한다.

로컬 근거: `data/results/source-review-20261107/`의 `backup.json`, `plan.json`, `applied.json`, `after-*.json`, `verification.json`, `sources.json`, `images.json`, `ai-report/`. 원문 신청서·변경 전후 전체 데이터는 개인정보가 포함될 수 있어 커밋하지 않는다. 복구는 이후 사용자 변경과 저널을 대조한 뒤 해당 필드·관계만 되돌려야 하며 전체 행 덮어쓰기는 금지한다.
