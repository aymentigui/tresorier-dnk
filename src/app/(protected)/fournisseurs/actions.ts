'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const fournisseurSchema = z.object({
  nom: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  activite: z.string().optional(),
  seuil: z.coerce.number().nonnegative().optional().default(0),
  seuilActive: z.boolean().default(false),
});


// 1. Profil 360° du fournisseur (Correction des Decimals imbriqués)
export async function getFournisseurProfile(id: string) {
  await requirePermission('fournisseur:profile');
  
  const f = await prisma.fournisseur.findUnique({
    where: { id },
    include: {
      bonCommandes: { orderBy: { date: 'desc' } },
      contrats: { orderBy: { date: 'desc' }, include: { parent: true } },
      factures: { orderBy: { date: 'desc' }, include: { bonCommande: true, contrat: true } },
      cheques: { orderBy: { dateCreation: 'desc' }, include: { facture: true } }
    }
  });

  if (!f) return null;

  // جلب الأرشيف (Historique) الخاص بهذا المورد
  const logs = await prisma.auditLog.findMany({
    where: { entity: 'Fournisseur', entityId: id },
    orderBy: { createdAt: 'desc' }
  });

  return {
    ...f,
    cumulMontant: Number(f.cumulMontant),
    seuil: Number(f.seuil || 0),
    bonCommandes: f.bonCommandes.map(bc => ({ ...bc, montant: Number(bc.montant) })),
    contrats: f.contrats.map(c => ({ 
      ...c, 
      montant: Number(c.montant), 
      seuil: Number(c.seuil || 0),
      montantConsommeInitial: Number(c.montantConsommeInitial || 0)
    })),
    factures: f.factures.map(fac => ({ 
      ...fac, 
      montant: Number(fac.montant), 
      pourcentage: Number(fac.pourcentage),
      bonCommande: fac.bonCommande ? { ...fac.bonCommande, montant: Number(fac.bonCommande.montant) } : null,
      contrat: fac.contrat ? { ...fac.contrat, montant: Number(fac.contrat.montant) } : null
    })),
    cheques: f.cheques.map(chq => ({ ...chq, montant: Number(chq.montant) })),
    logs
  };
}

// 2. Création
export async function createFournisseur(formData: FormData) {
  await requirePermission('fournisseur:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  data.seuilActive = formData.get('seuilActive') === 'on' ? 'true' : 'false';

  const validation = fournisseurSchema.safeParse({ ...data, seuilActive: data.seuilActive === 'true' });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const exists = await prisma.fournisseur.findUnique({ where: { nom: validation.data.nom } });
    if (exists) return { error: "Ce fournisseur existe déjà." };

    const newF = await prisma.fournisseur.create({
      data: {
        nom: validation.data.nom,
        activite: validation.data.activite,
        seuil: validation.data.seuilActive ? validation.data.seuil : null,
        seuilActive: validation.data.seuilActive,
      }
    });

    await writeAudit({
      action: 'CREATE', entity: 'Fournisseur', entityId: newF.id,
      description: `Création du fournisseur ${newF.nom}`,
      userId: session?.userId, username: session?.username,
    });

    revalidatePath('/fournisseurs');
    return { success: true };
  } catch (error) { return { error: "Erreur lors de la création." }; }
}

// 3. Modification
export async function updateFournisseur(id: string, formData: FormData) {
  await requirePermission('fournisseur:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const data = Object.fromEntries(formData.entries());
  data.seuilActive = formData.get('seuilActive') === 'on' ? 'true' : 'false';

  const validation = fournisseurSchema.safeParse({ ...data, seuilActive: data.seuilActive === 'true' });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const exists = await prisma.fournisseur.findFirst({ where: { nom: validation.data.nom, NOT: { id } } });
    if (exists) return { error: "Ce nom est déjà utilisé." };

    const updated = await prisma.fournisseur.update({
      where: { id },
      data: {
        nom: validation.data.nom,
        activite: validation.data.activite,
        seuil: validation.data.seuilActive ? validation.data.seuil : null,
        seuilActive: validation.data.seuilActive,
      }
    });

    await writeAudit({
      action: 'UPDATE', entity: 'Fournisseur', entityId: id,
      description: `Modification du fournisseur ${updated.nom}`,
      userId: session?.userId, username: session?.username,
    });

    revalidatePath('/fournisseurs');
    return { success: true };
  } catch (error) { return { error: "Erreur lors de la modification." }; }
}

// 4. Suppression (Sécurisée)
export async function deleteFournisseur(id: string) {
  await requirePermission('fournisseur:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const f = await prisma.fournisseur.findUnique({ 
      where: { id },
      // نجيبو الكاونت (عدد) المستندات باش نفيريفيو قبل ما نمسحو
      include: {
        _count: { select: { factures: true, bonCommandes: true, contrats: true, cheques: true } }
      }
    });
    
    if (!f) return { error: "Introuvable." };

    // 💡 الحماية القصوى: منع الحذف إذا كان هناك أي أثر مالي
    if (f._count.factures > 0 || f._count.bonCommandes > 0 || f._count.contrats > 0 || f._count.cheques > 0) {
      return { error: "Impossible de supprimer : Ce fournisseur possède des documents (Factures, BC, Contrats ou Chèques). Archivez-le plutôt." };
    }

    await prisma.fournisseur.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE', entity: 'Fournisseur', entityId: id,
      description: `Suppression du fournisseur ${f.nom}`,
      userId: session?.userId, username: session?.username,
    });

    revalidatePath('/fournisseurs');
    return { success: true };
  } catch (error) { 
    return { error: "Impossible de supprimer ce fournisseur car il possède des données liées." }; 
  }
}

// 5. تصفير أو تعديل العتبة والمبلغ المتراكم للمورد
export async function manageFournisseurSeuil(id: string, formData: FormData) {
  await requirePermission('fournisseur:seuil');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const nouveauCumul = Math.max(0, Number(formData.get('cumulMontant') || 0)); // منع القيم السالبة
  const nouveauSeuil = Math.max(0, Number(formData.get('seuil') || 0));
  const seuilActive = formData.get('seuilActive') === 'on';
  const motif = formData.get('motif') as string;

  try {
    const oldF = await prisma.fournisseur.findUnique({ where: { id } });
    if (!oldF) return { error: "Fournisseur introuvable." };

    const updated = await prisma.fournisseur.update({
      where: { id },
      data: {
        cumulMontant: nouveauCumul,
        seuil: seuilActive ? nouveauSeuil : null,
        seuilActive: seuilActive,
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'Fournisseur',
      entityId: id,
      description: `Geston Cumul/Seuil : ${motif || 'Mise à jour manuelle'}`,
      userId: session?.userId,
      username: session?.username,
      before: { cumulMontant: Number(oldF.cumulMontant), seuil: Number(oldF.seuil || 0), seuilActive: oldF.seuilActive },
      after: { cumulMontant: nouveauCumul, seuil: nouveauSeuil, seuilActive }
    });

    revalidatePath('/fournisseurs');
    return { success: true };
  } catch (error) { 
    return { error: "Erreur lors de la mise à jour des montants." }; 
  }
}

// 6. القائمة المفلترة
export async function getFournisseurs(params: {
  page?: number; limit?: number; search?: string; activite?: string; alerteSeuil?: string;
}) {
  await requirePermission('fournisseur:view');
  
  const where: any = {};
  if (params.search) where.nom = { contains: params.search };
  if (params.activite) where.activite = { contains: params.activite };
  
  const allFournisseurs = await prisma.fournisseur.findMany({
    where,
    orderBy: { nom: 'asc' }
  });

  let filteredData = allFournisseurs;
  if (params.alerteSeuil === 'critique') {
    filteredData = allFournisseurs.filter(f => f.seuilActive && f.seuil && (Number(f.cumulMontant) / Number(f.seuil)) >= 0.9);
  } else if (params.alerteSeuil === 'normal') {
    filteredData = allFournisseurs.filter(f => !f.seuilActive || (f.seuilActive && f.seuil && (Number(f.cumulMontant) / Number(f.seuil)) < 0.9));
  }

  const total = filteredData.length;
  const page = params.page || 1;
  const limit = params.limit || 10;
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;

  const paginatedData = filteredData.slice(skip, skip + limit).map(item => ({
    ...item,
    cumulMontant: Number(item.cumulMontant),
    seuil: Number(item.seuil || 0)
  }));

  return { 
    data: paginatedData, 
    total, 
    page, 
    totalPages,
    summary: { totalCount: total }
  };
}