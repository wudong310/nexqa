// ── Trend Analysis + Quality Risk Types ─────────────────

export interface AITrendInsight {
  id: string;
  projectId: string;
  date: string;
  passRate: number;
  type: "improvement" | "regression" | "anomaly";
  title: string;
  analysis: string;
  suggestion?: string;
  relatedCases?: string[];
  confidence: number;
}

export interface QualityRiskCause {
  description: string;
  relatedCases: string[];
}

export interface QualityRisk {
  id: string;
  projectId: string;
  level: "high" | "medium" | "low";
  title: string;
  trend: number[];
  prediction?: number;
  causes: QualityRiskCause[];
  suggestion: string;
  actionLabel?: string;
  confidence: number;
  createdAt: string;
  dismissedAt?: string;
}

export interface TrendAnalysisResult {
  insights: AITrendInsight[];
  risks: QualityRisk[];
}
