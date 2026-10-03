'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { verifySession } from '@/lib/session';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const clientSchema = z.object({
  nom: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
});

// 1. قراءة العملاء
export async function getClients(page = 1, search = '', limit = 10) {
  await requirePermission('client:view');
  
  const skip = (page - 1) * limit;
  const where = search ? { nom: { contains: search } } : {};

  const [data, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.client.count({ where })
  ]);

  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

// 2. إضافة عميل
export async function createClient(formData: FormData) {
  await requirePermission('client:create');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const nom = formData.get('nom') as string;

  const validation = clientSchema.safeParse({ nom });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const exists = await prisma.client.findUnique({ where: { nom } });
    if (exists) return { error: "Ce client existe déjà." };

    const newClient = await prisma.client.create({ data: { nom } });

    await writeAudit({
      action: 'CREATE',
      entity: 'Client',
      entityId: newClient.id,
      description: `Création du client: ${nom}`,
      userId: session?.userId,
      username: session?.username,
      after: newClient
    });

    revalidatePath('/clients');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la création." };
  }
}

// 3. تعديل عميل
export async function updateClient(id: string, formData: FormData) {
  await requirePermission('client:update');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  const nom = formData.get('nom') as string;

  const validation = clientSchema.safeParse({ nom });
  if (!validation.success) return { error: validation.error.issues[0].message };

  try {
    const oldData = await prisma.client.findUnique({ where: { id } });
    if (!oldData) return { error: "Client introuvable." };

    const updated = await prisma.client.update({
      where: { id },
      data: { nom }
    });

    await writeAudit({
      action: 'UPDATE',
      entity: 'Client',
      entityId: id,
      description: `Modification du client: ${nom}`,
      userId: session?.userId,
      username: session?.username,
      before: oldData,
      after: updated
    });

    revalidatePath('/clients');
    return { success: true };
  } catch (error) {
    return { error: "Erreur lors de la modification." };
  }
}

// 4. حذف عميل
export async function deleteClient(id: string) {
  await requirePermission('client:delete');
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get('session')?.value);

  try {
    const oldData = await prisma.client.findUnique({ where: { id } });
    if (!oldData) return { error: "Client introuvable." };

    await prisma.client.delete({ where: { id } });

    await writeAudit({
      action: 'DELETE',
      entity: 'Client',
      entityId: id,
      description: `Suppression du client: ${oldData.nom}`,
      userId: session?.userId,
      username: session?.username,
      before: oldData
    });

    revalidatePath('/clients');
    return { success: true };
  } catch (error) {
    return { error: "Impossible de supprimer ce client (il a des encaissements liés)." };
  }
}