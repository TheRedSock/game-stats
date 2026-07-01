import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Login",
  description: "Sign in to run operational jobs for Game Stats.",
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
