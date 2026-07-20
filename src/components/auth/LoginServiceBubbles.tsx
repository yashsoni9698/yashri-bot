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

const DESKTOP_LANES = [
  { id: 0, x: "-92px", tail: "login-service-bubble-tail-right" },
  { id: 1, x: "0px", tail: "login-service-bubble-tail-center" },
  { id: 2, x: "92px", tail: "login-service-bubble-tail-left" },
] as const;

const MOBILE_LANES = [
  { id: 0, x: "-52px", tail: "login-service-bubble-tail-right" },
  { id: 1, x: "0px", tail: "login-service-bubble-tail-center" },
  { id: 2, x: "52px", tail: "login-service-bubble-tail-left" },
] as const;

const SPAWN_MS = 2800;
const MOBILE_LIFETIME_MS = 4800;
const DESKTOP_LIFETIME_MS = 5200;
const MAX_BUBBLES = 3;

type BubbleLane = {
  id: number;
  x: string;
  tail: string;
};

type ActiveBubble = {
  id: number;
  label: string;
  lane: BubbleLane;
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

    function spawn() {
      setBubbles((current) => {
        if (current.length >= MAX_BUBBLES) return current;

        const lanes = mobileRef.current ? MOBILE_LANES : DESKTOP_LANES;
        const lane = lanes[laneRef.current % lanes.length];
        laneRef.current += 1;

        const label =
          GRAPHIC_DESIGN_SERVICES[
            serviceRef.current % GRAPHIC_DESIGN_SERVICES.length
          ];
        serviceRef.current += 1;

        return [
          ...current,
          {
            id: idRef.current++,
            label,
            lane,
            mobile: mobileRef.current,
          },
        ];
      });
    }

    function onViewportChange() {
      sync();
      setBubbles([]);
      spawn();
    }

    spawn();
    const id = window.setInterval(spawn, SPAWN_MS);
    mq.addEventListener("change", onViewportChange);
    return () => {
      window.clearInterval(id);
      mq.removeEventListener("change", onViewportChange);
    };
  }, []);

  return (
    <div className="login-service-bubbles" aria-hidden>
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className={cn(
            "login-service-bubble",
            bubble.mobile
              ? "login-service-bubble-rise-mobile"
              : "login-service-bubble-rise-desktop"
          )}
          style={
            {
              "--bubble-x": bubble.lane.x,
              animationDuration: `${
                bubble.mobile ? MOBILE_LIFETIME_MS : DESKTOP_LIFETIME_MS
              }ms`,
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
