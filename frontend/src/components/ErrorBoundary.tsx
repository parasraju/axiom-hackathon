import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled SafeRoute UI error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen w-screen bg-slate-950 text-white p-6">
          <div className="p-4 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 mb-4">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h1 className="text-xl font-bold mb-2">SafeRoute Application Notice</h1>
          <p className="text-sm text-slate-400 max-w-md text-center mb-6">
            A rendering error occurred ({this.state.error?.message || 'Unexpected exception'}).
          </p>
          <button
            onClick={this.handleReload}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold shadow-lg transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reload SafeRoute Dashboard</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
