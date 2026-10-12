import { ReactNode } from 'react';

interface AuthLayoutProps {
  leftSide: ReactNode;
  rightSide: ReactNode;
}

export function AuthLayout({ leftSide, rightSide }: AuthLayoutProps) {
  return (
    // Coluna no celular: o formulário ocupa a largura toda e fica centralizado em qualquer aparelho.
    <div className="min-h-screen bg-white flex flex-col md:grid md:grid-cols-[45fr_55fr] md:grid-rows-1 md:auto-rows-max">
      {/* Left Side - 45% */}
      {leftSide}

      {/* Right Side - 55% */}
      {rightSide}
    </div>
  );
}
