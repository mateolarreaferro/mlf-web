export default function Vimeo({ id, title }: { id: string; title?: string }) {
  return (
    <figure className="my-10">
      <div className="aspect-video overflow-hidden rounded-2xl">
        <iframe
          src={`https://player.vimeo.com/video/${id}`}
          title={title ?? "Video"}
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
      {title ? <figcaption className="label mt-2">{title}</figcaption> : null}
    </figure>
  );
}
