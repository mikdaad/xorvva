import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  IconArrowRight, IconUsers, IconChecklist, IconCalculator, IconInbox,
  IconShieldCheck, IconLayoutDashboard, IconBeach, IconWorld, IconTrendingUp,
  IconSparkles, IconCircleCheckFilled,
} from '@tabler/icons-react';
import { Logo } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';

gsap.registerPlugin(ScrollTrigger);

/* Real product screenshot for the hero. Drop it at frontend/public/hero.png
   (or your 3D render) and set HERO_IMAGE = '/hero.png' — it replaces the mockup. */
const HERO_IMAGE = '';

export default function LandingPage() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      if (reduce) { gsap.set('[data-product]', { rotateX: 0 }); return; }

      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('[data-hero]', { y: 30, opacity: 0, duration: 0.8, stagger: 0.1 });

      gsap.fromTo('[data-product]',
        { rotateX: 30, y: 20 },
        { rotateX: 0, y: 0, ease: 'none', scrollTrigger: { trigger: '[data-product-wrap]', start: 'top 80%', end: 'top 24%', scrub: 1 } });

      gsap.set('[data-reveal]', { opacity: 0, y: 42 });
      ScrollTrigger.batch('[data-reveal]', {
        start: 'top 86%',
        onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.75, stagger: 0.09, ease: 'power3.out', overwrite: true }),
      });
    }, root);

    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => ctx.revert();
  }, []);

  return (
    <div ref={root} className="relative min-h-screen overflow-x-hidden bg-void">
      <Nav />
      <Hero />
      <Marquee />
      <Features />
      <Cta />
      <Footer />
    </div>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? 'glass border-b border-border py-2.5 shadow-soft-sm' : 'border-b border-transparent bg-transparent py-4'}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-medium text-frost-dim md:flex">
          <a href="#features" className="transition-colors hover:text-frost">Capabilities</a>
          <a href="#cta" className="transition-colors hover:text-frost">Pricing</a>
        </nav>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link to="/login" className="hidden rounded-full px-4 py-2 text-sm font-medium text-frost-dim transition-colors hover:text-frost sm:block">Log in</Link>
          <Link to="/signup" className="rounded-full bg-linear-to-br from-brand-2 to-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft-sm transition-[filter] hover:brightness-110">Get started</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative px-6 pt-36 md:pt-30">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-40" />
        <div className="mesh absolute inset-x-0 top-0 h-[60%] opacity-45 blur-[8px]" />
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <span data-hero className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-semibold text-glow shadow-soft-sm">
          <IconSparkles size={14} /> Cloud ERP for multi-company groups
        </span>
        <h1 data-hero className="mt-6 text-[clamp(2.75rem,6.5vw,5rem)] font-extrabold leading-[1.02] tracking-tight text-frost">
          Run every company<br className="hidden sm:block" /> from <span className="text-gradient">one platform</span>
        </h1>
        <p data-hero className="mx-auto mt-6 max-w-xl text-lg text-frost-dim">
          HR, approvals, and — next — accounting, built for businesses that run more than one company.
        </p>
        <div data-hero className="mt-9 flex items-center justify-center gap-3">
          <Link to="/signup" className="flex items-center gap-2 rounded-full bg-linear-to-br from-brand-2 to-primary px-7 py-3.5 text-sm font-semibold text-white shadow-soft transition-transform hover:scale-[1.04]">
            Start free <IconArrowRight size={17} />
          </Link>
          <Link to="/login" className="rounded-full glass px-7 py-3.5 text-sm font-semibold text-frost shadow-soft-sm transition-transform hover:scale-[1.04]">
            Sign in
          </Link>
        </div>
      </div>

      {/* Product screenshot — the hero */}
      <div data-hero data-product-wrap className="relative mx-auto mt-16 max-w-5xl" style={{ perspective: '1600px' }}>
        <div className="absolute inset-x-16 -top-2 bottom-16 rounded-[3rem] bg-primary/20 blur-[90px]" />
        <div data-product className="relative overflow-hidden rounded-2xl border border-border bg-abyss shadow-soft" style={{ transformOrigin: 'center top' }}>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-danger/70" />
            <span className="h-3 w-3 rounded-full bg-warning/70" />
            <span className="h-3 w-3 rounded-full bg-success/70" />
            <span className="ml-3 font-mono text-xs text-dim">app.xorva.io</span>
          </div>
          {HERO_IMAGE ? <img src={HERO_IMAGE} alt="Xorva dashboard" className="block w-full" /> : <DashboardShot />}
        </div>
      </div>
    </section>
  );
}

function DashboardShot() {
  const bars = [['Sales', 92], ['Operations', 74], ['Finance', 50], ['Support', 44], ['HR', 30]] as const;
  return (
    <div className="grid grid-cols-[180px_1fr] bg-void text-left max-sm:grid-cols-1">
      <aside className="hidden flex-col gap-1 border-r border-border bg-abyss p-3.5 sm:flex">
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-xs font-semibold text-glow"><IconLayoutDashboard size={15} /> Dashboard</div>
        {[{ l: 'Employees', Ic: IconUsers }, { l: 'Approvals', Ic: IconInbox }, { l: 'Leave', Ic: IconBeach }, { l: 'Accounting', Ic: IconCalculator }].map(({ l, Ic }) => (
          <div key={l} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-frost-dim"><Ic size={15} /> {l}</div>
        ))}
      </aside>
      <div className="p-5 md:p-7">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-lg font-extrabold text-frost">Dashboard</div>
            <div className="text-xs text-dim">Rightsource Trading · this month</div>
          </div>
          <span className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold text-glow">Company Admin</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[['Employees', '128'], ['Departments', '9'], ['Pending approvals', '4']].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-abyss p-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-dim">{k}</div>
              <div className="mt-1 text-2xl font-extrabold text-frost">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-border bg-abyss p-4">
          <div className="mb-3 text-xs font-bold text-frost">Headcount by department</div>
          <div className="flex flex-col gap-2.5">
            {bars.map(([l, p]) => (
              <div key={l} className="grid grid-cols-[90px_1fr] items-center gap-3">
                <span className="text-[11px] text-frost-dim">{l}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface"><span className="block h-full rounded-full bg-linear-to-r from-brand-2 to-primary" style={{ width: `${p}%` }} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const MODULES = ['Multi-tenant', 'Approvals', 'HR & Leave', 'Role-based access', 'Consolidation', 'Accounting soon'];
function Marquee() {
  return (
    <div className="mt-24 overflow-hidden border-y border-border py-5">
      <div className="flex w-max animate-marquee items-center gap-10">
        {[...MODULES, ...MODULES].map((m, i) => (
          <span key={i} className="flex items-center gap-10 font-mono text-sm uppercase tracking-[0.15em] text-dim">
            {m} <span className="h-1 w-1 rounded-full bg-glow/60" />
          </span>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: IconWorld, title: 'Multi-company by design', text: 'Run many companies under one group — each with fully isolated data.' },
  { icon: IconChecklist, title: 'Dynamic approvals', text: 'Configure who signs off on any action, per company — without code.' },
  { icon: IconUsers, title: 'HR & leave', text: 'Departments, employees, and leave that flows through approval.' },
  { icon: IconShieldCheck, title: 'Role-based access', text: 'CEO to employee — everyone sees exactly what they should.' },
  { icon: IconCircleCheckFilled, title: 'Consolidated view', text: 'The CEO sees every company; each admin sees only their own.' },
  { icon: IconCalculator, title: 'Accounting — next', text: 'Double-entry books, invoices, and financial statements.' },
];
function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <div data-reveal className="mx-auto mb-14 max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-semibold text-glow shadow-soft-sm"><IconSparkles size={14} /> Capabilities</span>
        <h2 className="mt-5 text-4xl font-extrabold tracking-tight text-frost md:text-5xl">Everything to run a group,<br /> in one place</h2>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div key={f.title} data-reveal style={{ transitionDelay: `${(i % 3) * 60}ms` }}
            className="glass group rounded-3xl p-7 shadow-soft-sm transition-all hover:-translate-y-1.5 hover:shadow-soft">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-brand-2 to-primary text-white shadow-soft-sm transition-transform group-hover:scale-110 group-hover:rotate-3">
              <f.icon size={22} stroke={1.7} />
            </span>
            <h3 className="mt-5 text-lg font-bold text-frost">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-frost-dim">{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="cta" className="px-6 pb-24">
      <div data-reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-linear-to-br from-brand-2 to-primary px-8 py-20 text-center shadow-soft">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 top-0 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="relative">
          <IconTrendingUp size={30} className="mx-auto text-white" />
          <h2 className="mt-4 text-4xl font-extrabold tracking-tight text-white md:text-5xl">Run your whole group<br className="hidden sm:block" /> in one place</h2>
          <p className="mx-auto mt-4 max-w-lg text-white/80">Set up your organization in minutes — companies, people, and approvals, connected.</p>
          <Link to="/signup" className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-primary shadow-lg transition-transform hover:scale-[1.04]">
            Start free <IconArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <Logo />
        <div className="text-sm text-dim">© 2026 Xorva ERP — Multi-entity operations</div>
      </div>
    </footer>
  );
}
