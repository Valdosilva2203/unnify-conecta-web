"use client";

import LayoutWrapper from "@/components/LayoutWrapper";
import { SidebarProvider } from "@/context/SidebarContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <LayoutWrapper showSidebar={true}>{children}</LayoutWrapper>
    </SidebarProvider>
  );
}
