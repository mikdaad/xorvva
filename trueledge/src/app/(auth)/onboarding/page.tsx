"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  onboardingSchema,
  EMIRATES,
  ENTITY_TYPES,
  TAX_TREATMENTS,
  COA_TEMPLATES,
  type OnboardingInput,
} from "@/lib/validations/onboarding";
import { completeOnboardingAction } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type WizardStep = 1 | 2 | 3 | 4;

export default function OnboardingWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  const defaultYear = new Date().getFullYear();

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OnboardingInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(onboardingSchema) as any,
    defaultValues: {
      org_name: "",
      subscription_tier: "trial",
      trade_name: "",
      legal_name: "",
      trn: "",
      corporate_tax_trn: "",
      entity_type: "company",
      tax_treatment: "registered",
      address_line1: "",
      city: "Dubai",
      emirate: "Dubai",
      is_free_zone: false,
      free_zone_name: "",
      phone: "",
      email: "",
      fiscal_year_start: `${defaultYear}-01-01`,
      base_currency: "AED",
      coa_template: "trading",
    },
  });

  const isFreeZone = watch("is_free_zone");
  const selectedCoaTemplate = watch("coa_template");

  // Tally Prime Style Keyboard Navigation: Pressing 'Enter' inside an input moves focus to the next input element
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && e.target instanceof HTMLElement) {
      const target = e.target;
      // Allow enter on buttons or textareas normally
      if (target.tagName === "BUTTON" || target.tagName === "TEXTAREA") return;

      e.preventDefault();
      const form = formRef.current;
      if (!form) return;

      const focusable = Array.from(
        form.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), button:not([disabled])'
        )
      );
      const index = focusable.indexOf(target);
      if (index > -1 && index < focusable.length - 1) {
        focusable[index + 1].focus();
      }
    }
  };

  const nextStep = async () => {
    setError(null);
    let fieldsToValidate: (keyof OnboardingInput)[] = [];
    if (step === 1) {
      fieldsToValidate = ["org_name"];
    } else if (step === 2) {
      fieldsToValidate = [
        "trade_name",
        "legal_name",
        "trn",
        "corporate_tax_trn",
        "entity_type",
        "tax_treatment",
        "emirate",
      ];
    } else if (step === 3) {
      fieldsToValidate = ["fiscal_year_start", "base_currency", "coa_template"];
    }

    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setStep((prev) => (prev + 1) as WizardStep);
    }
  };

  const prevStep = () => {
    setError(null);
    setStep((prev) => (prev - 1) as WizardStep);
  };

  const onSubmit = async (data: OnboardingInput) => {
    setLoading(true);
    setError(null);

    const res = await completeOnboardingAction(data);

    if (!res.success) {
      setError(res.error ?? "Failed to complete onboarding.");
      setLoading(false);
      return;
    }

    setStep(4); // Success step
    setLoading(false);

    setTimeout(() => {
      router.push("/entities");
      router.refresh();
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-3xl">
        {/* Header Branding */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-600/20">
            TL
          </div>
          <div>
            <span className="text-2xl font-bold tracking-tight text-foreground">TrueLedge</span>
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              UAE Accounting & Audit
            </span>
          </div>
        </div>

        {/* Wizard Steps Progress Indicator */}
        <div className="mb-8 bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            {[
              { num: 1, title: "Practice Profile" },
              { num: 2, title: "Entity Setup (Tally)" },
              { num: 3, title: "Books & COA" },
              { num: 4, title: "Complete" },
            ].map((s, idx) => (
              <div key={s.num} className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      step === s.num
                        ? "bg-emerald-600 text-white ring-4 ring-emerald-600/20"
                        : step > s.num
                        ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/40"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s.num ? "✓" : s.num}
                  </div>
                  <span
                    className={`text-xs font-medium hidden sm:inline ${
                      step === s.num ? "text-foreground font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
                {idx < 3 && <div className={`h-0.5 flex-1 mx-2 transition-colors ${step > s.num ? "bg-emerald-600" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Wizard Card Form */}
        <Card className="border border-border shadow-xl">
          <form ref={formRef} onKeyDown={handleKeyDown} onSubmit={handleSubmit(onSubmit)}>
            {/* ------------------------------------------------------------ */}
            {/* STEP 1: Organisation Profile */}
            {/* ------------------------------------------------------------ */}
            {step === 1 && (
              <>
                <CardHeader className="border-b border-border bg-muted/20">
                  <CardTitle className="text-xl font-bold">Step 1: Organisation Profile</CardTitle>
                  <CardDescription>
                    Configure your accounting practice, corporate group, or firm profile.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {error && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="org_name" className="text-sm font-semibold">
                      Organisation / Firm Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="org_name"
                      placeholder="e.g. Al Falah Accounting & Tax Advisory"
                      {...register("org_name")}
                      autoFocus
                      className="h-10 text-base"
                    />
                    {errors.org_name && (
                      <p className="text-xs text-red-500 mt-1">{errors.org_name.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      This will act as your tenant umbrella. You can create multiple client entities under this firm.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-muted-foreground space-y-2">
                    <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <span>✓ Multi-Tenant RLS Security</span>
                    </div>
                    <p>
                      All client company data is strictly isolated using PostgreSQL Row-Level Security (RLS) with <code className="text-emerald-300">organisation_id</code> and <code className="text-emerald-300">entity_id</code>.
                    </p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button type="button" onClick={nextStep} className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer px-6">
                      Continue to Entity Setup →
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {/* ------------------------------------------------------------ */}
            {/* STEP 2: Tally-Style Entity Setup */}
            {/* ------------------------------------------------------------ */}
            {step === 2 && (
              <>
                <CardHeader className="border-b border-border bg-muted/20 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Step 2: Company Setup (Tally Prime Style)</CardTitle>
                    <CardDescription>
                      Dense, rapid entry form. Press <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Enter</kbd> to move focus to the next field.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                    Fast Data Entry
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {error && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  {/* Section: Identity */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-border pb-1">
                      1. Company Identity
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="trade_name" className="text-xs font-medium">
                          Trade Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="trade_name"
                          placeholder="e.g. Golden Gate Trading LLC"
                          {...register("trade_name")}
                          autoFocus
                          className="h-9 text-sm"
                        />
                        {errors.trade_name && (
                          <p className="text-[11px] text-red-500">{errors.trade_name.message}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="legal_name" className="text-xs font-medium">
                          Legal Name <span className="text-muted-foreground">(As per Trade License)</span>
                        </Label>
                        <Input
                          id="legal_name"
                          placeholder="e.g. Golden Gate Commercial Trading LLC"
                          {...register("legal_name")}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section: Tax & FTA Registration */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-border pb-1">
                      2. UAE FTA Tax Registration
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="trn" className="text-xs font-medium">
                          VAT TRN <span className="text-muted-foreground">(15 digits)</span>
                        </Label>
                        <Input
                          id="trn"
                          placeholder="100XXXXXXXXXXXX"
                          maxLength={15}
                          {...register("trn")}
                          className="h-9 text-sm font-mono"
                        />
                        {errors.trn && <p className="text-[11px] text-red-500">{errors.trn.message}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="corporate_tax_trn" className="text-xs font-medium">
                          Corporate Tax TRN
                        </Label>
                        <Input
                          id="corporate_tax_trn"
                          placeholder="CT-XXXXXXXXXXXX"
                          {...register("corporate_tax_trn")}
                          className="h-9 text-sm font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="tax_treatment" className="text-xs font-medium">
                          Tax Treatment
                        </Label>
                        <select
                          id="tax_treatment"
                          {...register("tax_treatment")}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-emerald-500"
                        >
                          {TAX_TREATMENTS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Section: Location & Emirate */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-border pb-1">
                      3. Jurisdiction & Location
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="entity_type" className="text-xs font-medium">
                          Entity Type
                        </Label>
                        <select
                          id="entity_type"
                          {...register("entity_type")}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-emerald-500"
                        >
                          {ENTITY_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="emirate" className="text-xs font-medium">
                          Emirate
                        </Label>
                        <select
                          id="emirate"
                          {...register("emirate")}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-emerald-500"
                        >
                          {EMIRATES.map((em) => (
                            <option key={em} value={em}>
                              {em}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="city" className="text-xs font-medium">
                          City
                        </Label>
                        <Input id="city" placeholder="e.g. Dubai" {...register("city")} className="h-9 text-sm" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="flex items-center space-x-2 pt-2">
                        <input
                          type="checkbox"
                          id="is_free_zone"
                          checked={isFreeZone}
                          onChange={(e) => setValue("is_free_zone", e.target.checked)}
                          className="h-4 w-4 rounded border-input text-emerald-600 focus:ring-emerald-500"
                        />
                        <Label htmlFor="is_free_zone" className="text-xs font-medium cursor-pointer">
                          Free Zone Company (Qualifying Free Zone Person)
                        </Label>
                      </div>

                      {isFreeZone && (
                        <div className="space-y-1.5">
                          <Label htmlFor="free_zone_name" className="text-xs font-medium">
                            Free Zone Authority Name
                          </Label>
                          <Input
                            id="free_zone_name"
                            placeholder="e.g. DMCC, JAFZA, DAFZA, DIFC"
                            {...register("free_zone_name")}
                            className="h-9 text-sm"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button type="button" variant="outline" onClick={prevStep} className="cursor-pointer">
                      ← Back
                    </Button>
                    <Button type="button" onClick={nextStep} className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer px-6">
                      Continue to Books & COA →
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {/* ------------------------------------------------------------ */}
            {/* STEP 3: Books Beginning Date & COA Template Selection */}
            {/* ------------------------------------------------------------ */}
            {step === 3 && (
              <>
                <CardHeader className="border-b border-border bg-muted/20">
                  <CardTitle className="text-xl font-bold">Step 3: Books Beginning Date & COA Template</CardTitle>
                  <CardDescription>
                    Configure fiscal year start and choose your industry-specific Chart of Accounts template.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {error && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="fiscal_year_start" className="text-sm font-semibold">
                        Financial Year Start (&quot;Books beginning from&quot;) <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="fiscal_year_start"
                        type="date"
                        {...register("fiscal_year_start")}
                        className="h-10 text-sm font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        12 monthly accounting periods + 1 year-end adjustment period will be auto-generated.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="base_currency" className="text-sm font-semibold">
                        Base Functional Currency
                      </Label>
                      <Input
                        id="base_currency"
                        value="AED - UAE Dirham"
                        disabled
                        className="h-10 text-sm font-mono bg-muted/40"
                      />
                      <p className="text-xs text-muted-foreground">
                        UAE FTA requires financial statements & journals in AED. Multi-currency supported.
                      </p>
                    </div>
                  </div>

                  {/* COA Template Selection */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Select Chart of Accounts Template</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {COA_TEMPLATES.map((tmpl) => {
                        const isSelected = selectedCoaTemplate === tmpl.value;
                        return (
                          <div
                            key={tmpl.value}
                            onClick={() => setValue("coa_template", tmpl.value)}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              isSelected
                                ? "border-emerald-500 bg-emerald-500/10 shadow-md"
                                : "border-border hover:border-emerald-500/40 hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <h4 className="text-sm font-bold text-foreground">{tmpl.name}</h4>
                              {isSelected && <Badge className="bg-emerald-600 text-white text-[10px]">Selected</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{tmpl.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button type="button" variant="outline" onClick={prevStep} className="cursor-pointer">
                      ← Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer px-8"
                    >
                      {loading ? "Initializing Organisation & Books..." : "Finish & Create Company →"}
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {/* ------------------------------------------------------------ */}
            {/* STEP 4: Success Completion */}
            {/* ------------------------------------------------------------ */}
            {step === 4 && (
              <CardContent className="py-16 text-center space-y-4">
                <div className="h-16 w-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-8 h-8">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold">Organisation & Company Created!</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Your tenant organisation, company entity, fiscal year, monthly periods, UAE tax codes, and Chart of Accounts are fully configured.
                </p>
                <p className="text-xs font-semibold text-emerald-400 animate-pulse">
                  Redirecting to Company Select Screen...
                </p>
              </CardContent>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
