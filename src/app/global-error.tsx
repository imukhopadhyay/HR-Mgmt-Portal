"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui", padding: 32 }}>
        <h1>Something went wrong</h1>
        <p>An unexpected error occurred. The issue has been logged.</p>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
