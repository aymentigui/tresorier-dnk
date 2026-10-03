import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '../lib/session';

// الصفحات المسموح الدخول ليها بلا تسجيل دخول
const publicRoutes = ['/login'];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublicRoute = publicRoutes.includes(path);

  // نقراو الـ Cookie تاع الجلسة
  const cookie = req.cookies.get('session')?.value;
  const session = await verifySession(cookie);

  // إذا ماشي صفحة عامة (كيما login) والمستخدم ماعندوش جلسة، نرجعوه للـ Login
  if (!isPublicRoute && !session) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  // إذا راهو مسجل دخول وحب يروح للـ login، نرجعوه للـ Dashboard (لوحة القيادة)
  if (isPublicRoute && session) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  return NextResponse.next();
}

// هنا نحددو وقتاش يخدم الـ middleware (نستثنيو الملفات الثابتة والصور)
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};