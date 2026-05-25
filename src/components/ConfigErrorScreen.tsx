interface ConfigErrorScreenProps {
  detail?: string;
}

export default function ConfigErrorScreen({ detail }: ConfigErrorScreenProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#fff",
        color: "#111",
      }}
    >
      <div style={{ maxWidth: 560, textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
          Konfiguratsiooniviga
        </h1>
        <p style={{ lineHeight: 1.5, color: "#374151" }}>
          VITE_SUPABASE_URL või VITE_SUPABASE_ANON_KEY puudub Lovable
          keskkonna seadetes. Kontrolli env variables ja deploy uuesti.
        </p>
        {detail ? (
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
            {detail}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
