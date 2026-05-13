// src/sites.js
// 크롤링 대상 기관별 설정
// adapter: 게시판 유형 (각 기관의 HTML 구조에 맞는 파서)
// boards: 크롤링할 게시판 목록 (URL + 게시판 이름)

export const sites = [
  // ──────────────────────────────────────────────
  // 1. 서울시청
  // ──────────────────────────────────────────────
  {
    id: "seoul-city",
    name: "서울특별시",
    domain: "https://www.seoul.go.kr",
    adapter: "seoul-city",
    boards: [
      {
        name: "공고/고시",
        url: "https://www.seoul.go.kr/news/news_notice.do",
        category: "공고",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 2. 마포구청
  // ──────────────────────────────────────────────
  {
    id: "mapo-gu",
    name: "마포구청",
    domain: "https://www.mapo.go.kr",
    adapter: "mapo-gu",
    boards: [
      {
        name: "공지사항",
        url: "https://www.mapo.go.kr/site/main/board/notice/list",
        category: "공지",
      },
      {
        name: "채용공고",
        url: "https://www.mapo.go.kr/site/main/board/recruit/list",
        category: "채용",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 3. 마포구 산하 동 주민센터 (16개 동)
  // ──────────────────────────────────────────────
  ...[
    "gongdeok", "ahyeon", "dohwa", "yonggang",
    "daeheung", "yeomni", "sinsu", "seogang",
    "seogyo", "hapjeong", "mangwon1", "mangwon2",
    "yeonnam", "seongsan1", "seongsan2", "sangam"
  ].map((dong, i) => {
    const dongNames = [
      "공덕동", "아현동", "도화동", "용강동",
      "대흥동", "염리동", "신수동", "서강동",
      "서교동", "합정동", "망원1동", "망원2동",
      "연남동", "성산1동", "성산2동", "상암동"
    ];
    return {
      id: `mapo-dong-${dong}`,
      name: `마포구 ${dongNames[i]} 주민센터`,
      domain: "https://www.mapo.go.kr",
      adapter: "mapo-dong",
      boards: [
        {
          name: "주민센터 소식",
          url: `https://www.mapo.go.kr/site/${dong}/board/notice/list`,
          category: "동주민센터",
        },
      ],
    };
  }),

  // ──────────────────────────────────────────────
  // 4. 마포구의회
  // ──────────────────────────────────────────────
  {
    id: "mapo-council",
    name: "마포구의회",
    domain: "https://council.mapo.seoul.kr",
    adapter: "generic-board",
    boards: [
      {
        name: "공지사항",
        url: "https://council.mapo.seoul.kr/kr/news/bbsNotice.do",
        category: "공지",
      },
      {
        name: "입법예고",
        url: "https://council.mapo.seoul.kr/kr/news/bbsLaw.do",
        category: "입법",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 5. 마포구시설관리공단
  // ──────────────────────────────────────────────
  {
    id: "mfmc",
    name: "마포구시설관리공단",
    domain: "https://www.mfmc.or.kr",
    adapter: "mfmc",
    boards: [
      {
        name: "공지사항",
        url: "https://www.mfmc.or.kr/view/bbs/board.php?tbname=notice",
        category: "공지",
      },
      {
        name: "채용공고",
        url: "https://www.mfmc.or.kr/view/bbs/board.php?tbname=recruit",
        category: "채용",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 6. 마포문화재단
  // ──────────────────────────────────────────────
  {
    id: "mfac",
    name: "마포문화재단",
    domain: "https://www.mfac.or.kr",
    adapter: "mfac",
    boards: [
      {
        name: "재단소식",
        url: "https://www.mfac.or.kr/communication/notice_all_list.jsp",
        category: "문화",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 7. 마포인재육성장학재단
  // ──────────────────────────────────────────────
  {
    id: "mapo-scholarship",
    name: "마포인재육성장학재단",
    domain: "http://www.mapojh.or.kr",
    adapter: "generic-board",
    boards: [
      {
        name: "공지사항",
        url: "http://www.mapojh.or.kr/notice",
        category: "장학",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 8. 마포문화원
  // ──────────────────────────────────────────────
  {
    id: "mapo-culture",
    name: "마포문화원",
    domain: "http://www.mapocc.or.kr",
    adapter: "generic-board",
    boards: [
      {
        name: "공지사항",
        url: "http://www.mapocc.or.kr/board/notice",
        category: "문화",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 9. 마포구고용복지지원센터
  // ──────────────────────────────────────────────
  {
    id: "mapo-employ",
    name: "마포구고용복지지원센터",
    domain: "https://mapoworkfare.or.kr",
    adapter: "mapo-employ",
    boards: [
      {
        name: "공지사항",
        url: "https://mapoworkfare.or.kr/notice",
        category: "일자리",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 10. 마포구노동자종합지원센터
  // ──────────────────────────────────────────────
  {
    id: "mapo-labor",
    name: "마포구노동자종합지원센터",
    domain: "https://mapolabor.org",
    adapter: "generic-board",
    boards: [
      {
        name: "공지사항",
        url: "https://mapolabor.org/community/news",
        category: "노동",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 11. 구립망원청소년문화센터
  // ──────────────────────────────────────────────
  {
    id: "mangwon-youth",
    name: "구립망원청소년문화센터",
    domain: "http://www.mwyouth.org",
    adapter: "generic-board",
    boards: [
      {
        name: "공지사항",
        url: "http://www.mwyouth.org/bbs/board.php?bo_table=notice",
        category: "청소년",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 12. 구립도화청소년문화의집
  // ──────────────────────────────────────────────
  {
    id: "dohwa-youth",
    name: "구립도화청소년문화의집",
    domain: "http://www.dhyouth.or.kr",
    adapter: "generic-board",
    boards: [
      {
        name: "공지사항",
        url: "http://www.dhyouth.or.kr/new2024/board/notice",
        category: "청소년",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 13. 구립마포청소년문화의집
  // ──────────────────────────────────────────────
  {
    id: "mapo-youth",
    name: "구립마포청소년문화의집",
    domain: "https://www.mycc.or.kr",
    adapter: "generic-board",
    boards: [
      {
        name: "공지사항",
        url: "https://www.mycc.or.kr/p_community/sub01.php",
        category: "청소년",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 14. 마포장애인종합복지관
  // ──────────────────────────────────────────────
  {
    id: "mapo-disabled",
    name: "마포장애인종합복지관",
    domain: "https://mapowelfare.or.kr",
    adapter: "mapo-welfare",
    boards: [
      {
        name: "공지사항",
        url: "https://mapowelfare.or.kr/bbs/board.php?bo_table=notice",
        category: "복지",
      },
      {
        name: "채용공고",
        url: "https://mapowelfare.or.kr/bbs/board.php?bo_table=recruit",
        category: "채용",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 15. 마포노인복지센터
  // ──────────────────────────────────────────────
  {
    id: "mapo-senior",
    name: "마포노인복지센터",
    domain: "https://mapocare.or.kr",
    adapter: "generic-board",
    boards: [
      {
        name: "공지사항",
        url: "https://mapocare.or.kr/bbs/board.php?bo_table=notice",
        category: "노인복지",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 16. 마포구민체육센터
  // ──────────────────────────────────────────────
  {
    id: "mapo-sports",
    name: "마포구민체육센터",
    domain: "http://www.maposc.or.kr",
    adapter: "generic-board",
    boards: [
      {
        name: "공지사항",
        url: "http://www.maposc.or.kr/subpage/index/22",
        category: "체육",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 17. 한국전기안전공사
  // ──────────────────────────────────────────────
  {
    id: "kesco",
    name: "한국전기안전공사",
    domain: "https://www.kesco.or.kr",
    adapter: "kesco",
    boards: [
      {
        name: "공지사항",
        url: "https://www.kesco.or.kr/sfcont/selectPageListSfCont.do",
        category: "안전",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 18. 마포구어린이급식관리지원센터
  // ──────────────────────────────────────────────
  {
    id: "mapo-kids-meal",
    name: "마포구어린이급식관리지원센터",
    domain: "https://ccfsm.foodnara.go.kr",
    adapter: "ccfsm",
    boards: [
      {
        name: "공지사항",
        url: "https://ccfsm.foodnara.go.kr/mapo/",
        category: "급식",
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 19. 마포복지재단
  // ──────────────────────────────────────────────
  {
    id: "mapo-welfare-foundation",
    name: "마포복지재단",
    domain: "https://www.mapowf.or.kr",
    adapter: "mapowf",
    boards: [
      {
        name: "공지사항",
        url: "https://www.mapowf.or.kr/main/sub.html?boardID=www31",
        category: "복지",
      },
      {
        name: "채용공고",
        url: "https://www.mapowf.or.kr/main/sub.html?page=5&boardID=www31&bCate=",
        category: "채용",
      },
    ],
  },
  {
    id: "youth-seoul",
    name: "청년몽땅정보통",
    domain: "https://youth.seoul.go.kr",
    adapter: "youth-seoul",
    maxPages: 10,
    boards: [
      {
        name: "청년지원정보",
        url: "https://youth.seoul.go.kr/infoData/sprtInfo/list.do?key=2309130006",
        category: "복지",
      },
    ],
  },
];
