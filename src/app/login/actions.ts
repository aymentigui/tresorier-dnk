'use server';

import bcrypt from 'bcrypt';
import { createSession } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';

export async function loginAction(formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Veuillez remplir tous les champs.' };
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    return { error: 'Nom d\'utilisateur ou mot de passe incorrect.' };
  }

  if (user.isBlocked) {
    return { error: 'Ce compte est bloqué par l\'administrateur.' };
  }

  // التحقق من الحظر المؤقت (Brute-force)
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remainingTime = Math.ceil((user.lockedUntil.getTime() - new Date().getTime()) / 60000);
    return { error: `Compte verrouillé. Veuillez réessayer dans ${remainingTime} minutes.` };
  }

  // التحقق من كلمة السر
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    const newAttempts = user.failedLoginAttempts + 1;
    let lockedUntil = null;
    let errorMsg = 'Nom d\'utilisateur ou mot de passe incorrect.';

    if (newAttempts >= 10) {
      lockedUntil = new Date(Date.now() + 15 * 60000); // 15 دقيقة
      errorMsg = 'Compte verrouillé après 10 tentatives échouées. Réessayez dans 15 minutes.';
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: newAttempts, lockedUntil }
    });

    await writeAudit({
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user.id,
      description: `Échec de connexion (${newAttempts}/10 tentatives)`,
      username: user.username,
    });

    return { error: errorMsg };
  }

  // إذا كان الدخول صحيح
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null }
  });

  await writeAudit({
    action: 'LOGIN',
    entity: 'User',
    entityId: user.id,
    description: 'Connexion réussie',
    userId: user.id,
    username: user.username,
  });

  await createSession(user.id, user.username);

  return { success: true };
}