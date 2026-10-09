"use client";

import { GalleryVerticalEnd } from "lucide-react";
import { SignupForm } from "@/components/signup-form";

export function AuthPanel() {
  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 lg:p-10 bg-background flex flex-col justify-between">
      <div className="flex justify-center gap-2 md:justify-start mb-4">
        <a href="#" className="flex items-center gap-2 font-medium text-foreground">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEnd className="size-4" />
          </div>
          NextKinHR
        </a>
      </div>

      <div className="flex flex-1 items-center justify-center py-2">
        <div className="w-full max-w-sm">
          <SignupForm />
        </div>
      </div>

      <div className="text-center md:text-left text-xs text-muted-foreground mt-4">
        © {new Date().getFullYear()} NextKinHR. All rights reserved.
      </div>
    </div>
  );
}
