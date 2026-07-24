const TITLE_EXCLUDE_RULES = [
  {
    name: "selected-list-or-award-list",
    pattern: /\uCD5C\uC885\s*\uC120\uBC1C\s*\uBA85\uB2E8|\uC120\uBC1C\s*\uBA85\uB2E8|\uCC38\uAC00\uC0C1\s*\uBA85\uB2E8|\uC218\uC0C1(?:\uC790)?\s*\uBA85\uB2E8|\uBCF8\uC120\s*\uC9C4\uCD9C(?:\uC790|\s*\uB300\uC0C1\uC790)?\s*(?:\uACF5\uC9C0|\uC548\uB0B4)?/i,
    reason: "selected/result list announcement",
  },
  {
    name: "event-cancellation-notice",
    pattern: /\uD589\uC0AC\s*\uCDE8\uC18C(?:\s*\uC54C\uB9BC|\s*\uC548\uB0B4|\s*\uACF5\uC9C0)?/i,
    reason: "event cancellation notice is not an active event poster",
    titleOnly: true,
  },
  {
    name: "service-operation-end",
    pattern: /\uBC88\uD638\s*\uC6B4\uC601\s*\uC885\uB8CC|\uC11C\uBE44\uC2A4\s*\uC885\uB8CC|\uC6B4\uC601\s*\uC885\uB8CC\s*\uC548\uB0B4/i,
    reason: "service operation end notice",
  },
  {
    name: "street-event-schedule",
    pattern: /(?:\uC0C1\uC0C1\uB9C8\uB2F9|\uBC34\uB4DC\uC874|\uD589\uC0AC).*(?:\uD589\uC0AC\s*\uC77C\uC815|\d{1,2}\.\d{1,2}\s*[~.-]\s*\d{1,2}\.\d{1,2})|(?:\uD589\uC0AC\s*\uC77C\uC815).*(?:\uC0C1\uC0C1\uB9C8\uB2F9|\uBC34\uB4DC\uC874)/i,
    reason: "street/facility event schedule, not an individual poster",
    titleOnly: true,
  },
  {
    name: "recruitment-screening-schedule",
    pattern: /\uBAA8\uC9D1.*\uC2EC\uC0AC\s*\uC77C\uC815(?:\s*\uACF5\uACE0|\s*\uC548\uB0B4)?|\uC2EC\uC0AC\s*\uC77C\uC815.*\uBAA8\uC9D1/i,
    reason: "recruitment screening schedule is an administrative follow-up, not a recruitment poster",
    titleOnly: true,
  },
  {
    name: "breadcrumb-title",
    pattern: /^[^/<>()[\]]+\s+\/\s+[^/<>()[\]]+\s+\/\s+[^/<>()[\]]+(?:\s+\/\s+[^/<>()[\]]+)*$/i,
    reason: "breadcrumb/navigation path captured as title",
  },
  {
    name: "system-error-page",
    pattern: /\uC2DC\uC2A4\uD15C\s*\uC624\uB958(?:\s*\uC785\uB2C8\uB2E4|\s*\uC785\uB2C8\uB2E4\.)?|\uC624\uB958\s*\uD398\uC774\uC9C0|\uC694\uCCAD\uD558\uC2E0\s*\uD398\uC774\uC9C0\uB97C\s*\uCC3E\uC744\s*\uC218\s*\uC5C6/i,
    reason: "system error page captured instead of notice content",
  },
  {
    name: "web-accessibility-mark",
    pattern: /\uC6F9\s*\uC811\uADFC\uC131|\uD488\uC9C8\s*\uC778\uC99D\s*\uB9C8\uD06C|\uACFC\uD559\uAE30\uC220\uC815\uBCF4\uD1B5\uC2E0\uBD80|\bWA\b\s*(?:\uB9C8\uD06C|\uC778\uC99D)/i,
    reason: "web accessibility mark/certification asset is not a poster",
  },
  {
    name: "facility-schedule-or-parking-control",
    pattern: /(?:\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C|\uC77C\uC815\s*\uD45C|\uAD00\uB0B4\s*\uB300\uAD00\s*\uC77C\uC815|\uC6D4\s*\uAD00\uB0B4\s*\uB300\uAD00|\uBCFC\uB9C1\uC7A5\s*\uC2DC\uAC04\uD45C|\uC8FC\uCC28\uC7A5\s*\uC77C\uBD80\s*\uD1B5\uC81C|\uC8FC\uCC28\s*\uD1B5\uC81C|\uD648\uD398\uC774\uC9C0\s*\uC774\uC6A9|\uD68C\uC6D0\s*\uC811\uC218\s*\uBC0F\s*\uC774\uC6A9\s*\uC548\uB0B4)/i,
    reason: "facility schedule, timetable, homepage, or parking-control notice is not a poster notice",
    titleOnly: true,
  },
  {
    name: "resident-registration-administrative-notice",
    pattern: /(?:\uC8FC\uBBFC\uB4F1\uB85D|\uAC70\uC8FC\uBD88\uBA85|\uBB34\uB2E8\uC804\uCD9C|\uD589\uC815\uC0C1\s*\uAD00\uB9AC\uC8FC\uC18C).*(?:\uACF5\uACE0|\uC9C1\uAD8C\uC870\uCE58|\uCD5C\uACE0|\uC0AC\uC2E4\uC870\uC0AC|\uC774\uC804)|(?:\uC9C1\uAD8C\uC870\uCE58|\uCD5C\uACE0\s*\uACF5\uACE0|\uC0AC\uC2E4\uC870\uC0AC).*(?:\uC8FC\uBBFC\uB4F1\uB85D|\uAC70\uC8FC\uBD88\uBA85|\uBB34\uB2E8\uC804\uCD9C|\uD589\uC815\uC0C1\s*\uAD00\uB9AC\uC8FC\uC18C)/i,
    reason: "resident-registration administrative notice is not a poster notice",
  },
  {
    name: "civil-defense-or-shelter-guide",
    pattern: /(?:\uBBFC\uBC29\uC704\s*\uB300\uD53C\uC2DC\uC124|\uC9C0\uC9C4\s*\uC625\uC678\uB300\uD53C\uC18C|\uBE44\uC0C1\uC2DC\s*\uAD6D\uBBFC\uD589\uB3D9\uC694\uB839|\uB300\uD53C\uC18C\s*\uC548\uB0B4)/i,
    reason: "civil defense or shelter guide is not a poster notice",
  },
  {
    name: "local-waste-disposal-guide",
    pattern: /(?:\uC0DD\uD65C\s*\uC4F0\uB808\uAE30|\uC4F0\uB808\uAE30).*(?:\uC218\uAC70\s*\uC911\uB2E8|\uBC30\uCD9C\s*\uC77C\uC815|\uBC30\uCD9C\s*\uC548\uB0B4|\uC218\uAC70|\uAC10\uB7C9)|(?:\uC218\uAC70\s*\uC911\uB2E8|\uBC30\uCD9C\s*\uC77C\uC815|\uBC30\uCD9C\s*\uC548\uB0B4).*(?:\uC0DD\uD65C\s*\uC4F0\uB808\uAE30|\uC4F0\uB808\uAE30)/i,
    reason: "local waste disposal guide is not a poster notice",
  },
  {
    name: "partial-operation-or-public-holiday",
    pattern: /(?:\uBD80\uBD84\s*\uC6B4\uC601\uC77C|\uBD80\uBD84\uC6B4\uC601\uC77C|\uBC95\uC815\s*\uACF5\uD734\uC77C|\uACF5\uD734\uC77C\s*\uC6B4\uC601|\uC774\uC6A9\s*\uC2DC\uAC04\s*\uC548\uB0B4).*(?:\uC548\uB0B4|\uC6B4\uC601|\uC774\uC6A9)|(?:\uC548\uB0B4|\uC6B4\uC601|\uC774\uC6A9).*(?:\uBD80\uBD84\s*\uC6B4\uC601\uC77C|\uBC95\uC815\s*\uACF5\uD734\uC77C|\uACF5\uD734\uC77C\s*\uC6B4\uC601|\uC774\uC6A9\s*\uC2DC\uAC04)/i,
    reason: "partial operation or public-holiday facility notice is not a poster notice",
  },
  {
    name: "monthly-calendar-or-schedule-image",
    pattern: /(?:\d{1,2}\s*\uC6D4|[0-9]{2}\s*\uC6D4).*(?:\uC6D4\s*\uD504\uB85C\uADF8\uB7A8\s*\uC548\uB0B4|\uD504\uB85C\uADF8\uB7A8\s*\uC548\uB0B4|\uCE98\uB9B0\uB354|\uB2EC\uB825|\uC2A4\uCF00\uC904|\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C)|(?:\uC6D4\s*\uD504\uB85C\uADF8\uB7A8\s*\uC548\uB0B4|\uCE98\uB9B0\uB354|\uB2EC\uB825|\uC2A4\uCF00\uC904|\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C).*(?:\d{1,2}\s*\uC6D4|[0-9]{2}\s*\uC6D4)/i,
    reason: "monthly calendar/schedule image, not an individual poster",
  },
  {
    name: "gangbuk-anc-monthly-craft-class-schedule",
    pattern: /(?:\uAC15\uBD81\s*ANC|\uACF5\uC608\uC804\uC2DC\uAD00\s*\uAC15\uBD81\s*ANC).*(?:\d{1,2}\s*\uC6D4\s*\uACF5\uC608\s*(?:\uCCB4\uD5D8\s*)?\uD074\uB798\uC2A4|\uACF5\uC608\s*\uD074\uB798\uC2A4\s*\(\s*\d{1,2}\s*\uC6D4\s*\))/i,
    reason: "Gangbuk ANC monthly craft class schedule, not an individual poster",
  },
  {
    name: "metadata-title",
    pattern: /^(작성자|관리자|번호|제목|공지사항|조회수|첨부파일|maposc)$/i,
    reason: "board metadata captured as title",
  },
  {
    name: "metadata-title-prefix",
    pattern: /^작성자\s*:/i,
    reason: "board metadata captured as title",
  },
  {
    name: "rss-or-feed",
    pattern: /^(rss|feed)$/i,
    reason: "RSS/feed navigation item",
  },
  {
    name: "sports-facility-hours-or-closure",
    pattern: /(?:부분\s*운영일|법정\s*공휴일|공휴일|시간표|이용\s*시간|운영\s*안내|이용\s*안내).*(?:배드민턴|볼링장|종합체육관|체육관|센터|시설)|(?:배드민턴|볼링장|종합체육관|체육관|센터|시설).*(?:부분\s*운영일|법정\s*공휴일|공휴일|시간표|이용\s*시간|운영\s*안내|이용\s*안내)/i,
    reason: "sports facility hours or holiday operation notice, not a poster notice",
  },
  {
    name: "sports-program-timetable",
    pattern: /(?:프로그램|생활\s*체육|생활체육|스포츠|아카데미맥|수영장|헬스장|배드민턴|체육관|체력\s*인증\s*센터).*(?:시간표|운영\s*안내|운영안내|이용\s*안내|이용안내|모집\s*일정|고객\s*모집\s*일정|개소\s*및\s*이용)|(?:시간표|운영\s*안내|운영안내|이용\s*안내|이용안내|모집\s*일정|고객\s*모집\s*일정|개소\s*및\s*이용).*(?:프로그램|생활\s*체육|생활체육|스포츠|아카데미맥|수영장|헬스장|배드민턴|체육관|체력\s*인증\s*센터)/i,
    reason: "sports center timetable or operation guide, not an individual poster",
  },
  {
    name: "facility-administrative-notice",
    pattern: /(?:사진\s*및\s*동영상\s*촬영\s*안내|배드민턴\s*타임별\s*이용\s*(?:코드|코트)\s*안내|체육관\s*대관\s*당첨자\s*안내|주차장\s*일부\s*제한\s*안내|시설\s*장비\s*및\s*물품\s*현황\s*공시|장비\s*및\s*보호구\s*현황\s*공시|시설\s*이용료\s*소득공제\s*안내|회원\s*이용약관|홈페이지\s*이용약관|다중\s*로그인\s*차단\s*안내|직원\s*사칭\s*주의\s*안내)/i,
    reason: "facility or organization administrative notice, not a poster notice",
  },
  {
    name: "holiday-operation-notice",
    pattern: /(?:부분\s*운영일|법정\s*공휴일|공휴일).*(?:이용\s*안내|이용안내|운영\s*안내|운영안내)|(?:이용\s*안내|이용안내|운영\s*안내|운영안내).*(?:부분\s*운영일|법정\s*공휴일|공휴일)/i,
    reason: "holiday or partial-operation notice, not a poster notice",
  },
  {
    name: "holiday-designation-or-partial-operation",
    pattern: /(?:부분\s*운영일|법정\s*공휴일|공휴일).*(?:지정\s*알림|알림|공지|이용\s*시간|운영\s*안내|이용\s*안내)|(?:지정\s*알림|알림|공지|이용\s*시간|운영\s*안내|이용\s*안내).*(?:부분\s*운영일|법정\s*공휴일|공휴일)|부분\s*운영일/i,
    reason: "holiday or partial-operation administrative notice, not a poster notice",
  },
  {
    name: "election-facility-notice",
    pattern: /(?:전국\s*동시\s*지방\s*선거|전국동시지방선거|선거일).*(?:환불\s*안내|시설|주차|이용\s*제한|이용제한|운영\s*안내)/i,
    reason: "election-day facility operation notice, not a poster notice",
  },
  {
    name: "election-administrative-notice",
    pattern: /(?:전국\s*동시\s*지방\s*선거|전국동시지방선거).*(?:무투표|선거구|후보자|사퇴|환불|안내)/i,
    reason: "election administrative notice, not a poster notice",
  },
  {
    name: "facility-access-control-or-refund",
    pattern: /(?:주차장|주차|시설|센터).*(?:일부\s*통제|통제|이용\s*제한|이용제한)|(?:환불\s*안내|회원\s*접수\s*및\s*이용\s*안내|회원접수\s*및\s*이용안내)/i,
    reason: "facility access, refund, or member-use guide, not a poster notice",
  },
  {
    name: "rental-schedule-table",
    pattern: /(?:센터|체육관|시설).*(?:관내\s*대관|대관).*(?:일정표|일정\s*표)|(?:관내\s*대관|대관).*(?:일정표|일정\s*표)/i,
    reason: "facility rental schedule table, not a poster notice",
  },
  {
    name: "homepage-parking-control-notice",
    pattern: /홈페이지.*(?:이용|접속).*(?:주차\s*통제|주차통제)|(?:주차\s*통제|주차통제).*(?:홈페이지|이용\s*안내)/i,
    reason: "homepage or parking-control operation notice, not a poster notice",
  },
  {
    name: "sports-facility-use-schedule",
    pattern: /(?:\d{1,2}\s*월\s*(?:~|-|부터)\s*\d{1,2}\s*월|오전|오후|야간|평일|주말).*(?:종합체육관|체육관|체육센터|배드민턴|수영장|헬스장).*(?:이용\s*안내|운영\s*안내|시간\s*안내|일정\s*안내)|(?:종합체육관|체육관|체육센터|배드민턴|수영장|헬스장).*(?:오전|오후|야간|평일|주말|이용\s*안내|운영\s*안내|시간\s*안내|일정\s*안내)/i,
    reason: "sports facility use schedule, not a poster notice",
  },
  {
    name: "application-guide",
    pattern: /신청\s*안내|신청안내|이용\s*안내|신청방법|신청서|등록\s*안내|업\s*신청/i,
    reason: "administrative application guide",
  },
  {
    name: "reporting-or-voting-guide",
    pattern: /거소투표|투표신고|전수조사|신고센터|신고\s*안내/i,
    reason: "reporting/voting guide",
  },
  {
    name: "result-or-selected-list",
    pattern: /결과\s*안내|선정\s*결과|추첨\s*결과|합격자|당첨자|서류심사|최종\s*합격|발표|선발.*공개|공개.*선발/i,
    reason: "result announcement",
  },
  {
    name: "korean-result-or-selected-list",
    pattern: /합격자\s*발표|최종\s*합격자?|서류\s*합격자?|1차\s*합격자?|2차\s*합격자?|선정\s*결과|추첨\s*결과|결과\s*발표|대상자\s*발표|명단\s*발표/i,
    reason: "result announcement",
  },
  {
    name: "selected-or-result-announcement",
    pattern: /\uC120\uBC1C\s*\uACB0\uACFC|\uC120\uBC1C\uACB0\uACFC|\uACB0\uACFC\s*\uBC1C\uD45C|\uACB0\uACFC\uBC1C\uD45C|\uCD5C\uC885\s*\uD569\uACA9|\uC11C\uB958\s*\uD569\uACA9|\uC120\uC815\s*\uACB0\uACFC|\uCD94\uCCA8\s*\uACB0\uACFC|\uC218\uC5EC\uC2DD\s*\uC77C\uC815|\uC7A5\uD559\uC0DD\s*\uC120\uBC1C\s*\uACB0\uACFC|\uC7A5\uD559\uC11C\s*\uC218\uC5EC\uC2DD/i,
    reason: "selected/result announcement is not a recruitment poster",
  },
  {
    name: "closure-or-operation-notice",
    pattern: /휴관\s*안내|휴무\s*안내|운영\s*안내|일정\s*안내|개관\s*안내/i,
    reason: "facility operation notice",
  },
  {
    name: "posting-guide",
    pattern: /게시\s*요청|게시요청|게시\s*가이드|프로그램\s*게시/i,
    reason: "posting guide",
  },
  {
    name: "donation-or-campaign-link",
    pattern: /모금함|후원|기부\s*안내|서명\s*관련/i,
    reason: "donation/signature notice",
  },
  {
    name: "job-result-announcement",
    pattern: /\uCC44\uC6A9\s*\uACB0\uACFC|\uCC44\uC6A9\uACB0\uACFC|\uC120\uBC1C\s*\uACB0\uACFC|\uC11C\uB958\s*\uC804\uD615\s*\uACB0\uACFC|\uC11C\uB958\uC804\uD615\s*\uACB0\uACFC/i,
    reason: "job/result announcement",
  },
  {
    name: "budget-or-expense-disclosure",
    pattern: /\uC5C5\uBB34\s*\uCD94\uC9C4\uBE44|\uC5C5\uBB34\uCD94\uC9C4\uBE44|\uC608\s*[.\u00B7]?\s*\uACB0\uC0B0\s*\uACF5\uACE0|\uC608\uC0B0\s*\uACF5\uC2DC|\uACB0\uC0B0\s*\uBC0F\s*\d{4}\uB144?\s*\d*\uCC28?\s*\uCD94\uACBD\s*\uC608\uC0B0|\uD6C4\uC6D0\uAE08\uD488\s*\uC218\uC785\s*\uBC0F\s*\uC0AC\uC6A9\s*\uACB0\uACFC/i,
    reason: "budget/expense disclosure is not a poster notice",
  },
  {
    name: "job-document-notice",
    pattern: /채용\s*서류\s*(?:반환|청구|접수|안내)|이의신청서|반환\s*신청서/i,
    reason: "job administrative document notice",
  },
  {
    name: "public-workfare-recruitment-document",
    pattern: /지역공동체\s*일자리\s*사업.*참여자\s*모집|지역공동체일자리사업.*참여자\s*모집/i,
    reason: "administrative workfare recruitment document, not a poster notice",
  },
  {
    name: "facility-use-guide",
    pattern: /(종합체육관|체육관|배드민턴|수영장|헬스장|체육센터|시설|대관).*(이용\s*안내|운영\s*안내|휴관\s*안내|대관\s*안내)|(?:이용\s*안내|운영\s*안내|휴관\s*안내|대관\s*안내).*(종합체육관|체육관|배드민턴|수영장|헬스장|체육센터|시설|대관)/i,
    reason: "facility operation or use guide, not a poster notice",
  },
  {
    name: "low-poster-specific-known-terms",
    pattern: /외국인관광\s*도시민박업|안심장비\s*지원사업|반려식물\s*클리닉|구석구석\s*동네문화예술교육|인공달팽이관/i,
    reason: "known low-poster notice format",
  },
];

const COLLECTABLE_ANNOUNCEMENT_PATTERN = /\uBAA8\uC9D1|\uACF5\uACE0|\uCC44\uC6A9|\uC9C0\uC6D0\s*\uC0AC\uC5C5|\uC9C0\uC6D0\uC0AC\uC5C5|\uAD50\uC721|\uD504\uB85C\uADF8\uB7A8|\uCC38\uC5EC\uC790|\uC218\uAC15\uC0DD|\uACF5\uBAA8|\uC811\uC218|\uC2E0\uCCAD\uC790|\uD6C8\uB828|\uAC15\uC88C|\uD074\uB798\uC2A4/i;
const STRONG_COLLECTABLE_NOTICE_PATTERN = /(?:\uC785\uC8FC\uAE30\uC5C5|\uC785\uC8FC\s*\uC2A4\uD0C0\uD2B8\uC5C5|\uCC38\uC5EC(?:\uC790|\uCCAD\uB144)|\uAD50\uC721\uC0DD|\uC218\uAC15\uC0DD|\uB4DC\uB9BC\uCCAD\uB144|\uAD6C\uC9C1\uCCAD\uB144|\uC2E0\uD63C\uBD80\uBD80|\uC790\uACA9\uC99D).*(?:\uBAA8\uC9D1|\uC9C0\uC6D0|\uAD50\uC721|\uD504\uB85C\uADF8\uB7A8|\uC0AC\uC5C5)|(?:\uBAA8\uC9D1|\uC9C0\uC6D0|\uAD50\uC721|\uD504\uB85C\uADF8\uB7A8|\uC0AC\uC5C5).*(?:\uC785\uC8FC\uAE30\uC5C5|\uC785\uC8FC\s*\uC2A4\uD0C0\uD2B8\uC5C5|\uCC38\uC5EC(?:\uC790|\uCCAD\uB144)|\uAD50\uC721\uC0DD|\uC218\uAC15\uC0DD|\uB4DC\uB9BC\uCCAD\uB144|\uAD6C\uC9C1\uCCAD\uB144|\uC2E0\uD63C\uBD80\uBD80|\uC790\uACA9\uC99D)/i;
const WEAK_ADMIN_EXCLUSION_RULES = new Set([
  "holiday-designation-or-partial-operation",
  "holiday-operation-notice",
  "closure-or-operation-notice",
  "facility-use-guide",
]);
const CENTRAL_TEXT_NOTICE_FALSE_POSITIVE_RULES = new Set([
  "street-event-schedule",
  "monthly-calendar-or-schedule-image",
  "sports-program-timetable",
]);
const CENTRAL_TEXT_NOTICE_SOURCE_PATTERN = /(?:k-startup|K-Startup|k-startup\.go\.kr|bizinfo|bizinfo\.go\.kr|youthcenter|youthcenter\.go\.kr|\uAE30\uC5C5\uB9C8\uB2F9|\uC628\uD1B5\uCCAD\uB144)/i;
const CENTRAL_TEXT_NOTICE_SIGNAL_PATTERN = /(?:\uC2E0\uCCAD|\uC811\uC218)\s*\uAE30\uAC04|\uC2E0\uCCAD\s*\uBC29\uBC95|\uC8FC\uAD00\uAE30\uAD00|\uCC3D\uC5C5|\uC2A4\uD0C0\uD2B8\uC5C5|\uCC38\uAC00\uAE30\uC5C5|\uCC38\uC5EC\uAE30\uC5C5|\uCC3D\uC5C5\uAE30\uC5C5|\uC785\uC8FC\uAE30\uC5C5|\uC9C0\uC6D0\s*\uC0AC\uC5C5|\uC0AC\uC5C5\s*\uACF5\uACE0|\uC561\uC140\uB7EC\uB808\uC774\uD305|\uCEE8\uC124\uD305|\uD22C\uC790|\uBCF4\uC721\uC13C\uD130|\bIR\b/i;
const JOB_ALIO_FALSE_POSITIVE_RULES = new Set([
  "job-document-notice",
  "result-or-selected-list",
  "korean-result-or-selected-list",
]);
const JOB_ALIO_SOURCE_PATTERN = /(?:job-alio|JOB-ALIO|job\.alio\.go\.kr)/i;
const JOB_ALIO_RECRUIT_NOTICE_PATTERN = /(?:\uCC44\uC6A9\s*\uAE30\uAC04|\uC751\uC2DC\s*\uC790\uACA9|\uCC44\uC6A9\s*\uC778\uC6D0|\uACE0\uC6A9\s*\uD615\uD0DC|\uADFC\uBB34\s*\uC9C0|\uD559\uB825\s*\uC815\uBCF4|\uC804\uD615\s*\uC808\uCC28|\uC9C0\uC6D0\uC11C|\uC9C1\uBB34\s*\uAE30\uC220\uC11C)/i;
const LOCAL_EMPLOYMENT_FALSE_POSITIVE_RULES = new Set([
  "sports-facility-hours-or-closure",
  "sports-program-timetable",
  "facility-use-guide",
]);
const LOCAL_EMPLOYMENT_SOURCE_PATTERN = /(?:mapo-employ|mapoworkfare\.or\.kr|\uB9C8\uD3EC\uAD6C\uACE0\uC6A9\uBCF5\uC9C0\uC9C0\uC6D0\uC13C\uD130)/i;
const LOCAL_EMPLOYMENT_RECRUIT_NOTICE_PATTERN = /(?:\uCC44\uC6A9\s*\uACF5\uACE0|\uCC44\uC6A9\uACF5\uACE0|\uBAA8\uC9D1\s*\uACF5\uACE0|\uBAA8\uC9D1\uACF5\uACE0|\uBC14\uB9AC\uC2A4\uD0C0.*\uBAA8\uC9D1|\uC0AC\uD68C\uBCF5\uC9C0\uC0AC.*\uCC44\uC6A9|\uB9E4\uB2C8\uC800.*\uCC44\uC6A9|\uACC4\uC57D\uC9C1.*\uCC44\uC6A9)/i;
const LOCAL_SCHOLARSHIP_FALSE_POSITIVE_RULES = new Set([
  "closure-or-operation-notice",
  "facility-use-guide",
]);
const LOCAL_SCHOLARSHIP_SOURCE_PATTERN = /(?:mapo-scholarship|mapojh\.or\.kr|\uB9C8\uD3EC\uC778\uC7AC\uC721\uC131\uC7A5\uD559\uC7AC\uB2E8)/i;
const LOCAL_SCHOLARSHIP_SELECTION_NOTICE_PATTERN = /(?:\uC7A5\uD559(?:\uC0DD|\uAE08)?).*(?:\uC120\uBC1C|\uBAA8\uC9D1|\uC811\uC218|\uC2E0\uCCAD|\uC9C0\uC6D0\s*\uB300\uC0C1)|(?:\uC120\uBC1C|\uBAA8\uC9D1|\uC811\uC218|\uC2E0\uCCAD|\uC9C0\uC6D0\s*\uB300\uC0C1).*(?:\uC7A5\uD559(?:\uC0DD|\uAE08)?)/i;
const SCHOLARSHIP_RESULT_OR_CEREMONY_PATTERN = /\uACB0\uACFC|\uBC1C\uD45C|\uBA85\uB2E8|\uC218\uC5EC\uC2DD/i;

function isCentralTextNoticeFalsePositive(post, matchedRule, text) {
  if (!CENTRAL_TEXT_NOTICE_FALSE_POSITIVE_RULES.has(matchedRule.name)) return false;

  const sourceText = [
    post.site,
    post.siteId,
    post.collectionSourceSlug,
    post.sourceUrl,
    post.url,
  ].filter(Boolean).join(" ");

  return CENTRAL_TEXT_NOTICE_SOURCE_PATTERN.test(sourceText)
    && CENTRAL_TEXT_NOTICE_SIGNAL_PATTERN.test(text);
}

function isJobAlioRecruitNoticeFalsePositive(post, matchedRule, text) {
  if (!JOB_ALIO_FALSE_POSITIVE_RULES.has(matchedRule.name)) return false;

  const sourceText = [
    post.site,
    post.siteId,
    post.collectionSourceSlug,
    post.sourceUrl,
    post.url,
  ].filter(Boolean).join(" ");

  return JOB_ALIO_SOURCE_PATTERN.test(sourceText)
    && JOB_ALIO_RECRUIT_NOTICE_PATTERN.test(text);
}

function isLocalEmploymentRecruitNoticeFalsePositive(post, matchedRule, text) {
  if (!LOCAL_EMPLOYMENT_FALSE_POSITIVE_RULES.has(matchedRule.name)) return false;

  const sourceText = [
    post.site,
    post.siteId,
    post.collectionSourceSlug,
    post.sourceUrl,
    post.url,
  ].filter(Boolean).join(" ");

  return LOCAL_EMPLOYMENT_SOURCE_PATTERN.test(sourceText)
    && LOCAL_EMPLOYMENT_RECRUIT_NOTICE_PATTERN.test(text);
}

function isLocalScholarshipSelectionNoticeFalsePositive(post, matchedRule, text) {
  if (!LOCAL_SCHOLARSHIP_FALSE_POSITIVE_RULES.has(matchedRule.name)) return false;
  if (SCHOLARSHIP_RESULT_OR_CEREMONY_PATTERN.test(text)) return false;

  const sourceText = [
    post.site,
    post.siteId,
    post.collectionSourceSlug,
    post.sourceUrl,
    post.url,
  ].filter(Boolean).join(" ");

  return LOCAL_SCHOLARSHIP_SOURCE_PATTERN.test(sourceText)
    && LOCAL_SCHOLARSHIP_SELECTION_NOTICE_PATTERN.test(text);
}

export function getPostExclusionReason(post = {}) {
  const title = String(post.title ?? "").replace(/\s+/g, " ").trim();
  const text = [
    post.title,
    post.content,
    post.summary_short,
    post.summary_long,
    ...(Array.isArray(post.attachments) ? post.attachments.map((attachment) => attachment?.name) : []),
    ...(Array.isArray(post.images) ? post.images : []),
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const matchedRule = TITLE_EXCLUDE_RULES.find((rule) => (
    rule.pattern.test(title) || (!rule.titleOnly && rule.pattern.test(text))
  ));
  if (!matchedRule) return null;
  if (isCentralTextNoticeFalsePositive(post, matchedRule, `${title} ${text}`)) {
    return null;
  }
  if (isJobAlioRecruitNoticeFalsePositive(post, matchedRule, `${title} ${text}`)) {
    return null;
  }
  if (isLocalEmploymentRecruitNoticeFalsePositive(post, matchedRule, `${title} ${text}`)) {
    return null;
  }
  if (isLocalScholarshipSelectionNoticeFalsePositive(post, matchedRule, `${title} ${text}`)) {
    return null;
  }
  if (matchedRule.name === "application-guide" && COLLECTABLE_ANNOUNCEMENT_PATTERN.test(`${title} ${text}`)) {
    return null;
  }
  if (WEAK_ADMIN_EXCLUSION_RULES.has(matchedRule.name) && STRONG_COLLECTABLE_NOTICE_PATTERN.test(`${title} ${text}`)) {
    return null;
  }

  return {
    rule: matchedRule.name,
    reason: matchedRule.reason,
  };
}

export function isExcludedPostCandidate(post = {}) {
  return Boolean(getPostExclusionReason(post));
}
