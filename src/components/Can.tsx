import { hasPermission } from '@/lib/permissions';

export default async function Can({
  permission,
  children,
  fallback = null
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode; // واش يبان إذا ماعندوش الحق (افتراضياً والو)
}) {
  const isAllowed = await hasPermission(permission);

  if (!isAllowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}