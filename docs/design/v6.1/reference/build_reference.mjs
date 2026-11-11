// PosterLink v6.1 정적 참조 화면 생성기
// 실행: node build_reference.mjs <출력 경로>
import fs from 'node:fs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const WJ = '&#8288;';
// 제목의 < > · 앞뒤에서 줄이 끊기지 않게 word joiner를 넣는다.
const wj = (s) => esc(s).replace(/&lt;/g, '&lt;' + WJ).replace(/&gt;/g, WJ + '&gt;').replace(/·/g, WJ + '·' + WJ);

const ICON = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  left: '<polyline points="15 18 9 12 15 6"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  expand: '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
};
const ic = (n, s = 20, st = '') => `<svg class="ic" viewBox="0 0 24 24" style="width:${s}px;height:${s}px;${st}" aria-hidden="true">${ICON[n]}</svg>`;
const ph = (label = '포스터') => `<div class="ph">${label}</div>`;
const thumb = (w, h, r = 6, extra = '') => `<div class="thumb" style="width:${w}px;height:${h}px;border-radius:${r}px;${extra}">${ph('')}</div>`;
const badge = (t, must = false) => `<span class="badge${must ? ' badge--must' : ''}">${t}</span>`;

/* ───────── 데이터 (시안과 같은 실제 공고) ───────── */
const P = {
  leather: { title: '또오리랑 가죽공방 모집', elig: '서울 생활권 만 19~39세 청년', org: '서울청년센터 양천' },
  jobtalk: { title: '현직자 멘토링 송파 잡톡 참여자 모집', elig: '39세 이하 청년 누구나', org: '송파구청' },
  sinhon: { title: '신혼부부 매입임대주택 입주자 모집', elig: '서울 거주 무주택 신혼부부', org: '강북구청' },
  sm: { title: 'SM엔터테인먼트 오픈이노베이션 밋업', elig: '초기창업패키지 선정·졸업기업', org: '씨엔티테크' },
  kitchen: { title: '공유주방 25기 및 제조주방 13기 모집', elig: '서울 소재 F&B 스타트업', org: '서울경제진흥원' },
  labor: { title: '일하는 청년을 위한 포인트 노동법', elig: '일하는 청년', org: '서울청년센터 은평' },
  maum: { title: '몸과 마음을 잇는 마음비움테라피2', elig: '고립·은둔을 겪는 서울시민', org: '서울시복지재단' },
  mento: { title: '시각장애학생 멘토링교실 자원봉사자 모집', elig: '대학생·성인', org: '성북시각장애인복지관' },
  single: { title: '싱글데이: 싱글말고 위글', elig: '서초구 거주·생활권 1인가구', org: '서초1인가구지원센터' },
  house: { title: '집 보는 수업 <보여줘! 강북홈즈>', elig: '만 19~39세 청년', org: '서울청년센터 강북' },
  gangsa: { title: '청소년 자원봉사교육 강사단 양성교육', elig: '마포구 거주·활동자', org: '마포구청' },
  tour: { title: '길에서 만나는 노동의 역사 탐방', elig: '서울에서 일하거나 거주하는 노동자', org: '서울노동권익센터' },
  coach: { title: '채용담당자의 취업 코칭', elig: '만 19~39세 청년', org: '용산청년지음' },
};

/* ───────── 공통 컴포넌트 ───────── */
// 공고 카드: 도장(조건부) · 찜 · 마감 표시(pill) · 짧은 제목 · 신청 자격 · 기관
const card = (o) => `<article class="card pcard">
  <div class="poster">${ph()}${o.stamp ? `<span class="stamp"${o.stamp === '오늘' ? ' style="font-size:12px"' : ''}>${o.stamp}</span>` : ''}<button class="fav" aria-label="${o.fav ? '찜 해제' : '찜'}">${ic('heart', 20, o.fav ? 'fill:currentColor' : '')}</button></div>
  <div class="pcard-body">
    <div class="pill${o.kind === 'muted' ? ' pill--muted' : o.kind === 'applied' ? ' pill--applied' : ''}">${o.kind === 'applied' ? ic('check', 12) : ''}${esc(o.pill)}</div>
    <h3 class="card-title">${wj(o.title)}</h3>
    <p class="card-elig">${wj(o.elig)}</p>
    <p class="card-org">${esc(o.org)}</p>
  </div>
</article>`;

const tabbar = (on) => `<nav class="tabbar">${[['home', '홈'], ['compass', '찾기'], ['heart', '찜'], ['user', '마이']].map(([i, t]) => `<div class="${t === on ? 'is-on' : ''}">${ic(i, 22)}${t}</div>`).join('')}</nav>`;
const divider = (t) => `<div class="divider">${t}</div>`;

// 찜 목록의 큰 행: 마감일이 확인된 공고. actions=true면 버튼 줄을 펼친다(D-3 이내).
const favRow = (o) => `<div class="card" style="padding:10px">
  <div style="display:flex;gap:11px">
    <div style="position:relative;flex:none">${thumb(56, 78)}${o.stamp ? `<span class="stamp stamp--row">${o.stamp}</span>` : ''}</div>
    <div style="min-width:0;flex:1">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div class="pill" style="margin-bottom:4px">${esc(o.pill)}</div>${ic('heart', 19, 'flex:none;margin-top:1px;' + (o.fav === false ? 'color:var(--faint)' : 'fill:currentColor'))}</div>
      <div class="c2" style="font-size:14px;font-weight:600;line-height:1.4">${wj(o.title)}</div>
      <div class="muted l1" style="font-size:12.5px;margin-top:2px">${esc(o.info)}</div>
    </div>
  </div>
  ${o.actions ? `<div style="display:flex;gap:8px;margin-top:10px"><span class="btn btn--outline" style="flex:1;height:36px;border-radius:9px;font-size:13px;gap:5px">${esc(o.cta)}${ic('ext', 14)}</span><span class="btn" style="flex:none;height:36px;border-radius:9px;padding:0 12px;font-size:13px;gap:4px;color:var(--muted)">${ic('check', 14)}신청했어요</span></div>` : ''}
</div>`;

// 찜 목록의 작은 행: 마감 알림이 없는 공고 / 신청한 공고 / 마감된 공고
const smallRow = (o) => `<div class="card" style="padding:9px 10px;display:flex;gap:10px${o.closed ? ';background:var(--closed-bg)' : ''}">
  ${thumb(44, 60, 5, o.closed ? 'opacity:.7' : '')}
  <div style="min-width:0;flex:1">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      ${o.pill ? `<span class="pill${o.muted ? ' pill--muted' : ''}" style="margin-bottom:0">${esc(o.pill)}</span>` : `<span style="font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:3px;color:${o.applied ? 'var(--ok)' : 'var(--muted)'}">${o.applied ? ic('check', 13) : ''}${esc(o.status)}</span>`}
      ${o.applied ? '<span class="undo">되돌리기</span>' : o.closed ? '' : ic('heart', 17, 'fill:currentColor;flex:none')}
    </div>
    <div class="l1" style="font-size:13.5px;font-weight:600;margin-top:${o.pill ? 3 : 1}px${o.closed ? ';color:var(--muted)' : ''}">${wj(o.title)}</div>
    ${o.meta ? `<div class="muted l1" style="font-size:12px;margin-top:1px">${esc(o.meta)}</div>` : ''}
    ${o.link ? `<div style="font-size:12.5px;font-weight:700;margin-top:3px;display:flex;align-items:center;gap:1px">${esc(o.link)}${ic('right', 14)}</div>` : ''}
  </div>
</div>`;

// 비슷한 공고 행: 마감 표시 → 조건(굵게) + 우대·우선 꼬리표 → 제목 → 일정·기관
const similarRow = (o) => `<div class="card" style="padding:10px">
  <div style="display:flex;gap:11px">
    ${thumb(56, 78)}
    <div style="min-width:0;flex:1">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div class="pill${o.muted ? ' pill--muted' : ''}" style="margin-bottom:4px">${esc(o.pill)}</div>${ic('heart', 19, 'flex:none;margin-top:1px;color:var(--faint)')}</div>
      <div style="font-size:13px;font-weight:700;line-height:1.5;display:flex;flex-wrap:wrap;align-items:baseline;gap:0 8px">${o.cond ? `<span>${esc(o.cond)}</span>` : ''}${o.pref ? `<span class="pref">${badge(o.prefTag || '우대')}${esc(o.pref)}</span>` : ''}</div>
      <div class="c2" style="font-size:14px;font-weight:600;line-height:1.4;margin-top:1px">${wj(o.title)}</div>
      <div class="muted l1" style="font-size:12.5px;margin-top:2px">${esc(o.meta)}</div>
    </div>
  </div>
</div>`;

const miniSimilar = (cond, title) => `<div class="card" style="display:flex;gap:9px;padding:8px">${thumb(44, 60, 5, 'border:0')}<div style="min-width:0"><div class="l1" style="font-size:11.5px;font-weight:700;line-height:1.4">${esc(cond)}</div><div class="c2" style="font-size:12.5px;font-weight:600;line-height:1.35;margin-top:1px">${wj(title)}</div></div></div>`;

/* ───────── 모바일: 홈 ───────── */
const homeTop = (o = {}) => `<div style="display:flex;align-items:center;gap:8px">
      <button class="serif" style="font-size:21px;display:flex;align-items:center;gap:4px">${ic('pin', 20)}서울 전체${ic('down', 17)}</button>
      <button class="chip" style="padding:4px 10px;font-size:12px">대상 전체${ic('down', 13)}</button>
      <span style="flex:1"></span>${ic('search', 22)}${ic('bell', 22)}
    </div>
    <div class="muted" style="margin-top:3px">지원·강좌·행사 · 접수 중 166건</div>
    ${o.strip ? `<a class="card" style="margin-top:10px;padding:7px 12px;display:flex;align-items:center;gap:10px"><span class="stamp stamp--inline">${o.strip.stamp}</span><span style="flex:1;font-size:14px;font-weight:600">${esc(o.strip.text)}</span>${ic('right', 18, 'color:var(--faint)')}</a>` : ''}
    <div class="chips" style="display:flex;gap:7px;margin-top:12px;overflow:hidden">${['전체', '지원·혜택', '교육·강좌', '문화·행사', '일자리', '공모전'].map((t, i) => `<button class="chip${i === 0 ? ' is-on' : ''}">${t}</button>`).join('')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 10px">
      <h2 class="serif" style="font-size:18px">새로 올라온 공고</h2>
      ${o.since ? `<button style="border:1px solid var(--ink);border-radius:14px;padding:4px 10px;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:2px">${esc(o.since)}${ic('right', 13)}</button>` : ''}
    </div>`;

const mHomeFirst = () => `<div class="phone">
  <div style="padding:16px 16px 0">
    ${homeTop()}
    <div class="grid2">
      ${card({ ...P.leather, stamp: 'D-2', pill: '11.11(수) 23:59까지' })}
      ${card({ ...P.jobtalk, pill: '각 클래스 전날까지 접수' })}
      ${card({ ...P.sinhon, stamp: 'D-3', pill: '11.12(목) 오후 6시까지' })}
      ${card({ ...P.sm, pill: '11.20(금) 오후 6시까지' })}
    </div>
  </div>
  ${tabbar('홈')}
</div>`;

const mHomeReturn = () => `<div class="phone">
  <div style="padding:16px 16px 0">
    ${homeTop({ strip: { stamp: 'D-3', text: '찜한 공고 1건 · 목요일 마감' }, since: '지난 방문 이후 14건' })}
    <div class="grid2">
      ${card({ ...P.leather, kind: 'applied', pill: '신청했어요', fav: true })}
      ${card({ ...P.jobtalk, pill: '각 클래스 전날까지 접수', fav: true })}
      ${card({ ...P.sinhon, stamp: 'D-3', pill: '11.12(목) 오후 6시까지', fav: true })}
      ${card({ ...P.sm, pill: '11.20(금) 오후 6시까지' })}
    </div>
  </div>
  ${tabbar('홈')}
</div>`;

const mHomeSticky = () => `<div class="phone">
  <header style="position:absolute;left:0;right:0;top:0;z-index:3;background:var(--paper);border-bottom:1px solid var(--line);padding:11px 16px 10px">
    <div style="display:flex;align-items:center;gap:8px">
      <button class="serif" style="font-size:17px;display:flex;align-items:center;gap:3px">${ic('pin', 17)}서울 전체${ic('down', 15)}</button>
      <button class="chip" style="padding:3px 9px;font-size:11.5px">대상 전체${ic('down', 12)}</button>
      <span style="flex:1"></span>${ic('search', 21)}${ic('bell', 21)}
    </div>
  </header>
  <div class="grid2" style="padding:0 16px;margin-top:-62px">
    ${card({ ...P.sinhon, stamp: 'D-3', pill: '11.12(목) 오후 6시까지', fav: true })}
    ${card({ ...P.sm, pill: '11.20(금) 오후 6시까지' })}
    ${card({ ...P.kitchen, pill: '11.26(목) 오후 1시까지', fav: true })}
    ${card({ ...P.jobtalk, pill: '각 클래스 전날까지 접수' })}
    ${card({ ...P.mento, pill: '11.22(일)까지' })}
    ${card({ ...P.labor, pill: '11.15(일)까지' })}
  </div>
  ${tabbar('홈')}
</div>`;

/* ───────── 모바일: 상세 ───────── */
const topbar = () => `<header class="topbar">${ic('left', 22)}<span style="font-size:15px;font-weight:600">공고 상세</span>${ic('share', 21)}</header>`;
const hero = (h) => `<div class="hero" style="height:${h}px">${ph('포스터 미리보기 · 화면 높이의 40% 이하')}<div class="hero-fade"></div><button class="hero-zoom">${ic('expand', 13)}크게 보기</button></div>`;
const tags = (a, b, c, cCls = '') => `<div style="display:flex;gap:6px"><span class="tag is-on">${a}</span><span class="tag">${b}</span><span class="tag${cCls ? ' ' + cCls : ''}">${c}</span></div>`;
const sourceLine = (t = '출처 청년몽땅정보통') => `<div class="muted" style="font-size:12px;margin-top:8px;display:flex;align-items:center;gap:3px">${t} · <a style="color:var(--ink);font-weight:600;display:inline-flex;align-items:center">공식 공고문 보기${ic('right', 13)}</a></div>`;
const BT = 'border-top:1px solid var(--line)';
const BL = 'border-left:1px solid var(--line)';
const actionbar = (o = {}) => `<div class="actionbar">
    <button class="btn" style="flex:none;width:46px" aria-label="찜">${ic('heart', 21, o.fav ? 'fill:currentColor' : '')}</button>
    ${o.hideApplied ? '' : `<button class="btn${o.applied ? ' btn--applied' : ''}" style="flex:none;padding:0 12px;font-size:14px;gap:4px${o.applied ? '' : ';color:var(--ink-soft)'}">${ic('check', 15)}신청했어요</button>`}
    <a class="btn ${o.applied ? 'btn--outline' : 'btn--primary'}" style="flex:1;font-size:15px;gap:6px">${esc(o.cta || '신청 페이지로 이동')}${ic('ext', 16)}</a>
  </div>`;

// 가죽공방: 날짜·시각이 모두 확인된 공고. state = 'open' | 'prompt' | 'applied'
const mDetailLeather = (state) => `<div class="phone">
  ${topbar()}
  ${hero(280)}
  <div style="padding:13px 16px 0">
    ${tags('문화·행사', '양천구', '접수 중')}
    <h1 class="serif c3" style="font-size:19px;line-height:1.38;margin-top:9px">${wj('서울청년센터 양천<또오리랑 가죽공방> 모집')}</h1>
    ${state === 'applied' ? `<div class="okbar" style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;display:inline-flex;align-items:center;gap:4px">${ic('check', 15)}신청한 공고예요</span><button class="undo">되돌리기</button></div><div style="margin-top:1px;font-size:12.5px">마감 알림을 껐어요 · 선정 안내 11.12(목) 오후 3시 예정</div></div>` : ''}
    <section class="card" style="margin-top:11px">
      <div class="cell"><div class="cell-k"><span>대상</span><span>회당 10명</span></div><div class="cell-v l1">서울 생활권 만 19~39세 청년 누구나</div><div class="pref" style="font-size:13px;margin-top:2px">${badge('우대')}신규 참여자</div></div>
      <div style="display:grid;grid-template-columns:1.32fr 1fr;${BT}">
        <div class="cell"><div class="cell-k"><span>신청 마감</span>${state === 'applied' ? '' : '<span>D-2</span>'}</div><div class="cell-v">11.11(수) 밤 11시 59분까지</div><div class="cap">조기 마감될 수 있어요</div></div>
        <div class="cell" style="${BL}"><div class="cell-k">비용</div><div class="cell-v unknown">공고문에서 확인</div></div>
      </div>
      <div class="cell" style="${BT}"><div class="cell-k">진행</div><div class="cell-v l1">11.19(목)·20(금)·26(목)·27(금) 중 1회</div><div class="cap">저녁 7~9시 · 서울청년센터 양천 2층</div></div>
    </section>
    ${sourceLine()}
    <h2 class="serif" style="font-size:16px;margin:13px 0 8px">비슷한 접수 중 공고</h2>
  </div>
  ${state === 'prompt' ? `<div class="sheet" role="dialog" aria-label="신청 여부 확인"><div style="font-size:15.5px;font-weight:700">신청을 마치셨나요?</div><div class="muted" style="font-size:13px;margin-top:3px">신청했다고 표시하면 이 공고의 마감 알림이 꺼져요.</div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn--primary" style="flex:1;height:42px;font-size:14.5px;gap:5px">${ic('check', 15)}신청했어요</button><button class="btn" style="flex:1;height:42px;font-size:14.5px;color:var(--ink-soft)">아직이에요</button></div></div>` : ''}
  ${actionbar({ fav: true, applied: state === 'applied', hideApplied: state === 'prompt' })}
</div>`;

// 포인트 노동법: 날짜만 확인된 공고
const mDetailDateOnly = () => `<div class="phone">
  ${topbar()}
  ${hero(300)}
  <div style="padding:13px 16px 0">
    ${tags('교육·강좌', '은평구', '접수 중')}
    <h1 class="serif c3" style="font-size:19px;line-height:1.38;margin-top:9px">${wj('서울청년센터은평 X 서울노동권익센터 <일하는 청년을 위한 포인트 노동법> 수강생 모집')}</h1>
    <section class="card" style="margin-top:11px">
      <div class="cell"><div class="cell-k"><span>대상</span><span>모집 30명</span></div><div class="cell-v l1">근로계약을 맺고 일하는 청년</div><div class="pref" style="font-size:13px;margin-top:2px">${badge('필수', true)}1·2회차 모두 참여</div></div>
      <div style="display:grid;grid-template-columns:1.32fr 1fr;${BT}">
        <div class="cell"><div class="cell-k"><span>신청 마감</span><span>D-6</span></div><div class="cell-v">11.15(일)까지</div><div class="cap">마감 시각은 공고문에서 확인</div></div>
        <div class="cell" style="${BL}"><div class="cell-k">비용</div><div class="cell-v unknown">공고문에서 확인</div></div>
      </div>
      <div class="cell" style="${BT}"><div class="cell-k">진행</div><div class="cell-v l1">11.18(수)·11.20(금) 저녁 7~9시</div><div class="cap">서울청년센터 은평 · 추첨 선발</div></div>
    </section>
    ${sourceLine()}
    <h2 class="serif" style="font-size:16px;margin:13px 0 8px">비슷한 접수 중 공고</h2>
  </div>
  ${actionbar({})}
</div>`;

// 송파 잡톡: 회차마다 접수가 끝나는 공고
const mDetailSessions = () => `<div class="phone">
  ${topbar()}
  ${hero(296)}
  <div style="padding:13px 16px 0">
    ${tags('문화·행사', '송파구', '접수 중')}
    <h1 class="serif c3" style="font-size:19px;line-height:1.38;margin-top:9px">${wj('송파구청 <2026 송파 현직자 멘토링 송파 잡톡(Job Talk)」 참여자 모집>')}</h1>
    <section class="card" style="margin-top:11px">
      <div class="cell"><div class="cell-k"><span>대상</span><span>모집 직무별 10명 내외</span></div><div class="cell-v">39세 이하 청년 누구나<span class="pref" style="font-size:13px;margin-left:8px">${badge('우대')}송파구민</span></div></div>
      <div style="display:grid;grid-template-columns:1.7fr 1fr;${BT}">
        <div class="cell"><div class="cell-k"><span>신청 마감</span><span>마지막 접수 12.13(일)</span></div><div class="cell-v">각 클래스 전날까지</div><div class="cap l1">11.11(수) 클래스는 11.10(화)까지</div></div>
        <div class="cell" style="${BL}"><div class="cell-k">비용</div><div class="cell-v unknown">공고문에서 확인</div></div>
      </div>
      <div class="cell" style="${BT}"><div class="cell-k">진행</div><div class="cell-v l1">매주 월·수 저녁 7~9시 · 송파청년센터</div><div class="cap l1">11.9(월)~12.14(월) · 직무·회차를 골라 신청</div></div>
    </section>
    ${sourceLine()}
    <h2 class="serif" style="font-size:16px;margin:13px 0 8px">비슷한 접수 중 공고</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${miniSimilar('서울 생활권 청년', '전문가 1:1 취업상담')}${miniSimilar('도봉구 취업준비청년', 'NCS 대비 특강')}</div>
  </div>
  ${actionbar({ fav: true })}
</div>`;

// 강사단 교육: 접수 마감이 확인되기 전(출처 충돌). 찜한 직후의 안내 포함.
const mDetailUnverified = () => `<div class="phone">
  ${topbar()}
  ${hero(338)}
  <div style="padding:13px 16px 0">
    ${tags('교육·강좌', '마포구', '접수 중')}
    <h1 class="serif c3" style="font-size:19px;line-height:1.38;margin-top:9px">${wj('마포구 청소년 자원봉사교육 강사단 양성교육 모집')}</h1>
    <div class="muted" style="font-size:12.5px;margin-top:3px">마포구청</div>
    <section class="card" style="margin-top:11px">
      <div class="cell"><div class="cell-k">신청 마감</div><div class="cell-v unknown">공고문에서 확인</div><div class="cap">마감일이 서로 다르게 올라와 있어 확인하고 있어요. 확인 전에는 <span style="white-space:nowrap">D-day와</span> 마감 알림을 표시하지 않아요.</div></div>
      <a class="cell" style="${BT};display:flex;align-items:center;justify-content:space-between"><span style="font-size:13.5px;font-weight:600">대상·비용·일정은 포스터와 공고문에서 확인</span>${ic('right', 16, 'color:var(--faint)')}</a>
    </section>
  </div>
  <div class="snackbar" role="status"><b style="font-weight:700">찜했어요.</b> 마감일 확인 전이라 마감 알림은 없어요.</div>
  ${actionbar({ fav: true, cta: '공식 공고 확인하기' })}
</div>`;

// 마감된 공고: 대안을 먼저 보여준다
const mDetailClosed = () => `<div class="phone">
  ${topbar()}
  <div style="padding:14px 16px 0">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:6px"><span class="tag">교육·강좌</span><span class="tag">종로구</span><span class="tag is-closed">접수 종료</span></div>
        <h1 class="serif c3" style="font-size:17px;line-height:1.4;margin-top:8px;color:var(--ink-soft)">${wj('종로구 1인가구지원센터 <안심 전·월세 클래스> 참여자 모집')}</h1>
      </div>
      ${thumb(74, 104, 8, 'opacity:.75')}
    </div>
    <div style="margin-top:12px;background:var(--ink);color:#fff;border-radius:10px;padding:11px 13px;font-size:14px;font-weight:600">이 공고는 8월 17일에 접수가 끝났어요</div>
    <h2 class="serif" style="font-size:18px;margin:18px 0 2px">지금 접수 중인 비슷한 공고</h2>
    <div class="muted" style="font-size:12.5px">집 구하기·임대차 계약 주제 · 1인가구 대상 공고는 지금 없어요</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin:13px 0 8px"><span style="font-size:13.5px;font-weight:700">같은 주제 · 대상이 다른 공고</span><span class="muted" style="font-size:12px;display:inline-flex;align-items:center;gap:3px">${ic('pin', 12)}서울 다른 구까지 넓혀 찾음</span></div>
    <div style="display:grid;gap:8px">
      ${similarRow({ pill: '회차별 접수 조건은 신청 페이지에서 확인', muted: true, cond: '만 19~39세 청년', pref: '강북구 거주·생활권', title: '집 보는 수업 <보여줘! 강북홈즈> 모집', meta: '11.17(화)~19(목) · 서울청년센터 강북' })}
      ${similarRow({ pill: '매월 선착순 예약', prefTag: '우선', pref: '강북구 연립·다세대 거주자', title: '빌라관리사무소 무료법률상담실', meta: '매월 셋째 목요일 오전 상담 · 강북구청' })}
    </div>
    <a class="card" style="margin-top:8px;padding:12px;display:flex;align-items:center;justify-content:space-between;font-size:13.5px;font-weight:600">접수 중인 주거 공고 모두 보기${ic('right', 16, 'color:var(--faint)')}</a>
    <button class="btn btn--outline" style="margin-top:12px;width:100%;height:44px;font-size:14px;gap:6px;background:transparent">${ic('bell', 17)}비슷한 공고 받기</button>
    <button class="muted" style="margin-top:12px;width:100%;font-size:13px;display:flex;align-items:center;justify-content:center;gap:3px">마감된 공고 내용 보기${ic('down', 15)}</button>
  </div>
  ${tabbar('')}
</div>`;

/* ───────── 모바일: 찜 ───────── */
const mFav = (o = {}) => `<div class="phone">
  <div style="padding:16px 16px 0">
    <div style="display:flex;align-items:center;justify-content:space-between"><h1 class="serif" style="font-size:21px">찜</h1><span class="muted" style="font-size:12.5px">마감이 가까운 순</span></div>
    <div class="muted" style="margin-top:3px">접수 중 5건 · 이번 주 마감 1건</div>
    <div style="display:grid;gap:8px;margin-top:12px">
      ${favRow({ stamp: 'D-3', pill: '11.12(목) 오후 6시까지', title: P.sinhon.title, info: '서울 거주 무주택 신혼부부 · 강북구청', actions: true, cta: '공식 공고 확인하기' })}
      ${favRow({ pill: '11.26(목) 오후 1시까지 · D-17', title: P.kitchen.title, info: '서울 소재 F&B 스타트업 · 서울경제진흥원' })}
    </div>
    ${divider('마감 알림이 없는 공고 3건')}
    <div style="display:grid;gap:8px">
      ${smallRow({ pill: '각 클래스 전날까지 접수', title: P.jobtalk.title, meta: '39세 이하 청년 누구나 · 송파구청' })}
      ${smallRow({ pill: '회차별 접수 조건은 신청 페이지에서 확인', muted: true, title: '집 보는 수업 <보여줘! 강북홈즈> 모집', meta: '만 19~39세 청년 · 서울청년센터 강북' })}
      ${smallRow({ pill: '정원 마감 때까지', title: '종로 청년생활 아카데미 참여자 모집', meta: '만 39세 이하 청년 · 종로구' })}
    </div>
    ${divider('신청한 공고 2건')}
    <div style="display:grid;gap:8px">
      ${smallRow({ applied: true, status: '신청했어요', title: P.leather.title, meta: '11.12(목) 오후 3시 선정 안내 예정' })}
      ${smallRow({ applied: true, status: '신청했어요', title: '복지법률 토론회 <육아휴직제도 현실과 과제>', meta: '11.13(금) 진행 · 서초구 변호사회관' })}
    </div>
    ${divider('마감된 공고 1건')}
    ${smallRow({ closed: true, status: '8.17 마감', title: '안심 전·월세 클래스 참여자 모집', link: '비슷한 접수 중 공고 2건 보기' })}
  </div>
  ${o.snackbar ? `<div class="snackbar" role="status" style="display:flex;align-items:center;justify-content:space-between;bottom:78px"><span>‘신청한 공고’로 옮겼어요</span><button style="font-weight:700;text-decoration:underline;text-underline-offset:3px">되돌리기</button></div>` : ''}
  ${tabbar('찜')}
</div>`;

const mFavEmpty = () => `<div class="phone">
  <div style="padding:16px 16px 0">
    <h1 class="serif" style="font-size:21px">찜</h1>
    <div class="card" style="margin-top:12px;padding:22px 18px 20px;text-align:center">
      <div style="display:flex;justify-content:center">${ic('heart', 30)}</div>
      <div class="serif" style="font-size:17px;margin-top:8px">아직 찜한 공고가 없어요</div>
      <div class="muted" style="font-size:13px;margin-top:5px;line-height:1.55">공고의 ♡를 누르면 여기에 모이고,<br>마감이 가까운 순서로 정리돼요.</div>
      <a class="btn btn--primary" style="margin:14px auto 0;height:42px;font-size:14px;width:170px">공고 둘러보기</a>
    </div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin:20px 0 9px"><h2 class="serif" style="font-size:17px">이번 주에 마감되는 공고</h2><span class="muted" style="font-size:12.5px">서울 전체</span></div>
    <div style="display:grid;gap:8px">
      ${favRow({ stamp: 'D-1', pill: '11.10(화) 오전 9시까지', title: P.coach.title, info: '만 19~39세 청년 · 용산청년지음', fav: false })}
      ${favRow({ stamp: 'D-2', pill: '11.11(수) 밤 11시 59분까지', title: P.leather.title, info: '서울 생활권 만 19~39세 청년 · 서울청년센터 양천', fav: false })}
      ${favRow({ stamp: 'D-3', pill: '11.12(목) 오후 6시까지', title: P.sinhon.title, info: '서울 거주 무주택 신혼부부 · 강북구청', fav: false })}
      ${favRow({ pill: '11.15(일)까지 · D-6', title: P.labor.title, info: '일하는 청년 · 서울청년센터 은평', fav: false })}
    </div>
  </div>
  ${tabbar('찜')}
</div>`;

/* ───────── PC ───────── */
const pcHeader = (on) => `<header class="pc-header"><div class="wrap">
    <a class="serif pc-logo">PosterLink</a>
    <div class="pc-search">${ic('search', 17)}공고·기관 이름으로 찾기</div>
    <span style="flex:1"></span>
    ${['홈', '찾기', '찜', '마이'].map((t) => `<a class="pc-nav${t === on ? ' is-on' : ''}">${t}</a>`).join('')}
    ${ic('bell', 21)}
  </div></header>`;

const pcHome = () => `<div class="pc">
  ${pcHeader('홈')}
  <div class="wrap" style="padding-top:28px">
    <div style="display:flex;align-items:center;gap:12px">
      <button class="serif" style="font-size:28px;display:flex;align-items:center;gap:6px">${ic('pin', 25)}서울 전체${ic('down', 20)}</button>
      <button class="chip" style="padding:6px 13px;font-size:13.5px">대상 전체${ic('down', 15)}</button>
      <span style="flex:1"></span>
      <a class="card" style="padding:8px 14px;display:flex;align-items:center;gap:10px;width:320px"><span class="stamp stamp--inline" style="width:36px;height:36px;font-size:11.5px">D-3</span><span style="flex:1;font-size:14.5px;font-weight:600">찜한 공고 1건 · 목요일 마감</span>${ic('right', 18, 'color:var(--faint)')}</a>
    </div>
    <div class="muted" style="margin-top:2px;font-size:14px">지원·강좌·행사 · 접수 중 166건</div>
    <div style="display:flex;gap:8px;margin-top:18px">${['전체', '지원·혜택', '교육·강좌', '문화·행사', '일자리', '공모전'].map((t, i) => `<button class="chip${i === 0 ? ' is-on' : ''}">${t}</button>`).join('')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:26px 0 14px">
      <h2 class="serif" style="font-size:22px">새로 올라온 공고</h2>
      <button style="border:1px solid var(--ink);border-radius:16px;padding:5px 13px;font-size:13.5px;font-weight:600;display:inline-flex;align-items:center;gap:3px">지난 방문 이후 14건${ic('right', 14)}</button>
    </div>
    <div class="grid4">
      ${card({ ...P.leather, kind: 'applied', pill: '신청했어요', fav: true })}
      ${card({ ...P.jobtalk, pill: '각 클래스 전날까지 접수', fav: true })}
      ${card({ ...P.sinhon, stamp: 'D-3', pill: '11.12(목) 오후 6시까지', fav: true })}
      ${card({ ...P.sm, pill: '11.20(금) 오후 6시까지' })}
      ${card({ ...P.kitchen, pill: '11.26(목) 오후 1시까지', fav: true })}
      ${card({ ...P.labor, pill: '11.15(일)까지' })}
      ${card({ ...P.maum, pill: '11.13(금)까지' })}
      ${card({ ...P.mento, pill: '11.22(일)까지' })}
    </div>
  </div>
</div>`;

const pcSimilar = (o) => `<div class="card" style="padding:10px;display:flex;gap:11px">${thumb(50, 70)}<div style="min-width:0;flex:1"><div class="pill" style="margin-bottom:4px">${esc(o.pill)}</div><div class="l1" style="font-size:13.5px;font-weight:700">${esc(o.cond)}${o.pref ? `<span class="pref" style="margin-left:8px">${badge('우대')}${esc(o.pref)}</span>` : ''}</div><div class="l1" style="font-size:14.5px;font-weight:600;margin-top:1px">${wj(o.title)}</div><div class="muted l1" style="font-size:12.5px;margin-top:1px">${esc(o.meta)}</div></div></div>`;

const pcDetail = () => `<div class="pc">
  ${pcHeader('')}
  <div class="wrap" style="padding-top:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;height:40px;color:var(--muted);font-size:14px"><a style="display:inline-flex;align-items:center;gap:4px">${ic('left', 17)}목록으로</a><button style="display:inline-flex;align-items:center;gap:6px">${ic('share', 17)}공유</button></div>
    <div style="display:grid;grid-template-columns:480px 1fr;gap:48px;margin-top:6px;align-items:start">
      <div style="position:relative;height:744px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--poster-bg)">
        ${ph('포스터 · 긴 포스터는 위쪽부터')}
        <div style="position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(rgba(241,238,228,0),rgba(241,238,228,.98) 58%)"></div>
        <span class="muted" style="position:absolute;left:16px;bottom:19px;font-size:13px">긴 포스터라 위쪽만 보여요</span>
        <button style="position:absolute;right:14px;bottom:13px;background:#fff;border:1px solid var(--line-strong);border-radius:17px;padding:6px 14px;font-size:13.5px;font-weight:600;display:inline-flex;align-items:center;gap:6px">${ic('expand', 15)}포스터 전체 보기</button>
      </div>
      <div style="padding-top:2px">
        <div style="display:flex;gap:7px"><span class="tag is-on" style="font-size:13px;padding:4px 11px">교육·강좌</span><span class="tag" style="font-size:13px;padding:4px 11px">용산구</span><span class="tag" style="font-size:13px;padding:4px 11px">접수 중</span></div>
        <h1 class="serif" style="font-size:27px;line-height:1.38;margin-top:12px;letter-spacing:-.3px">${wj('용산청년지음 <[N잡 컴퍼니] 나의 경험을 강의로, 강사 생존 키트> 참여자 모집')}</h1>
        <div class="muted" style="font-size:14px;margin-top:6px">용산일자리카페(용산청년지음)</div>
        <section class="card" style="margin-top:16px">
          <div class="pcell"><div class="pcell-k"><span>대상</span><span>모집 6명</span></div><div class="pcell-v">강사 활동을 꿈꾸는 만 19~39세 청년</div><div style="font-size:14.5px;font-weight:500;line-height:1.45;margin-top:1px;color:var(--ink-soft)">${badge('우대')}용산구민·용산일자리카페 참여자<span style="display:inline-block;width:16px"></span>${badge('필수', true)}전 회차 참석</div></div>
          <div style="display:grid;grid-template-columns:1.25fr 1fr 1.15fr;${BT}">
            <div class="pcell"><div class="pcell-k"><span>신청 마감</span><span>D-10</span></div><div class="pcell-v">11.19(목) 오전 9시까지</div></div>
            <div class="pcell" style="${BL}"><div class="pcell-k">비용</div><div class="pcell-v ok">전액 무료</div></div>
            <div class="pcell" style="${BL}"><div class="pcell-k">진행</div><div class="pcell-v">11.25(수)~11.30(월)</div></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1.6fr;${BT}">
            <div class="pcell"><div class="pcell-k">장소</div><div class="pcell-v">용산청년지음 미팅룸3</div></div>
            <div class="pcell" style="${BL}"><div class="pcell-k">신청 방법</div><div class="pcell-v">미니인턴 &gt; M클래스 &gt; 강사 생존에서 신청</div><div class="cap">11/19 개별 문자 안내</div></div>
          </div>
        </section>
        <div style="display:flex;gap:10px;margin-top:16px">
          <a class="btn btn--primary" style="flex:1;height:52px;font-size:16.5px;gap:7px">신청 페이지로 이동${ic('ext', 17)}</a>
          <button class="btn" style="height:52px;padding:0 17px;font-size:15px;gap:6px;color:var(--ink-soft)">${ic('check', 16)}신청했어요</button>
          <button class="btn" style="height:52px;padding:0 17px;font-size:15px;gap:6px">${ic('heart', 18)}찜</button>
        </div>
        <div class="muted" style="font-size:12.5px;margin-top:9px">신청을 마친 뒤 ‘신청했어요’로 표시하면 마감 알림에서 빠지고 찜의 ‘신청한 공고’에 모여요. 언제든 되돌릴 수 있어요.</div>
        <div class="muted" style="font-size:12.5px;margin-top:4px;display:flex;align-items:center;gap:3px">출처 청년몽땅정보통 · 11.9 확인 · <a style="color:var(--ink);font-weight:600;display:inline-flex;align-items:center">공식 공고문 보기${ic('right', 13)}</a></div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin:24px 0 9px"><h2 class="serif" style="font-size:18px">비슷한 접수 중 공고</h2><span class="muted" style="font-size:12.5px;display:inline-flex;align-items:center;gap:3px">${ic('pin', 13)} 같은 주제(강사 활동) · 대상이 다른 공고 · 서울 다른 구까지 넓혀 찾음</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${pcSimilar({ pill: '11.20(금) 오후 6시까지 · D-11', cond: '마포구 거주·활동자 대상', pref: '강의 경력', title: '청소년 자원봉사교육 강사단 양성교육', meta: '교육 12.3(목)~12.17(목) · 마포구청' })}
          ${pcSimilar({ pill: '12.31(목)까지 · D-52', cond: '문화예술 분야 전문강사', title: '문화예술 전문강사 인력풀 모집', meta: '강남구 복지기관 연계 · 강남복지재단' })}
        </div>
        <a style="margin-top:10px;font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:2px">접수 중인 교육·강좌 모두 보기${ic('right', 15)}</a>
      </div>
    </div>
  </div>
</div>`;

const pcFavRow = (o) => `<div class="card" style="padding:14px 16px;display:flex;gap:16px;align-items:center">
  <div style="position:relative;flex:none">${thumb(66, 92, 7)}${o.stamp ? `<span class="stamp stamp--row" style="left:-7px;top:-7px;width:38px;height:38px;font-size:12px">${o.stamp}</span>` : ''}</div>
  <div style="min-width:0;flex:1"><div class="pill">${esc(o.pill)}</div><div class="l1" style="font-size:16.5px;font-weight:600">${wj(o.title)}</div><div class="muted l1" style="font-size:13.5px;margin-top:3px">${esc(o.info)}</div></div>
  <div style="flex:none;display:flex;gap:8px;align-items:center"><a class="btn btn--outline" style="height:40px;padding:0 14px;font-size:14px;gap:5px">${esc(o.cta)}${ic('ext', 14)}</a><button class="btn" style="height:40px;padding:0 12px;font-size:14px;gap:4px;color:var(--ink-soft)">${ic('check', 14)}신청했어요</button>${ic('heart', 21, 'fill:currentColor;margin-left:4px')}</div>
</div>`;
const pcFavRowS = (o) => `<div class="card" style="padding:11px 16px;display:flex;gap:14px;align-items:center">
  ${thumb(46, 64)}
  <div style="min-width:0;flex:1"><div class="pill${o.muted ? ' pill--muted' : ''}" style="margin-bottom:4px">${esc(o.pill)}</div><div class="l1" style="font-size:15.5px;font-weight:600">${wj(o.title)}</div><div class="muted l1" style="font-size:13px;margin-top:2px">${esc(o.info)}</div></div>
  <div style="flex:none;display:flex;gap:8px;align-items:center"><button class="btn" style="height:36px;padding:0 12px;font-size:13.5px;gap:4px;color:var(--ink-soft)">${ic('check', 14)}신청했어요</button>${ic('heart', 20, 'fill:currentColor;margin-left:4px')}</div>
</div>`;
const pcRail = (o) => `<div class="card" style="padding:12px;display:flex;gap:11px${o.closed ? ';background:var(--closed-bg)' : ''}">
  ${thumb(50, 70, 6, o.closed ? 'opacity:.7' : '')}
  <div style="min-width:0;flex:1">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:3px;color:${o.applied ? 'var(--ok)' : 'var(--muted)'}">${o.applied ? ic('check', 14) : ''}${esc(o.status)}</span>${o.applied ? '<button class="undo" style="font-size:12.5px">되돌리기</button>' : ''}</div>
    <div class="c2" style="font-size:14.5px;font-weight:600;line-height:1.4;margin-top:2px${o.closed ? ';color:var(--muted)' : ''}">${wj(o.title)}</div>
    ${o.meta ? `<div class="muted l1" style="font-size:12.5px;margin-top:2px">${esc(o.meta)}</div>` : ''}
    ${o.link ? `<a style="font-size:13px;font-weight:700;margin-top:4px;display:flex;align-items:center;gap:1px">${esc(o.link)}${ic('right', 14)}</a>` : ''}
  </div>
</div>`;
const groupHead = (t, r) => `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px"><h2 style="font-size:14px;font-weight:700">${t}</h2>${r ? `<span class="muted" style="font-size:13px">${r}</span>` : ''}</div>`;

const pcFav = () => `<div class="pc">
  ${pcHeader('찜')}
  <div class="wrap" style="padding-top:28px">
    <div style="display:flex;align-items:baseline;gap:14px"><h1 class="serif" style="font-size:28px">찜</h1><span class="muted" style="font-size:14px">접수 중 5건 · 이번 주 마감 1건</span></div>
    <div style="display:grid;grid-template-columns:1fr 360px;gap:40px;margin-top:20px;align-items:start">
      <div>
        ${groupHead('마감일이 확인된 공고 2건', '마감이 가까운 순')}
        <div style="display:grid;gap:10px">
          ${pcFavRow({ stamp: 'D-3', pill: '11.12(목) 오후 6시까지', title: P.sinhon.title, info: '서울 거주 무주택 신혼부부 · 강북구청', cta: '공식 공고 확인하기' })}
          ${pcFavRow({ pill: '11.26(목) 오후 1시까지 · D-17', title: P.kitchen.title, info: '서울 소재 F&B 스타트업 · 서울경제진흥원', cta: '신청 페이지로 이동' })}
        </div>
        <div style="height:24px"></div>
        ${groupHead('마감 알림이 없는 공고 3건', '회차별 접수·정원 마감')}
        <div style="display:grid;gap:8px">
          ${pcFavRowS({ pill: '각 클래스 전날까지 접수', title: P.jobtalk.title, info: '39세 이하 청년 누구나 · 송파구청' })}
          ${pcFavRowS({ pill: '회차별 접수 조건은 신청 페이지에서 확인', muted: true, title: '집 보는 수업 <보여줘! 강북홈즈> 모집', info: '만 19~39세 청년 · 서울청년센터 강북' })}
          ${pcFavRowS({ pill: '정원 마감 때까지', title: '종로 청년생활 아카데미 참여자 모집', info: '만 39세 이하 청년 · 종로구' })}
        </div>
      </div>
      <aside>
        ${groupHead('신청한 공고 2건')}
        <div style="display:grid;gap:8px">
          ${pcRail({ applied: true, status: '신청했어요', title: P.leather.title, meta: '11.12(목) 오후 3시 선정 안내 예정' })}
          ${pcRail({ applied: true, status: '신청했어요', title: '복지법률 토론회 <육아휴직제도 현실과 과제>', meta: '11.13(금) 진행 · 서초구 변호사회관' })}
        </div>
        <div class="muted" style="font-size:12.5px;margin-top:7px">신청한 공고는 홈의 마감 알림에서 빠져요.</div>
        <div style="height:26px"></div>
        ${groupHead('마감된 공고 1건')}
        ${pcRail({ closed: true, status: '8.17 마감', title: '안심 전·월세 클래스 참여자 모집', link: '비슷한 접수 중 공고 2건 보기' })}
      </aside>
    </div>
  </div>
</div>`;

/* ───────── 카드 상태 모음 (마감 표시 기준) ───────── */
const stateCol = (c, cap) => `<div class="state"><div style="width:173px">${card(c)}</div><div class="state-cap"><b>${cap[0]}</b><span>${cap[1]}</span><span class="do">${cap[2]}</span></div></div>`;
const stateGroup = (title, inner) => `<div class="state-group"><div class="state-title">${title}</div><div class="state-row">${inner}</div></div>`;
const cardStates = () => `<div class="states phone-like">
  ${stateGroup('날짜와 시각 확인 → 확인된 시각까지 표시', stateCol({ ...P.leather, stamp: 'D-2', pill: '11.11(수) 23:59까지' }, ['원문에 23:59가 있는 공고', '포스터: ~11.11.(수) 23:59', '2열 카드에서는 24시간 표기']) + stateCol({ ...P.sinhon, stamp: 'D-3', pill: '11.12(목) 오후 6시까지' }, ['시각이 정각인 공고', '포스터: 접수 ~11.12.(목) 18시', '확인된 시각 기준으로 적용']))}
  ${stateGroup('날짜만 확인 → 날짜 기준 도장, 하루 전 안내까지', stateCol({ ...P.labor, pill: '11.15(일)까지' }, ['날짜만 수집한 공고', '공고문: ~11.15(일), 시각 없음', '11.12부터 D-3 도장']) + stateCol({ ...P.single, stamp: '오늘', pill: '오늘이 마감일 · 시각 확인' }, ['마감 당일', '공고문: 모집 ~11.09.(월)', '남은 시간·자정은 쓰지 않음']))}
  ${stateGroup('회차별 접수 → 공고 전체 마감으로 쓰지 않음', stateCol({ ...P.jobtalk, pill: '각 클래스 전날까지 접수' }, ['조건이 확인된 공고', '포스터: 신청 ~각 클래스 D-1', '‘12.13까지’로 쓰지 않음']) + stateCol({ ...P.house, kind: 'muted', pill: '회차별 접수 조건 확인' }, ['조건 확인 전', '신청 페이지: 접수 ~11.19 0시', '회차별 마감은 확인 뒤 표시']))}
  ${stateGroup('마감일 미확인·출처 충돌 → 도장·D-day·알림 보류', stateCol({ ...P.tour, kind: 'muted', pill: '접수 여부 확인' }, ['접수 여부도 확인 전', '공고문: 신청 ‘상시’, 탐방 ~10.23', '‘접수 중’ 대신 이 표시']) + stateCol({ ...P.gangsa, kind: 'muted', pill: '마감일은 공고문에서 확인' }, ['출처 충돌 · 확인 전', '서비스 값 12.3 = 교육 시작일', '‘접수 중’ 배지는 유지']) + stateCol({ ...P.gangsa, pill: '11.20(금) 오후 6시까지' }, ['같은 공고 · 확인 후', '포스터: 모집 ~11.20.(금) 18:00', '접수 마감·교육 시작일 따로']))}
  ${stateGroup('이용자 상태', stateCol({ ...P.leather, kind: 'applied', pill: '신청했어요', fav: true }, ['신청 표시한 공고', '도장·D-day 숨김', '홈 마감 안내에서 제외']) + stateCol({ ...P.sinhon, stamp: 'D-3', pill: '11.12(목) 오후 6시까지', fav: true }, ['찜한 공고', '하트 채움', '도장은 D-3부터 당일까지']))}
</div>`;

/* ───────── 문서 ───────── */
const shot = (id, cap, inner) => `<figure class="shot" id="${id}"><figcaption>${cap}</figcaption>${inner}</figure>`;

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PosterLink v6.1 참조 화면</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@700&display=swap">
<link rel="stylesheet" href="reference.css">
</head>
<body>
<main class="doc">
<h1>PosterLink v6.1 참조 화면</h1>
<p class="lead">시안의 화면과 컴포넌트를 정적 HTML/CSS로 옮긴 참조입니다. 치수·색·글자 크기·문구는 이 파일의 값을 기준으로 삼습니다. 포스터 자리는 자리표시자이고, 실제 포스터가 들어간 모습은 <code>screens/</code>의 이미지를 보세요. 날짜와 D-day는 2026.11.9(월) 기준 예시입니다. 규칙과 상태 정의는 <code>SPEC.md</code>가 우선합니다.</p>

<h2 id="cards">1. 공고 카드 상태 (마감 표시 기준)</h2>
<p class="note">모바일 2열 카드(폭 173px) 기준입니다. 표시 문구는 SPEC.md 4장의 규칙에서 나옵니다.</p>
${cardStates()}

<h2>2. 모바일 홈 (390×844)</h2>
<div class="row">
${shot('m-home-first', '홈 · 첫 방문 (찜 마감 줄·지난 방문 버튼 없음)', mHomeFirst())}
${shot('m-home-return', '홈 · 다시 방문 (찜 마감 줄, 지난 방문 이후 N건)', mHomeReturn())}
${shot('m-home-sticky', '홈 · 스크롤 중 머리글', mHomeSticky())}
</div>

<h2>3. 모바일 상세</h2>
<div class="row">
${shot('m-detail-open', '상세 · 날짜와 시각이 확인된 공고', mDetailLeather('open'))}
${shot('m-detail-prompt', '상세 · 신청 페이지에서 돌아왔을 때 한 번 묻기', mDetailLeather('prompt'))}
${shot('m-detail-applied', '상세 · ‘신청했어요’로 표시한 뒤', mDetailLeather('applied'))}
</div>
<div class="row" style="margin-top:22px">
${shot('m-detail-dateonly', '상세 · 날짜만 확인된 공고', mDetailDateOnly())}
${shot('m-detail-sessions', '상세 · 회차마다 접수가 끝나는 공고', mDetailSessions())}
${shot('m-detail-unverified', '상세 · 접수 마감이 확인되기 전 (찜한 직후 안내)', mDetailUnverified())}
${shot('m-detail-closed', '상세 · 마감된 공고 → 비슷한 접수 중 공고', mDetailClosed())}
</div>

<h2>4. 모바일 찜</h2>
<div class="row">
${shot('m-fav', '찜 · 네 묶음', mFav())}
${shot('m-fav-moved', '찜 · ‘신청했어요’를 누른 직후', mFav({ snackbar: true }))}
${shot('m-fav-empty', '찜 · 처음 열었을 때', mFavEmpty())}
</div>

<h2>5. PC (1440×900 첫 화면)</h2>
<div class="row">
${shot('pc-home', 'PC 홈 · 4열', pcHome())}
${shot('pc-detail', 'PC 상세 · 왼쪽 포스터, 오른쪽 신청 정보', pcDetail())}
${shot('pc-fav', 'PC 찜', pcFav())}
</div>
</main>
</body>
</html>
`;

const out = process.argv[2] || 'index.html';
fs.writeFileSync(out, html);
console.log('wrote', out, html.length);
