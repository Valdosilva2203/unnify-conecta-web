import { LayoutContador } from '@/components/contador/LayoutContador';

export default function ContadorLayout({ children }: { children: React.ReactNode }) {
  return <LayoutContador>{children}</LayoutContador>;
}
