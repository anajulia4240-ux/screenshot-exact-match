import v1 from "@/assets/video-1.mp4.asset.json";
import v2 from "@/assets/video-2.mp4.asset.json";
import v3 from "@/assets/video-3.mp4.asset.json";
import v4 from "@/assets/video-4.mp4.asset.json";

const VIDEOS = [v1, v2, v3, v4];

/** Vertical videos with native controls so the sound plays when the customer taps play. */
export function VideoSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10">
      <h2 className="mb-4 text-xl font-bold">Veja quem já usa</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {VIDEOS.map((v) => (
          <video
            key={v.asset_id}
            src={v.url}
            controls
            playsInline
            preload="metadata"
            className="aspect-[9/16] w-full rounded-xl bg-muted object-cover"
            onPlay={(e) => {
              // Pause the other videos so the audio doesn't overlap.
              document.querySelectorAll("video").forEach((el) => {
                if (el !== e.currentTarget) el.pause();
              });
            }}
          />
        ))}
      </div>
    </section>
  );
}
