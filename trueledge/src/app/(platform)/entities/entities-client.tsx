"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  entitySchema,
  accountingSettingsSchema,
  EMIRATES,
  ENTITY_TYPES,
  TAX_TREATMENTS,
  COA_TEMPLATES,
} from "@/lib/validations/onboarding";
import { createEntityAction } from "@/lib/actions/onboarding";
import { CompanyGrid, type CompanyRow } from "./company-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";

const newCompanySchema = entitySchema.merge(accountingSettingsSchema);
type NewCompanyFormInput = z.infer<typeof newCompanySchema>;

interface EntitiesClientProps {
  organisationId: string;
  organisationName: string;
  companies: CompanyRow[];
}

export function EntitiesClient({
  organisationId,
  organisationName,
  companies,
}: EntitiesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const defaultYear = new Date().getFullYear();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<NewCompanyFormInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(newCompanySchema) as any,
    defaultValues: {
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
      books_begin_date: `${defaultYear}-01-01`,
      mailing_name: "",
      decimal_places: 2,
      base_currency: "AED",
      coa_template: "trading",
    },
  });

  const isFreeZoneModal = watch("is_free_zone");

  // Tally keyboard navigation handler for the creation modal
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && e.target instanceof HTMLElement) {
      const target = e.target;
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

  const handleCreateCompany = async (data: NewCompanyFormInput) => {
    setFormError(null);
    const res = await createEntityAction({
      ...data,
      organisation_id: organisationId,
    });

    if (!res.success) {
      setFormError(res.error ?? "Failed to create entity.");
      return;
    }

    setIsModalOpen(false);
    reset();
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner: Tally Prime Style Select Company */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border border-border p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
              {organisationName}
            </span>
            <span className="text-xs text-muted-foreground">• Firm Dashboard</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Select Company</h1>
          <p className="text-sm text-muted-foreground">
            Select a client entity to open books, or create a new company under this firm.
          </p>
        </div>

        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer shadow-md shadow-emerald-600/20 gap-2 self-start sm:self-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create New Entity
        </Button>
      </div>

      {/* Keyboard-first company grid (TanStack Table v9) */}
      <CompanyGrid companies={companies} onRequestCreate={() => setIsModalOpen(true)} />

      {/* ------------------------------------------------------------------ */}
      {/* MODAL DIALOG: Rapid Tally-Style Create New Entity */}
      {/* ------------------------------------------------------------------ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
              <div>
                <h2 className="text-lg font-bold">Create New Client Company</h2>
                <p className="text-xs text-muted-foreground">Tally Prime rapid company creation form</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Form */}
            <form ref={formRef} onKeyDown={handleKeyDown} onSubmit={handleSubmit(handleCreateCompany)} className="flex-1 overflow-y-auto p-6 space-y-6">
              {formError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {formError}
                </div>
              )}

              {/* Section 1: Company Info */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-border pb-1">
                  1. Company Identity
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="modal_trade_name" className="text-xs font-medium">Trade Name *</Label>
                    <Input id="modal_trade_name" placeholder="e.g. Al Maya Retail LLC" {...register("trade_name")} autoFocus className="h-9 text-sm" />
                    {errors.trade_name && <p className="text-[11px] text-red-500">{errors.trade_name.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modal_legal_name" className="text-xs font-medium">Legal Name</Label>
                    <Input id="modal_legal_name" placeholder="As per license" {...register("legal_name")} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modal_mailing_name" className="text-xs font-medium">Mailing Name</Label>
                    <Input id="modal_mailing_name" placeholder="For correspondence" {...register("mailing_name")} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modal_decimal_places" className="text-xs font-medium">Decimal Places</Label>
                    <select id="modal_decimal_places" {...register("decimal_places")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                      <option value="2">2 (Standard)</option>
                      <option value="4">4 (High Precision)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: FTA Tax Details */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-border pb-1">
                  2. UAE Tax Registration
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="modal_trn" className="text-xs font-medium">VAT TRN (15 digits)</Label>
                    <Input id="modal_trn" placeholder="100XXXXXXXXXXXX" maxLength={15} {...register("trn")} className="h-9 text-sm font-mono" />
                    {errors.trn && <p className="text-[11px] text-red-500">{errors.trn.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modal_ct_trn" className="text-xs font-medium">Corporate Tax TRN</Label>
                    <Input id="modal_ct_trn" placeholder="CT-XXXXXXXXXXXX" {...register("corporate_tax_trn")} className="h-9 text-sm font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modal_tax_treatment" className="text-xs font-medium">Tax Treatment</Label>
                    <select id="modal_tax_treatment" {...register("tax_treatment")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                      {TAX_TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Location */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-border pb-1">
                  3. Location & Emirate
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="modal_entity_type" className="text-xs font-medium">Entity Type</Label>
                    <select id="modal_entity_type" {...register("entity_type")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                      {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modal_emirate" className="text-xs font-medium">Emirate</Label>
                    <select id="modal_emirate" {...register("emirate")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                      {EMIRATES.map((em) => <option key={em} value={em}>{em}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modal_city" className="text-xs font-medium">City</Label>
                    <Input id="modal_city" placeholder="Dubai" {...register("city")} className="h-9 text-sm" />
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <input
                    type="checkbox"
                    id="modal_is_free_zone"
                    checked={isFreeZoneModal}
                    onChange={(e) => setValue("is_free_zone", e.target.checked)}
                    className="h-4 w-4 rounded border-input text-emerald-600"
                  />
                  <Label htmlFor="modal_is_free_zone" className="text-xs font-medium cursor-pointer">
                    Free Zone Company
                  </Label>
                  {isFreeZoneModal && (
                    <Input placeholder="Authority Name (e.g. DMCC)" {...register("free_zone_name")} className="h-8 text-xs ml-2 w-48 inline-block" />
                  )}
                </div>
              </div>

              {/* Section 4: Books & COA Template */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-border pb-1">
                  4. Accounting Books & COA Template
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="modal_fy_start" className="text-xs font-medium">Financial Year From *</Label>
                    <Input id="modal_fy_start" type="date" {...register("fiscal_year_start")} className="h-9 text-sm font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modal_books_start" className="text-xs font-medium">Books Beginning From</Label>
                    <Input id="modal_books_start" type="date" {...register("books_begin_date")} className="h-9 text-sm font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modal_coa" className="text-xs font-medium">COA Template *</Label>
                    <select id="modal_coa" {...register("coa_template")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                      {COA_TEMPLATES.map((tmpl) => (
                        <option key={tmpl.value} value={tmpl.value}>{tmpl.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="cursor-pointer">
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer">
                  {isPending ? "Creating Company..." : "Create & Initialize Books →"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
