import "dotenv/config"
import bcrypt from "bcrypt"
import { prisma } from "../src/lib/prisma"

async function main() {
  console.log("🌱 Début du seeding...")

  // ============================================================
  // 1. PERMISSIONS
  // ============================================================

  const resources = [
    "cheque",
    "encaissement",
    "fournisseur",
    "client",
    "ligneCredit",
    "frais",
    "solde",
    "user",
    "role",
    "log",
    "dashboard",
    "bonCommande",
    "contrat",
    "facture",
  ]

  const standardActions = [
    "view",
    "create",
    "update",
    "delete",
    "import",
    "export",
  ]

  const specificPermissions = [
    {
      code: "solde:activate",
      label: "Activer un solde",
      resource: "solde",
    },
    {
      code: "user:block",
      label: "Bloquer/Débloquer un utilisateur",
      resource: "user",
    },
    {
      code: "user:resetPassword",
      label: "Réinitialiser le mot de passe",
      resource: "user",
    },
    {
      code: "log:view",
      label: "Voir le journal d&aposaudit",
      resource: "log",
    },
    {
      code: "dashboard:view",
      label: "Voir le tableau de bord",
      resource: "dashboard",
    },

    {
      code: "cheque:cancel",
      label: "Annuler un chèque",
      resource: "cheque",
    },
    {
      code: "cheque:reactivate",
      label: "Réactiver un chèque annulé",
      resource: "cheque",
    },

    {
      code: "ligneCredit:activate",
      label: "Activer/Désactiver une ligne de crédit",
      resource: "ligneCredit",
    },

    {
      code: "contrat:renew",
      label: "Renouveler un contrat",
      resource: "contrat",
    },
    {
      code: "contrat:seuil",
      label: "Gérer le seuil d&aposun contrat",
      resource: "contrat",
    },

    {
      code: "fournisseur:seuil",
      label: "Gérer le seuil d&aposun fournisseur",
      resource: "fournisseur",
    },
    {
      code: "fournisseur:profile",
      label: "Accéder au profil complet 360° du fournisseur",
      resource: "fournisseur",
    },
  ]

  const allPermissions = [...specificPermissions]

  resources.forEach((resource) => {
    if (resource !== "log" && resource !== "dashboard") {
      standardActions.forEach((action) => {
        allPermissions.push({
          code: `${resource}:${action}`,
          label: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource}`,
          resource,
        })
      })
    }
  })

  console.log(`🔐 Création de ${allPermissions.length} permissions...`)

  for (const permission of allPermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        label: permission.label,
        resource: permission.resource,
      },
      create: {
        code: permission.code,
        label: permission.label,
        resource: permission.resource,
      },
    })
  }

  // ============================================================
  // 2. RÉCUPÉRER LES PERMISSIONS
  // ============================================================

  const dbPermissions = await prisma.permission.findMany()

  console.log(`✅ ${dbPermissions.length} permissions disponibles`)

  // ============================================================
  // 3. RÔLE ADMINISTRATEUR
  // ============================================================

  console.log("👑 Création du rôle Administrateur...")

  const adminRole = await prisma.role.upsert({
    where: {
      name: "Administrateur",
    },
    update: {
      description: "Accès total au système",
      permissions: {
        set: dbPermissions.map((p) => ({
          id: p.id,
        })),
      },
    },
    create: {
      name: "Administrateur",
      description: "Accès total au système",
      permissions: {
        connect: dbPermissions.map((p) => ({
          id: p.id,
        })),
      },
    },
  })

  console.log("✅ Rôle Administrateur créé/vérifié")

  // ============================================================
  // 4. UTILISATEUR ADMIN
  // ============================================================

  const password = process.env.SEED_ADMIN_PASSWORD || "Admin123!"
  const passwordHash = await bcrypt.hash(password, 10)

  console.log("👤 Création de l&aposutilisateur admin...")

  const adminUser = await prisma.user.upsert({
    where: {
      username: "admin",
    },
    update: {
      fullName: "Administrateur Système",
      mustChangePassword: false,
      roles: {
        connect: {
          id: adminRole.id,
        },
      },
    },
    create: {
      username: "admin",
      fullName: "Administrateur Système",
      passwordHash,
      mustChangePassword: false,
      roles: {
        connect: {
          id: adminRole.id,
        },
      },
    },
  })

  console.log(`✅ Utilisateur admin : ${adminUser.username}`)

  console.log("")
  console.log("🎉 Seeding terminé avec succès !")
  console.log("")
  console.log("📋 Compte administrateur")
  console.log("   Username : admin")

  if (process.env.SEED_ADMIN_PASSWORD) {
    console.log("   Password : [défini dans SEED_ADMIN_PASSWORD]")
  } else {
    console.log("   Password : Admin123!")
  }
}

main()
  .catch((error) => {
    console.error("❌ Erreur pendant le seeding :")
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })