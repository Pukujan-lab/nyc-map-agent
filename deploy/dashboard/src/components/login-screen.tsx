import * as React from "react";
import { Loader2, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, postLogin } from "@/lib/api";

interface LoginScreenProps {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || password.length === 0) return;

    setPending(true);
    setError(null);
    try {
      await postLogin(password);
      onSuccess();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.kind === "unauthorized") setError("Wrong password.");
        else if (caught.kind === "rate-limited")
          setError("Too many attempts. Wait a few minutes.");
        else setError("Could not reach the deploy server.");
      } else {
        setError("Could not reach the deploy server.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md border border-border bg-card">
            <LockKeyhole className="size-4 text-muted-foreground" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              NYC Map Agent
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Deploys
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h1 className="text-base font-semibold tracking-tight">Deploy dashboard</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter the operator password to continue.
          </p>

          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="deploy-password"
                className="block text-[11px] font-medium text-slate-300"
              >
                Password
              </label>
              <Input
                id="deploy-password"
                type="password"
                name="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error != null}
                aria-describedby={error ? "deploy-password-error" : undefined}
                className="h-9 font-mono text-sm"
                placeholder="••••••••"
              />
              {error ? (
                <p
                  id="deploy-password-error"
                  role="alert"
                  className="text-[11px] text-red-300"
                >
                  {error}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="h-9 w-full"
              disabled={pending || password.length === 0}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
          Session cookie · same origin
        </p>
      </div>
    </div>
  );
}
