export default function SoundCloud({ url, title }: { url: string; title?: string }) {
  const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
    url,
  )}&color=%23d9645e&inverse=false&auto_play=false&show_user=true`;
  return (
    <figure className="my-10">
      <iframe
        title={title ?? "SoundCloud player"}
        width="100%"
        height="166"
        scrolling="no"
        frameBorder="no"
        allow="autoplay"
        src={src}
      />
      {title ? <figcaption className="label mt-2">{title}</figcaption> : null}
    </figure>
  );
}
