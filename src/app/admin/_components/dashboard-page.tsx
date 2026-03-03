"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { api } from "~/trpc/react";
import { Skeleton } from "~/components/ui/skeleton";
import { useQueryState } from "nuqs";
import { useEffect } from "react";

export function DashboardPage() {
  const { data: stats, isLoading } = api.analytics.getDailyStats.useQuery();
  const [code, setCode] = useQueryState("code");
  const renewToken = api.xero.updateTokenset.useMutation();
  const renewXero = async () => {
    await renewToken.mutateAsync({
      url: window.location.href,
    });
    void setCode(null);
  };
  useEffect(() => {
    if (code) {
      void renewXero();
    }
  }, [code]);

  return (
    <div className="p-6">
      <h1 className="mb-6 text-3xl font-bold">Admin Dashboard</h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Unique Visitors Today</CardTitle>
            <CardDescription>Distinct users visiting your site</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-1/2" />
            ) : (
              <p className="text-3xl font-bold">{stats?.uniqueVisitorsCount}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Listing Views Today</CardTitle>
            <CardDescription>
              Product views in the last 24 hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-1/2" />
            ) : (
              <p className="text-3xl font-bold">{stats?.listingViewCount}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Orders</CardTitle>
            <CardDescription>
              Orders with &quot;Paid&quot; status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-1/2" />
            ) : (
              <p className="text-3xl font-bold">{stats?.pendingOrdersCount}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
