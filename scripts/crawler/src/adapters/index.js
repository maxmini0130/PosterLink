// src/adapters/index.js
// Adapter registry keyed by collection source adapter name.

import genericBoard from "./generic-board.js";
import mapoGu from "./mapo-gu.js";
import youthSeoul from "./youth-seoul.js";
import youthcenter from "./youthcenter.js";
import maposcYeyak from "./maposc-yeyak.js";
import mfac from "./mfac.js";
import bizinfo from "./bizinfo.js";
import kStartup from "./k-startup.js";
import jobAlio from "./job-alio.js";
import kesco from "./kesco.js";
import mapoEmploy from "./mapo-employ.js";
import ccfsm from "./ccfsm.js";
import mapoLabor from "./mapo-labor.js";

const adapters = {
  "generic-board": genericBoard,

  "mapo-gu": mapoGu,
  "mapo-dong": mapoGu,
  "youth-seoul": youthSeoul,
  "maposc-yeyak": maposcYeyak,
  "mfac": mfac,
  "youthcenter": youthcenter,
  "bizinfo": bizinfo,
  "k-startup": kStartup,
  "job-alio": jobAlio,
  "kesco": kesco,
  "mapo-employ": mapoEmploy,
  "ccfsm": ccfsm,
  "mapo-labor": mapoLabor,

  "seoul-city": genericBoard,
  "mfmc": genericBoard,
  "mapo-welfare": genericBoard,
  "mapowf": genericBoard,
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
