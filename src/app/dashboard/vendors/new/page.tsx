"use client";

import * as React from "react";
import { VendorForm } from "@/components/vendor-form";

export default function NewVendorPage() {
  return <VendorForm backUrl="/dashboard/vendors" />;
}
