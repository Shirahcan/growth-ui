import { useGrowth } from '../GrowthProvider';

/**
 * The estate host's product picker (shirah.co super admin). "All products" reads across, READ-ONLY;
 * choosing one product lets the screens edit it (every call then carries `?as_product=`).
 *
 * A product host has no picker: this renders nothing there.
 */
export function ProductPicker({ label = 'Product', allLabel = 'All products (read only)' }: { label?: string; allLabel?: string }) {
  const { picker, scope } = useGrowth();
  if (picker === null) return null;

  const value = scope.kind === 'product' ? scope.product : '';

  return (
    <label className="gr-picker">
      <span className="gr-picker-label">{label}</span>
      <select
        className="gr-picker-select"
        value={value}
        onChange={(e) => picker.choose(e.target.value === '' ? { kind: 'across' } : { kind: 'product', product: e.target.value })}
      >
        <option value="">{allLabel}</option>
        {picker.products.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
