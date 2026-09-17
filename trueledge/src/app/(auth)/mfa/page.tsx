"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MfaStep = "enroll" | "verify" | "complete";

export default function MfaPage() {
  const router = useRouter();
  const [step, setStep] = useState<MfaStep>("enroll");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialized = useRef<boolean | null>(null);

  if (initialized.current == null) {
    initialized.current = true;
    // Check for existing MFA factors on first render
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.mfa.listFactors();
      if (!data) return;

      const totp = data.totp;
      if (totp && totp.length > 0) {
        const verifiedFactor = totp.find((f) => f.status === "verified");
        if (verifiedFactor) {
          setFactorId(verifiedFactor.id);
          setStep("verify");
        }
      }
    })();
  }

  async function handleEnroll() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "TrueLedge Authenticator",
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setStep("verify");
    setLoading(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Create a challenge
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    // Verify the code
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: verifyCode,
    });

    if (verifyError) {
      setError("Invalid code. Please try again.");
      setLoading(false);
      return;
    }

    setStep("complete");
    setLoading(false);

    // Redirect after a brief delay
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 2000);
  }

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="space-y-1 px-0">
        <CardTitle className="text-2xl font-bold tracking-tight">
          {step === "enroll" && "Set up two-factor authentication"}
          {step === "verify" && "Verify your authenticator"}
          {step === "complete" && "MFA enabled!"}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {step === "enroll" &&
            "Protect your account with a TOTP authenticator app like Google Authenticator or Authy."}
          {step === "verify" &&
            "Scan the QR code with your authenticator app, then enter the 6-digit code."}
          {step === "complete" &&
            "Two-factor authentication has been successfully enabled on your account."}
        </CardDescription>
      </CardHeader>

      {step === "enroll" && (
        <CardFooter className="px-0 pt-4">
          <Button
            onClick={handleEnroll}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            disabled={loading}
          >
            {loading ? "Setting up..." : "Set up authenticator"}
          </Button>
        </CardFooter>
      )}

      {step === "verify" && (
        <form onSubmit={handleVerify}>
          <CardContent className="space-y-6 px-0">
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {qrCode && (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-xl border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode}
                    alt="MFA QR Code"
                    className="h-48 w-48"
                  />
                </div>
                {secret && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">
                      Manual entry key:
                    </p>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {secret}
                    </code>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mfa-code">Verification code</Label>
              <Input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) =>
                  setVerifyCode(e.target.value.replace(/\D/g, ""))
                }
                required
                disabled={loading}
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
            </div>
          </CardContent>

          <CardFooter className="px-0 pt-2">
            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              disabled={loading || verifyCode.length !== 6}
            >
              {loading ? "Verifying..." : "Verify and enable"}
            </Button>
          </CardFooter>
        </form>
      )}

      {step === "complete" && (
        <CardContent className="px-0">
          <div className="flex items-center justify-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 animate-pulse">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-8 w-8 text-emerald-400"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Redirecting to dashboard...
          </p>
        </CardContent>
      )}
    </Card>
  );
}
