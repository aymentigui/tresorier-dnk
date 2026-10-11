'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const factureSchema = z.object({
  numero: z.string().min(1, "Le numéro de facture est requis"),
  designation: z.string().optional(),
  description: z.string().optional(),
  date: z.string().min(1, "La date est requise"),
  montant: z.coerce.number().positive("Le montant doit être supérieur à 0"),
  fournisseurId: z.string().min(1, "Le fournisseur est requis"),
  bonCommandeId: z.string().optional().nullable(),
  contratId: z.string().optional().nullable(),
});

// 1. جلب المستندات (BC & Contrats) الخاصة بمورد معين للفورميلار
export async function getDocsForFournisseur(fournisseurId: string) {
  if (!fournisseurId) return { bonsCommandes: [], contrats: [] };
  
  const [bonsCommandes, contrats] = await Promise.all([
    prisma.bonCommande.findMany({ where: { fournisseurId }, select: { id: true, numero: true } }),
    prisma.contrat.findMany({ where: { fournisseurId, isActive: true }, select: { id: true, numero: true } })
  ]);
  return { bonsCommandes, contrats };
}

// 2. جلب تفاصيل فاتورة (الشيكات المرتبطة)
export async function getFactureDetails(id: string) {
  await requirePermission('facture:view');
  
  const facture = await prisma.facture.findUnique({
    where: { id },
    include: {
      fournisseur: { select: { nom: true } },
      bonCommande: { select: { id: true, numero: true, designation: true } },
      contrat: { select: { id: true, numero: true, designation: true } },
      cheques: {
        orderBy: { dateCreation: 'desc' }
      }
    }
  });

  if (!facture) return null;

  return {
    ...facture,
    montant: Number(facture.montant),
    pourcentage: Number(facture.pourcentage),
    cheques: facture.cheques.map(c => ({ ...c, montant: Number(c.montant) }))
  };
}

// 3. إضافة فاتورة
export async function createFacture(formData: FormData) {
  await requirePermission('facture:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data: Record<string, any> = Object.fromEntries(formData.entries());
  
  if (data.rattachement === 'BC') data.contratId = null;
  else if (data.rattachement === 'CONTRAT') data.bonCommandeId = null;
  else { data.bonCommandeId = null; data.contratId = null; }

  const validation = factureSchema.safeParse(data);
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const exists = await prisma.facture.findUnique({ where: { numero: validation.data.numero } });
    if (exists) return { error: "Ce numéro de facture existe déjà." };

    const newFacture = await prisma.facture.create({
      data: {
        numero: validation.data.numero,
        designation: validation.data.designation || null,
        description: validation.data.description || null,
        date: new Date(validation.data.date),
        montant: validation.data.montant,
        fournisseurId: validation.data.fournisseurId,
        bonCommandeId: validation.data.bonCommandeId || null,
        contratId: validation.data.contratId || null,
        statut: 'EN_ATTENTE',
        pourcentage: 0
      }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'Facture',
      entityId: newFacture.id,
      description: `Création de la facture N° ${newFacture.numero}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/factures');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création." };
  }
}

// 4. تعديل فاتورة
export async function updateFacture(id: string, formData: FormData) {
  await requirePermission('facture:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data: Record<string, any> = Object.fromEntries(formData.entries());
  
  if (data.rattachement === 'BC') data.contratId = null;
  else if (data.rattachement === 'CONTRAT') data.bonCommandeId = null;
  else { data.bonCommandeId = null; data.contratId = null; }

  const validation = factureSchema.safeParse(data);
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const oldFacture = await prisma.facture.findUnique({ 
      where: { id },
      include: { cheques: { where: { statut: { not: 'ANNULE' } } } }
    });
    if (!oldFacture) return { error: "Facture introuvable." };

    // 💡 الحماية 1: منع تبديل المورد إذا كان هناك شيكات مدفوعة
    if (oldFacture.fournisseurId !== validation.data.fournisseurId && oldFacture.cheques.length > 0) {
      return { error: "Impossible de changer le fournisseur : Cette facture possède déjà des chèques de règlement liés." };
    }

    const exists = await prisma.facture.findFirst({ where: { numero: validation.data.numero, NOT: { id } } });
    if (exists) return { error: "Ce numéro de facture est déjà utilisé." };

    // 💡 الحماية 2: إعادة حساب نسبة الدفع والحالة إذا تغير المبلغ
    const newMontant = validation.data.montant;
    const totalPaye = oldFacture.cheques.reduce((sum, c) => sum + Number(c.montant), 0);
    
    let pourcentage = newMontant > 0 ? (totalPaye / newMontant) * 100 : 0;
    pourcentage = Math.min(Math.max(pourcentage, 0), 100);

    let statut: 'PAYEE' | 'PARTIELLEMENT_PAYEE' | 'EN_ATTENTE' = 'EN_ATTENTE';
    if (pourcentage >= 100) statut = 'PAYEE';
    else if (pourcentage > 0) statut = 'PARTIELLEMENT_PAYEE';

    const updated = await prisma.facture.update({
      where: { id },
      data: {
        numero: validation.data.numero,
        designation: validation.data.designation || null,
        description: validation.data.description || null,
        date: new Date(validation.data.date),
        montant: newMontant,
        fournisseurId: validation.data.fournisseurId,
        bonCommandeId: validation.data.bonCommandeId || null,
        contratId: validation.data.contratId || null,
        pourcentage, // تحديث النسبة
        statut       // تحديث الحالة
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'Facture',
      entityId: id,
      description: `Modification de la facture N° ${updated.numero}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/factures');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 5. حذف فاتورة
export async function deleteFacture(id: string) {
  await requirePermission('facture:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const facture = await prisma.facture.findUnique({ 
      where: { id },
      include: { _count: { select: { cheques: true } } }
    });
    if (!facture) return { error: "Facture introuvable." };

    // 💡 الحماية 3: منع الحذف إذا كانت هناك شيكات
    if (facture._count.cheques > 0) {
      return { error: "Impossible de supprimer : Cette facture contient des chèques de règlement. Veuillez annuler ou supprimer les chèques d&aposabord." };
    }

    await prisma.facture.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'Facture',
      entityId: id,
      description: `Suppression de la facture N° ${facture.numero}`,
      userId: session?.userId,
      username: session?.username,
    });

    revalidatePath('/factures');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la suppression." };
  }
}


// أضف هذه الدوال في أعلى الملف لجلب القوائم للـ Combobox
export async function getFournisseursList() {
  return await prisma.fournisseur.findMany({ select: { id: true, nom: true }, orderBy: { nom: 'asc' } });
}
export async function getBonsCommandesList() {
  return await prisma.bonCommande.findMany({ select: { id: true, numero: true }, orderBy: { date: 'desc' } });
}
export async function getContratsList() {
  return await prisma.contrat.findMany({ select: { id: true, numero: true }, orderBy: { date: 'desc' } });
}

// دالة الجلب مع الفلاتر المتقدمة
export async function getFactures(params: {
  page?: number; limit?: number; search?: string; fournisseurId?: string; statut?: string;
  rattachement?: string; bonCommandeId?: string; contratId?: string;
  dateDebut?: string; dateFin?: string; montantMin?: string; montantMax?: string;
}) {
  await requirePermission('facture:view');
  const page = params.page || 1;
  const limit = params.limit || 10;
  const skip = (page - 1) * limit;

  const where: any = {};
  
  if (params.search) where.numero = { contains: params.search };
  if (params.fournisseurId) where.fournisseurId = params.fournisseurId;
  if (params.statut) where.statut = params.statut;
  
  if (params.rattachement === 'BC') where.bonCommandeId = { not: null };
  else if (params.rattachement === 'CONTRAT') where.contratId = { not: null };
  else if (params.rattachement === 'AUCUN') { where.bonCommandeId = null; where.contratId = null; }

  if (params.bonCommandeId) where.bonCommandeId = params.bonCommandeId;
  if (params.contratId) where.contratId = params.contratId;

  if (params.dateDebut || params.dateFin) {
    where.date = {};
    if (params.dateDebut) where.date.gte = new Date(params.dateDebut);
    if (params.dateFin) where.date.lte = new Date(params.dateFin);
  }

  if (params.montantMin || params.montantMax) {
    where.montant = {};
    if (params.montantMin) where.montant.gte = Number(params.montantMin);
    if (params.montantMax) where.montant.lte = Number(params.montantMax);
  }

  const [rawItems, total, aggregation] = await Promise.all([
    prisma.facture.findMany({
      where, skip, take: limit,
      include: { 
        fournisseur: { select: { nom: true } },
        bonCommande: { select: { id: true, numero: true, designation: true } },
        contrat: { select: { id: true, numero: true, designation: true } }
      },
      orderBy: { date: 'desc' }
    }),
    prisma.facture.count({ where }),
    prisma.facture.aggregate({ where, _sum: { montant: true }, _count: { id: true } })
  ]);

  const data = rawItems.map(item => {
    let displayDesignation = item.designation;
    if (!displayDesignation) {
      if (item.bonCommande?.designation) displayDesignation = item.bonCommande.designation;
      else if (item.contrat?.designation) displayDesignation = item.contrat.designation;
      else displayDesignation = 'Sans désignation';
    }

    return {
      ...item,
      montant: Number(item.montant),
      pourcentage: Number(item.pourcentage),
      displayDesignation
    };
  });

  return { 
    data, total, page, totalPages: Math.ceil(total / limit),
    summary: { totalMontant: Number(aggregation._sum.montant || 0), totalCount: aggregation._count.id }
  };
}