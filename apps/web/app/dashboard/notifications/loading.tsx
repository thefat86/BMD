export default function Loading() {
  return (
    <div
      style={{
        padding: "12px 16px 24px",
        maxWidth: "100%",
        margin: "0 auto",
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, var(--night) 0%, var(--indigo) 100%)",
      }}
    >
      <div
        style={{
          height: 20,
          width: 160,
          marginTop: 14,
          marginBottom: 18,
          borderRadius: 6,
          background: "rgba(244,228,193,0.05)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: 72,
              background: "rgba(244,228,193,0.04)",
              border: "1px solid rgba(244,228,193,0.06)",
              borderRadius: 14,
              opacity: 0.7,
              animation: `bmd-notif-skel 1.2s ease-in-out ${i * 0.08}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes bmd-notif-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
