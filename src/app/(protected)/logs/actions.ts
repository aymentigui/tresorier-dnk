'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';

// جلب قائمة المستخدمين للفلاتر
export async function getUsersList() {
  return await prisma.user.findMany({
    select: { id: true, username: true, fullName: true },
    orderBy: { username: 'asc' }
  });
}

// قراءة السجلات (Logs) مع الفلاتر
export async function getLogs(params: {
  page?: number; limit?: number; search?: string; userId?: string; action?: string; entity?: string;
}) {
  await requirePermission('log:view'); // حارس الصلاحيات (مهم جداً هنا)
  
  const page = params.page || 1;
  const limit = params.limit || 15;
  const skip = (page - 1) * limit;

  const where: any = {};
  
  // بحث عام في الوصف أو المعرف
  if (params.search) {
    where.OR = [
      { description: { contains: params.search } },
      { entityId: { contains: params.search } }
    ];
  }
  
  if (params.userId) where.userId = params.userId;
  if (params.action) where.action = params.action;
  if (params.entity) where.entity = params.entity;

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true, fullName: true } } } // باش نجيبو اسم اللي دار الحركة
    }),
    prisma.auditLog.count({ where })
  ]);

  return { data, total, page, totalPages: Math.ceil(total / limit) };
}