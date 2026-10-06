// 관리자 화면 요청 전에 만료가 가까운 로그인 토큰을 갱신한다.
// 권한 확인은 여기서 하지 않고, 페이지·Server Action 의 requireAdmin() 이 한다.
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, needsRefresh, refreshGrant, sessionCookies } from "@/lib/admin/session";

export async function proxy(request: NextRequest) {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh || !needsRefresh(access)) return NextResponse.next();

  const tokens = await refreshGrant(refresh).catch(() => null);
  if (!tokens) {
    const res = NextResponse.next();
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }

  // 이번 요청의 렌더링에서도 새 토큰을 보도록 요청 쿠키를 바꾸고, 응답으로 브라우저 쿠키도 바꾼다
  const cookies = sessionCookies(tokens);
  for (const c of cookies) request.cookies.set(c.name, c.value); // Cookie 요청 헤더도 함께 바뀐다
  const res = NextResponse.next({ request: { headers: new Headers(request.headers) } });
  for (const c of cookies) res.cookies.set(c);
  return res;
}

export const config = {
  matcher: ["/admin/:path*"],
};
