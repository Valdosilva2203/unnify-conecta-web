"use client";

import LayoutWrapper from "@/components/LayoutWrapper";
import { SidebarProvider } from "@/context/SidebarContext";

export default function PrefeituraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <LayoutWrapper showSidebar={false}>{children}</LayoutWrapper>
    </SidebarProvider>
  );
}
