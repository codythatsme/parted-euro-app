import { redirect } from "next/navigation";
import { AppSidebar } from "~/components/app-sidebar";
import { AdminBreadcrumb } from "~/components/admin-breadcrumb";
import { Separator } from "~/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { auth } from "~/server/auth";
import { ThemeProvider } from "~/components/theme-provider";
import { type Metadata } from "next";
import { PendingOrderProvider } from "~/components/pending-order-provider";
import { PendingOrderIndicator } from "./_components/pending-order-indicator";
import { DirectOrderFinalizeDialog } from "./_components/direct-order-finalize-dialog";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user.isAdmin) {
    redirect("/");
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SidebarProvider>
        <AppSidebar
          user={{
            name: session.user.name ?? "Admin User",
            email: session.user.email ?? "admin@example.com",
            image: session.user.image ?? undefined,
          }}
        />
        <PendingOrderProvider>
          <SidebarInset className="overflow-x-hidden">
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <AdminBreadcrumb />
              </div>
              <div className="ml-auto pr-4">
                <PendingOrderIndicator />
              </div>
            </header>
            {children}
          </SidebarInset>
          <DirectOrderFinalizeDialog />
        </PendingOrderProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
}
