import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { track } from "@/lib/track";
import v1 from "@/assets/video-1.mp4.asset.json";
import v2 from "@/assets/video-2.mp4.asset.json";
import v3 from "@/assets/video-3.mp4.asset.json";
import v4 from "@/assets/video-4.mp4.asset.json";

const VIDEOS = [v1, v2, v3, v4];

/**
 * Vídeos verticais: só carregam quando chegam perto da tela (mais leve no 4G),
 * mostram o primeiro quadro como capa e um botão de play. Ao tocar, abrem com som e controles.
 */
function VideoCard({ url, n }: { url: string; n: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const counted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-muted">
      <video
        ref={ref}
        // "#t=0.1" faz o navegador (inclusive iPhone) mostrar o 1º quadro como capa.
        src={visible ? `${url}#t=0.1` : undefined}
        controls={playing}
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
        onPlay={(e) => {
          setPlaying(true);
          // Aba Eventos: registra o 1º play de cada vídeo.
          if (!counted.current) {
            counted.current = true;
            void track("video_play", { label: `Vídeo ${n}` });
          }
          // Pausa os outros vídeos para o áudio não sobrepor.
          document.querySelectorAll("video").forEach((el) => {
            if (el !== e.currentTarget) el.pause();
          });
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      {!playing && (
        <button
          type="button"
          aria-label="Assistir vídeo"
          onClick={() => void ref.current?.play()}
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-black/5 to-transparent transition hover:from-black/55"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-primary shadow-lg ring-4 ring-white/30 transition active:scale-95">
            <Play className="ml-1 h-6 w-6 fill-current" />
          </span>
        </button>
      )}
    </div>
  );
}

export function VideoSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10">
      <h2 className="mb-3 text-lg font-bold sm:mb-4 sm:text-xl">Veja quem já usa</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {VIDEOS.map((v, i) => (
          <VideoCard key={v.asset_id} url={v.url} n={i + 1} />
        ))}
      </div>
    </section>
  );
}
