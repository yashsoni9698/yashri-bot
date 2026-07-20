"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export const GRAPHIC_DESIGN_SERVICES = [
  "Logo Designing",
  "Business Card",
  "Invitation Card",
  "Template Design",
  "Social Media Post",
  "Festival Greetings",
  "Envelope Designing",
  "Video Invitation",
  "Packaging Box",
  "Certificates",
  "Bill Book",
  "Brochure Design",
  "Flyer & Poster",
  "Brand Identity",
  "Banner Design",
  "Letterhead Design",
] as const;

const LANES = [
  { id: 0, x: "-110px", tail: "login-service-bubble-tail-right" },
  { id: 1, x: "0px", tail: "login-service-bubble-tail-center" },
  { id: 2, x: "110px", tail: "login-service-bubble-tail-left" },
] as const;

const MOBILE_LANES = [
  { id: 0, x: "-64px", tail: "login-service-bubble-tail-right" },
  { id: 1, x: "0px", tail: "login-service-bubble-tail-center" },
  { id: 2, x: "64px", tail: "login-service-bubble-tail-left" },
] as const;

const SPAWN_MS = 2600;
const LIFETIME_MS = 5200;
const MAX_BUBBLES = 4;

type ActiveBubble = {
  id: number;
  label: string;
  lane: (typeof LANES)[number];
  mobile: boolean;
};

export function LoginServiceBubbles() {
  const [bubbles, setBubbles] = useState<ActiveBubble[]>([]);
  const serviceRef = useRef(0);
  const laneRef = useRef(0);
  const idRef = useRef(0);
  const mobileRef = useRef(false);

  const removeBubble = useCallback((id: number) => {
    setBubbles((current) => current.filter((b) => b.id !== id));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      mobileRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    function spawn() {
      setBubbles((current) => {
        if (current.length >= MAX_BUBBLES) return current;

        const lanes = mobileRef.current ? MOBILE_LANES : LANES;
        const lane = lanes[laneRef.current % lanes.length];
        laneRef.current += 1;

        const label =
          GRAPHIC_DESIGN_SERVICES[
            serviceRef.current % GRAPHIC_DESIGN_SERVICES.length
          ];
        serviceRef.current += 1;

        const bubble: ActiveBubble = {
          id: idRef.current++,
          label,
          lane,
          mobile: mobileRef.current,
        };

        return [...current, bubble];
      });
    }

    spawn();
    const id = window.setInterval(spawn, SPAWN_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="login-service-bubbles" aria-hidden>
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className="login-service-bubble login-service-bubble-rise"
          style={
            {
              "--bubble-x": bubble.lane.x,
              animationDuration: `${LIFETIME_MS}ms`,
            } as CSSProperties
          }
          onAnimationEnd={() => removeBubble(bubble.id)}
        >
          <span
            className={cn("login-service-bubble-tail", bubble.lane.tail)}
            aria-hidden
          />
          <p className="login-service-bubble-text">{bubble.label}</p>
        </div>
      ))}
    </div>
  );
}
