import Link from "next/link";

// The splash stands in until the sweep list exists and `/` redirects to it.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
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
    </div>
  );
}
