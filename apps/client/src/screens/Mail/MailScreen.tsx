import { useEffect, useState, type JSX } from 'react';
import type { MailMessage } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { Prose } from '../../ui/Prose/Prose';
import { Rewards, describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { useMailStore } from '../../state/mailStore';
import { toast } from '../../state/uiStore';
import styles from './MailScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';

/**
 * The mailbox.
 *
 * A list beside a reading pane (UI_UX_DESIGN §3, screen 23). "Collect all" sits above the
 * list rather than inside a message, because it is the only thing most players will ever do
 * here and making them open twelve messages to take twelve gifts is busywork wearing the
 * costume of a feature.
 */
export function MailScreen(): JSX.Element {
  const mail = useMailStore((state) => state.mail);
  const loading = useMailStore((state) => state.loading);
  const busy = useMailStore((state) => state.busy);
  const error = useMailStore((state) => state.error);
  const load = useMailStore((state) => state.load);
  const open = useMailStore((state) => state.open);
  const claim = useMailStore((state) => state.claim);
  const claimAll = useMailStore((state) => state.claimAll);
  const discard = useMailStore((state) => state.discard);
  const lastPaid = useMailStore((state) => state.lastPaid);
  const clearPaid = useMailStore((state) => state.clearPaid);
  const rewardName = useRewardName();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lastPaid) return;
    const line = describeRewards(lastPaid, rewardName);
    if (line) toast.success(`Collected — ${line}.`);
    clearPaid();
  }, [lastPaid, clearPaid, rewardName]);

  const messages = mail?.messages ?? [];
  // Falls back to the newest rather than to nothing: an inbox that opens on an empty pane
  // makes the player click before it tells them anything.
  const selected = messages.find((entry) => entry.id === selectedId) ?? messages[0] ?? null;

  const select = (message: MailMessage): void => {
    setSelectedId(message.id);
    void open(message.id);
  };

  useEffect(() => {
    if (selected && !selected.read) void open(selected.id);
  }, [selected, open]);

  return (
    <div className={styles.screen}>
      <Heading tagline="What was sent to you, and what came with it.">The Mailbox</Heading>

      {error && <p className={styles.error}>{error}</p>}

      {loading && !mail ? (
        <p className={styles.empty}>Opening the satchel…</p>
      ) : messages.length === 0 ? (
        <p className={styles.empty}>
          Nothing has arrived. Gifts, apologies and the occasional word from the Vale land here.
        </p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.list}>
            <div className={styles.listHead}>
              <span className={styles.count}>
                {/* The server caps a very large mailbox at its newest hundred, and says so
                    rather than quietly showing a hundred of a hundred and thirty. The
                    unread count is over the whole box either way. */}
                {mail?.truncated ? 'newest ' : ''}
                {messages.length} message{messages.length === 1 ? '' : 's'}
                {mail && mail.unread > 0 ? ` · ${mail.unread} unread` : ''}
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={!mail?.claimable || busy !== null}
                onClick={() => void claimAll()}
              >
                {busy === 'all'
                  ? 'Collecting…'
                  : `Collect all${mail?.claimable ? ` (${mail.claimable})` : ''}`}
              </Button>
            </div>

            <ul className={styles.items}>
              {messages.map((message) => (
                <li key={message.id}>
                  <button
                    type="button"
                    className={[
                      styles.item,
                      selected?.id === message.id ? styles.itemActive : '',
                      message.read ? '' : styles.itemUnread,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-current={selected?.id === message.id}
                    onClick={() => select(message)}
                  >
                    <span className={styles.itemTitle}>{message.title}</span>
                    <span className={styles.itemMeta}>
                      {new Date(message.sentAt).toLocaleDateString()}
                      {message.claimable && <span className={styles.gift}>gift</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {selected && (
            <Panel
              variant="hero"
              title={selected.title}
              actions={<span className={styles.from}>{selected.sentBy}</span>}
            >
              <Prose text={selected.body} className={styles.body} />

              {Object.keys(selected.attachments).length > 0 && (
                <div className={styles.attachments}>
                  <span className={styles.attachLabel}>
                    {selected.claimed ? 'Collected' : 'Attached'}
                  </span>
                  <Rewards rewards={selected.attachments} signed />
                </div>
              )}

              <div className={styles.actions}>
                {selected.claimable ? (
                  <Button
                    variant="primary"
                    disabled={busy !== null}
                    onClick={() => void claim(selected.id)}
                  >
                    {busy === selected.id ? 'Collecting…' : 'Collect'}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => {
                      void discard(selected.id);
                      setSelectedId(null);
                    }}
                  >
                    Throw away
                  </Button>
                )}
                {selected.expiresAt && !selected.claimed && (
                  <span className={styles.expiry}>
                    Gone after {new Date(selected.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
