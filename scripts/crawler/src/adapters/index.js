// src/adapters/index.js
// 어댑터 레지스트리 — adapter 이름으로 파서를 매핑
// 사이트별 HTML 구조가 다르면 전용 어댑터를 만들고 여기 등록

import genericBoard from "./generic-board.js";
import mapoGu from "./mapo-gu.js";
import youthSeoul from "./youth-seoul.js";

// 대부분의 기관은 그누보드(Gnuboard) 계열이라 generic-board로 커버 가능
// 구조가 다른 사이트만 전용 어댑터 작성

const adapters = {
  // 범용
  "generic-board": genericBoard,

  // 마포구청 & 동 주민센터 (동일 CMS)
  "mapo-gu": mapoGu,
  "mapo-dong": mapoGu, // 주민센터도 같은 도메인/구조
  "youth-seoul": youthSeoul,

  // 아래는 generic-board를 기본으로 사용하되,
  // 실제 크롤링 시 HTML 구조가 다르면 전용 어댑터를 추가
  "seoul-city": genericBoard,
  "mfmc": genericBoard,        // 마포구시설관리공단
  "mfac": genericBoard,        // 마포문화재단
  "mapo-employ": genericBoard,  // 고용복지지원센터
  "mapo-welfare": genericBoard, // 장애인종합복지관
  "mapowf": genericBoard,       // 마포복지재단
  "kesco": genericBoard,        // 한국전기안전공사
  "ccfsm": genericBoard,        // 어린이급식관리지원센터
};

export function getAdapter(adapterName) {
  const adapter = adapters[adapterName];
  if (!adapter) {
    console.warn(`Adapter "${adapterName}" not found, using generic-board`);
    return genericBoard;
  }
  return adapter;
}

export default adapters;
