function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|m4v)$/i.test(url);
}

function isAudioUrl(url: string) {
  return /\.(opus|ogg|mp3|m4a|wav|aac)$/i.test(url);
}

export function InterventionAttachments({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;

  const audios = urls.filter(isAudioUrl);
  const media = urls.filter((u) => !isAudioUrl(u));

  return (
    <div className="space-y-2">
      {media.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((url) =>
            isVideoUrl(url) ? (
              <video key={url} src={url} controls className="h-28 w-full rounded-md border object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="" className="h-28 w-full rounded-md border object-cover" />
            )
          )}
        </div>
      ) : null}
      {audios.map((url, i) => (
        <div key={url} className="space-y-1">
          <p className="text-xs text-muted-foreground">Message audio {audios.length > 1 ? i + 1 : ""}</p>
          <audio src={url} controls className="w-full" />
        </div>
      ))}
    </div>
  );
}
