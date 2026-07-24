import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  multiFactor,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as signOutGcpIdentity,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { QRCodeSVG } from "qrcode.react";
import { gcpIdentityAuth } from "@/integrations/gcp/identity";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function AuthPage() {
  const { session, bffSession, bffError, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const requestedFrom = params.get("from");
  const from = requestedFrom?.startsWith("/") && !requestedFrom.startsWith("//")
    ? requestedFrom
    : "/management/cockpit";
  const authRequired = params.get("reason") === "auth-required";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [totpQrUrl, setTotpQrUrl] = useState("");

  useEffect(() => {
    if (bffSession) nav(from, { replace: true });
  }, [bffSession, from, nav]);

  const signIn = async () => {
    setBusy(true);
    try {
      await signInWithEmailAndPassword(gcpIdentityAuth, email, password);
    } catch (error: unknown) {
      if (
        error instanceof FirebaseError
        && error.code === "auth/multi-factor-auth-required"
      ) {
        setMfaResolver(
          getMultiFactorResolver(gcpIdentityAuth, error as MultiFactorError),
        );
        setOtp("");
      } else {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const signUp = async () => {
    setBusy(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        gcpIdentityAuth,
        email,
        password,
      );
      await sendEmailVerification(credential.user, {
        url: `${window.location.origin}/auth`,
      });
      await signOutGcpIdentity(gcpIdentityAuth);
      toast.success("Account created. Check your email to verify it, then sign in.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      toast.error("Enter your email first.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(gcpIdentityAuth, email, {
        url: `${window.location.origin}/auth`,
      });
      toast.success("Password reset email sent.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const finishMfaSignIn = async () => {
    if (!mfaResolver) return;
    const hint = mfaResolver.hints.find(
      (candidate) => candidate.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    );
    if (!hint) {
      toast.error("This account has no supported authenticator factor.");
      return;
    }
    setBusy(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        hint.uid,
        otp,
      );
      await mfaResolver.resolveSignIn(assertion);
      setMfaResolver(null);
      setOtp("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    if (!session?.user) return;
    setBusy(true);
    try {
      await sendEmailVerification(session.user, {
        url: `${window.location.origin}/auth`,
      });
      toast.success("Verification email sent.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const refreshVerification = async () => {
    if (!session?.user) return;
    setBusy(true);
    try {
      await session.user.reload();
      await session.user.getIdToken(true);
      if (!session.user.emailVerified) {
        toast.error("Email is not verified yet.");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const beginTotpEnrollment = async () => {
    if (!session?.user) return;
    setBusy(true);
    try {
      await session.user.reload();
      if (!session.user.emailVerified) {
        throw new Error("Verify your email before setting up MFA.");
      }
      const enrollmentSession = await multiFactor(session.user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(enrollmentSession);
      setTotpSecret(secret);
      setTotpQrUrl(secret.generateQrCodeUrl(
        session.user.email ?? session.user.uid,
        "Pantheon Management",
      ));
      setOtp("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const finishTotpEnrollment = async () => {
    if (!session?.user || !totpSecret) return;
    setBusy(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        otp,
      );
      await multiFactor(session.user).enroll(assertion, "Pantheon Authenticator");
      await signOutGcpIdentity(gcpIdentityAuth);
      setTotpSecret(null);
      setTotpQrUrl("");
      setOtp("");
      toast.success("Authenticator enrolled. Sign in again with your verification code.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Pantheon Management</h1>
          <p className="text-sm text-muted-foreground">Sign in to access the cockpit.</p>
        </div>
        {authRequired && !session ? (
          <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">Your Pantheon session is missing or expired.</p>
            <p className="mt-1 text-muted-foreground">
              Sign in again to reconnect live data. Pantheon did not substitute fallback data.
            </p>
          </div>
        ) : null}
        {mfaResolver ? (
          <div className="space-y-3 rounded-md border p-4">
            <p className="font-medium">Authenticator verification</p>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app.
            </p>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/gu, ""))}
            />
            <Button
              className="w-full"
              onClick={() => void finishMfaSignIn()}
              disabled={busy || otp.length !== 6}
            >
              Verify and sign in
            </Button>
            <Button
              className="w-full"
              variant="ghost"
              onClick={() => setMfaResolver(null)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        ) : session?.user && !session.user.emailVerified ? (
          <div className="space-y-3 rounded-md border p-4">
            <p className="font-medium">Verify your email</p>
            <p className="text-sm text-muted-foreground">
              Pantheon will not admit this session until {session.user.email} is verified.
            </p>
            <Button className="w-full" onClick={() => void refreshVerification()} disabled={busy}>
              I verified my email
            </Button>
            <Button className="w-full" variant="outline" onClick={() => void resendVerification()} disabled={busy}>
              Resend verification email
            </Button>
            <Button className="w-full" variant="ghost" onClick={() => void signOut()} disabled={busy}>
              Use another account
            </Button>
          </div>
        ) : session?.user && multiFactor(session.user).enrolledFactors.length === 0 ? (
          <div className="space-y-3 rounded-md border p-4">
            <p className="font-medium">Set up authenticator MFA</p>
            <p className="text-sm text-muted-foreground">
              A TOTP authenticator is required before this GCP Identity account can access Pantheon.
            </p>
            {totpSecret && totpQrUrl ? (
              <>
                <div className="mx-auto w-fit rounded-md bg-white p-3">
                  <QRCodeSVG value={totpQrUrl} size={176} />
                </div>
                <p className="break-all rounded bg-muted p-2 text-center font-mono text-xs">
                  {totpSecret.secretKey}
                </p>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/gu, ""))}
                />
                <Button
                  className="w-full"
                  onClick={() => void finishTotpEnrollment()}
                  disabled={busy || otp.length !== 6}
                >
                  Confirm authenticator
                </Button>
              </>
            ) : (
              <Button className="w-full" onClick={() => void beginTotpEnrollment()} disabled={busy}>
                Start MFA setup
              </Button>
            )}
            <Button className="w-full" variant="ghost" onClick={() => void signOut()} disabled={busy}>
              Use another account
            </Button>
          </div>
        ) : session && !loading && bffError ? (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="font-medium">Pantheon session verification failed.</p>
            <p className="mt-1 text-muted-foreground">{bffError.message}</p>
            <Button className="mt-3 w-full" variant="outline" onClick={() => void signOut()}>
              Clear session and sign in again
            </Button>
          </div>
        ) : (
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="space-y-3 pt-4">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button className="w-full" onClick={signIn} disabled={busy}>Sign in</Button>
            <Button className="w-full" variant="ghost" onClick={() => void resetPassword()} disabled={busy}>
              Forgot password
            </Button>
          </TabsContent>
          <TabsContent value="signup" className="space-y-3 pt-4">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="12+ chars: upper, lower, number, symbol" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button className="w-full" onClick={signUp} disabled={busy}>Create account</Button>
          </TabsContent>
        </Tabs>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Authentication is provided by GCP Identity Platform.
        </p>
      </div>
    </div>
  );
}
