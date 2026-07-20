import { LoginServiceBubbles } from "@/components/auth/LoginServiceBubbles";

export function LoginAiRobot() {
  return (
    <div className="login-ai-robot-panel animate-fade-up">
      <LoginServiceBubbles />
      <div className="login-ai-robot login-ai-robot-float" aria-hidden>
        <div className="login-ai-robot-glow" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/yashri-ai-assistant.png?v=yash-ai"
          alt=""
          width={682}
          height={1024}
          decoding="async"
          className="login-ai-robot-image relative z-10"
        />
        <div className="login-ai-robot-floor-shadow" />
      </div>
    </div>
  );
}
