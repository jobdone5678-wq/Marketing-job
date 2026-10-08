"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createVendor,
  updateVendor,
  type Vendor,
  type VendorFormData,
} from "@/lib/vendors";
import {
  ArrowLeftIcon,
  Building2Icon,
  BriefcaseIcon,
  UserIcon,
  GlobeIcon,
  MailIcon,
  PhoneIcon,
  DollarSignIcon,
  ShieldCheckIcon,
  StarIcon,
  SendIcon,
} from "lucide-react";

interface VendorFormProps {
  initialVendor?: Vendor | null;
  backUrl?: string;
}

export function VendorForm({
  initialVendor,
  backUrl = "/dashboard/vendors",
}: VendorFormProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  // Vendor Basic Info
  const [name, setName] = React.useState(initialVendor?.name || "");
  const [tier, setTier] = React.useState<"Tier 1" | "Tier 2" | "Tier 3" | "Preferred">(
    initialVendor?.tier || "Tier 1"
  );
  const [website, setWebsite] = React.useState(initialVendor?.website || "");
  const [headquarters, setHeadquarters] = React.useState(
    initialVendor?.headquarters || ""
  );
  const [paymentTerms, setPaymentTerms] = React.useState<
    "Net 30" | "Net 45" | "Net 60" | "Immediate"
  >(initialVendor?.payment_terms || "Net 30");
  const [agreementStatus, setAgreementStatus] = React.useState<
    "MSA Active" | "Pending NDA" | "Standard RTR" | "No Agreement"
  >(initialVendor?.agreement_status || "MSA Active");
  const [responsiveness, setResponsiveness] = React.useState<"High" | "Medium" | "Low">(
    initialVendor?.responsiveness || "High"
  );
  const [specializationsStr, setSpecializationsStr] = React.useState(
    initialVendor?.specializations.join(", ") || "Data Engineering, AWS / Cloud Migration"
  );
  const [notes, setNotes] = React.useState(initialVendor?.notes || "");

  // Primary Contact Info
  const primaryContact = initialVendor?.contacts?.[0];
  const [contactName, setContactName] = React.useState(primaryContact?.name || "");
  const [contactTitle, setContactTitle] = React.useState(
    primaryContact?.title || "Lead Technical Recruiter"
  );
  const [contactEmail, setContactEmail] = React.useState(primaryContact?.email || "");
  const [contactPhone, setContactPhone] = React.useState(primaryContact?.phone || "");
  const [contactLinkedin, setContactLinkedin] = React.useState(
    primaryContact?.linkedin_url || ""
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Vendor company name is required.");
      return;
    }
    if (!contactName.trim() || !contactEmail.trim()) {
      toast.error("Primary recruiter name and email are required.");
      return;
    }

    setLoading(true);

    const specs = specializationsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const vendorPayload: VendorFormData = {
      name: name.trim(),
      tier,
      website: website.trim() || undefined,
      headquarters: headquarters.trim() || "USA",
      payment_terms: paymentTerms,
      agreement_status: agreementStatus,
      specializations: specs.length > 0 ? specs : ["General IT Staffing"],
      responsiveness,
      rating: initialVendor?.rating || 4.8,
      total_submissions: initialVendor?.total_submissions || 0,
      active_interviews: initialVendor?.active_interviews || 0,
      placements_count: initialVendor?.placements_count || 0,
      notes: notes.trim() || undefined,
      contacts: [
        {
          id: primaryContact?.id || `c-${Date.now()}`,
          name: contactName.trim(),
          title: contactTitle.trim(),
          email: contactEmail.trim(),
          phone: contactPhone.trim(),
          linkedin_url: contactLinkedin.trim() || undefined,
          is_primary: true,
        },
      ],
    };

    try {
      if (initialVendor) {
        const { data, error } = await updateVendor(initialVendor.id, vendorPayload);
        if (error) {
          toast.error("Failed to update vendor", { description: error });
        } else if (data) {
          toast.success("Vendor Partner Updated!", {
            description: `${data.name} profile successfully updated.`,
          });
          router.push(backUrl);
        }
      } else {
        const { data, error } = await createVendor(vendorPayload);
        if (error) {
          toast.error("Failed to add vendor", { description: error });
        } else if (data) {
          toast.success("Prime Vendor Added!", {
            description: `Successfully registered ${data.name} in CRM directory.`,
          });
          router.push(backUrl);
        }
      }
    } catch {
      toast.error("An error occurred while saving the vendor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-8 max-w-5xl w-full mx-auto">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href={backUrl}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors font-medium cursor-pointer"
          >
            <ArrowLeftIcon className="size-3.5" />
            Back to Prime Vendors Directory
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">
            {initialVendor ? "Edit Vendor" : "New Prime Vendor"}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {initialVendor ? `Edit ${initialVendor.name}` : "Add Prime Vendor Partner"}
              </h1>
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs"
              >
                <Building2Icon className="size-3" />
                Vendor CRM
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Register implementation partner recruiters, MSP accounts, payment terms, and direct contacts for bench marketing.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push(backUrl)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={loading}
              onClick={handleSubmit}
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 cursor-pointer shadow-xs"
            >
              <SendIcon className="size-3.5" />
              {loading ? "Saving..." : initialVendor ? "Update Vendor" : "Save Vendor Partner"}
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left 2 Columns: Vendor Details & Agreement */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card 1: Company Overview */}
            <Card className="shadow-xs">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center gap-2">
                  <Building2Icon className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    1. Prime Vendor & Staffing Partner Details
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Company name, headquarters location, tier status, and website.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="vendorName" className="text-xs font-medium">
                      Vendor Company Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="vendorName"
                      placeholder="e.g. TEKsystems, Apex Systems, Kforce"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9 text-xs bg-background"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="tier" className="text-xs font-medium">
                      Partner Tier
                    </Label>
                    <Select
                      value={tier}
                      onValueChange={(val) =>
                        setTier(val as "Tier 1" | "Tier 2" | "Tier 3" | "Preferred")
                      }
                    >
                      <SelectTrigger id="tier" className="h-9 text-xs bg-background font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Tier 1" className="text-xs">
                          Tier 1 (Direct Prime Accounts)
                        </SelectItem>
                        <SelectItem value="Preferred" className="text-xs">
                          Preferred Partner
                        </SelectItem>
                        <SelectItem value="Tier 2" className="text-xs">
                          Tier 2 (Sub-tier Implementation)
                        </SelectItem>
                        <SelectItem value="Tier 3" className="text-xs">
                          Tier 3 (Third-Party Network)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="headquarters" className="text-xs font-medium">
                      Headquarters (City, State)
                    </Label>
                    <Input
                      id="headquarters"
                      placeholder="e.g. Hanover, MD or Dallas, TX"
                      value={headquarters}
                      onChange={(e) => setHeadquarters(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="website" className="text-xs font-medium">
                      Website / Portal URL
                    </Label>
                    <Input
                      id="website"
                      placeholder="https://www.teksystems.com"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="specializations" className="text-xs font-medium">
                    Technical Domains & Practice Areas
                  </Label>
                  <Input
                    id="specializations"
                    placeholder="e.g. Data Engineering, AWS/Cloud, Snowflake, Java Full Stack"
                    value={specializationsStr}
                    onChange={(e) => setSpecializationsStr(e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Comma-separated list of tech stacks this vendor actively hires for.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Agreement & Terms */}
            <Card className="shadow-xs">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    2. Commercial Terms & Legal Agreements
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  C2C payment schedule, signed agreements, and response velocity.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="paymentTerms" className="text-xs font-medium">
                      Payment Terms
                    </Label>
                    <Select
                      value={paymentTerms}
                      onValueChange={(val) =>
                        setPaymentTerms(val as "Net 30" | "Net 45" | "Net 60" | "Immediate")
                      }
                    >
                      <SelectTrigger id="paymentTerms" className="h-9 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Net 30" className="text-xs">
                          Net 30 (Standard)
                        </SelectItem>
                        <SelectItem value="Net 45" className="text-xs">
                          Net 45
                        </SelectItem>
                        <SelectItem value="Net 60" className="text-xs">
                          Net 60
                        </SelectItem>
                        <SelectItem value="Immediate" className="text-xs">
                          Immediate / Bi-Weekly
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="agreementStatus" className="text-xs font-medium">
                      Agreement Status
                    </Label>
                    <Select
                      value={agreementStatus}
                      onValueChange={(val) =>
                        setAgreementStatus(
                          val as "MSA Active" | "Pending NDA" | "Standard RTR" | "No Agreement"
                        )
                      }
                    >
                      <SelectTrigger id="agreementStatus" className="h-9 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MSA Active" className="text-xs">
                          MSA Active
                        </SelectItem>
                        <SelectItem value="Standard RTR" className="text-xs">
                          Standard RTR
                        </SelectItem>
                        <SelectItem value="Pending NDA" className="text-xs">
                          Pending NDA
                        </SelectItem>
                        <SelectItem value="No Agreement" className="text-xs">
                          No Agreement
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="responsiveness" className="text-xs font-medium">
                      Recruiter Responsiveness
                    </Label>
                    <Select
                      value={responsiveness}
                      onValueChange={(val) =>
                        setResponsiveness(val as "High" | "Medium" | "Low")
                      }
                    >
                      <SelectTrigger id="responsiveness" className="h-9 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="High" className="text-xs">
                          High (Quick Feedback)
                        </SelectItem>
                        <SelectItem value="Medium" className="text-xs">
                          Medium
                        </SelectItem>
                        <SelectItem value="Low" className="text-xs">
                          Low (Slow Updates)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-medium">
                    Recruiter Notes & Managed End-Client Accounts
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="List direct client accounts (e.g. Capital One, Wells Fargo, Delta Air Lines), preferred C2C rate ranges, and tips for working with their delivery team..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="text-xs bg-background"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right 1 Column: Primary Recruiter Contact */}
          <div className="space-y-6">
            <Card className="shadow-xs border-primary/20">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <UserIcon className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    Primary Recruiter Contact
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Direct recruiter handling job submissions & RTRs.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="contactName" className="text-xs font-medium">
                    Recruiter Full Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="contactName"
                    placeholder="e.g. Sarah Jenkins"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="h-9 text-xs bg-background"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactTitle" className="text-xs font-medium">
                    Job Title / Role
                  </Label>
                  <Input
                    id="contactTitle"
                    placeholder="e.g. Senior Technical Recruiter"
                    value={contactTitle}
                    onChange={(e) => setContactTitle(e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactEmail" className="text-xs font-medium">
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    placeholder="sjenkins@teksystems.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="h-9 text-xs bg-background"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactPhone" className="text-xs font-medium">
                    Direct Phone Number
                  </Label>
                  <Input
                    id="contactPhone"
                    placeholder="(415) 555-0192"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactLinkedin" className="text-xs font-medium">
                    LinkedIn Profile URL
                  </Label>
                  <Input
                    id="contactLinkedin"
                    placeholder="https://linkedin.com/in/..."
                    value={contactLinkedin}
                    onChange={(e) => setContactLinkedin(e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Quick Action Button */}
            <div className="p-4 rounded-xl border bg-card shadow-xs space-y-2.5">
              <Button
                type="submit"
                disabled={loading}
                className="w-full gap-2 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <SendIcon className="size-4" />
                {loading ? "Saving..." : initialVendor ? "Update Vendor" : "Save Vendor Partner"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(backUrl)}
                className="w-full text-xs cursor-pointer"
              >
                Cancel & Return
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
