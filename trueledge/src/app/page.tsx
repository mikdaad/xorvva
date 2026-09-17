// app/page.tsx
"use client";

import React, { useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useInView, type Variants } from "framer-motion";
import { ArrowRight, Gem } from "lucide-react";
import { SplineSceneBasic } from "@/components/ui/demo";
import { CardStack, type CardStackItem } from "@/components/ui/card-stack";
import { CinematicFooter } from "@/components/ui/motion-footer";

/* ----------------------------- Anim: BlurFade ----------------------------- */
interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
  yOffset?: number;
  inViewMargin?: string;
  blur?: string;
}
function BlurFade({
  children,
  className,
  duration = 0.45,
  delay = 0,
  yOffset = 8,
  inViewMargin = "-80px",
  blur = "8px",
}: BlurFadeProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: inViewMargin as any });

  const variants: Variants = {
    hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
    visible: { y: 0, opacity: 1, filter: "blur(0px)" },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={variants}
      transition={{ delay, duration, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------- Glass Button ------------------------------ */
const glassButtonVariants = cva(
  "relative isolate all-unset cursor-pointer rounded-full transition-all",
  {
    variants: {
      size: {
        default: "text-base font-medium",
        sm: "text-sm font-medium",
        lg: "text-lg font-medium",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { size: "default" },
  }
);

const glassButtonTextVariants = cva(
  "glass-button-text relative block select-none tracking-tighter",
  {
    variants: {
      size: {
        default: "px-6 py-3.5",
        sm: "px-4 py-2",
        lg: "px-8 py-4",
        icon: "flex h-10 w-10 items-center justify-center",
      },
    },
    defaultVariants: { size: "default" },
  }
);

interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, contentClassName, onClick, ...props }, ref) => {
    const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const button = e.currentTarget.querySelector("button");
      if (button && e.target !== button) button.click();
    };

    return (
      <div
        className={cn(
          "glass-button-wrap cursor-pointer rounded-full relative",
          className
        )}
        onClick={handleWrapperClick}
      >
        <button
          type={props.type || "button"}
          className={cn(
            "glass-button relative z-10",
            glassButtonVariants({ size })
          )}
          ref={ref}
          onClick={onClick}
          {...props}
        >
          <span
            className={cn(glassButtonTextVariants({ size }), contentClassName)}
          >
            {children}
          </span>
        </button>
        <div className="glass-button-shadow rounded-full pointer-events-none" />
      </div>
    );
  }
);
GlassButton.displayName = "GlassButton";

/* -------------------------- Gradient Background -------------------------- */
const GradientBackground = () => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 800 600"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid slice"
    className="absolute inset-0 h-full w-full bg-[#0A0A0A]"
  >
    <defs>
      <linearGradient id="rev_grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#FF0000", stopOpacity: 0.7 }} />
        <stop
          offset="100%"
          style={{ stopColor: "#660000", stopOpacity: 0.8 }}
        />
      </linearGradient>

      <linearGradient id="rev_grad2" x1="0%" y1="0%" x2="150%" y2="150%">
        <stop
          offset="0%"
          style={{ stopColor: "#05e217ff", stopOpacity: 0.8 }}
        />
        <stop
          offset="100%"
          style={{ stopColor: "#002B11", stopOpacity: 0.9 }}
        />
      </linearGradient>

      <radialGradient id="rev_grad3" cx="50%" cy="50%" r="50%">
        <stop
          offset="0%"
          style={{ stopColor: "#FFFFFF", stopOpacity: 0.15 }}
        />
        <stop offset="100%" style={{ stopColor: "#FFFFFF", stopOpacity: 0 }} />
      </radialGradient>

      <filter id="rev_blur1" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="40" />
      </filter>
      <filter id="rev_blur2" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="35" />
      </filter>
      <filter id="rev_blur3" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="50" />
      </filter>
    </defs>

    <motion.ellipse
      cx="200"
      cy="500"
      rx="250"
      ry="180"
      fill="url(#rev_grad1)"
      filter="url(#rev_blur1)"
      transform="rotate(-30 200 500)"
      animate={{
        x: [0, 30, -20, 15, 0],
        y: [0, -35, 20, -25, 0],
        scale: [1, 1.08, 0.94, 1.04, 1],
      }}
      transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
    />

    <motion.rect
      x="500"
      y="100"
      width="300"
      height="250"
      rx="80"
      fill="url(#rev_grad2)"
      filter="url(#rev_blur2)"
      transform="rotate(15 650 225)"
      animate={{
        x: [0, -35, 25, -15, 0],
        y: [0, 30, -30, 20, 0],
        scale: [1, 0.95, 1.06, 0.98, 1],
      }}
      transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
    />

    <motion.circle
      cx="650"
      cy="450"
      r="200"
      fill="url(#rev_grad3)"
      filter="url(#rev_blur3)"
      animate={{
        x: [0, -25, 35, -20, 0],
        y: [0, -40, 25, -15, 0],
        scale: [1, 1.1, 0.92, 1.05, 1],
      }}
      transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
    />

    <motion.ellipse
      cx="50"
      cy="150"
      rx="180"
      ry="120"
      fill="#1A1A1A"
      filter="url(#rev_blur2)"
      opacity="0.8"
      animate={{
        x: [0, 40, -25, 20, 0],
        y: [0, 25, -35, 15, 0],
        scale: [1, 0.92, 1.08, 0.96, 1],
      }}
      transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
    />
  </svg>
);

/* --------------------------------- UI Bits -------------------------------- */
const DefaultLogo = () => (
  <div className="bg-primary text-primary-foreground rounded-md p-1.5">
    <Gem className="h-4 w-4" />
  </div>
);

function FeaturePill({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-full px-4 py-2 text-xs sm:text-sm font-semibold",
        "border border-border/60 bg-card/50 backdrop-blur",
        "text-foreground/90 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]"
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------ Carousel Items ---------------------------- */
const carouselItems: CardStackItem[] = [
  {
    id: 1,
    title: "Luxury Performance",
    description: "Experience the thrill of precision engineering",
    imageSrc:
      "/images/stack/s1.png",
    href: "https://www.trueledge.com/",
  },
  {
    id: 2,
    title: "Elegant Design",
    description: "Where beauty meets functionality",
    imageSrc:
      "/images/stack/s2.png",
    href: "https://www.trueledge.com/",
  },
  {
    id: 3,
    title: "Power & Speed",
    description: "Unleash the true potential of the road",
    imageSrc:
      "/images/stack/s3.png",
    href: "https://www.trueledge.com/",
  },
  {
    id: 4,
    title: "Timeless Craftsmanship",
    description: "Built with passion, driven by excellence",
    imageSrc:
      "https://i.pinimg.com/736x/5d/f7/69/5df7696c4f24b7961c8c72748a355ff8.jpg",
    href: "https://www.trueledge.com/",
  },
  {
    id: 5,
    title: "Future of Mobility",
    description: "Innovation that moves you forward",
    imageSrc:
      "/images/stack/s5.png",
    href: "https://www.trueledge.com/",
  },
];

/* ------------------------------ Landing Page ------------------------------ */
export default function HomePage() {
  const router = useRouter();

  return (
    <div className="relative w-full min-h-screen overflow-x-hidden bg-background">
      {/* Glass styles (button only) */}
      <style>{`
        @property --angle-1 { syntax: "<angle>"; inherits: false; initial-value: -75deg; }
        @property --angle-2 { syntax: "<angle>"; inherits: false; initial-value: -45deg; }

        .glass-button-wrap { --anim-time: 400ms; --anim-ease: cubic-bezier(0.25, 1, 0.5, 1); --border-width: clamp(1px, 0.0625em, 4px);
          position: relative; z-index: 2; transform-style: preserve-3d; transition: transform var(--anim-time) var(--anim-ease);
        }
        .glass-button-wrap:has(.glass-button:active) { transform: rotateX(25deg); }

        .glass-button-shadow { --shadow-cutoff-fix: 2em;
          position: absolute; width: calc(100% + var(--shadow-cutoff-fix)); height: calc(100% + var(--shadow-cutoff-fix));
          top: calc(0% - var(--shadow-cutoff-fix) / 2); left: calc(0% - var(--shadow-cutoff-fix) / 2);
          filter: blur(clamp(2px, 0.125em, 12px)); transition: filter var(--anim-time) var(--anim-ease);
          pointer-events: none; z-index: 0;
        }
        .glass-button-shadow::after {
          content: ""; position: absolute; inset: 0; border-radius: 9999px;
          background: linear-gradient(180deg, oklch(from var(--foreground) l c h / 20%), oklch(from var(--foreground) l c h / 10%));
          width: calc(100% - var(--shadow-cutoff-fix) - 0.25em);
          height: calc(100% - var(--shadow-cutoff-fix) - 0.25em);
          top: calc(var(--shadow-cutoff-fix) - 0.5em);
          left: calc(var(--shadow-cutoff-fix) - 0.875em);
          padding: 0.125em; box-sizing: border-box;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          transition: all var(--anim-time) var(--anim-ease);
          opacity: 1;
        }

        .glass-button {
          -webkit-tap-highlight-color: transparent;
          backdrop-filter: blur(clamp(1px, 0.125em, 4px));
          transition: all var(--anim-time) var(--anim-ease);
          background: linear-gradient(-75deg, oklch(from var(--background) l c h / 5%), oklch(from var(--background) l c h / 20%), oklch(from var(--background) l c h / 5%));
          box-shadow:
            inset 0 0.125em 0.125em oklch(from var(--foreground) l c h / 5%),
            inset 0 -0.125em 0.125em oklch(from var(--background) l c h / 50%),
            0 0.25em 0.125em -0.125em oklch(from var(--foreground) l c h / 20%),
            0 0 0.1em 0.25em inset oklch(from var(--background) l c h / 20%),
            0 0 0 0 oklch(from var(--background) l c h);
        }
        .glass-button:hover {
          transform: scale(0.985);
          backdrop-filter: blur(0.01em);
        }

        .glass-button-text {
          color: oklch(from var(--foreground) l c h / 90%);
          text-shadow: 0em 0.25em 0.05em oklch(from var(--foreground) l c h / 10%);
          transition: all var(--anim-time) var(--anim-ease);
        }
        .glass-button-text::after {
          content: ""; display: block; position: absolute;
          width: calc(100% - var(--border-width));
          height: calc(100% - var(--border-width));
          top: calc(0% + var(--border-width) / 2);
          left: calc(0% + var(--border-width) / 2);
          box-sizing: border-box;
          border-radius: 9999px;
          overflow: clip;
          background: linear-gradient(var(--angle-2), transparent 0%, oklch(from var(--background) l c h / 50%) 40% 50%, transparent 55%);
          z-index: 3;
          mix-blend-mode: screen;
          pointer-events: none;
          background-size: 200% 200%;
          background-position: 0% 50%;
          transition: background-position calc(var(--anim-time) * 1.25) var(--anim-ease), --angle-2 calc(var(--anim-time) * 1.25) var(--anim-ease);
        }
        .glass-button:hover .glass-button-text::after { background-position: 25% 50%; }

        .glass-button::after {
          content: ""; position: absolute; z-index: 1; inset: 0; border-radius: 9999px;
          width: calc(100% + var(--border-width));
          height: calc(100% + var(--border-width));
          top: calc(0% - var(--border-width) / 2);
          left: calc(0% - var(--border-width) / 2);
          padding: var(--border-width);
          box-sizing: border-box;
          background:
            conic-gradient(from var(--angle-1) at 50% 50%,
              oklch(from var(--foreground) l c h / 50%) 0%,
              transparent 5% 40%,
              oklch(from var(--foreground) l c h / 50%) 50%,
              transparent 60% 95%,
              oklch(from var(--foreground) l c h / 50%) 100%
            ),
            linear-gradient(180deg, oklch(from var(--background) l c h / 50%), oklch(from var(--background) l c h / 50%));
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          transition: all var(--anim-time) var(--anim-ease), --angle-1 500ms ease;
          pointer-events: none;
        }
        .glass-button:hover::after { --angle-1: -125deg; }
      `}</style>

      {/* Header */}
      <header className="fixed top-4 left-4 right-4 z-20">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DefaultLogo />
            <span className="text-base font-bold text-foreground">TrueLedge</span>
          </div>

          <div className="flex items-center gap-2">
            <GlassButton size="sm" onClick={() => router.push("/login")}>
              Login
            </GlassButton>
            <GlassButton
              size="sm"
              onClick={() => router.push("/signup")}
              className="hidden sm:block"
            >
              Sign up
            </GlassButton>
          </div>
        </div>
      </header>

      {/* -------------------- LANDING (gradient only here) -------------------- */}
      <main className="relative z-10">
        <div className="relative overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 z-0">
            <GradientBackground />
            {/* readability wash */}
            <div className="absolute inset-0 bg-background/35" />
          </div>

          {/* SPLINE / 3D ROBOT
          <section className="relative z-10 py-16 sm:py-20 px-4">
  <div className="mx-auto max-w-6xl">
    <BlurFade>
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
        Interactive 3D demo
      </h2>
    </BlurFade>

    <BlurFade delay={0.08} className="mt-10">
      <SplineSceneBasic />
    </BlurFade>
  </div>
</section> */}


          {/* HERO */}
          <section className="relative z-10 min-h-screen pt-28 pb-16 px-4">
            <div className="mx-auto max-w-6xl">
              <div className="grid lg:grid-cols-12 gap-10 items-center">
                <section className="lg:col-span-7">
                  <BlurFade delay={0.05}>
                    <h1 className="font-serif font-light text-4xl sm:text-5xl md:text-6xl tracking-tight text-foreground">
                      Intelligent Accounting for the UAE
                    </h1>
                  </BlurFade>

                  <BlurFade delay={0.12}>
                    <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
                      FTA VAT, Corporate Tax, and e-Invoicing compliant.
                      <br />
                      Multi-entity management with real-time financial insights.
                    </p>
                  </BlurFade>

                  <BlurFade delay={0.18}>
                    <div className="mt-6 flex flex-wrap gap-2">
                      <FeaturePill>VAT Compliant</FeaturePill>
                      <FeaturePill>e-Invoicing Ready</FeaturePill>
                      <FeaturePill>Multi-Entity</FeaturePill>
                      <FeaturePill>AI-Powered</FeaturePill>
                    </div>
                  </BlurFade>

                  <BlurFade delay={0.24}>
                    <div className="mt-8 flex flex-col sm:flex-row gap-3">
                      <GlassButton
                        size="lg"
                        contentClassName="flex items-center gap-2 justify-center"
                        onClick={() => router.push("/dashboard")}
                      >
                        Get started <ArrowRight className="h-5 w-5" />
                      </GlassButton>

                      <GlassButton
                        size="lg"
                        onClick={() => router.push("/signup")}
                        className="sm:hidden"
                      >
                        Sign up
                      </GlassButton>
                    </div>
                  </BlurFade>
                </section>

                {/* Testimonial */}
                <section className="lg:col-span-5">
                  <BlurFade delay={0.2}>
                    <div
                      className={cn(
                        "rounded-2xl border border-border/60",
                        "bg-card/55 backdrop-blur-md",
                        "p-6 sm:p-8",
                        "shadow-[0_30px_80px_-50px_rgba(0,0,0,0.55)]"
                      )}
                    >
                      <p className="text-foreground text-lg sm:text-xl leading-relaxed">
                        “TrueLedge transformed how we manage our clients’ books
                        across all seven emirates”
                      </p>
                      <p className="mt-4 text-sm text-muted-foreground font-medium">
                        — Managing Partner, Leading UAE Accounting Firm
                      </p>

                      <div className="mt-6 flex gap-2">
                        <div className="h-1.5 w-14 rounded-full bg-primary/70" />
                        <div className="h-1.5 w-6 rounded-full bg-foreground/20" />
                        <div className="h-1.5 w-6 rounded-full bg-foreground/20" />
                      </div>
                    </div>
                  </BlurFade>
                </section>
              </div>
            </div>
          </section>

          {/* CARD STACK */}
          <section className="relative z-10 py-16 sm:py-20 px-4">
            <div className="mx-auto max-w-6xl">
              <BlurFade>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                  Explore what’s possible
                </h2>
              </BlurFade>

              <BlurFade delay={0.08}>
                <p className="mt-3 max-w-2xl text-muted-foreground">
                  Swipe, drag, or use arrow keys to navigate the stack.
                </p>
              </BlurFade>

              <BlurFade delay={0.14} className="mt-10">
                <div className="mx-auto w-full max-w-5xl">
                  <CardStack
                    items={carouselItems}
                    initialIndex={0}
                    autoAdvance
                    intervalMs={2000}
                    pauseOnHover
                    showDots
                  />
                </div>
              </BlurFade>
            </div>
          </section>

          {/* Fade OUT the gradient as we approach the footer */}
          <div className="relative z-10 h-32 sm:h-48">
            <div
              className="absolute inset-0 bg-gradient-to-b from-transparent via-background/70 to-background"
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Solid pre-footer runway (no gradient) */}
        {/* <section className="relative bg-background px-4 py-16 sm:py-24 border-t border-border/30">
          <div className="mx-auto max-w-6xl">

            <div className="mt-10 h-24 w-px bg-gradient-to-b from-foreground/30 to-transparent" />
          </div>
        </section> */}
      </main>

      {/* Footer (gradient is disabled before we reach this) */}
      <CinematicFooter />
    </div>
  );
}