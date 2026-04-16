# 공공 포스터 앱 개발 문서 세트

이 문서는 **바이브 코딩(LLM/AI 보조 개발)** 기준으로 바로 구현에 들어갈 수 있도록 정리한 Markdown 세트입니다.

## 문서 구성

- `00_product_summary.md`  
  서비스 개요, 문제 정의, 핵심 가치, MVP 방향
- `01_personas_and_value.md`  
  주요 사용자, 기대 가치, 대표 사용 시나리오
- `02_information_architecture_and_flows.md`  
  IA, 메뉴 구조, 사용자/운영자/관리자 주요 플로우
- `03_screen_spec_user_app.md`  
  사용자 앱 화면 정의
- `04_screen_spec_operator_admin.md`  
  운영자 촬영/등록 화면 + 관리자 CMS 화면 정의
- `05_data_model.md`  
  핵심 엔티티, DB 스키마 초안, 인덱스/상태값
- `06_api_contracts.md`  
  REST API 초안
- `07_comment_and_moderation_policy.md`  
  댓글/대댓글/신고/블라인드/관리 정책
- `08_mvp_scope_and_roadmap.md`  
  MVP 범위, 제외 범위, 단계별 확장
- `09_build_order_for_vibe_coding.md`  
  바이브 코딩용 구현 순서, 프롬프트 가이드, 추천 스택
- `10_master_prompt_for_ai_coding.md`  
  AI 코딩 도구용 마스터 프롬프트
- `11_brand_guide.md`  
  서비스명, 슬로건, 로고/컬러/브랜드 방향
- `12_tech_architecture.md`  
  프론트/백엔드/DB/워커를 포함한 기술 아키텍처 제안
- `13_repository_structure.md`  
  모노레포 구조, 앱/패키지 분리 기준, 라우트 초안
- `14_db_auth_storage_strategy.md`  
  DB/Auth/Storage/RLS 전략 정리
- `15_development_checklist.md`  
  바이브코딩 시작 전후 체크리스트

## 권장 1차 구현 전략

초기에는 네이티브 앱보다 아래 구성이 개발 속도와 운영 효율 면에서 유리합니다.

- **프론트엔드**: Next.js + TypeScript + Tailwind
- **사용자 서비스**: 모바일 우선 웹 / PWA
- **운영자 등록도구**: 동일 코드베이스 내 운영자 전용 화면
- **관리자 CMS**: 웹 기반 백오피스
- **백엔드/DB**: Supabase(PostgreSQL/Auth/Storage) 또는 별도 Node/Nest API + PostgreSQL
- **OCR/이미지 보정**: 1차는 외부 스캔 SDK 없이 업로드 + 서버 보정/수동 보정 중심, 2차에서 자동화 강화

## 개발 원칙

1. **초기 핵심은 포스터 수집/구조화/노출**
2. **개인화 추천은 복잡한 AI보다 규칙 기반 점수화부터**
3. **댓글은 커뮤니티가 아니라 정보 보조 기능으로 설계**
4. **공식 정보와 사용자 의견을 반드시 분리**
5. **모든 포스터는 공식 출처 URL과 검수 이력을 가져야 함**

## 바로 구현할 때 우선 참고할 문서

가장 먼저 아래 4개를 기준으로 개발을 시작하면 됩니다.

1. `08_mvp_scope_and_roadmap.md`
2. `02_information_architecture_and_flows.md`
3. `03_screen_spec_user_app.md`
4. `05_data_model.md`

## 산출물 활용 방식

- 기획 기준 문서
- AI 코딩 프롬프트 입력 문서
- Cursor / Claude Code / Codex / Gemini Code Assist 작업 기준
- 개발자/디자이너/운영자 공통 참조 문서
