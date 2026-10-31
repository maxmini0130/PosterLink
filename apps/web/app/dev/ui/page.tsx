import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UiShowcase } from "./UiShowcase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "UI 컴포넌트 확인",
  robots: { index: false, follow: false },
};

/**
 * Local review page for the redesigned components (screenshots, keyboard
 * checks). Only served when the server runs with UI_SHOWCASE=1; everywhere
 * else, including Production and Preview, it is a 404.
 */
export default function UiShowcasePage() {
  if (process.env.UI_SHOWCASE !== "1") notFound();
  return <UiShowcase />;
}
