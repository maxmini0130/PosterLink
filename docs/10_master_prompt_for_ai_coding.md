# 10. AI 코딩 마스터 프롬프트

아래 프롬프트를 Cursor / Claude Code / Codex / Gemini Code Assist 등에 붙여 넣고 시작하면 된다.

---

## 프로젝트 프롬프트

공공 포스터 앱 MVP를 개발하려고 한다.

### 제품 요약
- 길에서 본 공공기관 포스터를 다시 찾고, 이해하고, 저장하고, 놓치지 않게 만드는 개인 맞춤형 공공정보 서비스
- 초기에는 운영자가 직접 포스터를 등록한다
- 사용자는 지역, 연령대, 관심 카테고리, 추가 조건 기반으로 맞춤 포스터를 본다
- 포스터에는 공식 링크가 최소 1개 이상 있어야 한다
- 댓글은 일반 커뮤니티가 아니라 질문/후기/정보공유 중심이다
- 공식 정보와 사용자 의견은 반드시 분리해서 보여줘야 한다

### 기술 스택
- Next.js App Router
- TypeScript
- Tailwind CSS
- PostgreSQL
- Zod
- 가능한 경우 shadcn/ui 사용
- 모바일 우선 반응형

### 필요한 주요 화면
1. 로그인/온보딩
2. 관심 정보 설정
3. 홈(추천 피드)
4. 탐색/검색
5. 포스터 상세
6. 찜 목록
7. 운영자 포스터 등록
8. 관리자 포스터 목록
9. 관리자 신고 처리

### 주요 데이터 모델
- users
- user_profiles
- categories
- regions
- eligibility_tags
- posters
- poster_images
- poster_links
- poster_favorites
- comments
- comment_reports
- notifications

### 구현 원칙
- 파일을 작은 컴포넌트 단위로 분리
- 목업 데이터와 실제 타입을 함께 정의
- enum/status 값을 명확히 작성
- 추후 Supabase 연동이 쉬운 구조로 작성
- 복잡한 AI 기능은 넣지 말고 규칙 기반 추천으로 먼저 구현
- 공공서비스 UI에 맞게 과도한 장식보다 가독성을 우선

### 요청 방식
- 한 번에 전체 앱을 만들지 말고, 단계별로 구현해줘
- 먼저 타입/더미데이터/컴포넌트 구조를 만든 뒤 페이지를 조립해줘
- 필요한 경우 SQL 스키마와 API 타입도 함께 작성해줘

---

## 추천 첫 요청

“위 조건을 기준으로, 먼저 `types`, `mock data`, `PosterCard`, `HomeHeader`, `FilterChips`, `CommentList` 컴포넌트를 작성하고 홈 화면과 포스터 상세 페이지를 구현해줘. 파일 분리 구조와 샘플 데이터도 함께 제시해줘.”
