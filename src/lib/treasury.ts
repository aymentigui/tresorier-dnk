import { prisma } from '@/lib/prisma';

export async function getTreasuryStats() {
  // 1. نجيبو الرصيد النشط (Active Solde)
  const activeSolde = await prisma.soldeBanque.findFirst({
    where: { active: true },
    orderBy: { dateCreation: 'desc' }
  });

  // 2. نجيبو خط الائتمان (مستقل عن تاريخ الرصيد)
  // الشرط: مفعل (isActive = true) وتاريخ نهايته أكبر من أو يساوي تاريخ اليوم
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeCredit = await prisma.ligneCredit.findFirst({
    where: { 
      isActive: true,
      dateFin: { gte: today } 
    },
    orderBy: { dateCreation: 'desc' } // نجيبو الأحدث
  });
  
  const totalCredits = activeCredit ? Number(activeCredit.montant) : 0;

  if (!activeSolde) {
    return {
      hasActiveSolde: false,
      soldeActuel: 0,
      dateSolde: null,
      // إذا ماكانش رصيد بنكي مدخل، السيولة هي نفسها مبلغ خط الائتمان (إن وجد)
      disponibilite: totalCredits, 
    };
  }

  const soldeDate = activeSolde.dateCreation;
  const soldeMontant = Number(activeSolde.montant);

  // 3. تطبيق القاعدة الذهبية للشيكات:
  // - TOUS les chèques en circulation (avant ou après SB)
  // - Les chèques décaissés APRÈS (SB)
  const cheques = await prisma.cheque.aggregate({
    where: {
      OR: [
        { statut: 'EN_CIRCULATION' }, // كل الشيكات العالقة
        { 
          statut: 'DECAISSE', 
          dateDecaissement: { gt: soldeDate } // الشيكات المصروفة بعد تاريخ الرصيد
        }
      ]
    },
    _sum: { montant: true }
  });
  const totalChequesADeduire = Number(cheques._sum.montant || 0);

  // 4. Frais après solde
  const frais = await prisma.frais.aggregate({
    where: { dateCreation: { gt: soldeDate } },
    _sum: { montant: true }
  });
  const totalFrais = Number(frais._sum.montant || 0);

  // 5. Encaissements après solde
  const encaissements = await prisma.encaissement.aggregate({
    where: { dateCreation: { gt: soldeDate } },
    _sum: { montant: true }
  });
  const totalEncaissements = Number(encaissements._sum.montant || 0);

  // 6. حساب السيولة (Disponibilité)
  // الرصيد + خط الائتمان + التحصيلات - الشيكات (العالقة + المصروفة بعد الرصيد) - المصاريف
  const disponibilite = soldeMontant + totalCredits + totalEncaissements - totalChequesADeduire - totalFrais;

  return {
    hasActiveSolde: true,
    soldeActuel: soldeMontant,
    dateSolde: soldeDate,
    disponibilite,
  };
}