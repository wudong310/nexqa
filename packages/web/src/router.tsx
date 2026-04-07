import { AppShell } from "@/components/layout/app-shell";
import { ApiTestPage } from "@/routes/api-test";
import { CICDPage } from "@/routes/cicd";
import { CoveragePage } from "@/routes/coverage";
import { DashboardPage } from "@/routes/dashboard";
import { EnvironmentsPage } from "@/routes/environments";
import { ExecutionHistoryPage } from "@/routes/execution-history";
import { OpenClawPage } from "@/routes/openclaw";
import { ProjectSelectPage } from "@/routes/project-select";
import { ProjectSettingsPage } from "@/routes/project-settings";
import { ProjectsPage } from "@/routes/projects";
import { ReportsPage } from "@/routes/reports";
import { SecurityReportPage } from "@/routes/security-report";
import { SettingsPage } from "@/routes/settings";
import { TestChainsPage } from "@/routes/test-chains";
import { TestPlansPage } from "@/routes/test-plans";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { redirect } from "@tanstack/react-router";

const rootRoute = createRootRoute({ component: AppShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectSelectPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/dashboard",
  component: DashboardPage,
});

const apiTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/api",
  component: ApiTestPage,
});

const apiImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/api/import",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/p/$projectId/api", params: { projectId: params.projectId } });
  },
  component: () => null,
});

const testChainsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/chains",
  component: TestChainsPage,
});

const executionHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/history",
  component: ExecutionHistoryPage,
});

const testPlansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/plans",
  component: TestPlansPage,
});

const coverageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/coverage",
  component: CoveragePage,
});

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/reports",
  component: ReportsPage,
});

const environmentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/environments",
  component: EnvironmentsPage,
});

const cicdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/cicd",
  component: CICDPage,
});

const openclawRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/openclaw",
  component: OpenClawPage,
});

const projectSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/settings",
  component: ProjectSettingsPage,
});

const securityReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/security/$taskId",
  component: SecurityReportPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectsRoute,
  dashboardRoute,
  apiTestRoute,
  apiImportRoute,
  testChainsRoute,
  testPlansRoute,
  coverageRoute,
  executionHistoryRoute,
  reportsRoute,
  securityReportRoute,
  environmentsRoute,
  cicdRoute,
  openclawRoute,
  projectSettingsRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree, basepath: "/nexqa" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
