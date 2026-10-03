'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { revalidatePath } from 'next/cache';

// جلب الأدوار (Roles) المتوفرة في قاعدة البيانات
export async function getRolesList() {
  return await prisma.role.findMany({
    orderBy: { name: 'asc' } // بدلنا nom بـ name
  });
}
// 1. قراءة المستخدمين
export async function getUsers(page = 1, search = '', limit = 10) {
  await requirePermission('user:view');
  
  const skip = (page - 1) * limit;
  const where = search ? { 
    OR: [
      { username: { contains: search } },
      { fullName: { contains: search } }
    ]
  } : {};

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: { // ما نجيبوش passwordHash للأمان
        id: true, username: true, fullName: true, 
        isBlocked: true, failedLoginAttempts: true, 
        lockedUntil: true, createdAt: true,
        roles: { select: { id: true, name: true, description: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.user.count({ where })
  ]);

  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

// 2. إضافة مستخدم جديد
export async function createUser(formData: FormData) {
  await requirePermission('user:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const username = formData.get('username') as string;
  const fullName = formData.get('fullName') as string;
  const password = formData.get('password') as string;
  const roleIds = formData.getAll('roles') as string[]; // نجيبو كامل الأدوار المحددة

  if (!username || !password || password.length < 6) {
    return { error: "Le mot de passe doit contenir au moins 6 caractères." };
  }

  try {
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return { error: "Ce nom d'utilisateur existe déjà." };

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        username,
        fullName,
        passwordHash,
        roles: {
          connect: roleIds.map(id => ({ id })) // ربط الأدوار بالمستخدم
        }
      }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'User',
      entityId: newUser.id,
      description: `Création de l'utilisateur: ${username}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/utilisateurs');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création de l'utilisateur." };
  }
}

// 3. تعديل مستخدم (مع إمكانية تغيير كلمة السر أو الأدوار)
export async function updateUser(id: string, formData: FormData) {
  await requirePermission('user:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const username = formData.get('username') as string;
  const fullName = formData.get('fullName') as string;
  const password = formData.get('password') as string;
  const roleIds = formData.getAll('roles') as string[];

  try {
    const oldData = await prisma.user.findUnique({ where: { id } });
    if (!oldData) return { error: "Utilisateur introuvable." };

    // إذا دخل كلمة سر جديدة، نشفروها، وإلا نخليو القديمة
    let passwordHash = oldData.passwordHash;
    if (password && password.length >= 6) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        username,
        fullName,
        passwordHash,
        roles: {
          set: roleIds.map(id => ({ id })) // تعويض الأدوار القديمة بالجديدة
        }
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      description: `Modification de l'utilisateur: ${username}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/utilisateurs');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. حظر أو فك حظر مستخدم (Bloquer / Débloquer)
export async function toggleBlockUser(id: string, isBlocked: boolean) {
  await requirePermission('user:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  if (session?.userId === id) {
    return { error: "Vous ne pouvez pas bloquer votre propre compte." };
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: { isBlocked }
    });

    await writeAudit({
      action: isBlocked ? 'BLOCK' : 'UNBLOCK',
      entity: 'User',
      entityId: id,
      description: `${isBlocked ? 'Blocage' : 'Déblocage'} de l'utilisateur: ${updated.username}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/utilisateurs');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de l'opération." };
  }
}

// 5. حذف مستخدم
export async function deleteUser(id: string) {
  await requirePermission('user:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  if (session?.userId === id) {
    return { error: "Vous ne pouvez pas supprimer votre propre compte." };
  }

  try {
    const oldData = await prisma.user.findUnique({ where: { id } });
    if (!oldData) return { error: "Utilisateur introuvable." };

    await prisma.user.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'User',
      entityId: id,
      description: `Suppression de l'utilisateur: ${oldData.username}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/utilisateurs');
    return { success: true };
  } catch (error) {
    return { error: "Impossible de supprimer cet utilisateur." };
  }
}