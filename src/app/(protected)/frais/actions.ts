'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { FraisType } from '@prisma/client';

const fraisSchema = z.object({
  nom: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  montant: z.coerce.number().positive("Le montant doit être supérieur à 0"),
  dateCreation: z.string().min(1, "La date est requise"),
  type: z.nativeEnum(FraisType),
});

// 1. Lire les frais
export async function getFrais(page = 1, search = '', limit = 10) {
  await requirePermission('frais:view');
  
  const skip = (page - 1) * limit;
  const where = search ? { nom: { contains: search } } : {};

  const [rawItems, total] = await Promise.all([
    prisma.frais.findMany({
      where,
      skip,
      take: limit,
      orderBy: { dateCreation: 'desc' }
    }),
    prisma.frais.count({ where })
  ]);

  const data = rawItems.map(item => ({
    ...item,
    montant: Number(item.montant),
  }));

  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

// 2. Ajouter un frais
export async function createFrais(formData: FormData) {
  await requirePermission('frais:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const nom = formData.get('nom') as string;
  const montant = formData.get('montant');
  const dateCreation = formData.get('dateCreation') as string;
  const type = formData.get('type') as FraisType;

  const validation = fraisSchema.safeParse({ nom, montant, dateCreation, type });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const newFrais = await prisma.frais.create({
      data: {
        nom: validation.data.nom,
        montant: validation.data.montant,
        dateCreation: new Date(validation.data.dateCreation),
        type: validation.data.type
      }
    });

    await writeAudit({
      action: 'CREATE',
      entity: 'Frais',
      entityId: newFrais.id,
      description: `Création du frais: ${nom} (${montant} DA)`,
      userId: session?.userId,
      username: session?.username,
      after: newFrais
    });

    revalidatePath('/frais');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création du frais." };
  }
}

// 3. Modifier un frais
export async function updateFrais(id: string, formData: FormData) {
  await requirePermission('frais:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const nom = formData.get('nom') as string;
  const montant = formData.get('montant');
  const dateCreation = formData.get('dateCreation') as string;
  const type = formData.get('type') as FraisType;

  const validation = fraisSchema.safeParse({ nom, montant, dateCreation, type });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const oldData = await prisma.frais.findUnique({ where: { id } });
    if (!oldData) return { error: "Frais introuvable." };

    const updated = await prisma.frais.update({
      where: { id },
      data: {
        nom: validation.data.nom,
        montant: validation.data.montant,
        dateCreation: new Date(validation.data.dateCreation),
        type: validation.data.type
      }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'Frais',
      entityId: id,
      description: `Modification du frais: ${nom}`,
      userId: session?.userId,
      username: session?.username,
      before: oldData,
      after: updated
    });

    revalidatePath('/frais');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. Supprimer un frais
export async function deleteFrais(id: string) {
  await requirePermission('frais:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const oldData = await prisma.frais.findUnique({ where: { id } });
    if (!oldData) return { error: "Frais introuvable." };

    await prisma.frais.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'Frais',
      entityId: id,
      description: `Suppression du frais: ${oldData.nom}`,
      userId: session?.userId,
      username: session?.username,
      before: oldData
    });

    revalidatePath('/frais');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la suppression." };
  }
}