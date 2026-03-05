import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Option Strategy Evaluator</h1>
      <Link href="/options/strategy" className="text-blue-700 underline">
        Open Strategy Builder
      </Link>
    </main>
  );
}