// Vercel Cron 호출 확인. CRON_SECRET 을 지정하면 Vercel Cron 이 Authorization: Bearer <값> 을 붙여 부르고, 그 밖의 호출은 막는다.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}
