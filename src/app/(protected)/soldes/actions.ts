'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const soldeSchema = z.object({
  montant: z.coerce.number().positive("Le montant doit être supérieur à 0"),
  dateCreation: z.string().min(1, "La date est requise"),
});

// 1. قراءة الأرصدة
export async function getSoldes(page = 1, limit = 10) {
  await requirePermission('solde:view');
  
  const skip = (page - 1) * limit;

  const [rawItems, total] = await Promise.all([
    prisma.soldeBanque.findMany({
      skip,
      take: limit,
      orderBy: { dateCreation: 'desc' }
    }),
    prisma.soldeBanque.count()
  ]);

  const data = rawItems.map(item => ({
    ...item,
    montant: Number(item.montant),
  }));

  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

// 2. إضافة رصيد جديد (يصبح نشطاً تلقائياً ويلغي تنشيط الآخرين في Transaction)
export async function createSolde(formData: FormData) {
  await requirePermission('solde:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const montant = formData.get('montant');
  const dateCreation = formData.get('dateCreation') as string;

  const validation = soldeSchema.safeParse({ montant, dateCreation });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const newSolde = await prisma.$transaction(async (tx) => {
      // نرجعو كل الأرصدة القديمة غير نشطة
      await tx.soldeBanque.updateMany({
        where: { active: true },
        data: { active: false }
      });

      // نكرييو الرصيد الجديد ونرجعوه هو النشط
      return await tx.soldeBanque.create({
        data: {
          montant: validation.data.montant,
          dateCreation: new Date(validation.data.dateCreation),
          active: true
        }
      });
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'SoldeBanque',
      entityId: newSolde.id,
      description: `Création d'un nouveau solde de ${newSolde.montant} DA`,
      userId: session?.userId,
      username: session?.username,
      after: newSolde
    });

    revalidatePath('/soldes');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création du solde." };
  }
}

// 3. تنشيط رصيد قديم يدوياً
export async function activateSolde(id: string) {
  await requirePermission('solde:activate');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const soldeToActivate = await prisma.soldeBanque.findUnique({ where: { id } });
    if (!soldeToActivate) return { error: "Solde introuvable." };
    if (soldeToActivate.active) return { error: "Ce solde est déjà actif." };

    await prisma.$transaction(async (tx) => {
      await tx.soldeBanque.updateMany({
        where: { active: true },
        data: { active: false }
      });

      await tx.soldeBanque.update({
        where: { id },
        data: { active: true }
      });
    });

    await writeAudit({
      action: 'ACTIVATE_SOLDE',
      entity: 'SoldeBanque',
      entityId: id,
      description: `Activation du solde du ${soldeToActivate.dateCreation.toISOString().split('T')[0]}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/soldes');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de l'activation." };
  }
}

// 4. حذف رصيد
export async function deleteSolde(id: string) {
  await requirePermission('solde:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const solde = await prisma.soldeBanque.findUnique({ where: { id } });
    if (!solde) return { error: "Solde introuvable." };
    if (solde.active) return { error: "Impossible de supprimer le solde actif. Activez un autre solde d'abord." };

    await prisma.soldeBanque.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'SoldeBanque',
      entityId: id,
      description: `Suppression du solde de ${solde.montant} DA`,
      userId: session?.userId,
      username: session?.username,
      before: solde
    });

    revalidatePath('/soldes');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la suppression." };
  }
}