import { NextRequest, NextResponse } from "next/server";
import { evaluateStrategy } from "@/lib/options/evaluateStrategy";
import type { EvaluateRequest } from "@/types/options";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EvaluateRequest;
    const result = evaluateStrategy(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to evaluate strategy" },
      { status: 400 }
    );
  }
}