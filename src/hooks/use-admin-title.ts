import { useEffect } from "react";

export function useAdminTitle(pageName: string) {
  useEffect(() => {
    document.title = `${pageName} - Admin`;
    
    // Cleanup function to reset title when component unmounts
    return () => {
      document.title = "Admin";
    };
  }, [pageName]);
}

