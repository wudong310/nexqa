import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Environment } from "@nexqa/shared";
import { Link } from "@tanstack/react-router";
import { Globe, Info } from "lucide-react";

interface BaseURLMigrationCardProps {
  projectId: string;
  defaultEnv: Environment | null;
}

export function BaseURLMigrationCard({
  projectId,
  defaultEnv,
}: BaseURLMigrationCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Base URL 和请求头</CardTitle>
      </CardHeader>
      <CardContent>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>已迁移到环境管理</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">
              Base URL 和请求头现在统一在「环境管理」中配置。
              不同环境（开发/测试/生产）可以使用不同的 URL 和 Headers。
            </p>
            {defaultEnv && (
              <div className="text-xs text-muted-foreground space-y-0.5 mt-2">
                <p>
                  当前默认环境:{" "}
                  <strong>{defaultEnv.name}</strong> ({defaultEnv.slug})
                </p>
                <p>
                  Base URL:{" "}
                  <code className="bg-muted px-1 rounded">
                    {defaultEnv.baseURL}
                  </code>
                </p>
              </div>
            )}
            <div className="pt-2">
              <Link
                to="/p/$projectId/environments"
                params={{ projectId }}
              >
                <Button variant="outline" size="sm">
                  <Globe className="h-3.5 w-3.5 mr-1.5" />
                  前往环境管理
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
