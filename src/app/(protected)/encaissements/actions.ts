'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const encaissementSchema = z.object({
  montant: z.coerce.number().positive("Le montant doit être supérieur à 0"),
  clientId: z.string().min(1, "Veuillez sélectionner un client"),
  dateCreation: z.string().min(1, "La date de création est requise"),
  dateEncaissement: z.string().optional(),
  reference: z.string().optional().nullable(),
});

// جلب العملاء للقائمة المنسدلة
export async function getClientsList() {
  return await prisma.client.findMany({
    select: { id: true, nom: true },
    orderBy: { nom: 'asc' }
  });
}

// 1. قراءة التحصيلات مع الفلاتر والمجاميع
export async function getEncaissements(params: {
  page?: number; limit?: number; search?: string; clientId?: string; statut?: string;
}) {
  await requirePermission('encaissement:view');
  
  const page = params.page || 1;
  const limit = params.limit || 10;
  const skip = (page - 1) * limit;

  const where: any = {};
  
  if (params.clientId) where.clientId = params.clientId;
  if (params.statut === 'en_circulation') where.dateEncaissement = null;
  else if (params.statut === 'encaisse') where.dateEncaissement = { not: null };

  const activeSolde = await prisma.soldeBanque.findFirst({ where: { active: true }, orderBy: { dateCreation: 'desc' } });

  const [rawItems, total, aggregation] = await Promise.all([
    prisma.encaissement.findMany({
      where,
      skip,
      take: limit,
      include: { client: { select: { nom: true } } },
      orderBy: { dateCreation: 'desc' }
    }),
    prisma.encaissement.count({ where }),
    prisma.encaissement.aggregate({
      where,
      _sum: { montant: true },
      _count: { id: true }
    })
  ]);

  const data = rawItems.map(item => ({
    ...item,
    montant: Number(item.montant),
  }));

  let totalApresSolde = 0;
  let countApresSolde = 0;
  
  if (activeSolde) {
    const apresSoldeAgg = await prisma.encaissement.aggregate({
      where: { ...where, dateCreation: { gt: activeSolde.dateCreation } },
      _sum: { montant: true },
      _count: { id: true }
    });
    totalApresSolde = Number(apresSoldeAgg._sum.montant || 0);
    countApresSolde = apresSoldeAgg._count.id;
  }

  return { 
    data, 
    total, 
    page, 
    totalPages: Math.ceil(total / limit),
    summary: {
      totalMontant: Number(aggregation._sum.montant || 0),
      totalCount: aggregation._count.id,
      totalApresSolde,
      countApresSolde,
      activeSoldeDate: activeSolde?.dateCreation || null
    }
  };
}

// 2. إضافة تحصيل
export async function createEncaissement(formData: FormData) {
  await requirePermission('encaissement:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  const validation = encaissementSchema.safeParse(data);
  
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const newEncaissement = await prisma.encaissement.create({
      data: {
        montant: validation.data.montant,
        clientId: validation.data.clientId,
        dateCreation: new Date(validation.data.dateCreation),
        dateEncaissement: validation.data.dateEncaissement ? new Date(validation.data.dateEncaissement) : null,
        reference: validation.data.reference || null,
      }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'Encaissement',
      entityId: newEncaissement.id,
      description: `Création d&aposun encaissement de ${validation.data.montant} DA`,
      userId: session?.userId,
      username: session?.username,
      after: newEncaissement
    });

    revalidatePath('/encaissements');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création." };
  }
}

// 3. تعديل تحصيل
export async function updateEncaissement(id: string, formData: FormData) {
  await requirePermission('encaissement:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  const validation = encaissementSchema.safeParse(data);
  
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const oldData = await prisma.encaissement.findUnique({ where: { id } });
    if (!oldData) return { error: "Encaissement introuvable." };

    const updated = await prisma.encaissement.update({
      where: { id },
      data: {
        montant: validation.data.montant,
        clientId: validation.data.clientId,
        dateCreation: new Date(validation.data.dateCreation),
        dateEncaissement: validation.data.dateEncaissement ? new Date(validation.data.dateEncaissement) : null,
        reference: validation.data.reference || null,
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'Encaissement',
      entityId: id,
      description: `Modification de l&aposencaissement`,
      userId: session?.userId,
      username: session?.username,
      before: oldData,
      after: updated
    });

    revalidatePath('/encaissements');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. حذف تحصيل
export async function deleteEncaissement(id: string) {
  await requirePermission('encaissement:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const oldData = await prisma.encaissement.findUnique({ where: { id } });
    if (!oldData) return { error: "Encaissement introuvable." };

    await prisma.encaissement.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'Encaissement',
      entityId: id,
      description: `Suppression d&aposun encaissement`,
      userId: session?.userId,
      username: session?.username,
      before: oldData
    });

    revalidatePath('/encaissements');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la suppression." };
  }
}