import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';

// دالة تجيب كل صلاحيات المستخدم الحالي من قاعدة البيانات
export async function getUserPermissions() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get('session')?.value;
  const session = await verifySession(cookie);

  if (!session) return [];

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      roles: {
        include: {
          permissions: true
        }
      }
    }
  });

  if (!user) return [];

  // دمج كل الصلاحيات من كل الأدوار بدون تكرار
  const permissions = new Set<string>();
  user.roles.forEach(role => {
    role.permissions.forEach(perm => {
      permissions.add(perm.code);
    });
  });

  return Array.from(permissions);
}

// دالة نستعملوها داخل الـ Server Actions باش نبلوكيو العملية إذا ماكاش صلاحية
export async function requirePermission(permissionCode: string) {
  const permissions = await getUserPermissions();
  if (!permissions.includes(permissionCode)) {
    throw new Error(`Accès refusé. Permission requise : ${permissionCode}`);
  }
  return true;
}

// دالة نستعملوها باش نفيريفيو الصلاحية برك (ترجع true أو false)
export async function hasPermission(permissionCode: string) {
  const permissions = await getUserPermissions();
  return permissions.includes(permissionCode);
}