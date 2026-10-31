import { redirect } from "next/navigation";

/** 찜 목록 moved to 내 공고 (UI redesign ⑨⑩), which guests can open too. */
export default function FavoritesPage() {
  redirect("/my-posters");
}
