'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// جلب قائمة الصلاحيات المتوفرة في النظام (باش نخيرو منها)
export async function getPermissionsList() {
  return await prisma.permission.findMany({
    orderBy: { code: 'asc' }
  });
}

// 1. قراءة الأدوار
export async function getRoles(page = 1, search = '', limit = 10) {
  // await requirePermission('role:view'); // مؤقتا تقدر توقفو إذا ماعندكش دور بصلاحية
  
  const skip = (page - 1) * limit;
  const where = search ? { name: { contains: search } } : {};

  const [data, total] = await Promise.all([
    prisma.role.findMany({
      where,
      skip,
      take: limit,
      include: { permissions: { select: { id: true, code: true } } }, // نجيبو الصلاحيات المربوطة
      orderBy: { name: 'asc' }
    }),
    prisma.role.count({ where })
  ]);

  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

// 2. إضافة دور جديد
export async function createRole(formData: FormData) {
  // await requirePermission('role:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  const permissionIds = formData.getAll('permissions') as string[];

  try {
    const exists = await prisma.role.findFirst({ where: { name } });
    if (exists) return { error: "Ce rôle existe déjà." };

    const newRole = await prisma.role.create({
      data: {
        name,
        description,
        permissions: { connect: permissionIds.map(id => ({ id })) }
      }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'Role',
      entityId: newRole.id,
      description: `Création du rôle: ${name}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/roles');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création du rôle." };
  }
}

// 3. تعديل دور
export async function updateRole(id: string, formData: FormData) {
  // await requirePermission('role:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  const permissionIds = formData.getAll('permissions') as string[];

  try {
    const updated = await prisma.role.update({
      where: { id },
      data: {
        name,
        description,
        permissions: { set: permissionIds.map(id => ({ id })) } // set: تمسح القدام ودير الجدد
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'Role',
      entityId: id,
      description: `Modification du rôle: ${name}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/roles');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. حذف دور
export async function deleteRole(id: string) {
  // await requirePermission('role:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    await prisma.role.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'Role',
      entityId: id,
      description: `Suppression d&aposun rôle`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/roles');
    return { success: true };
  } catch (error) {
    return { error: "Impossible de supprimer ce rôle (Il est peut-être assigné à des utilisateurs)." };
  }
}