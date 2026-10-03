import Sidebar from "@/components/Sidebar"
import Topbar from "@/components/Topbar"
import { verifySession } from "@/lib/session"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Toaster } from 'sonner';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // التحقق من الجلسة
  const cookieStore = await cookies()

  const cookie = cookieStore.get("session")?.value

  const session = await verifySession(cookie)

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="flex h-screen bg-slate-50 w-full overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Topbar user={session} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <Toaster position="top-center" richColors />
    </div>
  )
}