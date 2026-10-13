'use client';

import { MinhaConta } from '@/components/conta/MinhaConta';
import { AdminLayout } from '@/components/AdminLayout';

export default function SegurancaPage() {
  return (
    <AdminLayout>
      <MinhaConta secaoInicial="seguranca" />
    </AdminLayout>
  );
}
