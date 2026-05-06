import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendControlBar } from "./trend-control-bar";
import { TrendPassRateChart } from "./trend-pass-rate-chart";
import { TrendCaseCountChart } from "./trend-case-count-chart";
import { TrendFailTypeChart } from "./trend-fail-type-chart";
import { useTrends } from "@/hooks/use-coverage";
import type { Granularity, TimeRange } from "@/types/coverage";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface TrendSectionProps {
  projectId: string;
}

export function TrendSection({ projectId }: TrendSectionProps) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [range, setRange] = useState<TimeRange>("30d");

  const { data, isLoading } = useTrends(projectId, granularity, range);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">趋势分析</h3>
        <TrendControlBar
          granularity={granularity}
          range={range}
          onGranularityChange={setGranularity}
          onRangeChange={setRange}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[240px] w-full" />
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[200px] w-full" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[200px] w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pass rate chart — full width */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">通过率趋势</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendPassRateChart data={data?.passRate ?? []} height={240} />
            </CardContent>
          </Card>

          {/* Bottom two charts side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">用例执行统计</CardTitle>
              </CardHeader>
              <CardContent>
                <TrendCaseCountChart data={data?.caseCount ?? []} height={200} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">失败类型分布</CardTitle>
              </CardHeader>
              <CardContent>
                <TrendFailTypeChart data={data?.failType ?? []} height={200} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
