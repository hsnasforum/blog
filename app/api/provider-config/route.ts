import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ensureProviderConfig,
  normalizeProviderMode,
  updateProviderConfig,
} from "@/lib/writer/provider-settings";

const providerConfigSchema = z.object({
  mode: z.enum(["api-key", "oauth-proxy"]),
  baseUrl: z.string().url(),
  model: z.string().min(1),
});

export async function GET() {
  const config = await ensureProviderConfig();
  return NextResponse.json({ config });
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json();
    const parsed = providerConfigSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "provider 설정 검증 실패", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const config = await updateProviderConfig({
      mode: normalizeProviderMode(parsed.data.mode),
      baseUrl: parsed.data.baseUrl,
      model: parsed.data.model,
    });

    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json(
      {
        error: "provider 설정 저장 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
