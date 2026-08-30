import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-semibold tracking-[0.35em] text-text-1">
        WAR<span className="text-brand">·</span>ROOM
      </h1>
      <p className="text-sm text-text-3">Views arrive one vertical at a time.</p>
      <Link
        href="/kitchen-sink"
        className="text-sm text-text-2 underline decoration-hairline underline-offset-4 hover:text-text-1"
      >
        kitchen sink →
      </Link>
    </main>
  );
}
