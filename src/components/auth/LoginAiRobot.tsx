import { LoginServiceBubbles } from "@/components/auth/LoginServiceBubbles";

export function LoginAiRobot() {
  return (
    <div className="login-ai-robot-panel animate-fade-up">
      <LoginServiceBubbles />
      <div className="login-ai-robot" aria-hidden>
      <div className="login-ai-robot-glow" />
      <svg
        viewBox="0 0 200 240"
        className="login-ai-robot-svg relative z-10 h-32 w-32 sm:h-36 sm:w-36 md:h-52 md:w-52 lg:h-60 lg:w-60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="robot-body" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="55%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
          <linearGradient id="robot-face" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#042f2e" />
            <stop offset="100%" stopColor="#134e4a" />
          </linearGradient>
          <linearGradient id="robot-chest" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
          <filter id="robot-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="login-ai-robot-float">
          {/* Shadow */}
          <ellipse
            cx="100"
            cy="228"
            rx="42"
            ry="8"
            fill="rgba(15,118,110,0.18)"
            className="login-ai-robot-shadow"
          />

          {/* Left arm */}
          <g className="login-ai-robot-arm-left">
            <rect x="24" y="118" width="18" height="44" rx="9" fill="url(#robot-body)" />
            <circle cx="33" cy="168" r="10" fill="#0d9488" />
          </g>

          {/* Right arm */}
          <g className="login-ai-robot-arm-right">
            <rect x="158" y="118" width="18" height="44" rx="9" fill="url(#robot-body)" />
            <circle cx="167" cy="168" r="10" fill="#0d9488" />
          </g>

          {/* Body */}
          <rect x="58" y="108" width="84" height="88" rx="22" fill="url(#robot-body)" />
          <rect
            x="72"
            y="124"
            width="56"
            height="40"
            rx="10"
            fill="url(#robot-face)"
            stroke="#5eead4"
            strokeWidth="1.5"
            opacity="0.95"
          />

          {/* Chest lines */}
          <g className="login-ai-robot-chest">
            <rect x="78" y="132" width="44" height="4" rx="2" fill="url(#robot-chest)" opacity="0.9" />
            <rect x="78" y="142" width="32" height="3" rx="1.5" fill="#99f6e4" opacity="0.7" />
            <rect x="78" y="150" width="38" height="3" rx="1.5" fill="#99f6e4" opacity="0.5" />
          </g>

          {/* Legs */}
          <rect x="74" y="192" width="22" height="28" rx="10" fill="#0d9488" />
          <rect x="104" y="192" width="22" height="28" rx="10" fill="#0d9488" />
          <rect x="70" y="214" width="30" height="10" rx="5" fill="#134e4a" />
          <rect x="100" y="214" width="30" height="10" rx="5" fill="#134e4a" />

          {/* Head */}
          <rect x="52" y="36" width="96" height="78" rx="24" fill="url(#robot-body)" />
          <rect
            x="64"
            y="52"
            width="72"
            height="46"
            rx="14"
            fill="url(#robot-face)"
            stroke="#5eead4"
            strokeWidth="2"
          />

          {/* Antenna */}
          <g className="login-ai-robot-antenna">
            <rect x="96" y="18" width="8" height="22" rx="4" fill="#0d9488" />
            <circle cx="100" cy="14" r="7" fill="#2dd4bf" filter="url(#robot-glow)" />
          </g>

          {/* Eyes */}
          <g className="login-ai-robot-eyes">
            <circle cx="82" cy="74" r="9" fill="#5eead4" filter="url(#robot-glow)" />
            <circle cx="118" cy="74" r="9" fill="#5eead4" filter="url(#robot-glow)" />
            <circle cx="85" cy="71" r="3" fill="#ecfeff" className="login-ai-robot-eye-shine" />
            <circle cx="121" cy="71" r="3" fill="#ecfeff" className="login-ai-robot-eye-shine" />
          </g>

          {/* Mouth display */}
          <rect x="86" y="88" width="28" height="4" rx="2" fill="#2dd4bf" opacity="0.8" />
        </g>
      </svg>
      </div>
    </div>
  );
}
