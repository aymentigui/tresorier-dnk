'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const ligneCreditSchema = z.object({
  montant: z.coerce.number().positive("Le montant doit être supérieur à 0"),
  dateCreation: z.string().min(1, "La date est requise"),
});

// 1. قراءة خطوط الائتمان
export async function getLignesCredit(page = 1, limit = 10) {
  await requirePermission('ligneCredit:view');
  
  const skip = (page - 1) * limit;

  const [rawItems, total] = await Promise.all([
    prisma.ligneCredit.findMany({
      skip,
      take: limit,
      orderBy: { dateCreation: 'desc' }
    }),
    prisma.ligneCredit.count()
  ]);

  const data = rawItems.map(item => ({
    ...item,
    montant: Number(item.montant),
  }));

  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

// 2. إضافة خط ائتمان
export async function createLigneCredit(formData: FormData) {
  await requirePermission('ligneCredit:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const montant = formData.get('montant');
  const dateCreation = formData.get('dateCreation') as string;

  const validation = ligneCreditSchema.safeParse({ montant, dateCreation });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const newLigne = await prisma.ligneCredit.create({
      data: {
        montant: validation.data.montant,
        dateCreation: new Date(validation.data.dateCreation)
      }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'LigneCredit',
      entityId: newLigne.id,
      description: `Création d'une ligne de crédit de ${montant} DA`,
      userId: session?.userId,
      username: session?.username,
      after: newLigne
    });

    revalidatePath('/lignes-credit');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création." };
  }
}

// 3. تعديل خط ائتمان
export async function updateLigneCredit(id: string, formData: FormData) {
  await requirePermission('ligneCredit:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const montant = formData.get('montant');
  const dateCreation = formData.get('dateCreation') as string;

  const validation = ligneCreditSchema.safeParse({ montant, dateCreation });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const oldData = await prisma.ligneCredit.findUnique({ where: { id } });
    if (!oldData) return { error: "Ligne de crédit introuvable." };

    const updated = await prisma.ligneCredit.update({
      where: { id },
      data: {
        montant: validation.data.montant,
        dateCreation: new Date(validation.data.dateCreation)
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'LigneCredit',
      entityId: id,
      description: `Modification de la ligne de crédit`,
      userId: session?.userId,
      username: session?.username,
      before: oldData,
      after: updated
    });

    revalidatePath('/lignes-credit');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. حذف خط ائتمان
export async function deleteLigneCredit(id: string) {
  await requirePermission('ligneCredit:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const oldData = await prisma.ligneCredit.findUnique({ where: { id } });
    if (!oldData) return { error: "Ligne de crédit introuvable." };

    await prisma.ligneCredit.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'LigneCredit',
      entityId: id,
      description: `Suppression de la ligne de crédit de ${oldData.montant} DA`,
      userId: session?.userId,
      username: session?.username,
      before: oldData
    });

    revalidatePath('/lignes-credit');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la suppression." };
  }
}