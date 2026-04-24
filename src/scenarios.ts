export type MetricKind =
  | "latency"
  | "rate"
  | "count"
  | "throughput"
  | "duration";

export interface MetricDef {
  name: string;
  label: string;
  kind: MetricKind;
  group?: string;
  size?: string;
  higherIsBetter?: boolean;
}

export interface ScenarioDef {
  id: string;
  label: string;
  description: string;
  color: string;
  metrics: MetricDef[];
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "bucket-mounting",
    label: "Bucket Mounting",
    description: "Mount, unmount, read, write, and roundtrip latencies",
    color: "#6366f1",
    metrics: [
      {
        name: "bucket-mount-latency",
        label: "Mount",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "bucket-unmount-latency",
        label: "Unmount",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "bucket-write-latency",
        label: "Write",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "bucket-read-latency",
        label: "Read",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "bucket-roundtrip-latency",
        label: "Roundtrip",
        kind: "latency",
        higherIsBetter: false,
      },
    ],
  },
  {
    id: "backup-restore",
    label: "Backup & Restore",
    description: "Backup creation and restoration latency by file size",
    color: "#f59e0b",
    metrics: [
      {
        name: "backup-create-latency-100mb",
        label: "Create",
        kind: "latency",
        group: "create",
        size: "100MB",
        higherIsBetter: false,
      },
      {
        name: "backup-create-latency-500mb",
        label: "Create",
        kind: "latency",
        group: "create",
        size: "500MB",
        higherIsBetter: false,
      },
      {
        name: "backup-create-latency-1gb",
        label: "Create",
        kind: "latency",
        group: "create",
        size: "1GB",
        higherIsBetter: false,
      },
      {
        name: "backup-restore-latency-100mb",
        label: "Restore",
        kind: "latency",
        group: "restore",
        size: "100MB",
        higherIsBetter: false,
      },
      {
        name: "backup-restore-latency-500mb",
        label: "Restore",
        kind: "latency",
        group: "restore",
        size: "500MB",
        higherIsBetter: false,
      },
      {
        name: "backup-restore-latency-1gb",
        label: "Restore",
        kind: "latency",
        group: "restore",
        size: "1GB",
        higherIsBetter: false,
      },
      {
        name: "backup-read-after-restore",
        label: "Read After Restore",
        kind: "latency",
        group: "after",
        higherIsBetter: false,
      },
      {
        name: "backup-write-after-restore",
        label: "Write After Restore",
        kind: "latency",
        group: "after",
        higherIsBetter: false,
      },
    ],
  },
  {
    id: "file-io",
    label: "File I/O",
    description:
      "Read, write, roundtrip, and concurrent I/O latency by file size",
    color: "#22c55e",
    metrics: [
      {
        name: "file-write-latency-1kb",
        label: "Write",
        kind: "latency",
        group: "write",
        size: "1KB",
        higherIsBetter: false,
      },
      {
        name: "file-read-latency-1kb",
        label: "Read",
        kind: "latency",
        group: "read",
        size: "1KB",
        higherIsBetter: false,
      },
      {
        name: "file-roundtrip-latency-1kb",
        label: "Roundtrip",
        kind: "latency",
        group: "roundtrip",
        size: "1KB",
        higherIsBetter: false,
      },
      {
        name: "file-concurrent-write-1kb",
        label: "Conc. Write",
        kind: "latency",
        group: "conc-write",
        size: "1KB",
        higherIsBetter: false,
      },
      {
        name: "file-concurrent-read-1kb",
        label: "Conc. Read",
        kind: "latency",
        group: "conc-read",
        size: "1KB",
        higherIsBetter: false,
      },
      {
        name: "file-write-latency-10kb",
        label: "Write",
        kind: "latency",
        group: "write",
        size: "10KB",
        higherIsBetter: false,
      },
      {
        name: "file-read-latency-10kb",
        label: "Read",
        kind: "latency",
        group: "read",
        size: "10KB",
        higherIsBetter: false,
      },
      {
        name: "file-roundtrip-latency-10kb",
        label: "Roundtrip",
        kind: "latency",
        group: "roundtrip",
        size: "10KB",
        higherIsBetter: false,
      },
      {
        name: "file-concurrent-write-10kb",
        label: "Conc. Write",
        kind: "latency",
        group: "conc-write",
        size: "10KB",
        higherIsBetter: false,
      },
      {
        name: "file-concurrent-read-10kb",
        label: "Conc. Read",
        kind: "latency",
        group: "conc-read",
        size: "10KB",
        higherIsBetter: false,
      },
      {
        name: "file-write-latency-100kb",
        label: "Write",
        kind: "latency",
        group: "write",
        size: "100KB",
        higherIsBetter: false,
      },
      {
        name: "file-read-latency-100kb",
        label: "Read",
        kind: "latency",
        group: "read",
        size: "100KB",
        higherIsBetter: false,
      },
      {
        name: "file-roundtrip-latency-100kb",
        label: "Roundtrip",
        kind: "latency",
        group: "roundtrip",
        size: "100KB",
        higherIsBetter: false,
      },
      {
        name: "file-concurrent-write-100kb",
        label: "Conc. Write",
        kind: "latency",
        group: "conc-write",
        size: "100KB",
        higherIsBetter: false,
      },
      {
        name: "file-concurrent-read-100kb",
        label: "Conc. Read",
        kind: "latency",
        group: "conc-read",
        size: "100KB",
        higherIsBetter: false,
      },
      {
        name: "file-write-latency-1mb",
        label: "Write",
        kind: "latency",
        group: "write",
        size: "1MB",
        higherIsBetter: false,
      },
      {
        name: "file-read-latency-1mb",
        label: "Read",
        kind: "latency",
        group: "read",
        size: "1MB",
        higherIsBetter: false,
      },
      {
        name: "file-roundtrip-latency-1mb",
        label: "Roundtrip",
        kind: "latency",
        group: "roundtrip",
        size: "1MB",
        higherIsBetter: false,
      },
    ],
  },
  {
    id: "bursty-traffic",
    label: "Bursty Traffic",
    description: "Latency and success metrics under burst load conditions",
    color: "#ef4444",
    metrics: [
      {
        name: "baseline-latency",
        label: "Baseline Latency",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "burst-command",
        label: "Burst Commands",
        kind: "count",
        higherIsBetter: undefined,
      },
      {
        name: "burst-duration",
        label: "Burst Duration",
        kind: "duration",
        higherIsBetter: false,
      },
      {
        name: "burst-success-rate",
        label: "Burst Success Rate",
        kind: "rate",
        higherIsBetter: true,
      },
      {
        name: "recovery-latency",
        label: "Recovery Latency",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "recovery-overhead",
        label: "Recovery Overhead",
        kind: "rate",
        higherIsBetter: false,
      },
    ],
  },
  {
    id: "sustained-throughput",
    label: "Sustained Throughput",
    description: "Command throughput and latency under sustained load",
    color: "#06b6d4",
    metrics: [
      {
        name: "command-latency",
        label: "Command Latency",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "total-commands",
        label: "Total Commands",
        kind: "count",
        higherIsBetter: true,
      },
      {
        name: "completed-commands",
        label: "Completed Commands",
        kind: "count",
        higherIsBetter: true,
      },
      {
        name: "actual-throughput",
        label: "Throughput",
        kind: "throughput",
        higherIsBetter: true,
      },
      {
        name: "latency-degradation",
        label: "Latency Degradation",
        kind: "latency",
        higherIsBetter: false,
      },
    ],
  },
  {
    id: "concurrent-creation",
    label: "Concurrent Creation",
    description: "Concurrent sandbox creation performance and success rate",
    color: "#a78bfa",
    metrics: [
      {
        name: "sandbox-creation",
        label: "Creation Latency",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "total-concurrent-time",
        label: "Total Time",
        kind: "duration",
        higherIsBetter: false,
      },
      {
        name: "success-rate",
        label: "Success Rate",
        kind: "rate",
        higherIsBetter: true,
      },
    ],
  },
  {
    id: "burst-startup",
    label: "Burst Startup",
    description: "Startup latency and success rate under burst conditions",
    color: "#f97316",
    metrics: [
      {
        name: "burst-startup-latency",
        label: "Startup Latency",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "burst-startup-total-time",
        label: "Total Time",
        kind: "duration",
        higherIsBetter: false,
      },
      {
        name: "burst-startup-success-rate",
        label: "Success Rate",
        kind: "rate",
        higherIsBetter: true,
      },
    ],
  },
  {
    id: "cold-start",
    label: "Cold Start",
    description: "Cold vs warm start latency comparison",
    color: "#38bdf8",
    metrics: [
      {
        name: "cold-start-latency",
        label: "Cold Start",
        kind: "latency",
        higherIsBetter: false,
      },
      {
        name: "warm-command-latency",
        label: "Warm Command",
        kind: "latency",
        higherIsBetter: false,
      },
    ],
  },
];
