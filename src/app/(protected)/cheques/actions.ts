'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { ChequeType } from '@prisma/client';

const chequeSchema = z.object({
  numeroCheque: z.string().min(1, "Le numéro du chèque est requis"),
  montant: z.coerce.number().positive("Le montant doit être supérieur à 0"),
  fournisseurId: z.string().min(1, "Veuillez sélectionner un fournisseur"),
  reference: z.string().optional(),
  dateCreation: z.string().min(1, "La date de création est requise"),
  dateDecaissement: z.string().optional(),
  type: z.nativeEnum(ChequeType),
});

// دالة لجلب الموردين للقائمة المنسدلة (Combobox)
export async function getFournisseursList() {
  return await prisma.fournisseur.findMany({
    select: { id: true, nom: true },
    orderBy: { nom: 'asc' }
  });
}

// 1. قراءة الشيكات مع الفلاتر والمجاميع
export async function getCheques(params: {
  page?: number; limit?: number; search?: string; fournisseurId?: string; statut?: string;
}) {
  await requirePermission('cheque:view');
  
  const page = params.page || 1;
  const limit = params.limit || 10;
  const skip = (page - 1) * limit;

  // بناء شروط البحث (Filters)
  const where: any = {};
  
  if (params.search) {
    where.numeroCheque = { contains: params.search };
  }
  if (params.fournisseurId) {
    where.fournisseurId = params.fournisseurId;
  }
  if (params.statut === 'en_circulation') {
    where.dateDecaissement = null;
  } else if (params.statut === 'decaisse') {
    where.dateDecaissement = { not: null };
  }

  // جلب الرصيد النشط لمعرفة الشيكات "Après solde"
  const activeSolde = await prisma.soldeBanque.findFirst({ where: { active: true }, orderBy: { dateCreation: 'desc' } });

  // جلب البيانات، العدد الإجمالي، والمجاميع في نفس الوقت
  const [rawItems, total, aggregation] = await Promise.all([
    prisma.cheque.findMany({
      where,
      skip,
      take: limit,
      include: { fournisseur: { select: { nom: true } } }, // باش نجيبو اسم المورد
      orderBy: { dateCreation: 'desc' }
    }),
    prisma.cheque.count({ where }),
    prisma.cheque.aggregate({
      where,
      _sum: { montant: true },
      _count: { id: true }
    })
  ]);

  const data = rawItems.map(item => ({
    ...item,
    montant: Number(item.montant),
  }));

  // حساب المجاميع "Après solde"
  let totalApresSolde = 0;
  let countApresSolde = 0;
  
  if (activeSolde) {
    const apresSoldeAgg = await prisma.cheque.aggregate({
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

// 2. إضافة شيك
export async function createCheque(formData: FormData) {
  await requirePermission('cheque:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  const validation = chequeSchema.safeParse(data);
  
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const newCheque = await prisma.cheque.create({
      data: {
        numeroCheque: validation.data.numeroCheque,
        montant: validation.data.montant,
        fournisseurId: validation.data.fournisseurId,
        reference: validation.data.reference || null,
        dateCreation: new Date(validation.data.dateCreation),
        dateDecaissement: validation.data.dateDecaissement ? new Date(validation.data.dateDecaissement) : null,
        type: validation.data.type
      }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'Cheque',
      entityId: newCheque.id,
      description: `Création du chèque N°${newCheque.numeroCheque}`,
      userId: session?.userId,
      username: session?.username,
      after: newCheque
    });

    revalidatePath('/cheques');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création du chèque." };
  }
}

// 3. تعديل شيك
export async function updateCheque(id: string, formData: FormData) {
  await requirePermission('cheque:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  const validation = chequeSchema.safeParse(data);
  
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const oldData = await prisma.cheque.findUnique({ where: { id } });
    if (!oldData) return { error: "Chèque introuvable." };

    const updated = await prisma.cheque.update({
      where: { id },
      data: {
        numeroCheque: validation.data.numeroCheque,
        montant: validation.data.montant,
        fournisseurId: validation.data.fournisseurId,
        reference: validation.data.reference || null,
        dateCreation: new Date(validation.data.dateCreation),
        dateDecaissement: validation.data.dateDecaissement ? new Date(validation.data.dateDecaissement) : null,
        type: validation.data.type
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'Cheque',
      entityId: id,
      description: `Modification du chèque N°${updated.numeroCheque}`,
      userId: session?.userId,
      username: session?.username,
      before: oldData,
      after: updated
    });

    revalidatePath('/cheques');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. حذف شيك
export async function deleteCheque(id: string) {
  await requirePermission('cheque:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const oldData = await prisma.cheque.findUnique({ where: { id } });
    if (!oldData) return { error: "Chèque introuvable." };

    await prisma.cheque.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'Cheque',
      entityId: id,
      description: `Suppression du chèque N°${oldData.numeroCheque}`,
      userId: session?.userId,
      username: session?.username,
      before: oldData
    });

    revalidatePath('/cheques');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la suppression." };
  }
}