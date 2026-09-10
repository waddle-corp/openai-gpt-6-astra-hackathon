import type { CSSProperties } from 'react';
import { cents, money, type Product } from '@/lib/shop';
import { imageUrl } from '@/lib/source';
import { CompatibilityAssembly } from './compatibility-assembly';
import { GTR_HOTSPOTS, wheelOptions, type Hotspot } from './vehicle-hotspots';
import { WheelSwatches } from './wheel-swatches';
import { VehicleModel } from './vehicle-model';
import { compatibleParts, fitInfo, isPart, isVehicle, matchingVehicles, partCategory } from './compatibility-data';

export function FitsPanel({ product }: { product: Product }) {
  if (!isPart(product)) return null;
  const info = fitInfo(product);
  const evidence = info.evidence.filter(s => !info.notes.includes(s));
  return (
    <section className="fits-panel compatibility-desktop" aria-labelledby="fits-heading">
      <div className="fits-title"><span aria-hidden="true" className="fit-symbol">↔</span><h2 id="fits-heading">Fits your ride</h2></div>
      {info.models.length > 0 && <ul className="fit-models">
        {info.models.map(model => {
          const vehicle = matchingVehicles(model.key, product)[0];
          return <li key={model.key}>{vehicle ? <a href={`/store/products/${vehicle.handle}`}>{model.label} <span aria-hidden="true">↗</span></a> : <span>{model.label}</span>}</li>;
        })}
      </ul>}
      {evidence.length > 0 ? <div className="fit-evidence">{evidence.map(s => <p key={s}>{s}</p>)}</div> : !info.models.length && <p>Model compatibility is not specified in this listing. Confirm the fit for your exact model before ordering.</p>}
      {info.notes.length > 0 && <div className="fit-notes"><h3>Before you order</h3><ul>{info.notes.map(s => <li key={s}>{s}</li>)}</ul></div>}
      {product.handle === 'boosted-charger' && <p className="fit-replacement"><a href="/store/products/boostedusa-hyperlane-fast-charger">View the replacement Hyperlane Fast Charger →</a><span>For V2/V3 boards and Rev. Not for Gen 1.</span></p>}
      <p className="fit-source">From the product description. {product.variants.length > 1 ? 'Fit and contents may depend on the selected option.' : 'Models not listed are not confirmed.'}</p>
    </section>
  );
}

function PartCard({ product, index, note, preview }: { product: Product; index: number; note?: string; preview?: boolean }) {
  const prices = product.variants.map(v => cents(v.price));
  const price = prices.length ? Math.min(...prices) : 0;
  const swatches = preview && partCategory(product) === 'Wheels' ? wheelOptions(product) : [];
  return (
    <article className="compatibility-part" style={{ '--dock-index': index } as CSSProperties}>
      <a href={`/store/products/${product.handle}`}>
        <div className="compatibility-part-top"><span>{partCategory(product)}</span><span aria-hidden="true">↗</span></div>
        {product.images[0] ? <img src={imageUrl(product.images[0].url)} alt="" width="180" height="120" loading="lazy" /> : <div className="compatibility-no-image">No image available</div>}
        <h3>{product.title}</h3>
        <p className="compatibility-part-price">{Math.max(...prices) > price ? 'From ' : ''}{money(price)}{product.variants.every(v => !v.availableForSale) && <span>Sold out</span>}</p>
        {note && <p className="compatibility-part-note">{note}</p>}
        <span className="compatibility-part-link">View part <span aria-hidden="true">→</span></span>
      </a>
      {swatches.length > 0 && <WheelSwatches options={swatches} />}
    </article>
  );
}

export function CompatibleParts({ product }: { product: Product }) {
  if (!isVehicle(product)) return null;
  const all = compatibleParts(product);
  // Give the assembly a mix of part categories, with all remaining matches below.
  const featured = all.filter((item, i) => all.findIndex(other => partCategory(other.product) === partCategory(item.product)) === i).slice(0, 4);
  for (const item of all) {
    if (featured.length >= 4) break;
    if (!featured.includes(item)) featured.push(item);
  }
  const more = all.filter(item => !featured.includes(item));
  // ponytail: one stylised GTR-style board model covers the electric skateboards; other vehicles keep their photo.
  const model3d = /skateboard/i.test(product.productType) && !/scooter|bike|onewheel/i.test(product.title);
  const hotspots: Hotspot[] = featured.flatMap(item => {
    const anchor = GTR_HOTSPOTS[partCategory(item.product) as keyof typeof GTR_HOTSPOTS];
    return anchor ? [{ ...anchor, label: partCategory(item.product), href: `/store/products/${item.product.handle}` }] : [];
  });
  const cardNote = (part: Product) => part.handle === 'evolve-skateboards-battery-charger-400013-ss20'
    ? (/hadean/i.test(product.title) ? 'Select Hadean 5A · 3-pin connector' : 'Select GTR/Stoke 4A · D-shape connector')
    : part.variants.length > 1 ? 'Check the matching option on the part page.' : undefined;
  return (
    <section className="compatible-parts compatibility-desktop" aria-labelledby="compatible-parts-heading">
      <header className="compatibility-heading"><div><p className="eyebrow">Keep your ride rolling</p><h2 id="compatible-parts-heading">Compatible parts</h2></div><p>Made to work together.<br />Explore the parts that fit your {product.title.replace(/^Evolve /, '')}.</p></header>
      {all.length ? <>
        <CompatibilityAssembly>
          <svg className="compatibility-connectors" viewBox="0 0 1200 620" preserveAspectRatio="none" aria-hidden="true">
            <ellipse cx="600" cy="310" rx="325" ry="214" />
            {featured.map((item, index) => <g key={item.product.id}>
              <path d={['M260 150 L410 150 L510 260', 'M940 150 L790 150 L690 260', 'M260 460 L410 460 L510 360', 'M940 460 L790 460 L690 360'][index]} />
              <circle cx={index % 2 === 0 ? 510 : 690} cy={index < 2 ? 260 : 360} r="4" />
            </g>)}
          </svg>
          <figure className="compatibility-vehicle">
            <span className="eyebrow">Your ride</span>
            {model3d ? <VehicleModel src="/media/3d/evolve-gtr.glb" alt={`${product.title} with compatible parts docking into place`} hotspots={hotspots} /> : product.images[0] && <img src={imageUrl(product.images[0].url)} alt={product.title} width="420" height="320" loading="lazy" />}
            <figcaption>{product.title}</figcaption>
          </figure>
          {featured.map((item, index) => <PartCard key={item.product.id} product={item.product} index={index} note={cardNote(item.product)} preview={model3d} />)}
        </CompatibilityAssembly>
        <p className="compatibility-footnote"><span aria-hidden="true">↔</span> Fit details from the product listings. Parts sold separately. Check each part for options, contents and installation requirements.</p>
        {more.length > 0 && <details className="compatibility-more"><summary>More compatible parts ({more.length})</summary><div>{more.map((item, index) => <PartCard key={item.product.id} product={item.product} index={index} note={cardNote(item.product)} />)}</div></details>}
      </> : <div className="compatibility-empty"><h3>Let’s get the fit right.</h3><p>No model-specific parts are confirmed in the current catalog for this ride. Check the part’s description or contact us to confirm compatibility before ordering.</p><a href="/store/pages/contact-us">Contact us <span aria-hidden="true">→</span></a></div>}
    </section>
  );
}
