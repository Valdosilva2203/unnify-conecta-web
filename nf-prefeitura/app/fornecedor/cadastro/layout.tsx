import { Suspense } from "react";
import CadastroContent from "./page";

export default function CadastroLayout() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>Carregando...</p></div>}>
      <CadastroContent />
    </Suspense>
  );
}
