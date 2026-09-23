import Link from "next/link";
import { Wordmark } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="paper flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Wordmark />
      <h1 className="font-display mt-4 text-4xl">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">The page you are looking for does not exist or has moved.</p>
      <Link href="/files" className="text-sm font-medium underline underline-offset-4">
        Back to files
      </Link>
    </div>
  );
}
