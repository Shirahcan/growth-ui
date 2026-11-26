import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { Button, Card, Dialog, Empty, Kebab, LoadError, Loading, Notice, Pill, copyText } from '../ui/primitives';
import type { LandingPage } from './types';

/**
 * Growth > Landing pages (shared program G7b5a; source: Portify's landing pages list): pages for a bio link, an ad or
 * an auto-reply, instead of a third-party form. Sign-ups are counted from the people themselves. Creating, editing and
 * designing are the host's screens (its wizard and its designer), reached through the hooks below; a missing hook hides
 * its menu item rather than offering something that goes nowhere.
 */
export interface LandingPagesViewProps {
  onEdit?: (page: LandingPage) => void;
  onDesign?: (page: LandingPage) => void;
  onPreview?: (page: LandingPage) => void;
  /** Audience filtered to what the page brought in (`landing:{slug}`). */
  onViewSignups?: (source: string, label: string) => void;
  /** Where the host sets its landing pages' address (shown while it is unset). */
  onOpenSettings?: () => void;
  /** Bumps to make the list read again (after the host's wizard saved). */
  reloadKey?: number;
  /** The host's own count of leads per page slug (leads are the product's records). */
  leadsFor?: (page: LandingPage) => number;
}

const STATUS_WORDS: Record<LandingPage['status'], string> = { draft: 'Draft', live: 'Live', paused: 'Paused' };
const SENDS_WORDS: Record<LandingPage['deliverable_kind'], string> = { none: 'Nothing', file: 'A file', booking_link: 'A booking link' };

export function LandingPagesView({ onEdit, onDesign, onPreview, onViewSignups, onOpenSettings, reloadKey: hostReload = 0, leadsFor }: LandingPagesViewProps) {
  const { request, notify, onError, canEdit, words } = useGrowth();
  const [pages, setPages] = useState<LandingPage[] | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleting, setDeleting] = useState<LandingPage | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ pages: LandingPage[]; base_url: string | null }>>('GET', 'landing-pages')
      .then((res) => {
        if (!live) return;
        const body = unwrap(res);
        setPages(body.pages);
        setBaseUrl(body.base_url);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The landing pages could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey, hostReload]);

  const reload = () => setReloadKey((k) => k + 1);

  async function act(method: 'POST' | 'DELETE', path: string, done: string) {
    try {
      await request(method, path, {});
      notify(done);
      reload();
    } catch (e) {
      onError(e);
    }
  }

  async function copy(url: string | null) {
    if (url === null) {
      onError(new Error('This page has no address yet: set where landing pages live first.'));
      return;
    }
    if (await copyText(url)) notify('Link copied.');
    else onError(new Error('Copying was blocked by the browser. Select the link and copy it instead.'));
  }

  const audience = (key: string) => words.audiences[key] ?? key;

  return (
    <Card>
      <div className="gr-stack">
        {baseUrl === null ? (
          <Notice>
            Your landing pages have no address yet, so none can go live. Set where they live on your site
            {onOpenSettings ? (
              <>
                {' '}in <button type="button" className="gr-table-link" onClick={onOpenSettings}>Growth settings</button>.
              </>
            ) : (
              ' in Growth settings.'
            )}
          </Notice>
        ) : null}

        {failed ? (
          <LoadError message={failed} onRetry={reload} />
        ) : pages === null ? (
          <Loading label="Loading the landing pages…" />
        ) : pages.length === 0 ? (
          <Empty>No landing pages yet. Make one for a bio link or an auto-reply, instead of a third-party form.</Empty>
        ) : (
          <div className="gr-table-wrap">
            <table className="gr-table">
              <thead>
                <tr>
                  <th className="gr-table-main">Page</th>
                  <th>Adds people to</th>
                  <th>Sends them</th>
                  <th>Sign-ups</th>
                  <th>Status</th>
                  <th className="gr-table-actions"><span className="gr-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => {
                  const leads = leadsFor?.(p) ?? 0;

                  return (
                    <tr key={p.uuid}>
                      <td className="gr-table-main">
                        <span className="gr-row-title">{p.name}</span>
                        <span className="gr-hint">{p.public_url ?? `/${p.slug} (no address yet)`}</span>
                      </td>
                      <td>{audience(p.audience)}</td>
                      <td>{SENDS_WORDS[p.deliverable_kind]}</td>
                      <td>
                        {p.signups} ({p.confirmed} confirmed){leads > 0 ? `, ${leads} ${leads === 1 ? 'lead' : 'leads'}` : ''}
                      </td>
                      <td>
                        <div className="gr-pills">
                          <Pill tone={p.status === 'live' ? 'good' : 'muted'}>{STATUS_WORDS[p.status]}</Pill>
                          {p.search_exposure === 'link_only' ? <Pill>Link only</Pill> : null}
                        </div>
                      </td>
                      <td className="gr-table-actions">
                        <Kebab
                          label={`Actions for ${p.name}`}
                          items={[
                            { label: 'Edit page', hidden: !canEdit || !onEdit, onSelect: () => onEdit?.(p) },
                            { label: 'Design page', hidden: p.layout !== 'pml' || !onDesign, onSelect: () => onDesign?.(p) },
                            { label: 'Preview', hidden: p.layout === 'pml' || !onPreview, onSelect: () => onPreview?.(p) },
                            { label: 'Copy link', onSelect: () => void copy(p.public_url) },
                            { label: 'View sign-ups', hidden: !onViewSignups, onSelect: () => onViewSignups?.(`landing:${p.slug}`, p.name) },
                            { label: 'Pause', hidden: !canEdit || p.status !== 'live', onSelect: () => void act('POST', `landing-pages/${p.uuid}/pause`, 'Paused.') },
                            {
                              label: p.status === 'paused' ? 'Resume' : 'Publish',
                              hidden: !canEdit || p.status === 'live',
                              onSelect: () => void act('POST', `landing-pages/${p.uuid}/publish`, 'The page is live.'),
                            },
                            { label: 'Delete', danger: true, hidden: !canEdit, onSelect: () => setDeleting(p) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleting ? (
        <Dialog
          title={`Delete ${deleting.name}?`}
          description="The page, its link and its keyword links stop working at once, and this cannot be undone. The people who signed up stay in your audience."
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                tone="danger"
                onClick={() => {
                  const page = deleting;
                  setDeleting(null);
                  void act('DELETE', `landing-pages/${page.uuid}`, 'Landing page deleted.');
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <span />
        </Dialog>
      ) : null}
    </Card>
  );
}
