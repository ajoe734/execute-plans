import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut as signOutGcpIdentity,
  GoogleAuthProvider,
} from "firebase/auth";
import { gcpIdentityAuth } from "@/integrations/gcp/identity";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function AuthPage() {
  const { session, bffSession, bffError, loading, retryBffSession, signOut } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const requestedFrom = params.get("from");
  const agoraEntry = location.pathname === "/agora/auth";
  const from = requestedFrom?.startsWith("/") && !requestedFrom.startsWith("//")
    ? requestedFrom
    : agoraEntry ? "/agora/trading-room" : "/management/cockpit";
  const isAgora = agoraEntry || from === "/agora" || from.startsWith("/agora/");
  const productName = isAgora ? "Agora" : "Pantheon Management";
  const productArea = isAgora ? "trading workbench" : "cockpit";
  const authRequired = params.get("reason") === "auth-required";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (bffSession) nav(from, { replace: true });
  }, [bffSession, from, nav]);

  const signIn = async () => {
    setBusy(true);
    try {
      await signInWithEmailAndPassword(gcpIdentityAuth, email, password);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      await signInWithPopup(gcpIdentityAuth, new GoogleAuthProvider());
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
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
        url: `${window.location.origin}${agoraEntry ? "/agora/auth" : "/auth"}`,
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
        url: `${window.location.origin}${agoraEntry ? "/agora/auth" : "/auth"}`,
      });
      toast.success("Password reset email sent.");
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
        url: `${window.location.origin}${agoraEntry ? "/agora/auth" : "/auth"}`,
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

  const retryAccessVerification = async () => {
    setBusy(true);
    try {
      await retryBffSession();
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
          <h1 className="text-2xl font-semibold">{productName}</h1>
          <p className="text-sm text-muted-foreground">Sign in once to access the {productArea}.</p>
        </div>
        {authRequired && !session ? (
          <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">Your {isAgora ? "Agora" : "Pantheon"} session is missing or expired.</p>
            <p className="mt-1 text-muted-foreground">
              Sign in once to reconnect live data. {isAgora ? "Agora" : "Pantheon"} did not substitute fallback data.
            </p>
          </div>
        ) : null}
        {loading ? (
          <div role="status" className="rounded-md border p-4 text-sm">
            <p className="font-medium">Verifying {isAgora ? "Agora access" : "your Pantheon session"}…</p>
            <p className="mt-1 text-muted-foreground">
              Your identity is already signed in. You do not need to enter it again.
            </p>
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
        ) : session && !loading && bffError ? (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="font-medium">{isAgora ? "Agora access" : "Pantheon session"} verification failed.</p>
            <p className="mt-1 text-muted-foreground">{bffError.message}</p>
            <Button
              className="mt-3 w-full"
              variant="outline"
              onClick={() => void retryAccessVerification()}
              disabled={busy}
            >
              Retry access verification
            </Button>
            <Button className="mt-2 w-full" variant="ghost" onClick={() => void signOut()} disabled={busy}>
              Use another account
            </Button>
          </div>
        ) : (
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="space-y-3 pt-4">
            <Button className="w-full" variant="outline" onClick={() => void signInWithGoogle()} disabled={busy}>
              Continue with Google
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>or use email</span>
              <span className="h-px flex-1 bg-border" />
            </div>
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
          {isAgora
            ? "Agora uses your Pantheon single sign-on identity; there is no separate Agora password."
            : "Authentication is provided by GCP Identity Platform."}
        </p>
      </div>
    </div>
  );
}
