"use client";

import { ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react";
import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "@/lib/i18n";

import {
  createInitialEmailCodeLoginState,
  emailCodeLoginReducer,
  normalizeEmailCodeFailure,
  remainingSeconds,
  type EmailCodeChallenge,
  type EmailCodeFailure,
  type EmailCodeOperation,
} from "./emailCodeLoginMachine";

export interface StartEmailCodeInput {
  email: string;
  signal: AbortSignal;
}

export interface ContinueEmailCodeInput {
  interactionToken: string;
  signal: AbortSignal;
}

export interface VerifyEmailCodeInput extends ContinueEmailCodeInput {
  verificationCode: string;
}

export interface CancelEmailCodeInput {
  interactionToken: string | null;
}

export interface EmailCodeLoginPanelProps {
  active?: boolean;
  start: (input: StartEmailCodeInput) => Promise<EmailCodeChallenge>;
  resend: (input: ContinueEmailCodeInput) => Promise<EmailCodeChallenge>;
  verify: (input: VerifyEmailCodeInput) => Promise<void>;
  cancel: (input: CancelEmailCodeInput) => void | Promise<void>;
  onBackToMethods: () => void;
  onAuthenticated?: () => void;
  onUseHostedLogin?: () => void;
  onCriticalOperationChange?: (critical: boolean) => void;
}

function createPanelState() {
  return emailCodeLoginReducer(createInitialEmailCodeLoginState(), { type: "SELECT_EMAIL" });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function focusSoon(ref: RefObject<HTMLInputElement | null>): void {
  queueMicrotask(() => ref.current?.focus());
}

export function EmailCodeLoginPanel({
  active = true,
  start,
  resend,
  verify,
  cancel,
  onBackToMethods,
  onAuthenticated,
  onUseHostedLogin,
  onCriticalOperationChange,
}: EmailCodeLoginPanelProps) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(emailCodeLoginReducer, undefined, createPanelState);
  const [now, setNow] = useState(() => Date.now());
  const stateRef = useRef(state);
  const cancelRef = useRef(cancel);
  const criticalChangeRef = useRef(onCriticalOperationChange);
  const criticalRef = useRef(false);
  const activeRef = useRef(active);
  const previousActiveRef = useRef(active);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestControllerIdRef = useRef<number | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  stateRef.current = state;
  cancelRef.current = cancel;
  criticalChangeRef.current = onCriticalOperationChange;
  activeRef.current = active;

  const invalidateActiveRequest = useCallback(() => {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    requestControllerIdRef.current = null;
  }, []);

  const notifyCancel = useCallback((interactionToken: string | null) => {
    try {
      void Promise.resolve(cancelRef.current({ interactionToken })).catch(() => undefined);
    } catch {
      // 取消是尽力而为；清理本地验证码和 pending 状态不能被远端取消失败阻塞。
    }
  }, []);

  const notifyCritical = useCallback((critical: boolean) => {
    criticalRef.current = critical;
    criticalChangeRef.current?.(critical);
  }, []);

  const resetFlow = useCallback((target: "methods" | "email" | "reset") => {
    const interactionToken = stateRef.current.interactionToken;
    invalidateActiveRequest();
    notifyCancel(interactionToken);
    if (target === "email") {
      dispatch({ type: "CHANGE_EMAIL" });
      return;
    }
    dispatch({ type: target === "methods" ? "BACK_TO_METHODS" : "RESET" });
  }, [invalidateActiveRequest, notifyCancel]);

  useEffect(() => {
    const wasActive = previousActiveRef.current;
    previousActiveRef.current = active;
    if (wasActive && !active) {
      resetFlow("reset");
    } else if (!wasActive && active) {
      dispatch({ type: "SELECT_EMAIL" });
    }
  }, [active, resetFlow]);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      dispatch({ type: "TICK", now: current });
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (state.phase === "email-entry") emailInputRef.current?.focus();
    if (state.phase === "code-entry") codeInputRef.current?.focus();
  }, [active, state.phase]);

  useEffect(() => () => {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    if (activeRef.current) notifyCancel(stateRef.current.interactionToken);
    if (criticalRef.current) notifyCritical(false);
  }, [notifyCancel, notifyCritical]);

  const beginRequest = (
    operation: EmailCodeOperation,
    submittedEmail?: string,
  ): { requestId: number; signal: AbortSignal } | null => {
    if (requestControllerRef.current !== null) return null;
    const requestId = ++requestSequenceRef.current;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    requestControllerIdRef.current = requestId;
    dispatch({ type: "REQUEST_STARTED", operation, requestId, submittedEmail });
    return { requestId, signal: controller.signal };
  };

  const isCurrentRequest = (requestId: number): boolean => (
    activeRef.current
    && requestSequenceRef.current === requestId
    && requestControllerIdRef.current === requestId
    && requestControllerRef.current?.signal.aborted === false
  );

  const finishRequest = (requestId: number) => {
    if (requestControllerIdRef.current !== requestId) return;
    requestControllerRef.current = null;
    requestControllerIdRef.current = null;
  };

  const dispatchFailure = (
    operation: EmailCodeOperation,
    requestId: number,
    error: unknown,
  ): EmailCodeFailure => {
    const failure = normalizeEmailCodeFailure(error);
    dispatch({
      type: "REQUEST_FAILED",
      operation,
      requestId,
      failure,
      now: Date.now(),
    });
    return failure;
  };

  const handleStart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.phase !== "email-entry") return;
    const email = state.emailDraft.trim();
    if (!isValidEmail(email)) {
      dispatch({ type: "CLIENT_ERROR", failure: { code: "invalid_email" } });
      focusSoon(emailInputRef);
      return;
    }

    const request = beginRequest("start", email);
    if (request === null) return;
    try {
      const challenge = await start({ email, signal: request.signal });
      if (!isCurrentRequest(request.requestId)) {
        // 关闭弹窗与发送成功可能恰好竞态：此时 helper 已创建 OAuth/OTP 事务，
        // 但 reducer 不会再接收 interactionToken，必须用迟到响应里的 token 主动回收。
        notifyCancel(challenge.interactionToken);
        return;
      }
      finishRequest(request.requestId);
      dispatch({
        type: "CHALLENGE_RECEIVED",
        operation: "start",
        requestId: request.requestId,
        challenge,
        now: Date.now(),
      });
    } catch (error) {
      if (!isCurrentRequest(request.requestId)) return;
      finishRequest(request.requestId);
      const failure = dispatchFailure("start", request.requestId, error);
      if (failure.code !== "aborted") focusSoon(emailInputRef);
    }
  };

  const handleResend = async () => {
    if (state.phase !== "code-entry" || state.interactionToken === null) return;
    const request = beginRequest("resend");
    if (request === null) return;
    try {
      const challenge = await resend({
        interactionToken: state.interactionToken,
        signal: request.signal,
      });
      if (!isCurrentRequest(request.requestId)) return;
      finishRequest(request.requestId);
      dispatch({
        type: "CHALLENGE_RECEIVED",
        operation: "resend",
        requestId: request.requestId,
        challenge,
        now: Date.now(),
      });
    } catch (error) {
      if (!isCurrentRequest(request.requestId)) return;
      finishRequest(request.requestId);
      const failure = dispatchFailure("resend", request.requestId, error);
      if (failure.code === "invalid_code" || failure.code === "code_expired") focusSoon(codeInputRef);
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      state.phase !== "code-entry"
      || state.interactionToken === null
      || state.verificationCode.length !== state.codeLength
    ) return;

    const request = beginRequest("verify");
    if (request === null) return;
    notifyCritical(true);
    let authenticated = false;
    try {
      await verify({
        interactionToken: state.interactionToken,
        verificationCode: state.verificationCode,
        signal: request.signal,
      });
      if (!isCurrentRequest(request.requestId)) return;
      finishRequest(request.requestId);
      dispatch({ type: "VERIFY_SUCCEEDED", requestId: request.requestId });
      authenticated = true;
    } catch (error) {
      if (!isCurrentRequest(request.requestId)) return;
      finishRequest(request.requestId);
      const failure = dispatchFailure("verify", request.requestId, error);
      if (failure.code === "invalid_code" || failure.code === "code_expired") focusSoon(codeInputRef);
      if (
        failure.code === "too_many_attempts"
        || failure.code === "interaction_expired"
        || failure.code === "interaction_consumed"
      ) focusSoon(emailInputRef);
    } finally {
      notifyCritical(false);
    }
    if (authenticated) onAuthenticated?.();
  };

  const handleBackToMethods = () => {
    resetFlow("methods");
    onBackToMethods();
  };

  const handleChangeEmail = () => resetFlow("email");

  const handleHostedFallback = () => {
    resetFlow("reset");
    onUseHostedLogin?.();
  };

  if (!active || state.phase === "methods") return null;

  const retryRemaining = remainingSeconds(state.retryAvailableAt, now);
  const resendRemaining = remainingSeconds(state.resendAvailableAt, now);
  const expiryRemaining = remainingSeconds(state.codeExpiresAt, now);
  const emailRetryRemaining = state.retryOperation === "start" ? retryRemaining : 0;
  const resendRetryRemaining = state.retryOperation === "resend" ? retryRemaining : 0;
  const verifyRetryRemaining = state.retryOperation === "verify" ? retryRemaining : 0;
  const isEmailStep = state.phase === "email-entry" || state.phase === "sending";
  const isCodeStep = !isEmailStep;
  const emailError = isEmailStep ? state.error : null;
  const codeError = isCodeStep ? state.error : null;
  const isCodeExpired = state.codeExpiresAt !== null && expiryRemaining === 0;

  const errorMessage = (failure: EmailCodeFailure | null): string | null => {
    if (failure === null || failure.code === "aborted") return null;
    const seconds = failure.code === "rate_limited"
      ? Math.max(1, retryRemaining || failure.retryAfterSeconds || 1)
      : undefined;
    return t(`auth.emailCode.errors.${failure.code}`, { seconds });
  };

  const emailErrorMessage = errorMessage(emailError);
  const codeErrorMessage = errorMessage(codeError);
  const emailErrorId = emailErrorMessage ? "email-code-email-error" : undefined;
  const codeErrorId = codeErrorMessage ? "email-code-code-error" : undefined;

  return (
    <div className="flex flex-col gap-4" data-testid="email-code-login-panel">
      {isEmailStep ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit px-2"
            onClick={handleBackToMethods}
            disabled={state.phase === "sending"}
          >
            <ArrowLeft />
            {t("auth.emailCode.backToMethods")}
          </Button>
          <DialogHeader>
            <DialogTitle>{t("auth.emailCode.title")}</DialogTitle>
            <DialogDescription>{t("auth.emailCode.description")}</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleStart} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-code-email">{t("auth.emailCode.emailLabel")}</Label>
              <Input
                ref={emailInputRef}
                id="email-code-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={state.emailDraft}
                placeholder={t("auth.emailCode.emailPlaceholder")}
                disabled={state.phase === "sending"}
                aria-invalid={emailErrorMessage ? true : undefined}
                aria-describedby={emailErrorId}
                onChange={(event) => dispatch({ type: "SET_EMAIL", email: event.target.value })}
              />
              {emailErrorMessage ? (
                <p id={emailErrorId} role="alert" className="text-sm text-destructive">
                  {emailErrorMessage}
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={state.phase === "sending" || emailRetryRemaining > 0}
            >
              {state.phase === "sending" ? <Loader2 className="animate-spin" /> : <Mail />}
              {state.phase === "sending"
                ? t("auth.emailCode.sending")
                : emailRetryRemaining > 0
                  ? t("auth.emailCode.retryCountdown", { seconds: emailRetryRemaining })
                  : t("auth.emailCode.send")}
            </Button>
          </form>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit px-2"
            onClick={handleChangeEmail}
            disabled={state.phase !== "code-entry"}
          >
            <ArrowLeft />
            {t("auth.emailCode.changeEmail")}
          </Button>
          <DialogHeader>
            <DialogTitle>{t("auth.emailCode.codeTitle")}</DialogTitle>
            <DialogDescription>
              {t("auth.emailCode.codeDescription", { email: state.maskedDestination ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleVerify}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-code-value">{t("auth.emailCode.codeLabel")}</Label>
              <Input
                ref={codeInputRef}
                id="email-code-value"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={state.codeLength}
                value={state.verificationCode}
                placeholder={t("auth.emailCode.codePlaceholder", { count: state.codeLength })}
                disabled={state.phase !== "code-entry" || isCodeExpired}
                aria-invalid={codeErrorMessage ? true : undefined}
                aria-describedby={codeErrorId}
                onChange={(event) => dispatch({ type: "SET_CODE", code: event.target.value })}
              />
              {codeErrorMessage ? (
                <p id={codeErrorId} role="alert" className="text-sm text-destructive">
                  {codeErrorMessage}
                </p>
              ) : null}
              {state.notice === "code_resent" ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("auth.emailCode.codeResent")}
                </p>
              ) : null}
              {!isCodeExpired && expiryRemaining > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("auth.emailCode.codeExpiresIn", { seconds: expiryRemaining })}
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={
                state.phase !== "code-entry"
                || isCodeExpired
                || verifyRetryRemaining > 0
                || state.verificationCode.length !== state.codeLength
              }
            >
              {state.phase === "verifying" ? <Loader2 className="animate-spin" /> : <KeyRound />}
              {state.phase === "verifying"
                ? t("auth.emailCode.verifying")
                : verifyRetryRemaining > 0
                  ? t("auth.emailCode.retryCountdown", { seconds: verifyRetryRemaining })
                  : t("auth.emailCode.verify")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleResend}
              disabled={
                state.phase !== "code-entry"
                || resendRemaining > 0
                || resendRetryRemaining > 0
              }
            >
              {state.phase === "resending" ? <Loader2 className="animate-spin" /> : null}
              {state.phase === "resending"
                ? t("auth.emailCode.resending")
                : resendRetryRemaining > 0
                  ? t("auth.emailCode.retryCountdown", { seconds: resendRetryRemaining })
                  : resendRemaining > 0
                    ? t("auth.emailCode.resendCountdown", { seconds: resendRemaining })
                    : t("auth.emailCode.resend")}
            </Button>
          </form>
        </>
      )}

      {onUseHostedLogin ? (
        <Button
          type="button"
          variant="link"
          className="h-auto self-center p-0"
          onClick={handleHostedFallback}
          disabled={state.phase === "verifying"}
        >
          {t("auth.emailCode.hostedFallback")}
        </Button>
      ) : null}
    </div>
  );
}
