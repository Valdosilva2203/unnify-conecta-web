import { LayoutEmpresa } from '@/components/app/LayoutEmpresa';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <LayoutEmpresa>{children}</LayoutEmpresa>;
}
