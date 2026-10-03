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
      label: "Voir le journal d'audit",
      resource: "log",
    },
    {
      code: "dashboard:view",
      label: "Voir le tableau de bord",
      resource: "dashboard",
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
      where: {
        code: permission.code,
      },
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
        set: dbPermissions.map((permission) => ({
          id: permission.id,
        })),
      },
    },

    create: {
      name: "Administrateur",
      description: "Accès total au système",

      permissions: {
        connect: dbPermissions.map((permission) => ({
          id: permission.id,
        })),
      },
    },
  })

  console.log("✅ Rôle Administrateur créé/vérifié")

  // ============================================================
  // 4. UTILISATEUR ADMIN
  // ============================================================

  const password =
    process.env.SEED_ADMIN_PASSWORD || "Admin123!"

  const passwordHash = await bcrypt.hash(password, 10)

  console.log("👤 Création de l'utilisateur admin...")

  const adminUser = await prisma.user.upsert({
    where: {
      username: "admin",
    },

    update: {
      fullName: "Administrateur Système",
      mustChangePassword: true,

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
      mustChangePassword: true,

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
    process.exit(1)
  })
