'use client';

/** Catches failures in the root layout itself, where the normal error boundary
 *  cannot mount. Must render its own <html>/<body> and cannot use app styles. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center',
          background: '#08080a', color: '#f4f1ea', fontFamily: 'system-ui, sans-serif',
          padding: '2rem', textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>PRISM failed to start</h1>
          <p style={{ marginTop: '1rem', color: '#8b877e', lineHeight: 1.6, fontSize: '0.9rem' }}>
            A fatal error occurred before the interface could load.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '1.75rem', padding: '0.65rem 1.4rem', borderRadius: '0.6rem',
              border: 0, background: '#f4f1ea', color: '#08080a', fontSize: '0.9rem',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
