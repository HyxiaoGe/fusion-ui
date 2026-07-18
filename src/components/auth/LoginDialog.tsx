"use client";

import { Github, KeyRound, Loader2, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { EmailCodeLoginPanel } from "@/components/auth/EmailCodeLoginPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  cancelEmailCodeLogin,
  resendEmailCodeLogin,
  startEmailCodeLogin,
  verifyEmailCodeLogin,
} from "@/lib/auth/emailCodeAuth";
import { isAuthConfigured } from "@/lib/auth/auth-sdk";
import {
  getEmailLoginCapabilities,
  startSsoLogin,
  type EmailLoginCapabilities,
  type SsoProvider,
} from "@/lib/auth/authService";
import "@/lib/i18n";
import { useAppDispatch } from "@/redux/hooks";
import { completeEmailCodeLogin } from "@/redux/slices/authSlice";

const EMAIL_LOGIN_UNAVAILABLE: EmailLoginCapabilities = { headless: false };

export function LoginDialog({
  open,
  onOpenChange,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const dispatch = useAppDispatch();
  const [internalOpen, setInternalOpen] = useState(false);
  const [view, setView] = useState<"methods" | "email">("methods");
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailCapabilities, setEmailCapabilities] = useState<EmailLoginCapabilities>(EMAIL_LOGIN_UNAVAILABLE);
  const [criticalOperation, setCriticalOperation] = useState(false);
  const criticalOperationRef = useRef(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const isControlled = open !== undefined;
  const requestedOpen = isControlled ? open : internalOpen;
  // 外层受控 prop 即使在 verify 途中变成 false，也要等 authorization code 完成/失败后再关闭。
  const dialogOpen = criticalOperation ? true : requestedOpen;
  const isAnyLoginLoading = isGitHubLoading || isGoogleLoading;

  const setCritical = (critical: boolean) => {
    criticalOperationRef.current = critical;
    setCriticalOperation(critical);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && criticalOperationRef.current) return;
    if (!isControlled) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    let active = true;
    setEmailCapabilities(EMAIL_LOGIN_UNAVAILABLE);
    if (!dialogOpen) return () => { active = false; };

    void getEmailLoginCapabilities()
      .then((capabilities) => {
        if (active) setEmailCapabilities(capabilities);
      })
      .catch(() => {
        if (active) setEmailCapabilities(EMAIL_LOGIN_UNAVAILABLE);
      });

    return () => { active = false; };
  }, [dialogOpen]);

  useEffect(() => {
    if (dialogOpen) return;
    setView("methods");
    setIsGitHubLoading(false);
    setIsGoogleLoading(false);
    criticalOperationRef.current = false;
    setCriticalOperation(false);
  }, [dialogOpen]);

  const resetLoginLoading = () => {
    setIsGitHubLoading(false);
    setIsGoogleLoading(false);
  };

  const startOAuthLogin = (provider: SsoProvider) => {
    if (!isAuthConfigured()) {
      toast({ message: t("auth.configurationMissing"), type: "error" });
      resetLoginLoading();
      return;
    }

    void startSsoLogin(provider).catch(() => {
      toast({ message: t("auth.loginFailed"), type: "error" });
      resetLoginLoading();
    });
  };

  const handleGitHubLogin = () => {
    setIsGitHubLoading(true);
    startOAuthLogin("github");
  };

  const handleGoogleLogin = () => {
    setIsGoogleLoading(true);
    startOAuthLogin("google");
  };

  const handleEmailLogin = () => {
    if (!isAuthConfigured()) {
      toast({ message: t("auth.configurationMissing"), type: "error" });
      return;
    }
    setView("email");
  };

  const handleVerifyEmailCode = async (input: Parameters<typeof verifyEmailCodeLogin>[0]) => {
    await verifyEmailCodeLogin(input);
    await dispatch(completeEmailCodeLogin()).unwrap();
  };

  const handleEmailAuthenticated = () => handleDialogOpenChange(false);

  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className="sm:max-w-md"
        closeLabel={t("auth.closeDialog")}
        showCloseButton={!criticalOperation}
        onEscapeKeyDown={(event) => {
          if (criticalOperationRef.current) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (criticalOperationRef.current) event.preventDefault();
        }}
      >
        {view === "email" ? (
          <EmailCodeLoginPanel
            active={dialogOpen}
            start={startEmailCodeLogin}
            resend={resendEmailCodeLogin}
            verify={handleVerifyEmailCode}
            cancel={cancelEmailCodeLogin}
            onBackToMethods={() => setView("methods")}
            onAuthenticated={handleEmailAuthenticated}
            onCriticalOperationChange={setCritical}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("auth.loginTitle")}</DialogTitle>
              <DialogDescription>{t("auth.loginDescription")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col space-y-4 py-4">
              <Button onClick={handleGitHubLogin} disabled={isAnyLoginLoading}>
                {isGitHubLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Github className="mr-2 h-4 w-4" />
                )}
                {t("auth.githubLogin")}
              </Button>
              <Button onClick={handleGoogleLogin} disabled={isAnyLoginLoading}>
                {isGoogleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {t("auth.googleLogin")}
              </Button>
              {emailCapabilities.headless ? (
                <Button onClick={handleEmailLogin} disabled={isAnyLoginLoading}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  {t("auth.emailCodeLogin")}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
