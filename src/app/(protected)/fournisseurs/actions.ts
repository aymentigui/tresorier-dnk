'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// Zod Schema: باش نفيريفيو بلي المعلومات اللي دخلها المستخد صحيحة
const fournisseurSchema = z.object({
  nom: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  activite: z.string().optional(),
});

// 1. قراءة الموردين (مع البحث والصفحات - Pagination)
export async function getFournisseurs(page = 1, search = '', limit = 10) {
  await requirePermission('fournisseur:view'); // حارس الصلاحية
  
  const skip = (page - 1) * limit;
  const where = search ? {
    OR: [
      { nom: { contains: search } },
      { activite: { contains: search } },
    ]
  } : {};

  // نجيبو الداتا والعدد الإجمالي في نفس الوقت (للتسريع)
  const [data, total] = await Promise.all([
    prisma.fournisseur.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.fournisseur.count({ where })
  ]);

  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

// 2. إضافة مورد جديد
export async function createFournisseur(formData: FormData) {
  await requirePermission('fournisseur:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const nom = formData.get('nom') as string;
  const activite = formData.get('activite') as string;

  const validation = fournisseurSchema.safeParse({ nom, activite });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const exists = await prisma.fournisseur.findUnique({ where: { nom } });
    if (exists) return { error: "Ce fournisseur existe déjà." };

    const newFournisseur = await prisma.fournisseur.create({
      data: { nom, activite }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'Fournisseur',
      entityId: newFournisseur.id,
      description: `Création du fournisseur: ${nom}`,
      userId: session?.userId,
      username: session?.username,
      after: newFournisseur
    });

    revalidatePath('/fournisseurs'); // باش تتحدث الصفحة أوتوماتيكياً
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création." };
  }
}

// 3. تعديل مورد موجود
export async function updateFournisseur(id: string, formData: FormData) {
  await requirePermission('fournisseur:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const nom = formData.get('nom') as string;
  const activite = formData.get('activite') as string;

  const validation = fournisseurSchema.safeParse({ nom, activite });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const oldData = await prisma.fournisseur.findUnique({ where: { id } });
    if (!oldData) return { error: "Fournisseur introuvable." };

    const updated = await prisma.fournisseur.update({
      where: { id },
      data: { nom, activite }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'Fournisseur',
      entityId: id,
      description: `Modification du fournisseur: ${nom}`,
      userId: session?.userId,
      username: session?.username,
      before: oldData,
      after: updated
    });

    revalidatePath('/fournisseurs');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. حذف مورد
export async function deleteFournisseur(id: string) {
  await requirePermission('fournisseur:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const oldData = await prisma.fournisseur.findUnique({ where: { id } });
    if (!oldData) return { error: "Fournisseur introuvable." };

    await prisma.fournisseur.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'Fournisseur',
      entityId: id,
      description: `Suppression du fournisseur: ${oldData.nom}`,
      userId: session?.userId,
      username: session?.username,
      before: oldData
    });

    revalidatePath('/fournisseurs');
    return { success: true };
  } catch (error) {
    // إذا كان المورد مربوط بشيكات، MySQL راح ترفض الحذف ونبعتو هاد الإيرور
    return { error: "Impossible de supprimer ce fournisseur (il a des chèques liés)." };
  }
}