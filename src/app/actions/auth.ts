'use server';

import { deleteSession, verifySession } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export async function logoutAction() {
  const cookie = cookies().get('session')?.value;
  const session = await verifySession(cookie);

  if (session) {
    await writeAudit({
      action: 'LOGOUT',
      entity: 'User',
      entityId: session.userId,
      description: 'Déconnexion réussie',
      userId: session.userId,
      username: session.username,
    });
  }

  deleteSession();
  redirect('/login');
}