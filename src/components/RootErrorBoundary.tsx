import { Component, type ReactNode } from "react";
import ConfigErrorScreen from "./ConfigErrorScreen";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[RootErrorBoundary]", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const msg = error.message || "";
    const isConfigError =
      msg.includes("supabaseUrl is required") ||
      msg.includes("Supabase client unavailable") ||
      msg.includes("VITE_SUPABASE");

    if (isConfigError) {
      return <ConfigErrorScreen detail={msg} />;
    }

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: 560, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
            Midagi läks valesti
          </h1>
          <pre
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              background: "#f3f4f6",
              borderRadius: 6,
              fontSize: "0.75rem",
              textAlign: "left",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {msg}
          </pre>
        </div>
      </div>
    );
  }
}
