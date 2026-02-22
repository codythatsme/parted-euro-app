import { Link } from "~/components/link";
import React, { Suspense } from "react";
import { MobileNav } from "./mobile-nav";
import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { CartDrawer } from "~/components/cart-drawer";
import CartButton from "./cart-button";
import AdminMenu from "./admin-menu";
import { SearchCommand } from "~/components/search";

const Nav = () => {
  return (
    <header className="sticky top-0 z-50 bg-background py-4 shadow-sm">
      <div className="container mx-auto flex items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <img
            src="/logo.png"
            alt="Parted Euro"
            width={150}
            height={40}
            className="h-auto"
            
          />
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden space-x-8 md:flex">
          <Link
            prefetch={true}
            href="/listings"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            Browse Store
          </Link>
          <Link
            prefetch={true}
            href="/wrecking"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            Cars Wrecking Now
          </Link>
          <Link
            prefetch={true}
            href="/returns-refunds"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            Warranty & Return Policy
          </Link>
          <Link
            prefetch={true}
            href="/contact"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            Contact
          </Link>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <SearchCommand />
          <CartButton />
          <Suspense fallback={null}>
            <AdminMenu />
          </Suspense>
        </div>
        <MobileNav />
      </div>

      {/* Cart Drawer */}
      <CartDrawer />
    </header>
  );
};

export default Nav;
