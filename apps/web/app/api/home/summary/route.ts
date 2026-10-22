import { NextResponse } from "next/server";
import { fetchPublicHomeSummary } from "../../../../lib/homeSummary";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await fetchPublicHomeSummary());
}
