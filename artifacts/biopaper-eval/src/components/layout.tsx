import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, FlaskConical, LayoutDashboard, FileText, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Activity, label: "Submit Evaluation" },
    { href: "/evaluations", icon: FileText, label: "All Evaluations" },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background font-sans">
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar hidden md:flex flex-col">
        <div className="p-6 border-b border-border">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center group-hover:scale-105 transition-transform">
              <FlaskConical className="w-5 h-5" />
            </div>
            <span className="font-semibold text-lg tracking-tight">BioEval</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
            <Database className="w-4 h-4" />
            <span>Connected to API</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}