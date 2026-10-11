import { AuditAction } from '@prisma/client';
import { prisma } from './prisma';

export async function writeAudit({
  action,
  entity,
  entityId,
  description,
  userId,
  username,
  before,
  after,
}: {
  action: AuditAction;
  entity: string;
  entityId?: string;
  description: string;
  userId?: string;
  username?: string;
  before?: any;
  after?: any;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        description,
        userId,
        username,
        before: before ? JSON.parse(JSON.stringify(before)) : null,
        after: after ? JSON.parse(JSON.stringify(after)) : null,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la création de l&aposauditLog:", error);
  }
}