import { Suspense } from "react";
import LoginContent from "./login-content";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center"><p className="text-white text-lg">Carregando...</p></div>}>
      <LoginContent />
    </Suspense>
  );
}
