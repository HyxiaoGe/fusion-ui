'use client';

import { ToastProvider, setGlobalToast, useToast } from "@/components/ui/toast";
import { useEffect } from "react";

function ToastInitializer() {
  const toastContext = useToast();
  
  useEffect(() => {
    setGlobalToast(toastContext);
  }, [toastContext]);
  
  return null;
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ToastInitializer />
      {children}
    </ToastProvider>
  );
}