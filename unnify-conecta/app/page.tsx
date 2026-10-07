import { LandingHeader } from '@/components/LandingHeader';
import { HeroSection } from '@/components/HeroSection';
import { BenefitsSection } from '@/components/BenefitsSection';
import { PricingSection } from '@/components/PricingSection';
import { FinalCTA } from '@/components/FinalCTA';

export const metadata = {
  title: 'Unnify Conecta | Sua empresa no controle',
  description:
    'Organize suas finanças, trabalhe conectado ao seu contador e tenha informações claras para tomar decisões melhores.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <LandingHeader />
      <HeroSection />
      <BenefitsSection />
      <PricingSection />
      <FinalCTA />
    </main>
  );
}
