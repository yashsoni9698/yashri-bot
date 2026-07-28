/** Decorative full-screen login backdrop (pointer-events none). */
export function LoginBackground() {
  return (
    <div className="login-bg-scene" aria-hidden>
      <div className="login-bg-base" />
      <div className="login-bg-mesh login-bg-mesh-a" />
      <div className="login-bg-mesh login-bg-mesh-b" />
      <div className="login-bg-grid login-bg-grid-drift" />
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-orb login-bg-orb-3" />
      <div className="login-bg-shimmer" />
    </div>
  );
}
