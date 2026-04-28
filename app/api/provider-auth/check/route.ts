import { NextResponse } from "next/server";
import { z } from "zod";

import { checkProviderAuth } from "@/lib/writer/provider-auth";
import { normalizeProviderMode } from "@/lib/writer/provider-settings";

const authCheckSchema = z.object({
  mode: z.enum(["api-key", "oauth-proxy"]),
  baseUrl: z.string().url(),
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = authCheckSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "인증 확인 입력값 검증 실패", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await checkProviderAuth({
      mode: normalizeProviderMode(parsed.data.mode),
      baseUrl: parsed.data.baseUrl,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "unreachable",
        models: [],
        message: error instanceof Error ? error.message : "provider 인증 확인 실패",
      },
      { status: 500 },
    );
  }
}
