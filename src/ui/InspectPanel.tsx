import type { InspectItem } from "@/museum/Exhibit";

export function InspectPanel({ item, onClose, onGoto }: { item: InspectItem; onClose: () => void; onGoto?: (id: string) => void }) {
  const credit = item.image?.credit;
  return (
    <aside className="inspect" role="dialog" aria-label={item.title}>
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {item.image && (
        <figure>
          <img src={item.image.thumb} alt={item.image.caption || item.title} />
          {(item.image!.caption || credit) && (
            <figcaption>
              {item.image!.caption}
              {credit && (
                <>
                  {item.image!.caption ? " · " : ""}
                  <a href={credit.page} target="_blank" rel="noreferrer">
                    {credit.author ? `${credit.author}, ` : ""}
                    {credit.license}
                  </a>
                </>
              )}
            </figcaption>
          )}
        </figure>
      )}
      <h2 className={item.italic ? "italic" : undefined}>{item.title}</h2>
      {item.subtitle && <p className="subtitle">{item.subtitle}</p>}
      <ul className="meta">
        {item.meta.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      {item.body.split(/\n+/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <div className="actions">
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer">
            Read on Wikipedia ↗
          </a>
        )}
        {item.goto && onGoto && <button onClick={() => onGoto(item.goto!)}>Walk to this room</button>}
      </div>
      <p className="source">
        Text from Wikipedia, CC BY-SA 4.0.
        {item.silhouette && (
          <>
            {" "}
            Silhouette ({item.silhouette.depicts}):{" "}
            <a href={item.silhouette.page} target="_blank" rel="noreferrer">
              {item.silhouette.author ? `${item.silhouette.author}, ` : ""}
              {item.silhouette.license}
            </a>
            , via PhyloPic.
          </>
        )}
      </p>
    </aside>
  );
}
