import { prisma } from '@/lib/prisma';

export async function getTreasuryStats() {
  // 1. نجيبو الرصيد النشط (Active Solde)
  const activeSolde = await prisma.soldeBanque.findFirst({
    where: { active: true },
    orderBy: { dateCreation: 'desc' }
  });

  if (!activeSolde) {
    return {
      hasActiveSolde: false,
      soldeActuel: 0,
      dateSolde: null,
      disponibilite: 0,
    };
  }

  const soldeDate = activeSolde.dateCreation;
  const soldeMontant = Number(activeSolde.montant);

  // 2. Chèques en circulation ET après solde
  const cheques = await prisma.cheque.aggregate({
    where: {
      dateDecaissement: null,
      dateCreation: { gt: soldeDate }
    },
    _sum: { montant: true }
  });
  const totalCheques = Number(cheques._sum.montant || 0);

  // 3. Frais après solde
  const frais = await prisma.frais.aggregate({
    where: { dateCreation: { gt: soldeDate } },
    _sum: { montant: true }
  });
  const totalFrais = Number(frais._sum.montant || 0);

  // 4. Lignes de crédit après solde
  const credits = await prisma.ligneCredit.aggregate({
    where: { dateCreation: { gt: soldeDate } },
    _sum: { montant: true }
  });
  const totalCredits = Number(credits._sum.montant || 0);

  // 5. Encaissements après solde
  const encaissements = await prisma.encaissement.aggregate({
    where: { dateCreation: { gt: soldeDate } },
    _sum: { montant: true }
  });
  const totalEncaissements = Number(encaissements._sum.montant || 0);

  // 6. حساب السيولة (Disponibilité)
  const disponibilite = soldeMontant - totalCheques - totalFrais + totalCredits + totalEncaissements;

  return {
    hasActiveSolde: true,
    soldeActuel: soldeMontant,
    dateSolde: soldeDate,
    disponibilite,
  };
}