"use client";

import { Button } from "~/components/ui/button";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export function SettingsXeroPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  const authenticateXero = api.xero.authenticate.useMutation();
  const connectionStatus = api.xero.testXeroConnection.useQuery(undefined, {
    retry: 1,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (connectionStatus.isSuccess || connectionStatus.isError) {
      setIsChecking(false);
    }
  }, [connectionStatus.isSuccess, connectionStatus.isError]);

  const onRenew = async () => {
    const result = await authenticateXero.mutateAsync();
    if (result) {
      void router.push(result);
    }
  };

  return (
    <div className="p-6">
      <h1 className="mb-6 text-3xl font-bold">Xero Settings</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            {/* Connect your Xero account to enable automatic synchronization with
            your accounting system. */}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isChecking ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking connection status...</span>
            </div>
          ) : connectionStatus.isError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error checking Xero connection</AlertTitle>
              <AlertDescription>
                We couldn&apos;t verify your Xero connection status. Please try
                again later.
              </AlertDescription>
            </Alert>
          ) : connectionStatus.data ? (
            <div className="mb-4 flex flex-col gap-2">
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle>Connected to Xero</AlertTitle>
                <AlertDescription>
                  Your Xero account is successfully authenticated and ready to
                  use.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div className="mb-4 flex flex-col gap-2">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Not connected to Xero</AlertTitle>
                <AlertDescription>
                  Your Xero account is not currently connected. Please connect
                  to enable accounting features.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {!connectionStatus.data && !isChecking && (
            <Button
              onClick={onRenew}
              disabled={authenticateXero.isPending}
              className="mt-4"
            >
              {authenticateXero.isPending
                ? "Connecting..."
                : "Connect Xero Account"}
            </Button>
          )}

          {connectionStatus.data && (
            <Button
              onClick={onRenew}
              variant="outline"
              disabled={authenticateXero.isPending}
              className="mt-4"
            >
              {authenticateXero.isPending
                ? "Reconnecting..."
                : "Reconnect Xero Account"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
