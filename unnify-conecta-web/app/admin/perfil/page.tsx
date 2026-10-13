'use client';

import { MinhaConta } from '@/components/conta/MinhaConta';
import { AdminLayout } from '@/components/AdminLayout';

export default function MinhaContaAdminPage() {
  return (
    <AdminLayout>
      <MinhaConta />
    </AdminLayout>
  );
}
