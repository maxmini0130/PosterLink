import type { Metadata } from "next";
import { InterestsClient } from "./InterestsClient";

export const metadata: Metadata = {
  title: "관심 지역·분야 고르기",
  robots: { index: false, follow: false },
};

/** 관심 지역·분야 고르기 (UI redesign ⑤): kept in this browser for guests. */
export default function InterestsPage() {
  return <InterestsClient />;
}
