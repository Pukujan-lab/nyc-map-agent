import { Component, type ReactNode } from "react";
import { isChunkError, reloadOnce } from "@/lib/staleBuild";

/**
 * Keeps one failing part from blanking the whole app. A chunk from an older
 * build reloads the page once; anything else shows `fallback` (or a Reload
 * button at the top level).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode; name: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[${this.props.name}]`, error);
    if (isChunkError(error)) reloadOnce();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div role="alert" className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#0b1220] p-6 text-center text-slate-100">
        <p className="text-base font-semibold">Something went wrong.</p>
        <button type="button" className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
