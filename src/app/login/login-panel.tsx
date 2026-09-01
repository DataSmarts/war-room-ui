"use client";

import { useActionState } from "react";

import { login } from "@/app/actions/auth";
import { LoginFormView } from "@/components/auth/login-form";
import { LOGIN_IDLE } from "@/lib/auth/notices";

/**
 * The action, wired to the view — and nothing else.
 *
 * All this holds is `useActionState`, which is also all it needs to hold: `pending` is the
 * form's *loading*, distinct from anything the server said, and keeping it here means
 * `LoginFormView` stays a function of its props and `/kitchen-sink` can render every state it
 * has without a server action in sight.
 *
 * One action, dispatching on `intent`, because `useActionState` binds exactly one — see
 * `src/app/actions/auth.ts`. `next` rides through in a hidden field rather than in this
 * component's state, so it survives a rejected code and a switch to the fallback.
 */
export function LoginPanel({
  next,
  fallbackAvailable,
}: {
  next?: string;
  fallbackAvailable: boolean;
}) {
  const [state, formAction, pending] = useActionState(login, LOGIN_IDLE);

  return (
    <LoginFormView
      state={state}
      pending={pending}
      next={next}
      fallbackAvailable={fallbackAvailable}
      action={formAction}
    />
  );
}
