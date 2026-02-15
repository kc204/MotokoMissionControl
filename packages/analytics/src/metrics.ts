import { Metric, MetricType } from "@motoko/core";

export class MetricsCollector {
  private metrics: Metric[] = [];
  
  record(type: MetricType, value: number, labels?: Record<string, string>): void {
    this.metrics.push({
      id: `metric-${Date.now()}`,
      type,
      value,
      labels,
      timestamp: Date.now()
    });
  }
  
  getMetrics(type?: MetricType): Metric[] {
    return type ? this.metrics.filter(m => m.type === type) : this.metrics;
  }
  
  getAverage(type: MetricType): number {
    const typeMetrics = this.metrics.filter(m => m.type === type);
    if (typeMetrics.length === 0) return 0;
    return typeMetrics.reduce((sum, m) => sum + m.value, 0) / typeMetrics.length;
  }
}
