# 06. API 계약 초안

## 공통

### Base URL 예시
`/api/v1`

### 응답 형식 예시
```json
{
  "success": true,
  "data": {},
  "message": null
}
```

### 에러 형식 예시
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "필수값이 누락되었습니다."
  }
}
```

---

## 1. 인증

### POST `/auth/signup`
회원가입

### POST `/auth/login`
로그인

### POST `/auth/logout`
로그아웃

### GET `/auth/me`
내 정보 조회

---

## 2. 사용자 프로필

### GET `/me/profile`
내 프로필 조회

### PUT `/me/profile`
내 프로필 수정

#### request body 예시
```json
{
  "nickname": "jungmin",
  "gender": "male",
  "ageBand": "40s",
  "primaryRegionId": "region-seoul",
  "interestCategoryIds": ["cat-welfare", "cat-education"],
  "interestTagIds": ["tag-single-household", "tag-job-seeker"]
}
```

---

## 3. 포스터 목록/상세

### GET `/posters`
포스터 목록 조회

#### query params
- `page`
- `limit`
- `sort`: `recommended | latest | deadline | popular`
- `keyword`
- `categoryId`
- `regionId`
- `ageBand`
- `gender`
- `status`
- `onlyFavorites` (선택)

#### response item 예시
```json
{
  "id": "poster-uuid",
  "title": "서울 청년 어학시험 응시료 지원",
  "thumbnailUrl": "https://...",
  "sourceOrgName": "서울특별시 청년정책과",
  "categoryName": "지원금/복지",
  "regionNames": ["서울특별시"],
  "applicationEndAt": "2026-04-19T23:59:59+09:00",
  "favoriteCount": 23,
  "commentCount": 4,
  "tags": ["서울", "청년", "지원금"]
}
```

### GET `/posters/{posterId}`
포스터 상세 조회

### GET `/posters/recommended`
개인화 추천 목록

---

## 4. 찜

### POST `/posters/{posterId}/favorite`
찜하기

### DELETE `/posters/{posterId}/favorite`
찜 해제

### GET `/me/favorites`
내 찜 목록 조회

---

## 5. 댓글

### GET `/posters/{posterId}/comments`
댓글/대댓글 조회

#### query
- `sort=latest|popular`

### POST `/posters/{posterId}/comments`
댓글 작성

#### request body
```json
{
  "commentType": "question",
  "body": "재직자도 신청 가능한가요?"
}
```

### POST `/comments/{commentId}/replies`
대댓글 작성

### PUT `/comments/{commentId}`
본인 댓글 수정

### DELETE `/comments/{commentId}`
본인 댓글 삭제

---

## 6. 댓글 신고

### POST `/comments/{commentId}/reports`
댓글 신고

#### request body
```json
{
  "reasonCode": "misinformation",
  "reasonDetail": "공식 링크와 다른 정보를 안내하고 있습니다."
}
```

---

## 7. 알림

### GET `/me/notifications`
알림 목록

### PATCH `/me/notifications/{notificationId}/read`
알림 읽음 처리

### PATCH `/me/notifications/read-all`
전체 읽음 처리

---

## 8. 운영자 포스터 등록

### POST `/operator/posters`
포스터 신규 생성

### POST `/operator/posters/{posterId}/images`
이미지 업로드

### POST `/operator/posters/{posterId}/ocr`
OCR 추출 요청

### PUT `/operator/posters/{posterId}`
포스터 정보 수정

### POST `/operator/posters/{posterId}/submit-review`
검수 요청

### POST `/operator/posters/{posterId}/publish`
게시(권한 필요)

---

## 9. 관리자

### GET `/admin/posters`
포스터 관리 목록

### PATCH `/admin/posters/{posterId}/status`
상태 변경

#### request body
```json
{
  "status": "hidden",
  "reason": "중복 등록 포스터"
}
```

### GET `/admin/reports`
신고 목록

### PATCH `/admin/reports/{reportId}`
신고 처리

#### request body
```json
{
  "reportStatus": "actioned",
  "actionType": "hide_comment",
  "actionReason": "허위정보 유포"
}
```

### PATCH `/admin/comments/{commentId}/status`
댓글 상태 변경

### PATCH `/admin/users/{userId}/status`
사용자 제재 처리

---

## 10. 추천 API 설계 원칙

초기에는 별도 AI 추천 엔진 없이 규칙 기반으로 구현한다.

### 점수 예시
- 지역 일치 +30
- 상위 지역 일치 +20
- 연령대 일치 +20
- 관심 카테고리 일치 +15
- 추가 조건 일치 +20
- 전국민 대상 +10
- 마감 임박 +10
- 신규 등록 +5

### 추천 결과 정렬
- 최종 점수 desc
- 동일 점수면 마감임박 우선
- 이후 최신순
