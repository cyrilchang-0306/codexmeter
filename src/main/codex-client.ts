import { EventEmitter } from "node:events";
import { access } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type { RateLimitSnapshot } from "../shared/types";
import { mergeSnapshot } from "../shared/rate-limits";

interface RpcMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown> | null;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

const BUNDLED_CODEX = "/Applications/Codex.app/Contents/Resources/codex";

export class CodexClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private snapshot: RateLimitSnapshot | null = null;
  private stopping = false;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    this.stopping = false;
    await this.connect();
  }

  stop(): void {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectPending(new Error("Codex 连接已关闭。"));
    this.process?.kill();
    this.process = null;
  }

  async refresh(): Promise<RateLimitSnapshot> {
    const result = await this.request("account/rateLimits/read");
    const response = result as {
      rateLimits?: RateLimitSnapshot;
      rateLimitsByLimitId?: Record<string, RateLimitSnapshot> | null;
    };
    const snapshot =
      response.rateLimitsByLimitId?.codex ??
      response.rateLimits ??
      Object.values(response.rateLimitsByLimitId ?? {})[0];

    if (!snapshot) {
      throw new Error("Codex 未返回可识别的限额数据。");
    }

    this.snapshot = snapshot;
    this.emit("snapshot", snapshot);
    return snapshot;
  }

  private async resolveCodexPath(): Promise<string> {
    try {
      await access(BUNDLED_CODEX);
      return BUNDLED_CODEX;
    } catch {
      return "codex";
    }
  }

  private async connect(): Promise<void> {
    this.emit("status", "connecting");
    const command = await this.resolveCodexPath();
    const child = spawn(command, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
      windowsHide: true
    });
    this.process = child;

    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleLine(line));

    child.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message && !message.startsWith("WARNING:")) {
        this.emit("diagnostic", message);
      }
    });

    child.once("error", (error) => {
      this.emit("diagnostic", `spawn error: ${error.stack ?? error.message}`);
      this.handleDisconnect(error);
    });
    child.once("exit", (code) => {
      if (!this.stopping && this.process === child) {
        this.emit("diagnostic", `app-server exit code: ${code ?? "unknown"}`);
        this.handleDisconnect(new Error(`Codex app-server 已退出（代码 ${code ?? "未知"}）。`));
      }
    });

    try {
      await this.request("initialize", {
        clientInfo: {
          name: "codex_meter",
          title: "Codex Meter",
          version: "0.1.0"
        }
      });
      this.notify("initialized", {});
      await this.refresh();
      this.reconnectAttempt = 0;
      this.emit("status", "connected");
    } catch (error) {
      child.kill();
      throw error;
    }
  }

  private request(method: string, params: Record<string, unknown> | null = null): Promise<Record<string, unknown>> {
    if (!this.process?.stdin.writable) {
      return Promise.reject(new Error("Codex app-server 尚未连接。"));
    }

    const id = this.nextId++;
    this.write({ method, id, params });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 请求超时。`));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ method, params });
  }

  private write(message: RpcMessage): void {
    this.process?.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }

    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? "Codex 请求失败。"));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }

    if (message.method === "account/rateLimits/updated") {
      const update = message.params?.rateLimits as RateLimitSnapshot | undefined;
      if (update) {
        this.snapshot = mergeSnapshot(this.snapshot, update);
        this.emit("snapshot", this.snapshot);
      }
    }
  }

  private handleDisconnect(error: Error): void {
    if (this.stopping) {
      return;
    }
    this.process = null;
    this.rejectPending(error);
    this.emit("status", "error", error.message);
    this.scheduleReconnect();
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) {
      return;
    }
    const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error: Error) => this.handleDisconnect(error));
    }, delay);
  }
}
