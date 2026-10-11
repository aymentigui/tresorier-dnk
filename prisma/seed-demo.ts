import { prisma } from "../src/lib/prisma"

async function main() {
  console.log('🧹 Nettoyage des anciennes données opérationnelles...');
  // نمسحو البيانات القديمة باش مايصرلش تداخل (ما نمسحوش الـ Users والـ Permissions)
  await prisma.cheque.deleteMany({});
  await prisma.encaissement.deleteMany({});
  await prisma.facture.deleteMany({});
  await prisma.bonCommande.deleteMany({});
  await prisma.contrat.deleteMany({});
  await prisma.fournisseur.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.frais.deleteMany({});

  console.log('🚀 Génération des données de Démonstration (Présentation)...');

  // 1. Création des Fournisseurs
  const f1 = await prisma.fournisseur.create({
    data: { nom: 'Sarl Auto-Pièces (Maintenance Bus)', activite: 'Pièces de rechange', cumulMontant: 4500000, seuilActive: true, seuil: 5000000 }
  });
  
  const f2 = await prisma.fournisseur.create({
    data: { nom: 'Eurl Tech Informatique', activite: 'Matériel IT', cumulMontant: 120000, seuilActive: false }
  });

  const f3 = await prisma.fournisseur.create({
    data: { nom: 'Assurances XYZ', activite: 'Assurance Flotte', cumulMontant: 0, seuilActive: true, seuil: 10000000 }
  });

  // 2. Création des Clients
  const c1 = await prisma.client.create({
    data: { nom: "Université d&aposalger 3" }
  });

  // 3. Création des Contrats
  const contrat1 = await prisma.contrat.create({
    data: { 
      numero: 'CTR-2026-001', fournisseurId: f1.id, montant: 5000000, 
      date: new Date('2026-01-10'), seuilActive: true, seuil: 4000000, isActive: true,
      designation: 'Maintenance préventive des bus étudiants'
    }
  });

  // 4. Création des Bons de Commandes
  const bc1 = await prisma.bonCommande.create({
    data: { numero: 'BC-2026-045', fournisseurId: f2.id, montant: 150000, date: new Date('2026-03-15'), designation: 'Achat serveurs et câblage' }
  });

  // 5. Création des Factures
  // Facture 1 : Liée au Contrat (Presque payée)
  const fac1 = await prisma.facture.create({
    data: { 
      numero: 'FACT-26-112', fournisseurId: f1.id, contratId: contrat1.id, 
      montant: 3800000, date: new Date('2026-02-05'), statut: 'PARTIELLEMENT_PAYEE', pourcentage: 50,
      designation: 'Révision flotte 1er Trimestre'
    }
  });

  // Facture 2 : Liée au BC (Payée)
  const fac2 = await prisma.facture.create({
    data: { 
      numero: 'FACT-IT-009', fournisseurId: f2.id, bonCommandeId: bc1.id, 
      montant: 150000, date: new Date('2026-03-20'), statut: 'PAYEE', pourcentage: 100,
      designation: 'Facture globale matériel IT'
    }
  });

  // 6. Création des Chèques
  await prisma.cheque.createMany({
    data: [
      // Chèques pour f1 (Facture 1)
      { numeroCheque: 'CHQ-998877', fournisseurId: f1.id, factureId: fac1.id, montant: 1900000, dateCreation: new Date('2026-02-15'), type: 'BANQUE', statut: 'DECAISSE', dateDecaissement: new Date('2026-02-18') },
      { numeroCheque: 'CHQ-998878', fournisseurId: f1.id, factureId: fac1.id, montant: 1900000, dateCreation: new Date('2026-04-01'), type: 'BANQUE', statut: 'EN_CIRCULATION' }, // Ce chèque fera péter le seuil à 90% dans le dashboard !
      
      // Chèque pour f2 (Facture 2)
      { numeroCheque: 'CHQ-112233', fournisseurId: f2.id, factureId: fac2.id, montant: 150000, dateCreation: new Date('2026-03-22'), type: 'BANQUE', statut: 'DECAISSE', dateDecaissement: new Date('2026-03-25') },
      
      // Chèque Annulé
      { numeroCheque: 'CHQ-555666', fournisseurId: f3.id, montant: 50000, dateCreation: new Date('2026-01-05'), type: 'SIMPLE', statut: 'ANNULE', commentaire: 'Erreur de frappe sur le montant' }
    ]
  });

  // 7. Création des Encaissements
  await prisma.encaissement.create({
    data: { montant: 1500000, clientId: c1.id, dateCreation: new Date('2026-04-10'), dateEncaissement: new Date('2026-04-12'), reference: 'Virement Trésor Public' }
  });

  // 8. Création des Frais (Taxes/Virements) - تم التصحيح هنا
  await prisma.frais.create({
    data: { nom: 'Frais bancaires mensuels', montant: 15000, type: 'TAX', dateCreation: new Date('2026-04-01') }
  });

  console.log('✅ Base de données remplie avec succès pour la Démo !');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });