"use client";

import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
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
import { toast } from "sonner";
import { Textarea } from "~/components/ui/textarea";

export function SettingsEbayPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [template, setTemplate] = useState("");

  const ebayLogin = api.ebay.authenticate.useMutation();
  const connectionStatus = api.ebay.testEbayConnection.useQuery(undefined, {
    retry: 1,
    retryDelay: 1000,
  });
  const templateQuery = api.ebay.getListingTemplate.useQuery();
  const defaultTemplateQuery = api.ebay.getDefaultListingTemplate.useQuery();
  const saveTemplate = api.ebay.saveListingTemplate.useMutation({
    onSuccess: () => {
      void templateQuery.refetch();
    },
  });
  const regenerate = api.ebay.regenerateAllDescriptions.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Updated ${data.succeeded}/${data.total} listings` +
          (data.failed > 0 ? ` (${data.failed} failed)` : ""),
      );
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (connectionStatus.isSuccess || connectionStatus.isError) {
      setIsChecking(false);
    }
  }, [connectionStatus.isSuccess, connectionStatus.isError]);

  useEffect(() => {
    if (templateQuery.isSuccess && template === "") {
      setTemplate(templateQuery.data ?? "");
    }
  }, [templateQuery.isSuccess, templateQuery.data, template]);

  const authenticateEbay = async () => {
    const url = await ebayLogin.mutateAsync();
    if (url) {
      void router.push(url);
    }
  };

  return (
    <div className="p-6">
      <h1 className="mb-6 text-3xl font-bold">Ebay Settings</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            {/* Connect your eBay account to enable automatic listing
            synchronization. */}
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
              <AlertTitle>Error checking eBay connection</AlertTitle>
              <AlertDescription>
                We couldn&apos;t verify your eBay connection status. Please try
                again later.
              </AlertDescription>
            </Alert>
          ) : connectionStatus.data ? (
            <div className="mb-4 flex flex-col gap-2">
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle>Connected to eBay</AlertTitle>
                <AlertDescription>
                  Your eBay account is successfully authenticated and ready to
                  use.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div className="mb-4 flex flex-col gap-2">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Not connected to eBay</AlertTitle>
                <AlertDescription>
                  Your eBay account is not currently connected. Please connect
                  to enable listing features.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {!connectionStatus.data && !isChecking && (
            <Button
              onClick={authenticateEbay}
              disabled={ebayLogin.isPending}
              className="mt-4"
            >
              {ebayLogin.isPending ? "Connecting..." : "Connect eBay Account"}
            </Button>
          )}

          {connectionStatus.data && (
            <Button
              onClick={authenticateEbay}
              variant="outline"
              disabled={ebayLogin.isPending}
              className="mt-4"
            >
              {ebayLogin.isPending ? "Reconnecting..." : "Refresh eBay Token"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Listing Template</CardTitle>
          <CardDescription>
            Edit the HTML used for eBay listing descriptions. Supported
            placeholders:
            <span className="ml-2 rounded bg-muted px-2 py-0.5 font-mono text-xs">
              {"{{DESCRIPTION}}"}
            </span>
            <span className="ml-2 rounded bg-muted px-2 py-0.5 font-mono text-xs">
              {"{{PARTS_TABLE}}"}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templateQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading template...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="h-[420px] font-mono text-sm"
                placeholder="Enter eBay HTML template"
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => saveTemplate.mutate({ template })}
                  disabled={saveTemplate.isPending || template.length === 0}
                >
                  {saveTemplate.isPending ? "Saving..." : "Save Template"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    defaultTemplateQuery.data
                      ? setTemplate(defaultTemplateQuery.data)
                      : undefined
                  }
                  disabled={defaultTemplateQuery.isLoading}
                >
                  Reset to Default
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Bulk Update Listings</CardTitle>
          <CardDescription>
            Push the current template to all published eBay listings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
          >
            {regenerate.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating listings…
              </>
            ) : (
              "Apply Template to All Listings"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
