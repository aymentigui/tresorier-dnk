import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"

const secretKey = process.env.JWT_SECRET || "fallback_secret_key"

const encodedKey = new TextEncoder().encode(secretKey)

// ============================================================
// إنشاء الجلسة (Session)
// ============================================================

export async function createSession(
  userId: string,
  username: string
) {
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  )

  const session = await new SignJWT({
    userId,
    username,
  })
    .setProtectedHeader({
      alg: "HS256",
    })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey)

  const cookieStore = await cookies()

  cookieStore.set("session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })
}

// ============================================================
// التحقق من الجلسة
// ============================================================

export async function verifySession(
  session: string | undefined = ""
) {
  try {
    if (!session) {
      return null
    }

    const { payload } = await jwtVerify(
      session,
      encodedKey,
      {
        algorithms: ["HS256"],
      }
    )

    return payload as {
      userId: string
      username: string
    }
  } catch {
    return null
  }
}

// ============================================================
// تسجيل الخروج (حذف الجلسة)
// ============================================================

export async function deleteSession() {
  const cookieStore = await cookies()

  cookieStore.delete("session")
}
