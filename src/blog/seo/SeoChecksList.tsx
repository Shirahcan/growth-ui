import type { SeoGroup, SeoJump } from '../PostSeoPanel';

/** The search checks in their groups, each opening where it is fixed (a part of the design or one of the post's fields). */
export function SeoChecksList({ groups, onJump }: { groups: SeoGroup[]; onJump?: (to: SeoJump) => void }) {
  return (
    <>
      {groups.map((group) => (
        <details key={group.name} open={group.errors > 0} style={{ border: '1px solid #E4E4EF', borderRadius: 8 }}>
          <summary style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            {group.name}
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px', background: group.errors > 0 ? '#FDECEC' : '#E7F6EC', color: group.errors > 0 ? '#C62828' : '#15803D' }}>
              {group.errors > 0 ? `${group.errors} to fix` : 'All passed'}
            </span>
          </summary>
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 12px 12px', display: 'grid', gap: 8 }}>
            {group.items.map((item) => {
              const to: SeoJump | null = item.part ? { part: item.part } : item.field ? { field: item.field } : null;

              return (
                <li key={item.label} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 8, fontSize: 12.5, lineHeight: 1.45 }}>
                  <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, color: '#fff', marginTop: 1, background: item.ok ? '#15803D' : '#C62828' }}>
                    {item.ok ? '✓' : '✗'}
                  </span>
                  {to && onJump ? (
                    <button type="button" onClick={() => onJump(to)} style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', outline: 'none' }}>
                      <span className="gr-sr-only">{item.ok ? 'Passed: ' : 'To fix: '}</span>
                      {item.label}
                    </button>
                  ) : (
                    <span>
                      <span className="gr-sr-only">{item.ok ? 'Passed: ' : 'To fix: '}</span>
                      {item.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </>
  );
}
