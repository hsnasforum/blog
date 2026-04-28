import { z } from "zod";

const DEFAULT_DEV_DATABASE_URL = "file:./dev.db";

if (!process.env.DATABASE_URL) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("환경변수 DATABASE_URL이 필요합니다. 예: DATABASE_URL=\"file:./dev.db\"");
  }

  process.env.DATABASE_URL = DEFAULT_DEV_DATABASE_URL;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL이 필요합니다."),
  WRITER_PROVIDER: z.enum(["api-key", "oauth-proxy"]).default("oauth-proxy"),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  WRITER_MODEL: z.string().default("gpt-5.3"),
  WRITER_MODEL_OPTIONS: z.string().optional(),
  WRITER_REASONING_EFFORT: z.string().optional(),
  NAVER_CLIENT_ID: z.string().optional(),
  NAVER_CLIENT_SECRET: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  REDDIT_BEARER_TOKEN: z.string().optional(),
  REDDIT_SUBREDDIT_WHITELIST: z.string().optional(),
  STACKEXCHANGE_SITE: z.string().default("stackoverflow"),
  STACK_EXCHANGE_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  WRITER_PROVIDER: process.env.WRITER_PROVIDER,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  WRITER_MODEL: process.env.WRITER_MODEL,
  WRITER_MODEL_OPTIONS: process.env.WRITER_MODEL_OPTIONS,
  WRITER_REASONING_EFFORT: process.env.WRITER_REASONING_EFFORT,
  NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID,
  NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  REDDIT_BEARER_TOKEN: process.env.REDDIT_BEARER_TOKEN,
  REDDIT_SUBREDDIT_WHITELIST: process.env.REDDIT_SUBREDDIT_WHITELIST,
  STACKEXCHANGE_SITE: process.env.STACKEXCHANGE_SITE,
  STACK_EXCHANGE_KEY: process.env.STACK_EXCHANGE_KEY,
});

if (!parsed.success) {
  throw new Error(`환경변수 검증 실패: ${parsed.error.message}`);
}

export const env = parsed.data;
