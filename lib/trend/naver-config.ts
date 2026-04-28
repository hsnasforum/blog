import { env } from "@/lib/env";

export type NaverCredentials = {
  clientId: string;
  clientSecret: string;
};

export function getNaverCredentials(): NaverCredentials | null {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    return null;
  }

  return {
    clientId: env.NAVER_CLIENT_ID,
    clientSecret: env.NAVER_CLIENT_SECRET,
  };
}

export function hasNaverCredentials() {
  return Boolean(getNaverCredentials());
}

export function isMockTrendCollectorMode() {
  return process.env.TREND_COLLECTOR_MODE === "mock";
}

export function isTrendCollectionConfigured() {
  return hasNaverCredentials() || isMockTrendCollectorMode();
}
