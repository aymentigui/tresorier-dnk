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
  factureId: z.string().optional().nullable(),
  commentaire: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  dateCreation: z.string().min(1, "La date de création est requise"),
  dateDecaissement: z.string().optional().nullable(),
  type: z.nativeEnum(ChequeType),
});

export async function getFournisseursList() {
  return await prisma.fournisseur.findMany({ select: { id: true, nom: true }, orderBy: { nom: 'asc' } });
}

export async function getFacturesForCheques() {
  // نجيبو غير الفواتير اللي مازال ما تخلصوش 100% باش ما نعرضوهمش كامل في الـ Select
  const factures = await prisma.facture.findMany({
    where: { statut: { not: 'PAYEE' } },
    include: { cheques: { where: { statut: { not: 'ANNULE' } } } }
  });
  
  return factures.map(f => {
    const paye = f.cheques.reduce((acc, c) => acc + Number(c.montant), 0);
    const reste = Number(f.montant) - paye;
    return { id: f.id, numero: f.numero, fournisseurId: f.fournisseurId, reste: Math.max(0, reste), montant: Number(f.montant), statut: f.statut };
  });
}

// ==========================================
// محرك التزامن المالي (Synchronization Engine)
// ==========================================
async function syncFinancials(factureId: string | null | undefined, fournisseurId: string) {
  // 1. تحديث الفاتورة (حالة الدفع والنسبة)
  if (factureId) {
    const facture = await prisma.facture.findUnique({
      where: { id: factureId },
      include: { cheques: { where: { statut: { not: 'ANNULE' } } } }
    });
    
    if (facture) {
      const totalPaye = facture.cheques.reduce((sum, c) => sum + Number(c.montant), 0);
      const montantF = Number(facture.montant);
      let pourcentage = montantF > 0 ? (totalPaye / montantF) * 100 : 0;
      
      // Sécurité: لا تفوت 100 ولا تهبط تحت 0
      pourcentage = Math.min(Math.max(pourcentage, 0), 100);

      let statut: 'PAYEE' | 'PARTIELLEMENT_PAYEE' | 'EN_ATTENTE' = 'EN_ATTENTE';
      if (pourcentage >= 100) statut = 'PAYEE';
      else if (pourcentage > 0) statut = 'PARTIELLEMENT_PAYEE';

      await prisma.facture.update({ 
        where: { id: factureId }, 
        data: { pourcentage, statut } 
      });
    }
  }

  // 2. تحديث المورد (المبلغ المتراكم - Cumul des décaissements / chèques)
  const validCheques = await prisma.cheque.aggregate({
    where: { fournisseurId, statut: { not: 'ANNULE' } },
    _sum: { montant: true }
  });
  
  await prisma.fournisseur.update({
    where: { id: fournisseurId },
    data: { cumulMontant: validCheques._sum.montant || 0 }
  });
}

export async function getContratsList() {
  return await prisma.contrat.findMany({ select: { id: true, numero: true }, orderBy: { createdAt: 'desc' } });
}

export async function getCheques(params: { 
  page?: number; limit?: number; search?: string; fournisseurId?: string; statut?: string; 
  dateEmissionDebut?: string; dateEmissionFin?: string;
  dateEncaissementDebut?: string; dateEncaissementFin?: string;
  montantMin?: string; montantMax?: string;
  factureId?: string; contratId?: string;
}) {
  await requirePermission('cheque:view');
  const page = params.page || 1;
  const limit = params.limit || 10;
  const skip = (page - 1) * limit;

  const where: any = {};
  
  if (params.search) where.numeroCheque = { contains: params.search };
  if (params.fournisseurId) where.fournisseurId = params.fournisseurId;
  if (params.factureId) where.factureId = params.factureId;
  if (params.contratId) where.facture = { contratId: params.contratId };
  
  if (params.statut) {
    if (params.statut === 'annule') where.statut = 'ANNULE';
    else if (params.statut === 'en_circulation') where.statut = 'EN_CIRCULATION';
    else if (params.statut === 'decaisse') where.statut = 'DECAISSE';
  }

  if (params.dateEmissionDebut || params.dateEmissionFin) {
    where.dateCreation = {};
    if (params.dateEmissionDebut) where.dateCreation.gte = new Date(params.dateEmissionDebut);
    if (params.dateEmissionFin) where.dateCreation.lte = new Date(params.dateEmissionFin);
  }

  if (params.dateEncaissementDebut || params.dateEncaissementFin) {
    where.dateDecaissement = {};
    if (params.dateEncaissementDebut) where.dateDecaissement.gte = new Date(params.dateEncaissementDebut);
    if (params.dateEncaissementFin) where.dateDecaissement.lte = new Date(params.dateEncaissementFin);
  }

  if (params.montantMin || params.montantMax) {
    where.montant = {};
    if (params.montantMin) where.montant.gte = Number(params.montantMin);
    if (params.montantMax) where.montant.lte = Number(params.montantMax);
  }

  const activeSolde = await prisma.soldeBanque.findFirst({ where: { active: true }, orderBy: { dateCreation: 'desc' } });

  const [rawItems, total, aggregation] = await Promise.all([
    prisma.cheque.findMany({
      where, skip, take: limit,
      include: { fournisseur: { select: { nom: true } } },
      orderBy: { dateCreation: 'desc' }
    }),
    prisma.cheque.count({ where }),
    prisma.cheque.aggregate({ where, _sum: { montant: true }, _count: { id: true } })
  ]);

  const data = rawItems.map(item => ({ ...item, montant: Number(item.montant) }));

  let totalApresSolde = 0; let countApresSolde = 0;
  if (activeSolde) {
    const apresSoldeAgg = await prisma.cheque.aggregate({
      where: { ...where, dateCreation: { gt: activeSolde.dateCreation } },
      _sum: { montant: true }, _count: { id: true }
    });
    totalApresSolde = Number(apresSoldeAgg._sum.montant || 0);
    countApresSolde = apresSoldeAgg._count.id;
  }

  return { 
    data, total, page, totalPages: Math.ceil(total / limit),
    summary: { totalMontant: Number(aggregation._sum.montant || 0), totalCount: aggregation._count.id, totalApresSolde, countApresSolde, activeSoldeDate: activeSolde?.dateCreation || null }
  };
}

export async function getChequeDetails(id: string) {
  await requirePermission('cheque:view');
  const cheque = await prisma.cheque.findUnique({
    where: { id },
    include: {
      fournisseur: { select: { nom: true } },
      facture: {
        include: {
          bonCommande: { select: { numero: true } },
          contrat: { select: { numero: true } }
        }
      }
    }
  });
  if (!cheque) return null;
  return { ...cheque, montant: Number(cheque.montant) };
}

export async function createCheque(formData: FormData) {
  await requirePermission('cheque:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  if (!data.factureId) data.factureId = null as any;

  const validation = chequeSchema.safeParse(data);
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const newCheque = await prisma.cheque.create({
      data: {
        numeroCheque: validation.data.numeroCheque,
        montant: validation.data.montant,
        fournisseurId: validation.data.fournisseurId,
        factureId: validation.data.factureId || null,
        commentaire: validation.data.commentaire || null,
        reference: validation.data.reference || null,
        dateCreation: new Date(validation.data.dateCreation),
        dateDecaissement: validation.data.dateDecaissement ? new Date(validation.data.dateDecaissement) : null,
        type: validation.data.type,
        statut: validation.data.dateDecaissement ? 'DECAISSE' : 'EN_CIRCULATION'
      }
    });

    await syncFinancials(newCheque.factureId, newCheque.fournisseurId);

    await writeAudit({ action: 'CREATE', entity: 'Cheque', entityId: newCheque.id, description: `Création du chèque N°${newCheque.numeroCheque}`, userId: session?.userId, username: session?.username });
    revalidatePath('/cheques');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création." };
  }
}

export async function updateCheque(id: string, formData: FormData) {
  await requirePermission('cheque:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  if (!data.factureId) data.factureId = null as any;

  const validation = chequeSchema.safeParse(data);
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const oldData = await prisma.cheque.findUnique({ where: { id } });
    if (!oldData) return { error: "Chèque introuvable." };

    const newStatut = oldData.statut === 'ANNULE' ? 'ANNULE' : (validation.data.dateDecaissement ? 'DECAISSE' : 'EN_CIRCULATION');

    const updated = await prisma.cheque.update({
      where: { id },
      data: {
        numeroCheque: validation.data.numeroCheque,
        montant: validation.data.montant,
        fournisseurId: validation.data.fournisseurId,
        factureId: validation.data.factureId || null,
        commentaire: validation.data.commentaire || null,
        reference: validation.data.reference || null,
        dateCreation: new Date(validation.data.dateCreation),
        dateDecaissement: validation.data.dateDecaissement ? new Date(validation.data.dateDecaissement) : null,
        type: validation.data.type,
        statut: newStatut
      }
    });

    // 💡 Synchronisation robuste après Modification
    await syncFinancials(updated.factureId, updated.fournisseurId);
    
    // Si la facture a changé, on recalcule l&aposancienne facture
    if (oldData.factureId && oldData.factureId !== updated.factureId) {
      await syncFinancials(oldData.factureId, oldData.fournisseurId);
    }
    // Si le fournisseur a changé, on recalcule l&aposancien fournisseur
    if (oldData.fournisseurId !== updated.fournisseurId) {
      await syncFinancials(null, oldData.fournisseurId);
    }

    await writeAudit({ action: 'UPDATE', entity: 'Cheque', entityId: id, description: `Modification du chèque N°${updated.numeroCheque}`, userId: session?.userId, username: session?.username });
    revalidatePath('/cheques');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

export async function cancelCheque(id: string, commentaire: string) {
  await requirePermission('cheque:cancel');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const cheque = await prisma.cheque.update({
      where: { id },
      data: { statut: 'ANNULE', dateAnnulation: new Date(), commentaire }
    });
    
    await syncFinancials(cheque.factureId, cheque.fournisseurId);
    
    await writeAudit({ action: 'CANCEL', entity: 'Cheque', entityId: id, description: `Annulation du chèque N°${cheque.numeroCheque}`, userId: session?.userId, username: session?.username });
    revalidatePath('/cheques');
    return { success: true };
  } catch (error) { return { error: "Erreur lors de l&aposannulation." }; }
}

export async function reactivateCheque(id: string) {
  await requirePermission('cheque:reactivate');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const old = await prisma.cheque.findUnique({ where: { id } });
    if (!old) return { error: "Introuvable." };
    
    const newStatut = old.dateDecaissement ? 'DECAISSE' : 'EN_CIRCULATION';
    const cheque = await prisma.cheque.update({
      where: { id },
      data: { statut: newStatut, dateAnnulation: null }
    });
    
    await syncFinancials(cheque.factureId, cheque.fournisseurId);
    
    await writeAudit({ action: 'REACTIVATE', entity: 'Cheque', entityId: id, description: `Réactivation du chèque N°${cheque.numeroCheque}`, userId: session?.userId, username: session?.username });
    revalidatePath('/cheques');
    return { success: true };
  } catch (error) { return { error: "Erreur lors de la réactivation." }; }
}

export async function deleteCheque(id: string) {
  await requirePermission('cheque:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const oldData = await prisma.cheque.findUnique({ where: { id } });
    if (!oldData) return { error: "Chèque introuvable." };

    await prisma.cheque.delete({ where: { id } });
    await syncFinancials(oldData.factureId, oldData.fournisseurId); // مزامنة بعد الحذف مباشرة

    await writeAudit({ action: 'DELETE', entity: 'Cheque', entityId: id, description: `Suppression du chèque N°${oldData.numeroCheque}`, userId: session?.userId, username: session?.username });
    revalidatePath('/cheques');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la suppression." };
  }
}