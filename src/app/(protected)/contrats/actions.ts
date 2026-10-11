'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const contratSchema = z.object({
  numero: z.string().min(1, "Le numéro est requis"),
  designation: z.string().optional(),
  date: z.string().min(1, "La date est requise"),
  dateFin: z.string().optional().nullable(),
  montant: z.coerce.number().positive("Le montant doit être supérieur à 0"),
  montantConsommeInitial: z.coerce.number().nonnegative().optional().default(0), // <--- أضفنا الاستهلاك الأولي
  seuil: z.coerce.number().nonnegative().optional().default(0),
  seuilActive: z.boolean().default(false),
  fournisseurId: z.string().min(1, "Le fournisseur est requis"),
});

// 1. جلب تفاصيل العقد (الفواتير، الشيكات، التجديدات السابقة)
export async function getContratDetails(id: string) {
  await requirePermission('contrat:view');
  
  const contrat = await prisma.contrat.findUnique({
    where: { id },
    include: {
      fournisseur: { select: { nom: true } },
      parent: { select: { id: true, numero: true, date: true, montant: true } },
      renewals: { select: { id: true, numero: true, date: true, montant: true } },
      factures: {
        include: { cheques: { where: { statut: { not: 'ANNULE' } } } },
        orderBy: { date: 'desc' }
      }
    }
  });

  if (!contrat) return null;

  const montantContrat = Number(contrat.montant);
  const seuil = contrat.seuil ? Number(contrat.seuil) : 0;
  
  let totalChequesDuContrat = 0; 
  // 💡 الحساب الدقيق: نبدأ الحساب من الاستهلاك الأولي
  let totalFacturesDuContrat = Number(contrat.montantConsommeInitial || 0);

  let facturesDetails = contrat.factures.map(f => {
    const montantFacture = Number(f.montant);
    // نجمع الشيكات الحقيقية للفاتورة
    const totalChequesFacture = f.cheques.reduce((sum, c) => sum + Number(c.montant), 0);
    const pourcentage = montantFacture > 0 ? (totalChequesFacture / montantFacture) * 100 : 0;
    
    totalChequesDuContrat += totalChequesFacture; 
    totalFacturesDuContrat += montantFacture; 

    return { 
      ...f, 
      montant: montantFacture, 
      pourcentage: Math.min(pourcentage, 100), 
      paye: totalChequesFacture 
    };
  });

  const pourcentagePaiement = montantContrat > 0 ? (totalChequesDuContrat / montantContrat) * 100 : 0;
  // 💡 نسبة العتبة محسوبة الآن بدقة (الاستهلاك الأولي + الفواتير الحالية)
  const pourcentageSeuil = seuil > 0 ? (totalFacturesDuContrat / seuil) * 100 : 0;

  return {
    ...contrat,
    montant: montantContrat,
    montantConsommeInitial: Number(contrat.montantConsommeInitial || 0),
    seuil,
    totalPaye: totalChequesDuContrat,
    pourcentagePaiement: Math.min(pourcentagePaiement, 100),
    pourcentageSeuil,
    factures: facturesDetails
  };
}

// 2. إضافة عقد جديد
export async function createContrat(formData: FormData) {
  await requirePermission('contrat:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  data.seuilActive = formData.get('seuilActive') === 'on' ? 'true' : 'false';
  
  const validation = contratSchema.safeParse({ ...data, seuilActive: data.seuilActive === 'true' });
  if (!validation.success) return { error: validation.error.issues[0].message };

  if (validation.data.seuilActive && validation.data.seuil > validation.data.montant) {
    return { error: "Le seuil ne peut pas dépasser le montant du contrat." };
  }
  if (validation.data.montantConsommeInitial > validation.data.montant) {
    return { error: "Le montant consommé initialement ne peut pas dépasser le montant total du contrat." };
  }

  try {
    const exists = await prisma.contrat.findUnique({ where: { numero: validation.data.numero } });
    if (exists) return { error: "Ce numéro de contrat existe déjà." };

    const newContrat = await prisma.contrat.create({
      data: {
        numero: validation.data.numero,
        designation: validation.data.designation,
        date: new Date(validation.data.date),
        dateFin: validation.data.dateFin ? new Date(validation.data.dateFin) : null,
        montant: validation.data.montant,
        montantConsommeInitial: validation.data.montantConsommeInitial,
        seuil: validation.data.seuilActive ? validation.data.seuil : null,
        seuilActive: validation.data.seuilActive,
        fournisseurId: validation.data.fournisseurId,
        isActive: true
      }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'Contrat',
      entityId: newContrat.id,
      description: `Création du contrat N° ${newContrat.numero}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/contrats');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création." };
  }
}

// 3. تعديل عقد
export async function updateContrat(id: string, formData: FormData) {
  await requirePermission('contrat:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  data.seuilActive = formData.get('seuilActive') === 'on' ? 'true' : 'false';

  const validation = contratSchema.safeParse({ ...data, seuilActive: data.seuilActive === 'true' });
  if (!validation.success) return { error: validation.error.issues[0].message };

  if (validation.data.seuilActive && validation.data.seuil > validation.data.montant) {
    return { error: "Le seuil ne peut pas dépasser le montant du contrat." };
  }
  if (validation.data.montantConsommeInitial > validation.data.montant) {
    return { error: "Le montant consommé initialement ne peut pas dépasser le montant total du contrat." };
  }

  try {
    const oldContrat = await prisma.contrat.findUnique({ 
      where: { id }, 
      include: { _count: { select: { factures: true } } } 
    });
    if (!oldContrat) return { error: "Contrat introuvable." };

    // 💡 الحماية 1: منع تغيير المورد إذا كانت هناك فواتير مرتبطة
    if (oldContrat.fournisseurId !== validation.data.fournisseurId && oldContrat._count.factures > 0) {
      return { error: "Impossible de changer le fournisseur : Ce contrat possède déjà des factures liées." };
    }

    const updated = await prisma.contrat.update({
      where: { id },
      data: {
        numero: validation.data.numero,
        designation: validation.data.designation,
        date: new Date(validation.data.date),
        dateFin: validation.data.dateFin ? new Date(validation.data.dateFin) : null,
        montant: validation.data.montant,
        montantConsommeInitial: validation.data.montantConsommeInitial,
        seuil: validation.data.seuilActive ? validation.data.seuil : null,
        seuilActive: validation.data.seuilActive,
        fournisseurId: validation.data.fournisseurId
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'Contrat',
      entityId: id,
      description: `Modification du contrat N° ${updated.numero}`,
      userId: session?.userId,
      username: session?.username,
      before: oldContrat,
      after: updated
    });

    revalidatePath('/contrats');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. تجديد العقد (Renouvellement)
export async function renewContrat(oldId: string, formData: FormData) {
  await requirePermission('contrat:renew');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  data.seuilActive = formData.get('seuilActive') === 'on' ? 'true' : 'false';

  const validation = contratSchema.safeParse({ ...data, seuilActive: data.seuilActive === 'true' });
  if (!validation.success) return { error: validation.error.issues[0].message };

  if (validation.data.seuilActive && validation.data.seuil > validation.data.montant) {
    return { error: "Le seuil ne peut pas dépasser le montant du nouveau contrat." };
  }
  if (validation.data.montantConsommeInitial > validation.data.montant) {
    return { error: "Le montant consommé initialement ne peut pas dépasser le montant total du contrat." };
  }

  try {
    const oldContrat = await prisma.contrat.findUnique({ where: { id: oldId } });
    if (!oldContrat) return { error: "Ancien contrat introuvable." };

    const newContrat = await prisma.$transaction(async (tx) => {
      await tx.contrat.update({ where: { id: oldId }, data: { isActive: false } });

      return await tx.contrat.create({
        data: {
          numero: validation.data.numero,
          designation: validation.data.designation,
          date: new Date(validation.data.date),
          dateFin: validation.data.dateFin ? new Date(validation.data.dateFin) : null,
          montant: validation.data.montant,
          montantConsommeInitial: validation.data.montantConsommeInitial,
          seuil: validation.data.seuilActive ? validation.data.seuil : null,
          seuilActive: validation.data.seuilActive,
          fournisseurId: oldContrat.fournisseurId, 
          isActive: true,
          parentId: oldId 
        }
      });
    });

    await writeAudit({
      action: 'RENEW',
      entity: 'Contrat',
      entityId: newContrat.id,
      description: `Renouvellement du contrat N° ${oldContrat.numero} vers le nouveau contrat N° ${newContrat.numero}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/contrats');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors du renouvellement." };
  }
}

// 5. حذف عقد
export async function deleteContrat(id: string) {
  await requirePermission('contrat:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const contrat = await prisma.contrat.findUnique({ 
      where: { id },
      include: { factures: { include: { _count: { select: { cheques: true } } } } }
    });
    if (!contrat) return { error: "Contrat introuvable." };

    // 💡 الحماية 2: التحقق من وجود شيكات مدفوعة في الفواتير المربوطة
    const hasCheques = contrat.factures.some(f => f._count.cheques > 0);
    if (hasCheques) {
      return { error: "Impossible de supprimer ! Ce Contrat contient des factures qui ont déjà des chèques de règlement." };
    }

    await prisma.contrat.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'Contrat',
      entityId: id,
      description: `Suppression du contrat N° ${contrat.numero} (Toutes les factures associées ont été supprimées)`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/contrats');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la suppression." };
  }
}

export async function getFournisseursList() {
  return await prisma.fournisseur.findMany({ select: { id: true, nom: true }, orderBy: { nom: 'asc' } });
}

export async function getContrats(params: {
  page?: number; limit?: number; search?: string; fournisseurId?: string;
  statut?: string; dateDebutMin?: string; dateDebutMax?: string;
  dateFinMin?: string; dateFinMax?: string; montantMin?: string; montantMax?: string;
}) {
  await requirePermission('contrat:view');
  const page = params.page || 1;
  const limit = params.limit || 10;
  const skip = (page - 1) * limit;

  const where: any = {};
  
  if (params.search) where.numero = { contains: params.search };
  if (params.fournisseurId) where.fournisseurId = params.fournisseurId;
  if (params.statut) {
    if (params.statut === 'ACTIF') where.isActive = true;
    else if (params.statut === 'ARCHIVE') where.isActive = false;
  }

  if (params.dateDebutMin || params.dateDebutMax) {
    where.date = {};
    if (params.dateDebutMin) where.date.gte = new Date(params.dateDebutMin);
    if (params.dateDebutMax) where.date.lte = new Date(params.dateDebutMax);
  }

  if (params.dateFinMin || params.dateFinMax) {
    where.dateFin = {};
    if (params.dateFinMin) where.dateFin.gte = new Date(params.dateFinMin);
    if (params.dateFinMax) where.dateFin.lte = new Date(params.dateFinMax);
  }

  if (params.montantMin || params.montantMax) {
    where.montant = {};
    if (params.montantMin) where.montant.gte = Number(params.montantMin);
    if (params.montantMax) where.montant.lte = Number(params.montantMax);
  }

  const [rawItems, total, aggregation] = await Promise.all([
    prisma.contrat.findMany({
      where, skip, take: limit,
      include: { fournisseur: { select: { nom: true } }, _count: { select: { factures: true } }, parent: { select: { numero: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.contrat.count({ where }),
    prisma.contrat.aggregate({ where, _sum: { montant: true }, _count: { id: true } })
  ]);

  const data = rawItems.map(item => ({ 
    ...item, 
    montant: Number(item.montant), 
    montantConsommeInitial: Number(item.montantConsommeInitial || 0),
    seuil: item.seuil ? Number(item.seuil) : 0 
  }));

  return { 
    data, total, page, totalPages: Math.ceil(total / limit),
    summary: { totalMontant: Number(aggregation._sum.montant || 0), totalCount: aggregation._count.id }
  };
}