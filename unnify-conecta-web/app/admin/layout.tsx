import { GuardaAdmin } from '@/components/admin/GuardaAdmin';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <GuardaAdmin>{children}</GuardaAdmin>;
}
