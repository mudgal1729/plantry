// Share preview + send. Opened from the Menu's "Share this week" button. Shows
// the shareable image family as a horizontal swipe rail (menu, grocery, then one
// recipe sheet per dish marked "include recipe when sharing"), the way the
// images arrive on WhatsApp, and a Send button that renders each slide to a PNG
// client-side and hands the set to the OS share sheet.
//
// Rendering (design-revamp §1.7): the slides on screen and the exported PNGs
// come from the same ShareImages components, so they cannot drift (the
// DOM-to-image discipline). To export at a crisp 3x without showing a giant
// off-screen copy, a hidden capture stage holds a 360px-wide render of each
// slide; html-to-image walks that node and paints it to a PNG at pixelRatio 3.
//
// Delivery: the Web Share API level 2 (files) opens the native share sheet with
// all the PNGs attached, which is how an installed PWA shares into WhatsApp on
// both iOS and Android. When files-sharing is unavailable (desktop, older
// browsers) the fallback downloads every image so the user can attach them by
// hand. No server, no Convex action: the whole family is produced on the phone.

import { useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import type { Dish } from "@plantry/engine";
import type { CurrentWeek } from "../lib/types.js";
import { dishById } from "../lib/library.js";
import { weekRangeLabel } from "../lib/days.js";
import { Sheet, PrimaryButton } from "./primitives.js";
import {
  MenuShareImage,
  GroceryShareImage,
  RecipeShareImage,
  type ShareGroceryGroup,
} from "./ShareImages.js";

interface SharePreviewSheetProps {
  week: CurrentWeek;
  grocery: ShareGroceryGroup[];
  onClose: () => void;
}

interface Slide {
  id: string;
  label: string;
  fileSlug: string;
  node: React.ReactNode;
}

// The dishes the week has marked "include recipe when sharing", in week order,
// de-duplicated by dish id (the same dish placed twice rides one recipe sheet).
function includedDishes(week: CurrentWeek): Dish[] {
  const seen = new Set<number>();
  const out: Dish[] = [];
  for (const slot of week.slots) {
    for (const pick of slot.dishes) {
      if (!pick.includeRecipe || pick.dishId === null) continue;
      if (seen.has(pick.dishId)) continue;
      const dish = dishById(pick.dishId);
      if (!dish) continue;
      seen.add(pick.dishId);
      out.push(dish);
    }
  }
  return out;
}

function safeSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "dish"
  );
}

export function SharePreviewSheet({ week, grocery, onClose }: SharePreviewSheetProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "shared" | "downloaded" | "error">(
    "idle",
  );

  const recipes = useMemo(() => includedDishes(week), [week]);
  const rangeLabel = weekRangeLabel(week.weekStart);

  const slides: Slide[] = useMemo(() => {
    const list: Slide[] = [
      {
        id: "menu",
        label: "Menu",
        fileSlug: "menu",
        node: <MenuShareImage week={week} />,
      },
      {
        id: "grocery",
        label: "Grocery list",
        fileSlug: "grocery",
        node: <GroceryShareImage groups={grocery} weekStart={week.weekStart} />,
      },
      ...recipes.map((dish) => ({
        id: `recipe-${dish.id}`,
        label: dish.name,
        fileSlug: `recipe-${safeSlug(dish.name)}`,
        node: <RecipeShareImage dish={dish} />,
      })),
    ];
    return list;
  }, [week, grocery, recipes]);

  // Render each capture node to a PNG File. The nodes live in the hidden stage
  // below, keyed by slide id; we read them out of the stage in slide order.
  async function renderFiles(): Promise<File[]> {
    const stage = stageRef.current;
    if (!stage) return [];
    const files: File[] = [];
    for (const slide of slides) {
      const node = stage.querySelector<HTMLElement>(`[data-capture="${slide.id}"]`);
      if (!node) continue;
      // pixelRatio 3 matches the handoff's "exported at 3x" so the PNG is crisp
      // on a phone. cacheBust avoids a stale data-URL when the same node renders
      // twice across share attempts.
      const blob = await toBlob(node, { pixelRatio: 3, cacheBust: true });
      if (!blob) continue;
      files.push(
        new File(
          [blob],
          `plantry-${rangeLabel.replace(/\s+/g, "-").toLowerCase()}-${slide.fileSlug}.png`,
          {
            type: "image/png",
          },
        ),
      );
    }
    return files;
  }

  function downloadAll(files: File[]) {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick so the click has consumed the URL first.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  async function handleSend() {
    setStatus("working");
    try {
      const files = await renderFiles();
      if (files.length === 0) {
        setStatus("error");
        return;
      }
      // Web Share API level 2: share files into the native sheet when supported.
      // navigator.canShare gates on the actual files (some browsers expose share
      // but not file-sharing), so we only take this path when it will work.
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      const shareData: ShareData = {
        files,
        title: "Plantry",
        text: `This week's menu (${rangeLabel})`,
      };
      if (typeof nav.share === "function" && nav.canShare?.(shareData)) {
        try {
          await nav.share(shareData);
          setStatus("shared");
          return;
        } catch (err) {
          // A user cancel rejects with AbortError; that is not a failure, just
          // close quietly without falling through to a surprise download.
          if (err instanceof DOMException && err.name === "AbortError") {
            setStatus("idle");
            return;
          }
          // Any other share failure falls through to the download fallback.
        }
      }
      downloadAll(files);
      setStatus("downloaded");
    } catch (err) {
      console.error("share render failed", err);
      setStatus("error");
    }
  }

  const sending = status === "working";

  return (
    <Sheet onClose={onClose} tall>
      <div className="share__title">Share this week</div>
      <div className="share__sub">
        {slides.length} {slides.length === 1 ? "image" : "images"}, sent together. Swipe across to
        check them.
      </div>

      <div className="share__rail">
        {slides.map((slide, i) => (
          <div key={slide.id} className="share__slide">
            <div className="share__slide-label">
              {i + 1} of {slides.length} &middot; {slide.label}
            </div>
            <div className="share__slide-frame">{slide.node}</div>
          </div>
        ))}
      </div>

      {recipes.length === 0 && (
        <div className="share__hint">
          Turn on a dish&rsquo;s &ldquo;include recipe when sharing&rdquo; toggle to add recipe
          sheets.
        </div>
      )}

      {status === "error" && (
        <div className="share__error">Could not build the images. Please try again.</div>
      )}
      {status === "downloaded" && (
        <div className="share__hint">
          Images saved to this phone. Attach them in WhatsApp to send.
        </div>
      )}

      <PrimaryButton className="share__send" onClick={handleSend} disabled={sending}>
        {sending ? "Preparing images..." : "Send images"}
      </PrimaryButton>

      {/* Hidden capture stage. Each node renders at the share images' true 360px
          width, off-screen, so html-to-image can paint a crisp PNG without the
          giant render ever being visible. aria-hidden + off-screen, not
          display:none, because html-to-image needs a laid-out node to walk. */}
      <div ref={stageRef} className="share__stage" aria-hidden="true">
        {slides.map((slide) => (
          <div key={slide.id} data-capture={slide.id} className="share__capture">
            {slide.node}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
