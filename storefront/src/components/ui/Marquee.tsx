/**
 * The running brand ticker — the strip of promises that scrolls slowly across
 * the page, the way most modern fashion storefronts announce delivery and
 * payment terms.
 *
 * The list is rendered twice and the track is translated by exactly half its
 * width, which is what makes the loop seamless. The duplicate is hidden from
 * screen readers so the message is announced once.
 *
 * Motion stops entirely for visitors who ask for reduced motion (index.css).
 */
export function Marquee({
  items,
  className = "",
}: {
  items: string[];
  className?: string;
}) {
  const track = (
    <ul className="flex shrink-0 items-center">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-10 px-5">
          <span className="text-[0.625rem] tracking-eyebrow whitespace-nowrap uppercase">
            {item}
          </span>
          <span aria-hidden="true" className="text-accent">
            &#9670;
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={`group relative overflow-hidden ${className}`}>
      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
        {track}
        <div aria-hidden="true" className="flex">
          {track}
        </div>
      </div>
    </div>
  );
}
