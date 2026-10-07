'use client';

import { AuthLayout } from '@/components/AuthLayout';
import { LoginLeftSide } from '@/components/LoginLeftSide';
import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  return <AuthLayout leftSide={<LoginLeftSide />} rightSide={<LoginForm />} />;
}
