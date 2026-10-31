import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withdrawalContact } from "../../../../lib/withdrawalContact";

// Temporary safety stop: legacy comment CASCADE edges can delete others' replies.
// Excludes unapproved deletion jobs/SQL. No Auth deletion or OAuth unlink occurs.
export async function DELETE() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json(
      { error: "인증 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
  const contact = withdrawalContact();
  return NextResponse.json(
    {
      error:
        "회원정보와 다른 이용자의 데이터를 보호하기 위해 자동 탈퇴를 일시 중단했습니다. 계정과 데이터는 변경되지 않았습니다. " +
        (contact
          ? `탈퇴·개인정보 삭제 요청은 ${contact.label}로 직접 보내 주세요. 이 응답만으로 요청이 접수되지 않습니다.`
          : "현재 수신이 확인된 요청 경로를 준비 중입니다. 이 응답만으로 요청이 접수되지 않습니다."),
      requestContact: contact?.href ?? null,
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
