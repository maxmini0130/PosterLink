"use client";

import React from "react";

interface State { hasError: boolean; message: string }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <p className="text-5xl">⚠️</p>
            <h2 className="text-xl font-black text-gray-900">문제가 발생했습니다</h2>
            <p className="text-sm text-gray-500 font-bold">{this.state.message || "잠시 후 다시 시도해주세요."}</p>
            <button
              onClick={() => { this.setState({ hasError: false, message: "" }); window.location.reload(); }}
              className="mt-4 px-6 py-3 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
