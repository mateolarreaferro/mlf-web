"use client";

import { usePathname, useRouter } from "next/navigation";
import { TOUR_EVENT, TOUR_NOW_KEY } from "@/lib/intro";

/* Replays the tour; from any other page it goes home first and the tour picks up there. */
export default function TourButton() {
  const pathname = usePathname();
  const router = useRouter();

  const start = () => {
    if (pathname === "/") {
      window.dispatchEvent(new Event(TOUR_EVENT));
      return;
    }
    try {
      sessionStorage.setItem(TOUR_NOW_KEY, "1");
    } catch {}
    router.push("/");
  };

  return (
    <button type="button" onClick={start} className="label cursor-pointer hover:text-accent">
      tour
    </button>
  );
}
