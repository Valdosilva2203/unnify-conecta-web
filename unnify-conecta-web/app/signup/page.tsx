'use client';

import { AuthLayout } from '@/components/AuthLayout';
import { SignupLeftSide } from '@/components/SignupLeftSide';
import { SignupForm } from '@/components/SignupForm';

export default function SignupPage() {
  return <AuthLayout leftSide={<SignupLeftSide />} rightSide={<SignupForm />} />;
}
