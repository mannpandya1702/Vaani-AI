import { Component, ReactNode } from 'react';

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Top-level error boundary. Without this, any render-time exception
 * leaves the user with a blank white screen on stage. With this, they
 * see a calm message + a refresh button + the (truncated) error so a
 * dev in the room can diagnose. Audit-§3 finding (priya).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, componentStack: null };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  reset = () => this.setState({ error: null, componentStack: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background">
        <div className="w-16 h-16 rounded-full bg-red-500/15 text-red-700 dark:text-red-300 flex items-center justify-center mb-4 text-3xl">
          !
        </div>
        <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground mb-4">
          The app hit an unexpected error and couldn't render this view. The team has been notified.
          Try refreshing — if it keeps happening, hold a finger up to whoever's onstage.
        </p>
        <pre className="mt-2 max-w-2xl text-[11px] text-left bg-muted/60 rounded p-3 overflow-auto max-h-48">
          {String(this.state.error?.message ?? this.state.error).slice(0, 600)}
          {this.state.componentStack && (
            <>{'\n'}{this.state.componentStack.slice(0, 600)}</>
          )}
        </pre>
        <div className="mt-4 flex gap-2">
          <button
            onClick={this.reset}
            className="rounded-md border bg-secondary/60 hover:bg-secondary px-3 py-1.5 text-sm"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-vaani-saffron text-vaani-navy px-3 py-1.5 text-sm font-semibold"
          >
            Refresh page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
