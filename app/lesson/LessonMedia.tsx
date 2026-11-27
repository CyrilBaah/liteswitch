"use client";
// The heavy part of the page: the intro video and the lesson images.
// FULL: autoplaying 1080p video + retina PNGs + web font.
// LITE: 8 KB poster (360p video loads only on tap) + small lazy JPEGs.
import { useEffect, useState } from "react";
import { recordExposure } from "@/lib/flags";
import { useVariant } from "./VariantProvider";
// Real file sizes, written by scripts/make-media.sh. The receipt uses them to
// count video bytes the browser streams but doesn't report.
import MEDIA_SIZES from "./media-sizes.json";

export function IntroMedia() {
  const { decision, setIntroVisible } = useVariant();
  const [tapped, setTapped] = useState(false);

  // Record the exposure as soon as the variant is committed to the page,
  // before the media finishes loading. A full-page visitor who gives up during
  // the heavy download still counts as "shown full, didn't start".
  // recordExposure() does nothing unless Flagsmith said inExperiment === true.
  useEffect(() => {
    if (decision) recordExposure(decision);
  }, [decision]);

  // Still deciding: an empty box of the right size, no downloads.
  if (!decision) return <div className="media-slot" aria-busy="true" />;

  if (decision.config.video === "autoplay-hd") {
    return (
      <div className="media-slot">
        <video
          src="/media/git-intro-1080p.mp4"
          data-bytes={MEDIA_SIZES["git-intro-1080p.mp4"]}
          autoPlay
          muted
          loop
          playsInline
          // Autoplaying, looping video must be pausable, keyboard users included.
          controls
          preload="auto"
          // First frame is on screen -> the lesson counts as visible.
          onLoadedData={() => setIntroVisible(true)}
          // If the video can't load at all, don't lock the visitor out of the lesson text.
          onError={() => setIntroVisible(true)}
        />
      </div>
    );
  }

  // LITE: poster first, real (small) video only after a tap.
  return (
    <div className="media-slot">
      {tapped ? (
        <video
          src="/media/git-intro-360p.mp4"
          data-bytes={MEDIA_SIZES["git-intro-360p.mp4"]}
          controls
          autoPlay
          playsInline
        />
      ) : (
        <button className="poster" onClick={() => setTapped(true)} aria-label="Play the intro video (360p, about 0.24 MB)">
          {/* Plain <img> on purpose: next/image would re-encode our files and change the page weights we measure. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/media/git-intro-poster.jpg"
            alt="Intro video: Git in 10 minutes"
            width={640}
            height={360}
            // ref covers the case where the poster was cached and loaded before React attached onLoad.
            ref={(img) => { if (img?.complete) setIntroVisible(true); }}
            onLoad={() => setIntroVisible(true)}
          />
          <span className="play">▶ Tap to load video · 360p · 0.24 MB</span>
        </button>
      )}
    </div>
  );
}

type StepImageProps = {
  /** Base name in /public/media, e.g. "diagram" -> diagram-hd.png / diagram-low.jpg */
  name: string;
  alt: string;
  width: number;
  height: number;
};

export function StepImage({ name, alt, width, height }: StepImageProps) {
  const { decision } = useVariant();
  // Reserve the space so nothing jumps, but don't download until we know the variant.
  if (!decision) return <div className="img-slot" style={{ aspectRatio: `${width} / ${height}` }} />;

  const lite = decision.config.images === "low-lazy";
  return (
    // Plain <img> on purpose: next/image would resize/re-encode the HD files,
    // and the experiment needs the real full-page weight.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="lesson-img"
      src={lite ? `/media/${name}-low.jpg` : `/media/${name}-hd.png`}
      alt={alt}
      width={width}
      height={height}
      loading={lite ? "lazy" : "eager"}
    />
  );
}
