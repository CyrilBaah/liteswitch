// Measures how many bytes this page actually pulled over the network,
// using the browser's Performance API. Powers the data-cost receipt.

/**
 * Price used by the receipt: 1,000 FCFA per GB.
 * Source: Orange Sénégal 1 GB internet pass at 1,000 FCFA (osiris.sn, June 2024).
 * Change this one number to match another operator or country.
 */
export const CFA_PER_GB = 1000;

/**
 * Bytes this page has pulled over the network so far:
 * 1. transferSize of the page and every finished download (Performance API).
 *    Cache hits report 0, which is correct: cached bytes cost the visitor nothing.
 * 2. Videos: browsers stream them in pieces and don't report those pieces, so
 *    for every <video data-bytes="..."> we estimate:
 *      file size x (seconds buffered / total seconds).
 *    data-bytes is the real file size, written into the page by the app.
 */
export function bytesTransferred(): number {
  const entries = [
    ...performance.getEntriesByType("navigation"),
    ...performance.getEntriesByType("resource"),
  ] as PerformanceResourceTiming[];

  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-bytes]"));
  const videoUrls = new Set(videos.map((v) => v.currentSrc));

  // Finished downloads, skipping videos (counted below, so never twice).
  let total = entries
    .filter((entry) => !videoUrls.has(entry.name))
    .reduce((sum, entry) => sum + (entry.transferSize || 0), 0);

  for (const video of videos) {
    if (!video.duration || !Number.isFinite(video.duration)) continue;
    let bufferedSeconds = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      bufferedSeconds += video.buffered.end(i) - video.buffered.start(i);
    }
    total += Number(video.dataset.bytes) * Math.min(1, bufferedSeconds / video.duration);
  }
  return Math.round(total);
}

export function bytesToCfa(bytes: number): number {
  return (bytes / 1_000_000_000) * CFA_PER_GB;
}
