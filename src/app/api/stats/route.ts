import { NextResponse } from "next/server";
import { getFilterOptions, getOverviewStats } from "@/lib/metrics/aggregation";

export async function GET() {
  const [overview, filters] = await Promise.all([getOverviewStats(), getFilterOptions()]);
  return NextResponse.json({ overview, filters });
}
