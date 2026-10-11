'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const bonCommandeSchema = z.object({
  numero: z.string().min(1, "Le numéro est requis"),
  designation: z.string().optional(),
  date: z.string().min(1, "La date est requise"),
  montant: z.coerce.number().positive("Le montant doit être supérieur à 0"),
  fournisseurId: z.string().min(1, "Le fournisseur est requis"),
});

// 1. جلب تفاصيل طلبية معينة (الفواتير، الشيكات، وحالة الدفع)
export async function getBonCommandeDetails(id: string) {
  await requirePermission('bonCommande:view');
  
  const bc = await prisma.bonCommande.findUnique({
    where: { id },
    include: {
      fournisseur: { select: { nom: true } },
      factures: {
        include: {
          cheques: { where: { statut: { not: 'ANNULE' } } } // نجيبو غير الشيكات اللي ما تأنولاتش
        },
        orderBy: { date: 'desc' }
      }
    }
  });

  if (!bc) return null;

  // الحسابات الدقيقة الخاصة بـ Fiche
  const montantBC = Number(bc.montant);
  let totalFacturesPaye = 0;
  
  let facturesDetails = bc.factures.map(f => {
    const montantFacture = Number(f.montant);
    // 💡 الحساب الدقيق: نجمع الشيكات الحقيقية بدل الاعتماد على النسبة المئوية
    const payeFacture = f.cheques.reduce((sum, c) => sum + Number(c.montant), 0);
    totalFacturesPaye += payeFacture;

    const pct = montantFacture > 0 ? (payeFacture / montantFacture) * 100 : 0;

    return {
      ...f,
      montant: montantFacture,
      pourcentage: Math.min(pct, 100),
      paye: payeFacture,
      reste: Math.max(0, montantFacture - payeFacture)
    };
  });

  const pourcentageGlobal = montantBC > 0 ? (totalFacturesPaye / montantBC) * 100 : 0;
  
  let statutGlobal = 'EN_ATTENTE';
  if (pourcentageGlobal >= 100) statutGlobal = 'PAYEE';
  else if (pourcentageGlobal > 0) statutGlobal = 'PARTIELLEMENT_PAYEE';

  return {
    ...bc,
    montant: montantBC,
    totalPaye: totalFacturesPaye,
    pourcentageGlobal: Math.min(pourcentageGlobal, 100),
    statutGlobal,
    factures: facturesDetails
  };
}

// 2. إضافة طلبية
export async function createBonCommande(formData: FormData) {
  await requirePermission('bonCommande:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  const validation = bonCommandeSchema.safeParse(data);
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const exists = await prisma.bonCommande.findUnique({ where: { numero: validation.data.numero } });
    if (exists) return { error: "Ce numéro de bon de commande existe déjà." };

    const newBc = await prisma.bonCommande.create({
      data: {
        numero: validation.data.numero,
        designation: validation.data.designation,
        date: new Date(validation.data.date),
        montant: validation.data.montant,
        fournisseurId: validation.data.fournisseurId
      }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'BonCommande',
      entityId: newBc.id,
      description: `Création du BC N° ${validation.data.numero}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/bons-commande');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création." };
  }
}

// 3. تعديل طلبية (مع حماية تبديل المورد)
export async function updateBonCommande(id: string, formData: FormData) {
  await requirePermission('bonCommande:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  const validation = bonCommandeSchema.safeParse(data);
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    // 💡 الحماية 1: التحقق من وجود فواتير قبل تغيير المورد
    const existingBc = await prisma.bonCommande.findUnique({ where: { id }, include: { _count: { select: { factures: true } } } });
    if (!existingBc) return { error: "BC introuvable." };

    if (existingBc.fournisseurId !== validation.data.fournisseurId && existingBc._count.factures > 0) {
      return { error: "Impossible de changer le fournisseur : Ce BC possède déjà des factures liées." };
    }

    const existsName = await prisma.bonCommande.findFirst({ where: { numero: validation.data.numero, NOT: { id } } });
    if (existsName) return { error: "Ce numéro de bon de commande est déjà utilisé." };

    await prisma.bonCommande.update({
      where: { id },
      data: {
        numero: validation.data.numero,
        designation: validation.data.designation,
        date: new Date(validation.data.date),
        montant: validation.data.montant,
        fournisseurId: validation.data.fournisseurId
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'BonCommande',
      entityId: id,
      description: `Modification du BC N° ${validation.data.numero}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/bons-commande');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. حذف طلبية (مع حماية الشيكات)
export async function deleteBonCommande(id: string) {
  await requirePermission('bonCommande:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const bc = await prisma.bonCommande.findUnique({ 
      where: { id },
      include: { factures: { include: { _count: { select: { cheques: true } } } } }
    });
    
    if (!bc) return { error: "Bon de commande introuvable." };

    // 💡 الحماية 2: التحقق من وجود شيكات مدفوعة في الفواتير المربوطة
    const hasCheques = bc.factures.some(f => f._count.cheques > 0);
    if (hasCheques) {
      return { error: "Impossible de supprimer ! Ce BC contient des factures qui ont déjà des chèques de règlement." };
    }

    await prisma.bonCommande.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'BonCommande',
      entityId: id,
      description: `Suppression du BC N° ${bc.numero}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/bons-commande');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la suppression." };
  }
}

// 5. دوال الجلب للفلاتر (Filtres Pro)
export async function getFournisseursList() {
  return await prisma.fournisseur.findMany({ select: { id: true, nom: true }, orderBy: { nom: 'asc' } });
}

export async function getBonsCommandes(params: {
  page?: number; limit?: number; search?: string; fournisseurId?: string;
  dateDebutMin?: string; dateDebutMax?: string; montantMin?: string; montantMax?: string;
}) {
  await requirePermission('bonCommande:view');
  const page = params.page || 1;
  const limit = params.limit || 10;
  const skip = (page - 1) * limit;

  const where: any = {};
  
  if (params.search) where.numero = { contains: params.search };
  if (params.fournisseurId) where.fournisseurId = params.fournisseurId;

  if (params.dateDebutMin || params.dateDebutMax) {
    where.date = {};
    if (params.dateDebutMin) where.date.gte = new Date(params.dateDebutMin);
    if (params.dateDebutMax) where.date.lte = new Date(params.dateDebutMax);
  }

  if (params.montantMin || params.montantMax) {
    where.montant = {};
    if (params.montantMin) where.montant.gte = Number(params.montantMin);
    if (params.montantMax) where.montant.lte = Number(params.montantMax);
  }

  const [rawItems, total, aggregation] = await Promise.all([
    prisma.bonCommande.findMany({
      where, skip, take: limit,
      include: { 
        fournisseur: { select: { nom: true } },
        _count: { select: { factures: true } }
      },
      orderBy: { date: 'desc' }
    }),
    prisma.bonCommande.count({ where }),
    prisma.bonCommande.aggregate({ where, _sum: { montant: true }, _count: { id: true } })
  ]);

  const data = rawItems.map(item => ({ ...item, montant: Number(item.montant) }));

  return { 
    data, total, page, totalPages: Math.ceil(total / limit),
    summary: { totalMontant: Number(aggregation._sum.montant || 0), totalCount: aggregation._count.id }
  };
}