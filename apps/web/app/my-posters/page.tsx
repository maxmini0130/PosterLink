import type { Metadata } from "next";
import { MyPostersClient } from "./MyPostersClient";

export const metadata: Metadata = {
  title: "내 공고",
  robots: { index: false, follow: false },
};

/** 내 공고 (UI redesign ⑨⑩): guests see this browser's favorites, members their account. */
export default function MyPostersPage() {
  return <MyPostersClient />;
}
