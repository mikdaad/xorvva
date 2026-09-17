import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authentication | TrueLedge",
  description: "Sign in or create your TrueLedge account.",
};

/**
 * Auth layout — a centered, responsive layout for login/signup/mfa/onboarding.
 * Uses a modern split-screen design with branding on the left panel.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background overflow-hidden">
      {/* Left branding panel */}


      {/* Right content panel */}
      <div className="flex flex-1 flex-col items-center justify-center relative bg-background min-h-screen overflow-y-auto">
        <div className="w-full h-full flex flex-col items-center justify-center">
          {children}
        </div>
      </div>
    </div>
  );
}
