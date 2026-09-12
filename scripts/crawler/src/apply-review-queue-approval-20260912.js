#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REVIEW_QUEUE_APPROVAL_20260912";
const REPORT_DEFAULT = "data/results/review-queue-approval-20260912.json";
const REVIEWER = "codex-review-queue-20260912";

const DECISIONS = [
  { id: "0816e7c6-bb6f-4cf4-bc8c-dbcc29666af9", keep: true, reason: "Exact/same-event DDM academy duplicate candidate; K-Startup record is preferred for approval." },
  { id: "fee9f3f6-69bf-4dab-b300-4df24f86b0c2", status: "published", appEnd: "2026-09-14", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_HEALTH"], reason: "Recruitment closes 2026-09-14 noon; youth festival booth runs 2026-09-19 with image consulting and mental-health information." },
  { id: "05d52df7-3302-4fa6-82ab-25fe0b4deea8", status: "published", appEnd: "2026-09-20", eventStart: "2026-09-30", eventEnd: "2026-11-08", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_SUPPORT_PROGRAM"], reason: "Application deadline is 2026-09-20; counseling program groups run from 2026-09-30/10-04 through 2026-11-04/11-08." },
  { id: "d4d27689-dd9f-4e14-b374-461fbbe7ad55", status: "published", appStart: "2026-09-07", appEnd: "2026-09-28", eventStart: "2026-10-18", eventEnd: "2026-10-18", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_EVENT_RECRUIT"], reason: "Seller application period is 2026-09-07 to 2026-09-28; market operates 2026-10-18." },
  { id: "11cbc3d1-df73-45d4-bb14-3302f4fee6a5", status: "closed", eventStart: "2026-09-11", eventEnd: "2026-09-11", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_BUSINESS"], reason: "Public market/festival event was held 2026-09-11 and has passed as of 2026-09-12." },
  { id: "3577ff67-ca23-49dd-a684-38eeac69e30b", status: "closed", eventStart: "2026-09-11", eventEnd: "2026-09-11", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_BUSINESS"], reason: "Stored 2023 year was stale; source event date is 2026-09-11, now closed." },
  { id: "9d1f0094-bdca-443a-a350-36da829c7c92", status: "published", eventStart: "2026-09-17", eventEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Open local resident festival event is scheduled for 2026-09-17." },
  { id: "91425254-329a-42a9-b2b1-12dc65148c7f", status: "published", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "Youth policy package performance is scheduled for 2026-09-19." },
  { id: "b5855eda-d85c-46a5-9795-eda121392a1c", status: "published", appStart: "2026-09-08", appEnd: "2026-10-06", deadlineType: "fixed", categories: ["CAT_SUPPORT_PROGRAM", "CAT_LIFE_INFO"], reason: "Donation campaign participation runs 2026-09-08 to 2026-10-06." },
  { id: "bb1742ae-017d-4532-acf4-0d8cd6dc1a0d", status: "published", appEnd: "2026-09-30", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "Stored 2023 year was stale; selection notice is 2026-09-30 for a reading/discussion program." },
  { id: "df81662d-49a2-4cd1-8310-7c76b5f9dc8b", status: "published", appEnd: "2026-10-02", eventStart: "2026-10-08", eventEnd: "2026-10-15", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_HEALTH"], reason: "Application closes 2026-10-02; body/mind workshop runs 2026-10-08 and 2026-10-15." },
  { id: "76db8d44-f687-47cf-abc7-5a3ef6f6908d", status: "published", appEnd: "2026-10-27", eventStart: "2026-10-06", eventEnd: "2026-10-27", deadlineType: "until_exhausted", categories: ["CAT_COURSE", "CAT_HEALTH"], reason: "Recruitment is until capacity fills; course runs 2026-10-06 to 2026-10-27." },
  { id: "0aa0af0c-ace5-4912-890a-9747bedf5dde", status: "published", appStart: "2026-09-01", appEnd: "2026-09-28", eventStart: "2026-10-07", eventEnd: "2026-10-31", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Volunteer application period is 2026-09-01 to 2026-09-28; activities continue through the 2026-10-30/31 event." },
  { id: "c881bb6c-cca2-4c0a-8f57-9a06effb0356", status: "published", appEnd: "2026-09-23", eventStart: "2026-09-28", eventEnd: "2026-09-30", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_RECRUITMENT"], reason: "Career/job-prep course application closes 2026-09-23; course dates are 2026-09-28 to 2026-09-30." },
  { id: "eb78b753-eccc-46ae-8779-f09892500d77", status: "closed", appEnd: "2026-09-11", eventStart: "2026-09-16", eventEnd: "2026-09-16", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_RECRUITMENT"], reason: "Selection/application window ended 2026-09-11 even though mentoring event occurs later." },
  { id: "48a95431-8829-4663-90dc-529372ca20b2", status: "published", appEnd: "2026-09-15", eventStart: "2026-09-15", eventEnd: "2026-09-29", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "Acting workshop begins 2026-09-15 and runs through 2026-09-29." },
  { id: "2058f71a-8281-4ce5-8d54-dcf8f31ced7e", status: "published", appEnd: "2026-09-28", eventStart: "2026-09-14", eventEnd: "2026-09-28", deadlineType: "until_exhausted", categories: ["CAT_COURSE", "CAT_RECRUITMENT"], reason: "Portfolio workshop accepts applicants until filled and runs 2026-09-14 to 2026-09-28." },
  { id: "e520bacb-5b25-4bf0-a124-7f8fe9cacfde", status: "published", eventStart: "2026-09-18", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "Stored 2023 year was stale; youth-week event is on 2026-09-18." },
  { id: "5776fa87-978d-4b86-904d-d4db45a8cf83", status: "published", appStart: "2026-09-03", appEnd: "2026-09-13", eventStart: "2026-09-18", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Story submission runs 2026-09-03 to 2026-09-13; concert is on 2026-09-18." },
  { id: "cd704b1c-d049-4edb-ab58-2c2af3a1d145", status: "published", eventStart: "2026-09-16", eventEnd: "2026-09-16", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Public direct market is held on 2026-09-16." },
  { id: "ad03e172-8a56-4b39-93db-3445e1b3c0d4", status: "published", appEnd: null, deadlineType: "until_exhausted", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "Lectures are accepted by session until the 150-seat capacity fills; no single fixed final application date is stated." },
  { id: "83584a10-c9ea-4028-8102-26a80b8ece8f", status: "published", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "Open youth festival is scheduled for 2026-09-19." },
  { id: "5482d8aa-50b3-4c16-a8dd-1396d22e9c8d", status: "published", appEnd: "2026-09-16", eventStart: "2026-09-21", eventEnd: "2026-09-21", deadlineType: "fixed", categories: ["CAT_SUPPORT_PROGRAM", "CAT_LIFE_INFO"], reason: "Application closes 2026-09-16; new-resident support event runs 2026-09-21." },
  { id: "053bfcaf-2bb1-4bb1-b711-a6e135d0db1f", status: "published", eventStart: "2026-10-01", eventEnd: "2026-10-01", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_FAMILY"], reason: "Parent education lecture is scheduled for 2026-10-01." },
  { id: "689af3ff-0cfd-4d9b-8018-9356d5b83b1b", status: "published", eventStart: "2026-10-24", eventEnd: "2026-10-24", deadlineType: "unknown", categories: ["CAT_EVENT_RECRUIT", "CAT_BUSINESS"], reason: "Seller recruitment is active but no exact application deadline is stated; market date is 2026-10-24." },
  { id: "d9261ab2-b0cc-4f5f-968e-4bc9e11e4775", status: "published", appStart: "2026-09-10", appEnd: "2026-09-15", deadlineType: "fixed", categories: ["CAT_HEALTH", "CAT_SUPPORT_PROGRAM"], reason: "Stored 2026-09-10 was the application start; actual deadline is 2026-09-15 17:00." },
  { id: "ee5a1b4c-c999-48b1-8d5c-34d9bebd739f", status: "published", appStart: "2026-09-10", appEnd: "2026-10-30", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_SUPPORT_PROGRAM"], reason: "Startup/venture support application runs 2026-09-10 to 2026-10-30." },
  { id: "dbb2cd04-8b4b-48d3-b8d4-8b402d503aae", status: "published", appEnd: "2026-09-20", eventStart: "2026-09-22", eventEnd: "2026-09-22", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Movie gathering application closes 2026-09-20; event is 2026-09-22." },
  { id: "02ee8cbc-dda3-4a73-b65d-853ee31e7329", status: "published", appStart: "2026-08-28", appEnd: "2026-09-13", eventStart: "2026-09-14", eventEnd: "2026-09-14", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_LIFE_INFO"], reason: "Public reservation period is 2026-08-28 to 2026-09-13; lecture is on 2026-09-14." },
  { id: "7648f9de-5e30-40eb-9ce0-1c883249ffb5", status: "published", appEnd: "2026-10-07", eventStart: "2026-10-07", eventEnd: "2026-12-31", deadlineType: "ongoing", categories: ["CAT_HEALTH", "CAT_EVENT_RECRUIT"], reason: "Period is described as ongoing within the program schedule beginning 2026-10-07." },
  { id: "69df2f45-0057-42f7-b7f9-8e038dfc3d62", status: "published", eventStart: "2026-09-11", eventEnd: "2026-09-20", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Open cultural event runs 2026-09-11 to 2026-09-20." },
  { id: "b1275695-dbd8-4e91-91f0-d4d926e87256", status: "closed", appStart: "2026-09-06", appEnd: "2026-09-06", eventStart: "2026-09-06", eventEnd: "2026-09-06", deadlineType: "fixed", categories: ["CAT_LIFE_INFO", "CAT_SUPPORT_PROGRAM"], reason: "Free vehicle check event ended 2026-09-06." },
  { id: "6878e061-76f0-48e9-9420-b159d7bb6d3b", status: "published", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "Youth festival notice is for 2026-09-19." },
  { id: "5595fbb5-9584-4070-bfe7-c9f22c86fc80", status: "published", appEnd: "2026-10-23", deadlineType: "fixed", categories: ["CAT_CONTEST", "CAT_EVENT_RECRUIT"], reason: "Short-form content contest deadline is 2026-10-23." },
  { id: "d01d2f36-73ce-4cb9-a2d1-8cc43be1ff3f", status: "published", appStart: "2026-09-08", eventStart: "2026-09-17", eventEnd: "2026-09-20", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT", "CAT_COURSE"], reason: "Program applications open from 2026-09-08; book festival runs 2026-09-17 to 2026-09-20." },
  { id: "dc2a9392-eccd-4554-8306-b627e0ca6551", status: "published", appStart: "2026-09-07", appEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_HEALTH"], reason: "Hand-drip class application period is 2026-09-07 to 2026-09-18." },
  { id: "a37a72e9-d442-48ba-9a73-e03f51a1d0f3", status: "published", appEnd: "2026-09-18", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "One-day class recruitment closes 2026-09-18; class is on 2026-09-19." },
  { id: "9adb3a9f-2f7e-4f81-91ef-88d64933adb9", status: "published", appStart: "2026-09-08", eventStart: "2026-09-18", eventEnd: "2026-09-18", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT", "CAT_HEALTH"], reason: "Recruitment opens from 2026-09-08 on a first-come basis; event is 2026-09-18." },
  { id: "b4809bfe-901a-4f49-b493-cae83ccc4eaf", status: "published", appStart: "2026-09-01", appEnd: "2026-09-28", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_LIFE_INFO"], reason: "Tax seminar registration is 2026-09-01 to 2026-09-28." },
  { id: "23a11170-10d0-432d-99b6-4be2338d3669", status: "published", eventStart: "2026-09-13", eventEnd: "2026-09-13", deadlineType: "fixed", categories: ["CAT_LIFE_INFO", "CAT_EVENT_RECRUIT"], reason: "Free vehicle check event is on 2026-09-13." },
  { id: "cb463ab6-b596-4aed-9f12-cfa9876f1c72", status: "published", eventStart: "2026-09-12", eventEnd: "2026-09-13", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Garden talk and cinema event runs 2026-09-12 to 2026-09-13." },
  { id: "abe22a87-c444-4f23-94d3-d3727c2f368a", status: "published", appStart: "2026-09-17", appEnd: "2026-09-22", eventStart: "2026-10-15", eventEnd: "2026-10-19", deadlineType: "fixed", categories: ["CAT_SUPPORT_PROGRAM", "CAT_LIFE_INFO"], reason: "Food support recruitment is 2026-09-17 to 2026-09-22; 1992-2007 dates are eligibility birth years, not the deadline." },
  { id: "8943357c-96d6-43a5-942f-ed11cb3fa963", status: "published", appStart: "2026-09-09", appEnd: "2026-09-13", eventStart: "2026-09-14", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_HEALTH"], reason: "Stored 2023 year was stale; application period is 2026-09-09 to 2026-09-13 and online check-in runs from 2026-09-14." },
  { id: "ef8acd81-e528-4ea8-9a33-2202194e77c7", status: "published", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "Youth street festival is scheduled for 2026-09-19." },
  { id: "7929df21-0777-413e-8f08-9368840178f9", status: "published", eventStart: "2026-09-17", eventEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_RECRUITMENT"], reason: "Night career-UP self-work session is on 2026-09-17." },
  { id: "a955e71e-6161-4bbe-90c9-14bbe4d7f07e", status: "published", appEnd: "2026-09-28", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_RECRUITMENT"], reason: "Job application document special lecture has a valid application link and current deadline stored as 2026-09-28." },
  { id: "f16f38f8-8dd5-4d29-846b-02d4ed3aabca", status: "published", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "Youth festival club booth event is on 2026-09-19." },
  { id: "d29dacce-3f23-4d60-afb0-6d6dd89d3498", status: "published", appStart: "2026-09-10", appEnd: "2026-09-18", eventStart: "2026-09-22", eventEnd: "2026-09-22", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_FAMILY"], title: "성동청소년문화의집 <우리 가족 쿠킹클래스> 참여자 모집", reason: "Original title only had the institution; source shows cooking class recruitment 2026-09-10 to 2026-09-18 with event on 2026-09-22." },
  { id: "d2e40e47-e95d-48fe-9577-073fba25fb95", status: "published", appEnd: "2026-09-13", eventStart: "2026-09-17", eventEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Application closes 2026-09-13; T-talk sessions run 2026-09-17." },
  { id: "52db72be-703e-4b91-a4a5-71d7ec9a7af1", status: "published", appStart: "2026-08-24", appEnd: "2026-10-02", eventStart: "2027-01-29", eventEnd: "2027-03-28", deadlineType: "fixed", categories: ["CAT_CONTEST", "CAT_EVENT_RECRUIT"], reason: "Public art-stage call has two deadlines; final music/traditional deadline is 2026-10-02, with 2027 performance period." },
  { id: "92ade6e3-ba1f-4ca7-a7ac-cc4fedaef662", status: "published", appEnd: "2026-09-27", eventStart: "2026-10-12", eventEnd: "2026-10-29", deadlineType: "fixed", categories: ["CAT_RECRUITMENT", "CAT_COURSE"], title: "한국능률협회 <D-Bridge 미디어 커리어 빌드업> 참여자 모집", reason: "Program text indicates application until 2026-09-27 and activity period 2026-10-12 to 2026-10-29; title was corrected from institution-only." },
  { id: "c2626a5c-4da4-4547-8498-499aed6d9e81", status: "published", appStart: "2026-09-01", appEnd: "2026-09-14", eventStart: "2026-10-01", eventEnd: "2026-12-31", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Supporters recruitment is 2026-09-01 to 2026-09-14; activity runs 2026-10 to 2026-12." },
  { id: "b8513929-5175-4fdd-abdf-027e06987d68", keep: true, reason: "Exact/same-event DDM academy duplicate candidate; K-Startup record is preferred for approval." },
  { id: "f975d5f1-2260-46a7-827a-d64671b6cc79", status: "published", eventStart: "2026-09-18", eventEnd: "2026-09-18", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT", "CAT_COURSE"], reason: "Cinema music therapy event is on 2026-09-18 with online/phone registration; no fixed deadline stated." },
  { id: "0b8156e6-89c9-4a66-be30-c7a76ba58906", status: "published", appStart: "2026-08-27", appEnd: "2026-09-15", eventStart: "2026-09-17", eventEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_LIFE_INFO"], reason: "Stored 2023 year was stale; application period is 2026-08-27 to 2026-09-15." },
  { id: "3a3e6f51-4024-41e1-9d1b-c47103b40049", status: "published", appStart: "2026-09-02", appEnd: "2026-09-29", eventStart: "2026-10-06", eventEnd: "2026-10-27", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_LIFE_INFO"], reason: "Stored 2023 year was stale; application period is 2026-09-02 to 2026-09-29." },
  { id: "f6e97a5f-b6df-41dd-9f6a-0004fe88b87c", status: "published", appStart: "2026-09-07", appEnd: "2026-10-11", deadlineType: "fixed", categories: ["CAT_CONTEST", "CAT_HOUSING"], reason: "Stored 2026-09-07 was the start; Seoul Young Tech contest deadline is 2026-10-11." },
  { id: "6dad096b-f524-4301-9aef-84f42fe43070", status: "published", appEnd: "2026-10-31", eventStart: "2026-10-01", eventEnd: "2027-02-28", deadlineType: "fixed", categories: ["CAT_RECRUITMENT", "CAT_SUPPORT_PROGRAM"], reason: "Work-experience participant recruitment closes 2026-10-31; work period is 2026-10-01 to 2027-02-28." },
  { id: "7f6b4e99-918d-480c-810a-9f9ec0e1f348", status: "published", eventStart: "2026-10-16", eventEnd: "2026-10-17", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "Performance notice is for 2026-10-16 and 2026-10-17 at Mapo Art Center." },
  { id: "58dd3e80-eb17-4b9a-9bf5-cfb768aa5011", status: "published", appStart: "2026-09-01", appEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_COURSE"], reason: "Climate-tech academy application runs 2026-09-01 to 2026-09-18." },
  { id: "1f7f78b6-8715-46a6-8f54-6f7f8898d7b5", status: "published", appStart: "2026-09-03", appEnd: "2026-09-28", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_SUPPORT_PROGRAM"], reason: "Startup hub tenancy application runs 2026-09-03 to 2026-09-28." },
  { id: "31b90579-c08a-4abe-9450-3ec1d200f6bc", status: "published", appStart: "2026-09-08", appEnd: "2026-10-06", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_EVENT_RECRUIT"], reason: "Open innovation meetup application runs 2026-09-08 to 2026-10-06." },
  { id: "f5cef206-a09c-412e-8d16-496468cf0e80", status: "published", appStart: "2026-09-01", appEnd: "2026-09-27", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_EVENT_RECRUIT"], reason: "Hackathon application runs 2026-09-01 to 2026-09-27." },
  { id: "ca7cc5f3-bb15-4778-bb74-58748d081dd5", status: "closed", appStart: "2026-09-03", appEnd: "2026-09-10", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_COURSE"], reason: "Application period ended 2026-09-10 13:00." },
  { id: "86b03611-6217-4ab9-98a2-c48b11160e23", status: "published", appStart: "2026-09-08", appEnd: "2026-09-16", eventStart: "2026-09-16", eventEnd: "2026-09-16", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_COURSE"], reason: "Preferred DDM academy record; K-Startup application runs 2026-09-08 to 2026-09-16." },
  { id: "41bb0269-0461-4af5-bb59-93372903086d", status: "published", appStart: "2026-09-07", appEnd: "2026-09-20", eventStart: "2026-11-05", eventEnd: "2026-11-08", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_EVENT_RECRUIT"], reason: "Popup-store recruitment runs 2026-09-07 to 2026-09-20; event is planned 2026-11-05 to 2026-11-08." },
  { id: "b06a39cd-f5bf-490a-a4a9-678a7839822d", status: "published", appEnd: "2026-09-13", eventStart: "2026-09-16", eventEnd: "2026-09-21", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Application closes 2026-09-13; two sessions run 2026-09-16 and 2026-09-21." },
  { id: "ab8321f2-c8fe-4658-adc0-dbfd93de0a0d", status: "published", appStart: "2026-09-07", appEnd: "2026-09-30", eventStart: "2026-10-06", eventEnd: "2026-10-30", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_COURSE"], reason: "Pre-startup academy application runs 2026-09-07 to 2026-09-30; education schedule begins 2026-10-06." },
  { id: "ded568ee-b784-4f1e-872b-a7c29daa3dcf", status: "published", appEnd: "2026-09-21", eventStart: "2026-09-30", eventEnd: "2026-10-28", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_LIFE_INFO"], reason: "Application closes 2026-09-21; class runs 2026-09-30 to 2026-10-28." },
  { id: "32bb0b23-2854-4235-8ccd-3dcd21dc9df3", status: "published", appStart: "2026-09-07", appEnd: "2026-09-13", eventStart: "2026-09-01", eventEnd: "2026-12-18", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_LIFE_INFO"], reason: "Additional recruitment is 2026-09-07 to 2026-09-13; classes continue through 2026-12-18." },
  { id: "dad2c482-880e-40fc-ab37-8e5f43fc7c73", status: "published", eventStart: "2026-09-11", eventEnd: "2026-10-02", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "Adult beer-party event has remaining dates through 2026-10-02." },
  { id: "4305d42a-7e65-4e1c-9feb-06d0db8f4995", status: "published", eventStart: "2026-09-15", eventEnd: "2026-09-17", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT", "CAT_HEALTH"], reason: "Walk-in event runs 2026-09-15 to 2026-09-17 with on-site participation." },
  { id: "29ab92c3-d6a6-45c0-a5b2-fb4442012e13", status: "published", eventStart: "2026-09-12", eventEnd: "2026-09-12", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "Open youth festival is today, 2026-09-12." },
  { id: "4e35e80e-a4fc-42e9-965c-3e34a21d5cdf", status: "published", eventStart: "2026-09-12", eventEnd: "2026-09-12", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"], reason: "No advance application; first-come event runs today, 2026-09-12." },
  { id: "c5e12d0d-19fc-4da5-bd2e-42a6bc04f0ea", status: "published", appEnd: "2026-09-16", eventStart: "2026-09-19", eventEnd: "2026-09-19", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"], reason: "Advance registration event is tied to 2026-09-16 and the main event is 2026-09-19." },
  { id: "22a4d62f-7228-4a81-bb27-e9adde359891", status: "published", appStart: "2026-08-28", appEnd: "2026-09-16", deadlineType: "fixed", categories: ["CAT_CONTEST", "CAT_EVENT_RECRUIT"], reason: "Song contest submission deadline is 2026-09-16." },
  { id: "0c727808-0751-45ad-b59c-e1f12553861b", status: "published", eventStart: "2026-09-12", eventEnd: "2026-09-17", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_BUSINESS"], reason: "Commercial-district festival events run through 2026-09-17." },
  { id: "affa7767-30dc-4744-b3d6-7a4cb265881e", status: "published", eventStart: "2026-09-14", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_HEALTH", "CAT_EVENT_RECRUIT"], reason: "Mental-health open-day program runs 2026-09-14 to 2026-09-18." },
  { id: "2c1941c8-be18-4b85-90c8-aac6db8c00c9", status: "published", eventStart: "2026-09-01", eventEnd: "2026-10-30", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_HEALTH"], reason: "Gallery exhibition runs 2026-09-01 to 2026-10-30." },
  { id: "d7712888-a7a0-4abb-8b3f-ddef3c8691b4", status: "published", appStart: "2026-09-08", deadlineType: "ongoing", categories: ["CAT_RECRUITMENT", "CAT_SUPPORT_PROGRAM"], reason: "Notice states recruitment from 2026-09-08 with no closing date; do not invent an end date." },
  { id: "5761b95b-5e4d-47df-8f5a-2206da01fca4", keep: true, reason: "Stored text lacks application deadline, target, and enough official notice facts to verify dates/categories safely." },
];

function parseArgs() {
  return Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }));
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase URL and service role key are required");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "posterlink-review-approval-20260912" } },
  });
}

function toKstStart(date) {
  return date ? `${date}T00:00:00+09:00` : null;
}

function toKstEnd(date) {
  return date ? `${date}T23:59:59+09:00` : null;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeVerification(row, decision, categoryNamesByCode) {
  const now = new Date().toISOString();
  const verification = { ...asObject(row.field_verification) };
  verification.dateIssues = decision.keep ? verification.dateIssues : [];
  verification.classificationIssues = decision.keep ? verification.classificationIssues : [];
  verification.deadlineMatches = !decision.keep;
  verification.decision = decision.keep ? "review" : "approved";
  verification.reason = decision.keep
    ? `AI direct queue review kept in review: ${decision.reason}`
    : `AI direct queue review approved: ${decision.reason}`;
  verification.dateQuality = {
    ...asObject(verification.dateQuality),
    decision: decision.keep ? "review" : "pass",
    storedDeadline: decision.appEnd ?? null,
    normalizedDeadline: decision.appEnd ?? null,
    suggestedDeadline: decision.appEnd ?? null,
    reviewedAt: now,
    reviewedBy: REVIEWER,
  };
  verification.classification = {
    ...asObject(verification.classification),
    categoryCodes: decision.categories ?? [],
    primaryCategory: decision.categories?.[0] ?? null,
    categories: (decision.categories ?? []).map((code) => ({
      code,
      label: categoryNamesByCode.get(code) ?? code,
      confidence: 0.9,
      evidence: decision.reason,
      source: REVIEWER,
    })),
    confidence: decision.keep ? 0.5 : 0.9,
    reason: decision.reason,
    updatedBy: REVIEWER,
    updatedAt: now,
  };
  verification.aiQueueReview = {
    reviewer: "codex",
    reviewedAt: now,
    todayKst: "2026-09-12",
    approve: !decision.keep,
    finalStatus: decision.keep ? "review" : decision.status,
    finalDeadlineType: decision.deadlineType ?? null,
    finalApplicationStartAt: decision.appStart ?? null,
    finalApplicationEndAt: decision.appEnd ?? null,
    finalEventStartAt: decision.eventStart ?? null,
    finalEventEndAt: decision.eventEnd ?? null,
    finalCategories: decision.categories ?? [],
    reason: decision.reason,
  };
  return verification;
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  if (apply && args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  }

  const supabase = createSupabase();
  const ids = DECISIONS.map((decision) => decision.id);
  const [{ data: rows, error: rowsError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase.from("posters").select("id,title,poster_status,field_verification").in("id", ids),
    supabase.from("categories").select("id,code,name"),
  ]);
  if (rowsError) throw rowsError;
  if (categoriesError) throw categoriesError;

  const rowById = new Map((rows ?? []).map((row) => [row.id, row]));
  const categoryByCode = new Map((categories ?? []).map((row) => [row.code, row]));
  const categoryNamesByCode = new Map((categories ?? []).map((row) => [row.code, row.name]));
  const missing = ids.filter((id) => !rowById.has(id));
  if (missing.length) throw new Error(`Missing posters: ${missing.join(", ")}`);

  const applied = [];
  const kept = [];
  const skipped = [];

  for (const decision of DECISIONS) {
    const row = rowById.get(decision.id);
    if (row.poster_status !== "review") {
      skipped.push({ id: decision.id, title: row.title, status: row.poster_status, reason: "not_review" });
      continue;
    }
    if (decision.keep) {
      kept.push({ id: decision.id, title: row.title, reason: decision.reason });
      continue;
    }
    for (const code of decision.categories ?? []) {
      if (!categoryByCode.has(code)) throw new Error(`Unknown category ${code} for ${decision.id}`);
    }
    if (!apply) {
      applied.push({ id: decision.id, title: decision.title ?? row.title, plannedStatus: decision.status, dryRun: true });
      continue;
    }

    const posterUpdate = {
      poster_status: decision.status,
      published_at: new Date().toISOString(),
      rejection_reason: null,
      application_start_at: toKstStart(decision.appStart),
      application_end_at: toKstEnd(decision.appEnd),
      event_start_at: toKstStart(decision.eventStart),
      event_end_at: toKstEnd(decision.eventEnd),
      deadline_type: decision.deadlineType ?? "unknown",
      field_verification: mergeVerification(row, decision, categoryNamesByCode),
    };
    if (decision.title) posterUpdate.title = decision.title;

    const { data: updated, error: updateError } = await supabase
      .from("posters")
      .update(posterUpdate)
      .eq("id", decision.id)
      .eq("poster_status", "review")
      .select("id,title,poster_status,application_end_at,event_end_at,deadline_type")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      skipped.push({ id: decision.id, title: row.title, reason: "update_race" });
      continue;
    }

    const { error: deleteError } = await supabase
      .from("poster_categories")
      .delete()
      .eq("poster_id", decision.id);
    if (deleteError) throw deleteError;

    const categoryRows = decision.categories.map((code) => ({
      poster_id: decision.id,
      category_id: categoryByCode.get(code).id,
    }));
    const { error: insertError } = await supabase.from("poster_categories").insert(categoryRows);
    if (insertError) throw insertError;
    applied.push({ ...updated, category_codes: decision.categories, reason: decision.reason });
  }

  if (apply && applied.length > 0) {
    const { error } = await supabase.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "review_queue_approval_20260912",
      metadata_json: {
        reviewed_by: "codex",
        approved_count: applied.length,
        kept_review_count: kept.length,
        skipped_count: skipped.length,
        no_exposure_tier_changes: true,
      },
    });
    if (error) throw error;
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    input_count: DECISIONS.length,
    approved_or_closed_count: applied.length,
    kept_review_count: kept.length,
    skipped_count: skipped.length,
    status_counts: applied.reduce((acc, item) => {
      const status = item.poster_status ?? item.plannedStatus;
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {}),
    kept,
    skipped,
    applied,
  };

  const output = path.resolve(args.output ?? REPORT_DEFAULT);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output: path.relative(process.cwd(), output),
    mode: report.mode,
    input_count: report.input_count,
    approved_or_closed_count: report.approved_or_closed_count,
    kept_review_count: report.kept_review_count,
    skipped_count: report.skipped_count,
    status_counts: report.status_counts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
