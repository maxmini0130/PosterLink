# 05. 데이터 모델

## 권장 DB
PostgreSQL

## 1. 핵심 엔티티 목록

1. users
2. user_profiles
3. categories
4. regions
5. eligibility_tags
6. posters
7. poster_images
8. poster_links
9. poster_tags
10. poster_favorites
11. comments
12. comment_reports
13. admin_actions
14. notifications

---

## 2. 사용자 계정

### users
- id (uuid, pk)
- email
- password_hash or auth_provider
- role (`user`, `operator`, `admin`, `super_admin`)
- status (`active`, `suspended`, `withdrawn`)
- created_at
- updated_at

### user_profiles
- id (uuid, pk)
- user_id (fk -> users.id)
- nickname
- gender (`male`, `female`, `other`, `unknown`, `prefer_not_to_say`)
- age_band (`teen`, `20s`, `30s`, `40s`, `50s`, `60_plus`, `unknown`)
- primary_region_id (fk -> regions.id)
- notification_enabled (bool)
- created_at
- updated_at

### user_interest_categories
- id
- user_id
- category_id

### user_interest_tags
- id
- user_id
- eligibility_tag_id

---

## 3. 기준정보

### categories
- id
- parent_id (nullable)
- code
- name
- sort_order
- is_active

### regions
- id
- parent_id (nullable)
- level (`nation`, `sido`, `sigungu`, `eupmyeondong`)
- code
- name
- full_name
- is_active

### eligibility_tags
- id
- type (`age`, `gender`, `status`, `family`, `income`, `job`, `etc`)
- code
- name
- description
- is_active

---

## 4. 포스터

### posters
- id (uuid, pk)
- title
- slug
- source_org_name
- summary_short
- summary_long
- region_scope_type (`nationwide`, `regional`, `mixed`)
- primary_region_id (nullable)
- category_id
- exposure_start_at
- exposure_end_at
- application_start_at (nullable)
- application_end_at (nullable)
- poster_status (`draft`, `review_requested`, `published`, `hidden`, `rejected`, `expired`)
- official_notice_required (bool default true)
- allow_comments (bool default true)
- is_featured (bool default false)
- favorite_count (int default 0)
- comment_count (int default 0)
- created_by (fk -> users.id)
- approved_by (nullable fk -> users.id)
- published_at (nullable)
- created_at
- updated_at

### poster_images
- id
- poster_id
- image_type (`original`, `corrected`, `thumbnail`)
- storage_path
- width
- height
- created_at

### poster_links
- id
- poster_id
- link_type (`official_notice`, `official_apply`, `official_homepage`, `reference_blog`, `reference_news`, `reference_video`, `other`)
- title
- url
- is_primary (bool default false)
- created_at

### poster_regions
- id
- poster_id
- region_id

### poster_eligibility_tags
- id
- poster_id
- eligibility_tag_id

### poster_search_keywords
- id
- poster_id
- keyword

---

## 5. 찜

### poster_favorites
- id
- user_id
- poster_id
- created_at

#### unique index
- (user_id, poster_id)

---

## 6. 댓글

### comments
- id (uuid, pk)
- poster_id
- user_id
- parent_comment_id (nullable)  # null이면 댓글, 값 있으면 대댓글
- comment_type (`question`, `review`, `info`, `correction`, `general`)
- body
- status (`normal`, `hidden`, `deleted`, `blocked`)
- is_official (bool default false)
- like_count (int default 0)
- report_count (int default 0)
- created_at
- updated_at
- deleted_at (nullable)

### comment_reports
- id
- comment_id
- reporter_user_id
- reason_code (`abuse`, `misinformation`, `spam`, `political`, `privacy`, `hate`, `other`)
- reason_detail
- report_status (`received`, `reviewing`, `actioned`, `dismissed`)
- handled_by (nullable)
- handled_at (nullable)
- created_at

---

## 7. 관리자 액션

### admin_actions
- id
- actor_user_id
- target_type (`poster`, `comment`, `user`, `report`, `category`)
- target_id
- action_type (`create`, `update`, `hide`, `delete`, `suspend`, `approve`, `reject`, `expire`)
- action_reason
- metadata_json
- created_at

---

## 8. 알림

### notifications
- id
- user_id
- type (`favorite_deadline`, `new_match`, `comment_reply`, `comment_mention`, `system_notice`)
- title
- body
- target_type (`poster`, `comment`, `system`)
- target_id (nullable)
- is_read (bool default false)
- created_at

---

## 9. 추천 점수용 보조 필드(권장)

### posters 확장 또는 materialized view
- recommendation_base_score
- popularity_score
- freshness_score
- urgency_score

또는 조회 시 동적 계산:
- 지역 일치
- 연령대 일치
- 관심 카테고리 일치
- 추가 조건 일치
- 마감 임박 가중치
- 전국/전체 대상 가중치

---

## 10. 인덱스 권장

### posters
- index on `poster_status`
- index on `category_id`
- index on `application_end_at`
- index on `primary_region_id`
- full text index on `title`, `summary_short`, `source_org_name`

### comments
- index on `poster_id`
- index on `parent_comment_id`
- index on `status`

### poster_favorites
- unique `(user_id, poster_id)`

### comment_reports
- index on `report_status`
- index on `comment_id`

---

## 11. 상태값 설계 원칙

### poster_status
- `draft`: 작성중
- `review_requested`: 검수 요청
- `published`: 사용자 노출중
- `hidden`: 관리자 비공개
- `rejected`: 반려
- `expired`: 마감 종료

### comment.status
- `normal`: 정상 노출
- `hidden`: 관리자 숨김
- `deleted`: 삭제
- `blocked`: 작성 제한/자동 차단 상태
