// Global error boundary — renders a red error card instead of a black/blank
// screen when any descendant throws during render or in a lifecycle.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional label shown in the card header. */
  scope?: string;
  /** When true (default), shows "Reload" + "Go home" actions. */
  showActions?: boolean;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", this.props.scope ?? "app", error, info);
  }

  private reset = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const showActions = this.props.showActions !== false;
    const scope = this.props.scope ?? "App";
    const stack = (info?.componentStack ?? error.stack ?? "")
      .split("\n").slice(0, 8).join("\n");

    return (
      <div
        role="alert"
        className="m-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="font-semibold text-sm">
            畫面渲染失敗（{scope}）
          </div>
          {showActions && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={this.reset}
                className="text-xs px-2 py-1 rounded border border-destructive/40 hover:bg-destructive/10"
              >
                重試
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-xs px-2 py-1 rounded border border-destructive/40 hover:bg-destructive/10"
              >
                重新載入
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = "/management/cockpit"; }}
                className="text-xs px-2 py-1 rounded border border-destructive/40 hover:bg-destructive/10"
              >
                回首頁
              </button>
            </div>
          )}
        </div>
        <div className="text-xs font-mono break-all mb-2">
          {error.name}: {error.message}
        </div>
        {stack && (
          <pre className="text-[10px] font-mono whitespace-pre-wrap opacity-70 max-h-48 overflow-auto">
            {stack}
          </pre>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
