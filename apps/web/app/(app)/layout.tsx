import type { ReactNode } from "react";

import { Sidebar } from "../../components/shell/sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-60 min-h-screen px-8 py-7">{children}</main>
    </div>
  );
}
